import type { FastifyInstance } from "fastify";
import type { Benutzer } from "@torball/shared";
import { findAllByType, insertDoc, newId } from "../repository";
import { oeffentlichesProfil } from "../auth/benutzerProfil";
import { hashePasswort, passwortRegelVerstoss, passwortStimmt, verbrenneLoginZeit } from "../auth/passwort";
import { loescheSessionCookie, SESSION_COOKIE_NAME, setzeSessionCookie } from "../auth/plugin";
import { erstelleSession, loescheSessionPerToken } from "../auth/session";
import { pruefeTotpCode } from "../auth/totp";
import { aendereBenutzerAtomar } from "../auth/benutzerAenderung";
import { inAbkuehlung, registriereFehlversuch } from "../auth/loginZaehler";
import { ERSTES_KONTO_ID, legeErstesKontoAn } from "../auth/ersteinrichtung";
import { aktuelleSystemeinstellungen, benachrichtigeNeuenAccount } from "../systemeinstellungen";
import { SENSIBEL_RATE_LIMIT } from "../rateLimit";

// Anmelde-bezogene Routen: Login (inkl. optionaler 2FA), Logout, "wer bin ich" (/auth/me)
// und die einmalige Ersteinrichtung des allerersten Admin-Kontos. Die eigentliche
// Benutzerverwaltung (Einladung, Rollen, Profil) liegt in routes/benutzer.ts.

interface LoginBody {
  email: string;
  passwort: string;
  totpCode?: string;
}

const loginSchema = {
  type: "object",
  required: ["email", "passwort"],
  properties: {
    email: { type: "string", minLength: 1 },
    passwort: { type: "string", minLength: 1 },
    totpCode: { type: "string" },
  },
} as const;

interface BootstrapAdminBody {
  email: string;
  passwort: string;
  name: string;
  vorname?: string;
}

const bootstrapAdminSchema = {
  type: "object",
  required: ["email", "passwort", "name"],
  properties: {
    email: { type: "string", minLength: 1 },
    passwort: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    vorname: { type: "string" },
  },
} as const;

const CODE_FEHLER = "Der Bestätigungscode ist ungültig.";

// SENSIBEL_RATE_LIMIT (striktes IP-Limit fuer sensible Endpunkte) kommt aus ../rateLimit. Login
// selbst bekommt bewusst KEIN eigenes IP-Limit: die zeitbasierte Sperre pro Konto (siehe
// ../auth/loginZaehler.ts) drosselt
// Passwort-Raten unabhaengig von der IP - wichtig hinter NAT, wo viele Geraete eines Spielorts
// dieselbe IP teilen und ein striktes IP-Limit legitime Anmeldungen blockieren wuerde.

interface RegistrierenBody {
  email: string;
  passwort: string;
  name: string;
  vorname?: string;
}

const registrierenSchema = {
  type: "object",
  required: ["email", "passwort", "name"],
  properties: {
    email: { type: "string", minLength: 1 },
    passwort: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    vorname: { type: "string" },
  },
} as const;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login: prueft E-Mail/Passwort, bei aktiver 2FA zusaetzlich den TOTP-Code (erster Aufruf
  // ohne Code liefert nur {benoetigtTotp:true}). Erfolg -> Session-Cookie + oeffentliches Profil.
  app.post<{ Body: LoginBody }>("/auth/login", { schema: { body: loginSchema } }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase();
    const alle = await findAllByType<Benutzer>("benutzer");
    const benutzer = alle.find((b) => b.email.toLowerCase() === email);

    // Bewusst dieselbe generische Fehlermeldung fuer "kein solcher Account" und "falsches
    // Passwort" - sonst liesse sich ueber das Login-Formular ausprobieren, welche
    // E-Mail-Adressen ueberhaupt existieren.
    const ANMELDE_FEHLER = "E-Mail oder Passwort ist falsch.";
    if (!benutzer || !benutzer.passwortHash) {
      // Genauso viel Zeit verbrennen wie ein echter bcrypt-Vergleich, damit sich ueber die
      // Antwortzeit nicht ableiten laesst, ob diese E-Mail-Adresse ueberhaupt existiert.
      await verbrenneLoginZeit(req.body.passwort);
      return reply.code(401).send({ error: ANMELDE_FEHLER });
    }
    if (benutzer.gesperrt) {
      return reply.code(403).send({ error: "Dieser Account ist gesperrt." });
    }
    // Zeitbasierte Sperre nach zu vielen Fehlversuchen: waehrend der Abkuehlzeit gar nicht erst das
    // Passwort pruefen. Bewusst dieselbe generische Meldung wie bei falschem Passwort (kein Hinweis
    // auf die Sperre) - sonst liesse sich darueber ausprobieren, ob eine E-Mail existiert; die
    // gleiche Zeit verbrennen wie ein echter Vergleich (kein Timing-Leak gegenueber dem falschen
    // Passwort bzw. dem "Konto existiert nicht"-Fall).
    if (inAbkuehlung(benutzer)) {
      await verbrenneLoginZeit(req.body.passwort);
      return reply.code(401).send({ error: ANMELDE_FEHLER });
    }
    if (!(await passwortStimmt(req.body.passwort, benutzer.passwortHash))) {
      await registriereFehlversuch(benutzer._id);
      return reply.code(401).send({ error: ANMELDE_FEHLER });
    }

    if (benutzer.zweiFaAktiv) {
      if (!req.body.totpCode) {
        return reply.send({ benoetigtTotp: true });
      }
      // Ein falscher Code zaehlt genau wie ein falsches Passwort (gleicher Zaehler, gleiche
      // Abkuehlzeit): Wer das Passwort kennt, durfte den sechsstelligen Code sonst unbegrenzt raten.
      // Der Zaehler wird erst durch einen vollstaendig gelungenen Login zurueckgesetzt - nicht schon
      // dadurch, dass das Passwort stimmte.
      const pruefung = benutzer.zweiFaSecret
        ? await pruefeTotpCode(benutzer.zweiFaSecret, req.body.totpCode, benutzer.zweiFaLetzterZeitschritt)
        : ({ gueltig: false } as const);
      if (!pruefung.gueltig) {
        await registriereFehlversuch(benutzer._id);
        return reply.code(401).send({ error: CODE_FEHLER });
      }
      // Den Zeitschritt VOR dem Anmelden festhalten - atomar: Kommen zwei Anmeldungen mit demselben
      // Code gleichzeitig an, sieht die zweite beim erneuten Lesen den gemerkten Schritt und verliert.
      const verbraucht = await aendereBenutzerAtomar(benutzer._id, (b) =>
        (b.zweiFaLetzterZeitschritt ?? -1) >= pruefung.zeitschritt
          ? undefined
          : { ...b, zweiFaLetzterZeitschritt: pruefung.zeitschritt },
      );
      if (!verbraucht) {
        await registriereFehlversuch(benutzer._id);
        return reply.code(401).send({ error: CODE_FEHLER });
      }
    }

    const { token } = await erstelleSession(benutzer._id);
    setzeSessionCookie(reply, token);

    const aktualisiert =
      (await aendereBenutzerAtomar(benutzer._id, (b) => ({
        ...b,
        letzteAnmeldung: new Date().toISOString(),
        fehlgeschlageneLoginVersuche: 0,
        loginKontoGesperrtBis: undefined,
      }))) ?? benutzer;
    return oeffentlichesProfil(aktualisiert);
  });

  // Logout: beendet die aktuelle Session serverseitig und loescht das Cookie.
  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (token) await loescheSessionPerToken(token);
    loescheSessionCookie(reply);
    return reply.code(204).send();
  });

  // Aktuell angemeldeter Benutzer (aus req.benutzer, das der authPreHandler aufloest).
  app.get("/auth/me", async (req, reply) => {
    if (!req.benutzer) return reply.code(401).send({ error: "Nicht angemeldet" });
    return oeffentlichesProfil(req.benutzer);
  });

  /** Oeffentlich abrufbar (keine Anmeldung noetig), damit die Login-Seite bei einer frischen Installation auf die Ersteinrichtung hinweisen kann. */
  app.get("/auth/bootstrap-verfuegbar", async () => {
    const bestehende = await findAllByType<Benutzer>("benutzer");
    return { verfuegbar: bestehende.length === 0 };
  });

  /**
   * Einmalige Erst-Einrichtung (Huhn-Ei-Problem: ohne bestehenden Benutzer kann niemand
   * einen einladen). Funktioniert nur, solange noch KEIN Benutzer existiert - danach
   * laeuft jede weitere Anlage ausschliesslich ueber den Einladungs-Flow (routes/benutzer.ts).
   */
  app.post<{ Body: BootstrapAdminBody }>(
    "/auth/bootstrap-admin",
    { schema: { body: bootstrapAdminSchema }, config: { rateLimit: SENSIBEL_RATE_LIMIT } },
    async (req, reply) => {
      const bestehende = await findAllByType<Benutzer>("benutzer");
      if (bestehende.length > 0) {
        return reply
          .code(409)
          .send({ error: "Es existiert bereits mindestens ein Benutzer - Bootstrap nicht mehr möglich." });
      }

      const verstoss = passwortRegelVerstoss(req.body.passwort, {
        name: req.body.name,
        email: req.body.email,
      });
      if (verstoss) return reply.code(400).send({ error: verstoss });

      const benutzer: Benutzer = {
        _id: ERSTES_KONTO_ID,
        docType: "benutzer",
        benutzerId: ERSTES_KONTO_ID,
        email: req.body.email.trim().toLowerCase(),
        passwortHash: await hashePasswort(req.body.passwort),
        name: req.body.name,
        vorname: req.body.vorname?.trim() || undefined,
        globaleRolle: "admin",
        sprache: "de",
        zweiFaAktiv: false,
        gesperrt: false,
        erstelltAm: new Date().toISOString(),
      };
      // Atomar: bei zwei gleichzeitigen Anfragen gewinnt genau eine (feste ID, siehe ersteinrichtung.ts).
      const gespeichert = await legeErstesKontoAn(benutzer);
      if (!gespeichert) {
        return reply
          .code(409)
          .send({ error: "Es existiert bereits mindestens ein Benutzer - Bootstrap nicht mehr möglich." });
      }
      return reply.code(201).send(oeffentlichesProfil(gespeichert));
    },
  );

  /** Oeffentlich abrufbar (keine Anmeldung noetig), damit die Login-Seite bei aktivierter
   *  Selbstregistrierung einen Registrieren-Link anzeigen kann. */
  app.get("/auth/registrierung-verfuegbar", async () => {
    const einstellungen = await aktuelleSystemeinstellungen();
    return { verfuegbar: einstellungen.selbstregistrierungErlaubt };
  });

  /**
   * Selbstregistrierung (Systemeinstellungen, nur wenn von einem Admin aktiviert). Anders als
   * bootstrap-admin jederzeit nutzbar (nicht nur ohne bestehende Benutzer) und vergibt nie die
   * Rolle "admin" - die Rolle kommt aus den Systemeinstellungen (selbstregistrierungStandardRolle,
   * dort schon auf "benutzer"/"manager" beschraenkt).
   */
  app.post<{ Body: RegistrierenBody }>(
    "/auth/registrieren",
    { schema: { body: registrierenSchema }, config: { rateLimit: SENSIBEL_RATE_LIMIT } },
    async (req, reply) => {
      const einstellungen = await aktuelleSystemeinstellungen();
      if (!einstellungen.selbstregistrierungErlaubt) {
        return reply.code(403).send({ error: "Selbstregistrierung ist derzeit nicht aktiviert." });
      }

      const email = req.body.email.trim().toLowerCase();
      const bestehende = await findAllByType<Benutzer>("benutzer");
      if (bestehende.some((b) => b.email.toLowerCase() === email)) {
        return reply.code(409).send({ error: "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits." });
      }

      const verstoss = passwortRegelVerstoss(req.body.passwort, {
        name: req.body.name,
        email: req.body.email,
      });
      if (verstoss) return reply.code(400).send({ error: verstoss });

      const id = newId("benutzer");
      const benutzer: Benutzer = {
        _id: id,
        docType: "benutzer",
        benutzerId: id,
        email,
        passwortHash: await hashePasswort(req.body.passwort),
        name: req.body.name,
        vorname: req.body.vorname?.trim() || undefined,
        globaleRolle: einstellungen.selbstregistrierungStandardRolle,
        sprache: "de",
        zweiFaAktiv: false,
        gesperrt: false,
        erstelltAm: new Date().toISOString(),
      };
      const gespeichert = await insertDoc(benutzer);
      await benachrichtigeNeuenAccount(einstellungen, "registrierung", { name: benutzer.name, email });
      return reply.code(201).send(oeffentlichesProfil(gespeichert));
    },
  );
}

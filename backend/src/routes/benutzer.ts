import type { FastifyInstance } from "fastify";
import type { Benutzer, GlobaleRolle, VerbundeneInstanz } from "@torball/shared";
import { deleteDoc, findAllBySelector, findAllByType, findById, insertDoc, newId } from "../repository";
import { oeffentlichesProfil } from "../auth/benutzerProfil";
import { hashePasswort, passwortRegelVerstoss, passwortStimmt } from "../auth/passwort";
import { requireAuth, requireRolle } from "../auth/plugin";
import { loescheAlleSessionenVonBenutzer, loescheAndereSessionenVonBenutzer } from "../auth/session";
import { erzeugeOtpAuthUri, erzeugeQrCodeDataUri, erzeugeTotpSecret, totpCodeGueltig } from "../auth/totp";
import { erzeugeToken, hashe } from "../auth/token";
import { sendeMail } from "../mail/transport";
import { aktuelleSystemeinstellungen, benachrichtigeNeuenAccount, smtpVerbindungAus } from "../systemeinstellungen";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

const EINLADUNG_GUELTIG_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const RESET_GUELTIG_MS = 24 * 60 * 60 * 1000; // Abschnitt 21.4: 24 Stunden
const KOPPLUNG_GUELTIG_MS = 15 * 60 * 1000; // Turnier-Sync: Instanz-Kopplungscode, 15 Minuten

/** Manager duerfen laut Abschnitt 21.1 nur "Benutzer" und "Manager" anlegen/bearbeiten, keine Admins. */
function darfZielRolleVergeben(vergebendeRolle: GlobaleRolle, zielRolle: GlobaleRolle): boolean {
  if (vergebendeRolle === "admin") return true;
  if (vergebendeRolle === "manager") return zielRolle !== "admin";
  return false;
}

interface BenutzerAnlegenBody {
  email: string;
  name: string;
  globaleRolle: GlobaleRolle;
}

const benutzerAnlegenSchema = {
  type: "object",
  required: ["email", "name", "globaleRolle"],
  properties: {
    email: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    globaleRolle: { type: "string", enum: ["admin", "manager", "benutzer"] },
  },
} as const;

interface BenutzerAktualisierenBody {
  name?: string;
  globaleRolle?: GlobaleRolle;
  gesperrt?: boolean;
}

const benutzerAktualisierenSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    globaleRolle: { type: "string", enum: ["admin", "manager", "benutzer"] },
    gesperrt: { type: "boolean" },
  },
} as const;

export async function benutzerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/benutzer", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin", "manager"])) return;
    const alle = await findAllByType<Benutzer>("benutzer");
    return alle.map(oeffentlichesProfil);
  });

  /**
   * Legt einen Benutzer OHNE Passwort an (Abschnitt 25.2: "Einmal-Link per E-Mail,
   * Passwort-Setzung beim ersten Login"). Ist E-Mail-Versand konfiguriert, geht der
   * Einladungslink direkt an die neue Adresse. Andernfalls (Fallback, z.B. lokale
   * Entwicklung ohne SMTP-Konfiguration) kommt der Klartext-Link stattdessen direkt
   * in der Antwort an die einladende Person zurueck, die ihn dann manuell weitergeben
   * muss.
   */
  app.post<{ Body: BenutzerAnlegenBody }>(
    "/benutzer",
    { schema: { body: benutzerAnlegenSchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const vergebendeRolle = req.benutzer!.globaleRolle;
      if (!darfZielRolleVergeben(vergebendeRolle, req.body.globaleRolle)) {
        return reply.code(403).send({ error: "Diese Rolle darfst du nicht vergeben." });
      }

      const email = req.body.email.trim().toLowerCase();
      const bestehende = await findAllByType<Benutzer>("benutzer");
      if (bestehende.some((b) => b.email.toLowerCase() === email)) {
        return reply.code(409).send({ error: "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits." });
      }

      const { token, hash } = erzeugeToken();
      const id = newId("benutzer");
      const benutzer: Benutzer = {
        _id: id,
        docType: "benutzer",
        benutzerId: id,
        email,
        name: req.body.name,
        globaleRolle: req.body.globaleRolle,
        sprache: "de",
        zweiFaAktiv: false,
        gesperrt: false,
        erstelltVon: req.benutzer!._id,
        erstelltAm: new Date().toISOString(),
        einladungTokenHash: hash,
        einladungAblauf: new Date(Date.now() + EINLADUNG_GUELTIG_MS).toISOString(),
      };
      const gespeichert = await insertDoc(benutzer);

      const smtp = smtpVerbindungAus(await aktuelleSystemeinstellungen());
      if (smtp) {
        try {
          await sendeMail(smtp, {
            an: email,
            betreff: "Einladung zu Torball-Turniere",
            text:
              `Hallo ${req.body.name},\n\n` +
              `du wurdest zu Torball-Turniere eingeladen. Setze dein Passwort unter folgendem Link, ` +
              `um deinen Account zu aktivieren:\n\n` +
              `${FRONTEND_URL}/einladung/${token}\n\n` +
              `Der Link ist 7 Tage gueltig.`,
          });
        } catch (err) {
          // Ohne diesen Rollback bliebe ein Benutzer ohne Passwort und ohne abrufbaren
          // Einladungslink zurueck, falls der Mailversand fehlschlaegt (z.B. SMTP-Ausfall).
          await deleteDoc(gespeichert._id, gespeichert._rev!);
          app.log.error(err, "Einladungsmail konnte nicht versendet werden, Anlage zurueckgerollt");
          return reply.code(502).send({ error: "Einladung konnte nicht per E-Mail versendet werden." });
        }
        return reply.code(201).send({ benutzer: oeffentlichesProfil(gespeichert) });
      }

      return reply.code(201).send({ benutzer: oeffentlichesProfil(gespeichert), einladungsToken: token });
    },
  );

  /**
   * Selbst-Service fuer das eigene Profil (jede Rolle) - bewusst getrennt von
   * PUT /benutzer/:id (admin/manager-gated), das zusaetzlich Rolle/Sperrung
   * aendern darf. globaleRolle/gesperrt sind hier nicht aenderbar: sonst
   * koennte sich jeder Benutzer selbst zum Admin machen.
   *
   * E-Mail ist der Benutzername (Abschnitt 25.1) - eine Aenderung verlangt
   * deshalb wie bei der Passwortaenderung das aktuelle Passwort zur
   * Bestaetigung. Laeuft aktuell OHNE Bestaetigungslink/Benachrichtigung an
   * die alte Adresse (Abschnitt 25.4 saehe beides vor) - dieselbe
   * Einschraenkung wie bei Einladung/Passwort-Reset, solange kein
   * E-Mail-Versand angebunden ist.
   */
  app.put<{
    Body: {
      name?: string;
      vorname?: string;
      telefon?: string;
      lizenzVorhanden?: boolean;
      vereinVerband?: string;
      adresse?: string;
      email?: string;
      aktuellesPasswort?: string;
      standardTheme?: Benutzer["standardTheme"];
      standardDichte?: Benutzer["standardDichte"];
      standardBreite?: Benutzer["standardBreite"];
    };
  }>(
    "/benutzer/mich",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            // Optionale Stammdaten: leerer String erlaubt (Feld gezielt leeren).
            vorname: { type: "string" },
            telefon: { type: "string" },
            lizenzVorhanden: { type: "boolean" },
            vereinVerband: { type: "string" },
            adresse: { type: "string" },
            email: { type: "string", minLength: 1 },
            aktuellesPasswort: { type: "string" },
            standardTheme: { type: "string", enum: ["system", "light", "dark"] },
            standardDichte: { type: "string", enum: ["standard", "schmal"] },
            standardBreite: { type: "string", enum: ["standard", "breit"] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      // standardTheme/standardDichte und die Kontakt-/Stammdaten (Vorname, Telefon, Lizenz,
      // Verein/Verband, Adresse) sind keine sensiblen Felder (siehe CLAUDE.md) - anders als
      // E-Mail/Passwort/2FA deshalb ohne Passwort-Bestaetigung aenderbar.
      const aenderungen: Partial<
        Pick<
          Benutzer,
          | "name"
          | "vorname"
          | "telefon"
          | "lizenzVorhanden"
          | "vereinVerband"
          | "adresse"
          | "email"
          | "standardTheme"
          | "standardDichte"
          | "standardBreite"
        >
      > = {};

      if (req.body.name) {
        aenderungen.name = req.body.name;
      }

      // Optionale Textfelder: bei vorhandenem Schluessel immer uebernehmen (getrimmt), damit ein
      // leerer Wert das Feld auch wirklich leert (undefined = Feld nicht mitgesendet, unveraendert).
      if (req.body.vorname !== undefined) {
        aenderungen.vorname = req.body.vorname.trim() || undefined;
      }
      if (req.body.telefon !== undefined) {
        aenderungen.telefon = req.body.telefon.trim() || undefined;
      }
      if (req.body.vereinVerband !== undefined) {
        aenderungen.vereinVerband = req.body.vereinVerband.trim() || undefined;
      }
      if (req.body.adresse !== undefined) {
        aenderungen.adresse = req.body.adresse.trim() || undefined;
      }
      if (req.body.lizenzVorhanden !== undefined) {
        aenderungen.lizenzVorhanden = req.body.lizenzVorhanden;
      }

      if (req.body.standardTheme) {
        aenderungen.standardTheme = req.body.standardTheme;
      }

      if (req.body.standardDichte) {
        aenderungen.standardDichte = req.body.standardDichte;
      }

      if (req.body.standardBreite) {
        aenderungen.standardBreite = req.body.standardBreite;
      }

      if (req.body.email) {
        const neueEmail = req.body.email.trim().toLowerCase();
        if (neueEmail !== req.benutzer!.email) {
          if (
            !req.benutzer!.passwortHash ||
            !req.body.aktuellesPasswort ||
            !(await passwortStimmt(req.body.aktuellesPasswort, req.benutzer!.passwortHash))
          ) {
            return reply.code(401).send({ error: "Aktuelles Passwort ist falsch." });
          }

          const alle = await findAllByType<Benutzer>("benutzer");
          const vergeben = alle.some(
            (b) => b._id !== req.benutzer!._id && b.email.toLowerCase() === neueEmail,
          );
          if (vergeben) {
            return reply.code(409).send({ error: "Diese E-Mail-Adresse wird bereits verwendet." });
          }
          app.log.info(`E-Mail-Aenderung: ${req.benutzer!.email} -> ${neueEmail}`);
          aenderungen.email = neueEmail;
        }
      }

      const aktualisiert = await insertDoc({ ...req.benutzer!, ...aenderungen });
      return oeffentlichesProfil(aktualisiert);
    },
  );

  /** Selbst-Service-Passwortaenderung - verlangt das aktuelle Passwort. Beendet danach alle ANDEREN Sessions (Abschnitt 21.4-Prinzip), laesst die gerade benutzte Session aber am Leben. */
  app.put<{ Body: { aktuellesPasswort: string; neuesPasswort: string } }>(
    "/benutzer/mich/passwort",
    {
      schema: {
        body: {
          type: "object",
          required: ["aktuellesPasswort", "neuesPasswort"],
          properties: {
            aktuellesPasswort: { type: "string" },
            neuesPasswort: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      if (
        !req.benutzer!.passwortHash ||
        !(await passwortStimmt(req.body.aktuellesPasswort, req.benutzer!.passwortHash))
      ) {
        return reply.code(401).send({ error: "Aktuelles Passwort ist falsch." });
      }

      const verstoss = passwortRegelVerstoss(req.body.neuesPasswort);
      if (verstoss) return reply.code(400).send({ error: verstoss });

      const aktualisiert = await insertDoc({
        ...req.benutzer!,
        passwortHash: await hashePasswort(req.body.neuesPasswort),
      });

      if (req.sessionId) {
        await loescheAndereSessionenVonBenutzer(req.benutzer!._id, req.sessionId);
      }

      return oeffentlichesProfil(aktualisiert);
    },
  );

  app.put<{ Params: { id: string }; Body: BenutzerAktualisierenBody }>(
    "/benutzer/:id",
    { schema: { body: benutzerAktualisierenSchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const bestehend = await findById<Benutzer>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Benutzer nicht gefunden" });

      const vergebendeRolle = req.benutzer!.globaleRolle;
      if (!darfZielRolleVergeben(vergebendeRolle, bestehend.globaleRolle)) {
        return reply.code(403).send({ error: "Diesen Benutzer darfst du nicht bearbeiten." });
      }
      if (req.body.globaleRolle && !darfZielRolleVergeben(vergebendeRolle, req.body.globaleRolle)) {
        return reply.code(403).send({ error: "Diese Rolle darfst du nicht vergeben." });
      }

      // gesperrtGrund wird vom Server gesetzt, nie vom Client: ein manuelles (Ent-)Sperren hier
      // ist immer "manuell" - das unterscheidet es von einer automatischen Fehlversuche-Sperre,
      // die auch ueber einen Passwort-Reset aufgehoben werden darf (siehe passwort-reset unten).
      // Ein Entsperren setzt zugleich den Fehlversuche-Zaehler zurueck, sonst waere der Account
      // nach nur noch wenigen weiteren Fehlversuchen sofort wieder gesperrt.
      const sperrPatch =
        "gesperrt" in req.body
          ? req.body.gesperrt
            ? { gesperrtGrund: "manuell" as const }
            : { gesperrtGrund: undefined, fehlgeschlageneLoginVersuche: 0 }
          : {};

      const aktualisiert = await insertDoc({ ...bestehend, ...req.body, ...sperrPatch });
      return oeffentlichesProfil(aktualisiert);
    },
  );

  /**
   * Admin/Manager loest einen Passwort-Reset fuer eine ANDERE Person aus - Ergaenzung zum
   * Self-Service-Link (POST /benutzer/passwort-vergessen), fuer Faelle, in denen die Person den
   * E-Mail-Weg selbst nicht gehen kann (z.B. eine lokale Installation ohne Internetverbindung).
   * Nutzt denselben Reset-Token/-Endpunkt wie der Self-Service-Weg - die Person setzt ihr neues
   * Passwort weiterhin selbst, der/die Auslösende sieht/setzt es nie direkt. Ist kein Mailversand
   * konfiguriert (der Normalfall auf einer lokalen Installation) oder schlaegt der Versand fehl
   * (z.B. kein Internet trotz konfiguriertem SMTP), wird der Token in der Antwort zurueckgegeben -
   * analog zum Einladungs-Link-Fallback oben.
   */
  app.post<{ Params: { id: string } }>("/benutzer/:id/passwort-reset-ausloesen", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin", "manager"])) return;
    const ziel = await findById<Benutzer>(req.params.id);
    if (!ziel) return reply.code(404).send({ error: "Benutzer nicht gefunden" });
    if (!darfZielRolleVergeben(req.benutzer!.globaleRolle, ziel.globaleRolle)) {
      return reply.code(403).send({ error: "Diesen Benutzer darfst du nicht bearbeiten." });
    }

    const { token, hash } = erzeugeToken();
    await insertDoc({
      ...ziel,
      resetTokenHash: hash,
      resetAblauf: new Date(Date.now() + RESET_GUELTIG_MS).toISOString(),
    });

    const smtpFuerReset = smtpVerbindungAus(await aktuelleSystemeinstellungen());
    if (smtpFuerReset) {
      try {
        await sendeMail(smtpFuerReset, {
          an: ziel.email,
          betreff: "Passwort zurücksetzen - Torball-Turniere",
          text:
            `Hallo ${ziel.name},\n\n` +
            `für dein Konto wurde von der Turnierleitung/einem Admin ein Passwort-Reset ausgelöst. ` +
            `Falls das nicht erwartet war, wende dich bitte an sie/ihn.\n\n` +
            `Neues Passwort setzen (Link 24 Stunden gültig):\n` +
            `${FRONTEND_URL}/passwort-reset/${token}`,
        });
        return reply.send({ email: ziel.email });
      } catch (err) {
        // Fallback auf den Link in der Antwort, statt die Aktion wirkungslos verpuffen zu lassen
        // (z.B. SMTP konfiguriert, aber gerade kein Internet auf einer lokalen Installation).
        app.log.error(err, "Passwort-Reset-Mail konnte nicht versendet werden");
        return reply.send({ email: ziel.email, resetToken: token });
      }
    }

    return reply.send({ email: ziel.email, resetToken: token });
  });

  /**
   * Verschickt die Einladung fuer einen noch nicht aktivierten Account erneut (frischer Token mit
   * neuer Gueltigkeit, der alte wird ungueltig) - z.B. wenn die urspruengliche Mail nie ankam, weil
   * SMTP zum Zeitpunkt der Einladung noch nicht konfiguriert war. Nur fuer Accounts ohne gesetztes
   * Passwort (noch offene Einladung); ein bereits aktivierter Account hat keinen "erneut senden"-
   * Anwendungsfall. Fallback-Verhalten (Token in der Antwort bei fehlendem/fehlgeschlagenem
   * Mailversand) analog zum admin-ausgeloesten Passwort-Reset oben.
   */
  app.post<{ Params: { id: string } }>("/benutzer/:id/einladung-erneut-senden", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin", "manager"])) return;
    const ziel = await findById<Benutzer>(req.params.id);
    if (!ziel) return reply.code(404).send({ error: "Benutzer nicht gefunden" });
    if (!darfZielRolleVergeben(req.benutzer!.globaleRolle, ziel.globaleRolle)) {
      return reply.code(403).send({ error: "Diesen Benutzer darfst du nicht bearbeiten." });
    }
    if (ziel.passwortHash) {
      return reply.code(400).send({ error: "Dieser Account wurde bereits aktiviert." });
    }

    const { token, hash } = erzeugeToken();
    await insertDoc({
      ...ziel,
      einladungTokenHash: hash,
      einladungAblauf: new Date(Date.now() + EINLADUNG_GUELTIG_MS).toISOString(),
    });

    const smtpFuerEinladung = smtpVerbindungAus(await aktuelleSystemeinstellungen());
    if (smtpFuerEinladung) {
      try {
        await sendeMail(smtpFuerEinladung, {
          an: ziel.email,
          betreff: "Einladung zu Torball-Turniere",
          text:
            `Hallo ${ziel.name},\n\n` +
            `du wurdest zu Torball-Turniere eingeladen. Setze dein Passwort unter folgendem Link, ` +
            `um deinen Account zu aktivieren:\n\n` +
            `${FRONTEND_URL}/einladung/${token}\n\n` +
            `Der Link ist 7 Tage gueltig.`,
        });
        return reply.send({ email: ziel.email });
      } catch (err) {
        app.log.error(err, "Einladungsmail (erneut) konnte nicht versendet werden");
        return reply.send({ email: ziel.email, einladungsToken: token });
      }
    }

    return reply.send({ email: ziel.email, einladungsToken: token });
  });

  /**
   * Admin deaktiviert die 2FA eines ANDEREN Benutzers. Hintergrund: Verliert jemand den
   * Zugang zu seiner Authenticator-App, ist er ausgesperrt - "neu anlegen + Turniere neu
   * zuordnen" waere zu aufwaendig. Bewusst nur fuer Admins (nicht Manager): das Herabsetzen
   * fremder Konto-Sicherheit soll eng begrenzt sein. Verlangt kein Passwort des Zielkontos
   * (das kennt der Admin ja nicht) - anders als die Selbst-Service-Deaktivierung
   * (POST /benutzer/2fa/deaktivieren), die das eigene Passwort verlangt.
   */
  app.post<{ Params: { id: string } }>("/benutzer/:id/2fa/deaktivieren", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    // Fuer das EIGENE Konto bewusst gesperrt: sonst liesse sich die eigene 2FA hier ohne
    // Passwort abschalten und damit die Regel "sensible Selbst-Aenderungen verlangen das
    // Passwort" umgehen (CLAUDE.md). Fuers eigene Konto ist die Selbst-Service-Route
    // POST /benutzer/2fa/deaktivieren (mit Passwort) vorgesehen.
    if (req.params.id === req.benutzer!._id) {
      return reply
        .code(400)
        .send({ error: "Die eigene 2FA bitte im Profil (mit Passwort-Bestätigung) deaktivieren." });
    }
    const bestehend = await findById<Benutzer>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Benutzer nicht gefunden" });
    const aktualisiert = await insertDoc({ ...bestehend, zweiFaAktiv: false, zweiFaSecret: undefined });
    return oeffentlichesProfil(aktualisiert);
  });

  app.get<{ Params: { token: string } }>("/benutzer/einladung/:token", async (req, reply) => {
    const hash = hashe(req.params.token);
    const alle = await findAllByType<Benutzer>("benutzer");
    const benutzer = alle.find((b) => b.einladungTokenHash === hash);
    if (!benutzer || !benutzer.einladungAblauf || new Date(benutzer.einladungAblauf).getTime() < Date.now()) {
      return reply.code(404).send({ error: "Einladung ungültig oder abgelaufen." });
    }
    return { email: benutzer.email, name: benutzer.name };
  });

  app.post<{ Params: { token: string }; Body: { passwort: string } }>(
    "/benutzer/einladung/:token/annehmen",
    { schema: { body: { type: "object", required: ["passwort"], properties: { passwort: { type: "string" } } } } },
    async (req, reply) => {
      const hash = hashe(req.params.token);
      const alle = await findAllByType<Benutzer>("benutzer");
      const benutzer = alle.find((b) => b.einladungTokenHash === hash);
      if (!benutzer || !benutzer.einladungAblauf || new Date(benutzer.einladungAblauf).getTime() < Date.now()) {
        return reply.code(404).send({ error: "Einladung ungültig oder abgelaufen." });
      }

      const verstoss = passwortRegelVerstoss(req.body.passwort);
      if (verstoss) return reply.code(400).send({ error: verstoss });

      const aktualisiert = await insertDoc({
        ...benutzer,
        passwortHash: await hashePasswort(req.body.passwort),
        einladungTokenHash: undefined,
        einladungAblauf: undefined,
      });
      await benachrichtigeNeuenAccount(await aktuelleSystemeinstellungen(), "einladung-angenommen", {
        name: benutzer.name,
        email: benutzer.email,
      });
      return oeffentlichesProfil(aktualisiert);
    },
  );

  /**
   * Antwortet IMMER gleich, unabhaengig davon, ob die E-Mail existiert - sonst liesse
   * sich darueber ausprobieren, welche Adressen registriert sind. Ist E-Mail-Versand
   * konfiguriert, geht der Reset-Link per Mail an die Adresse. Andernfalls (Fallback)
   * landet er im Server-Log (nur auf der Konsole des Rechners sichtbar, der das
   * Backend betreibt).
   */
  app.post<{ Body: { email: string } }>(
    "/benutzer/passwort-vergessen",
    { schema: { body: { type: "object", required: ["email"], properties: { email: { type: "string" } } } } },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const alle = await findAllByType<Benutzer>("benutzer");
      const benutzer = alle.find((b) => b.email.toLowerCase() === email);

      if (benutzer && !benutzer.gesperrt) {
        const { token, hash } = erzeugeToken();
        await insertDoc({
          ...benutzer,
          resetTokenHash: hash,
          resetAblauf: new Date(Date.now() + RESET_GUELTIG_MS).toISOString(),
        });

        const smtpFuerVergessen = smtpVerbindungAus(await aktuelleSystemeinstellungen());
        if (smtpFuerVergessen) {
          try {
            await sendeMail(smtpFuerVergessen, {
              an: benutzer.email,
              betreff: "Passwort zurücksetzen - Torball-Turniere",
              text:
                `Hallo ${benutzer.name},\n\n` +
                `für dein Konto wurde ein Passwort-Reset angefordert. Falls das nicht du warst, ` +
                `kannst du diese E-Mail ignorieren.\n\n` +
                `Neues Passwort setzen (Link 24 Stunden gültig):\n` +
                `${FRONTEND_URL}/passwort-reset/${token}`,
            });
          } catch (err) {
            // Antwort bleibt bewusst {ok:true} wie im Erfolgsfall - sonst liesse sich ueber
            // einen abweichenden Fehlerstatus ausprobieren, welche Adressen registriert sind.
            app.log.error(err, "Passwort-Reset-Mail konnte nicht versendet werden");
          }
        } else {
          app.log.info(`Passwort-Reset fuer ${benutzer.email}: /passwort-reset/${token} (24h gueltig)`);
        }
      }

      return reply.send({ ok: true });
    },
  );

  // Prueft den Token OHNE ihn zu verbrauchen - laesst die Seite "Link ungueltig/abgelaufen" schon
  // beim Aufrufen anzeigen, statt erst nach dem Ausfuellen des Formulars (Nutzer-Vorgabe, live
  // aufgefallen: die Fehlermeldung kam vorher erst nach dem Absenden). Analog GET /benutzer/einladung/:token.
  app.get<{ Params: { token: string } }>("/benutzer/passwort-reset/:token", async (req, reply) => {
    const hash = hashe(req.params.token);
    const alle = await findAllByType<Benutzer>("benutzer");
    const benutzer = alle.find((b) => b.resetTokenHash === hash);
    if (!benutzer || !benutzer.resetAblauf || new Date(benutzer.resetAblauf).getTime() < Date.now()) {
      return reply.code(404).send({ error: "Der Link ist ungültig oder abgelaufen." });
    }
    return { ok: true };
  });

  app.post<{ Params: { token: string }; Body: { neuesPasswort: string } }>(
    "/benutzer/passwort-reset/:token",
    {
      schema: {
        body: { type: "object", required: ["neuesPasswort"], properties: { neuesPasswort: { type: "string" } } },
      },
    },
    async (req, reply) => {
      const hash = hashe(req.params.token);
      const alle = await findAllByType<Benutzer>("benutzer");
      const benutzer = alle.find((b) => b.resetTokenHash === hash);
      if (!benutzer || !benutzer.resetAblauf || new Date(benutzer.resetAblauf).getTime() < Date.now()) {
        return reply.code(404).send({ error: "Der Link ist ungültig oder abgelaufen." });
      }

      const verstoss = passwortRegelVerstoss(req.body.neuesPasswort);
      if (verstoss) return reply.code(400).send({ error: verstoss });

      // Ein erfolgreicher Reset hebt eine automatische Fehlversuche-Sperre mit auf (wer den Link
      // oeffnen konnte, hat sich ueber die E-Mail-Adresse legitimiert) - eine BEWUSSTE Admin-Sperre
      // (gesperrtGrund "manuell") bleibt davon unberuehrt, sonst liesse sie sich darueber aushebeln.
      const hebtFehlversucheSperreAuf = benutzer.gesperrtGrund === "fehlversuche";

      await insertDoc({
        ...benutzer,
        passwortHash: await hashePasswort(req.body.neuesPasswort),
        resetTokenHash: undefined,
        resetAblauf: undefined,
        fehlgeschlageneLoginVersuche: 0,
        ...(hebtFehlversucheSperreAuf ? { gesperrt: false, gesperrtGrund: undefined } : {}),
      });
      // Abschnitt 21.4: "alle aktiven Sessions beendet".
      await loescheAlleSessionenVonBenutzer(benutzer._id);

      return reply.send({ ok: true });
    },
  );

  app.post("/benutzer/2fa/einrichten", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const secret = erzeugeTotpSecret();
    const otpAuthUri = erzeugeOtpAuthUri(req.benutzer!.email, secret);
    const qrCodeDataUri = await erzeugeQrCodeDataUri(otpAuthUri);

    // Noch nicht aktiv (zweiFaAktiv bleibt false) - erst /bestaetigen schaltet es scharf.
    await insertDoc({ ...req.benutzer!, zweiFaSecret: secret });
    return { secret, otpAuthUri, qrCodeDataUri };
  });

  app.post<{ Body: { code: string } }>(
    "/benutzer/2fa/bestaetigen",
    { schema: { body: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const secret = req.benutzer!.zweiFaSecret;
      if (!secret) return reply.code(400).send({ error: "2FA wurde noch nicht eingerichtet." });
      if (!(await totpCodeGueltig(secret, req.body.code))) {
        return reply.code(401).send({ error: "Der Bestätigungscode ist ungültig." });
      }
      const aktualisiert = await insertDoc({ ...req.benutzer!, zweiFaAktiv: true });
      return oeffentlichesProfil(aktualisiert);
    },
  );

  app.post<{ Body: { passwort: string } }>(
    "/benutzer/2fa/deaktivieren",
    { schema: { body: { type: "object", required: ["passwort"], properties: { passwort: { type: "string" } } } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      if (!req.benutzer!.passwortHash || !(await passwortStimmt(req.body.passwort, req.benutzer!.passwortHash))) {
        return reply.code(401).send({ error: "Passwort ist falsch." });
      }
      const aktualisiert = await insertDoc({ ...req.benutzer!, zweiFaAktiv: false, zweiFaSecret: undefined });
      return oeffentlichesProfil(aktualisiert);
    },
  );

  // --- Instanz-Kopplung (Turnier-Sync, Abschnitt 21.3/23) ---
  // Kurzlebiger Einmal-Code (Vorbild: Einladungs-Token oben), gegen den sich eine lokale
  // Installation einmalig ein dauerhaftes Credential eintauscht (siehe routes/instanzSync.ts,
  // POST /instanzen/kopplung-einloesen).

  app.post("/benutzer/mich/instanz-kopplungscode", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { token, hash } = erzeugeToken();
    await insertDoc({
      ...req.benutzer!,
      instanzKopplungscodeHash: hash,
      instanzKopplungscodeAblauf: new Date(Date.now() + KOPPLUNG_GUELTIG_MS).toISOString(),
    });
    return reply.send({ kopplungscode: token, gueltigBis: new Date(Date.now() + KOPPLUNG_GUELTIG_MS).toISOString() });
  });

  app.get("/benutzer/mich/instanzen", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const instanzen = await findAllBySelector<VerbundeneInstanz>({
      docType: "verbundeneInstanz",
      benutzerId: req.benutzer!._id,
      widerrufen: false,
    });
    // instanzTokenHash nie an den Client zurueckgeben.
    return instanzen.map(({ instanzTokenHash: _instanzTokenHash, ...oeffentlich }) => oeffentlich);
  });

  app.post<{ Params: { id: string } }>("/benutzer/mich/instanzen/:id/widerrufen", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const instanz = await findById<VerbundeneInstanz>(req.params.id);
    if (!instanz || instanz.benutzerId !== req.benutzer!._id) {
      return reply.code(404).send({ error: "Instanz nicht gefunden" });
    }
    await insertDoc({ ...instanz, widerrufen: true, widerrufenAm: new Date().toISOString() });
    return reply.code(204).send();
  });
}

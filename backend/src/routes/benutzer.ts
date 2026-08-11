import type { FastifyInstance } from "fastify";
import type { Benutzer, GlobaleRolle } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";
import { oeffentlichesProfil } from "../auth/benutzerProfil";
import { hashePasswort, passwortRegelVerstoss, passwortStimmt } from "../auth/passwort";
import { requireAuth, requireRolle } from "../auth/plugin";
import { loescheAlleSessionenVonBenutzer, loescheAndereSessionenVonBenutzer } from "../auth/session";
import { erzeugeOtpAuthUri, erzeugeQrCodeDataUri, erzeugeTotpSecret, totpCodeGueltig } from "../auth/totp";
import { erzeugeToken, hashe } from "../auth/token";
import { mailKonfiguriert, sendeMail } from "../mail/transport";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

const EINLADUNG_GUELTIG_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const RESET_GUELTIG_MS = 24 * 60 * 60 * 1000; // Abschnitt 21.4: 24 Stunden

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

      if (mailKonfiguriert()) {
        try {
          await sendeMail({
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
      email?: string;
      aktuellesPasswort?: string;
      standardTheme?: Benutzer["standardTheme"];
      standardDichte?: Benutzer["standardDichte"];
    };
  }>(
    "/benutzer/mich",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            email: { type: "string", minLength: 1 },
            aktuellesPasswort: { type: "string" },
            standardTheme: { type: "string", enum: ["system", "light", "dark"] },
            standardDichte: { type: "string", enum: ["standard", "schmal"] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      // standardTheme/standardDichte sind reine Anzeige-Voreinstellungen, keine
      // sensiblen Felder (siehe CLAUDE.md) - anders als E-Mail/Passwort/2FA
      // deshalb ohne Passwort-Bestaetigung aenderbar.
      const aenderungen: Partial<Pick<Benutzer, "name" | "email" | "standardTheme" | "standardDichte">> = {};

      if (req.body.name) {
        aenderungen.name = req.body.name;
      }

      if (req.body.standardTheme) {
        aenderungen.standardTheme = req.body.standardTheme;
      }

      if (req.body.standardDichte) {
        aenderungen.standardDichte = req.body.standardDichte;
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

      const aktualisiert = await insertDoc({ ...bestehend, ...req.body });
      return oeffentlichesProfil(aktualisiert);
    },
  );

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

        if (mailKonfiguriert()) {
          try {
            await sendeMail({
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

      await insertDoc({
        ...benutzer,
        passwortHash: await hashePasswort(req.body.neuesPasswort),
        resetTokenHash: undefined,
        resetAblauf: undefined,
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
}

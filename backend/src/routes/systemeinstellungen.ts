import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Systemeinstellungen } from "@torball/shared";
import { insertDoc } from "../repository";
import { requireRolle } from "../auth/plugin";
import { testeSmtpVerbindung } from "../mail/transport";
import {
  aktuelleSystemeinstellungen,
  oeffentlicheSystemeinstellungen,
  SYSTEMEINSTELLUNGEN_ID,
} from "../systemeinstellungen";

interface SystemeinstellungenBody {
  selbstregistrierungErlaubt: boolean;
  selbstregistrierungStandardRolle: "benutzer" | "manager";
  mailversandAktiv: boolean;
  // null loescht einen gesetzten Wert gezielt; ein FEHLENDES Feld laesst den bisherigen Wert
  // unveraendert (siehe CLAUDE.md, "Optionale Textfelder leeren") - fuer smtpPasswort wichtig,
  // weil das Formular den aktuellen Geheimwert nie anzeigt und ihn beim Speichern nur mitschickt,
  // wenn tatsaechlich ein neuer Wert eingegeben wurde.
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPasswort?: string | null;
  smtpAbsender?: string | null;
  benachrichtigungEmpfaenger?: string | null;
}

const systemeinstellungenSchema = {
  type: "object",
  required: ["selbstregistrierungErlaubt", "selbstregistrierungStandardRolle", "mailversandAktiv"],
  properties: {
    selbstregistrierungErlaubt: { type: "boolean" },
    // "admin" bewusst nicht im enum: eine Selbstregistrierung darf nie automatisch
    // Admin-Rechte vergeben (siehe SelbstregistrierungsRolle in shared).
    selbstregistrierungStandardRolle: { type: "string", enum: ["benutzer", "manager"] },
    mailversandAktiv: { type: "boolean" },
    smtpHost: { type: ["string", "null"] },
    smtpPort: { type: ["number", "null"] },
    smtpUser: { type: ["string", "null"] },
    smtpPasswort: { type: ["string", "null"] },
    smtpAbsender: { type: ["string", "null"] },
    benachrichtigungEmpfaenger: { type: ["string", "null"] },
  },
} as const;

/** undefined = Feld fehlte im Body -> bisherigen Wert behalten; null -> gezielt loeschen. */
function feldOderBisherig<T>(wert: T | null | undefined, bisherigerWert: T | undefined): T | undefined {
  return wert === undefined ? bisherigerWert : (wert ?? undefined);
}

const nurAdmin = (req: FastifyRequest, reply: FastifyReply): boolean => requireRolle(req, reply, ["admin"]);

/** Systemweite App-Einstellungen (Selbstregistrierung + E-Mail-Versand), nur fuer Admins - lesend
 *  wie schreibend, anders als die (allen angemeldeten Personen lesbaren) Standardregeln, weil es
 *  hier keinen Grund gibt, dass normale Benutzer diese Werte einsehen muessen. */
export async function systemeinstellungenRoutes(app: FastifyInstance): Promise<void> {
  app.get("/systemeinstellungen", async (req, reply) => {
    if (!nurAdmin(req, reply)) return;
    return oeffentlicheSystemeinstellungen(await aktuelleSystemeinstellungen());
  });

  app.put<{ Body: SystemeinstellungenBody }>(
    "/systemeinstellungen",
    { schema: { body: systemeinstellungenSchema } },
    async (req, reply) => {
      if (!nurAdmin(req, reply)) return;

      const bisherige = await aktuelleSystemeinstellungen();
      const neu: Systemeinstellungen = {
        ...bisherige,
        _id: SYSTEMEINSTELLUNGEN_ID,
        docType: "systemeinstellungen",
        selbstregistrierungErlaubt: req.body.selbstregistrierungErlaubt,
        selbstregistrierungStandardRolle: req.body.selbstregistrierungStandardRolle,
        mailversandAktiv: req.body.mailversandAktiv,
        smtpHost: feldOderBisherig(req.body.smtpHost, bisherige.smtpHost),
        smtpPort: feldOderBisherig(req.body.smtpPort, bisherige.smtpPort),
        smtpUser: feldOderBisherig(req.body.smtpUser, bisherige.smtpUser),
        smtpPasswort: feldOderBisherig(req.body.smtpPasswort, bisherige.smtpPasswort),
        smtpAbsender: feldOderBisherig(req.body.smtpAbsender, bisherige.smtpAbsender),
        benachrichtigungEmpfaenger: feldOderBisherig(req.body.benachrichtigungEmpfaenger, bisherige.benachrichtigungEmpfaenger),
        geaendertVon: req.benutzer!._id,
        geaendertAm: new Date().toISOString(),
      };
      const gespeichert = await insertDoc(neu);
      return oeffentlicheSystemeinstellungen(gespeichert);
    },
  );

  // Bewusst 200 + { ok:false, fehler } statt einem HTTP-Fehler - ein fehlgeschlagener
  // Verbindungstest ist ein normales, erwartbares Ergebnis fuer den Knopf in der Oberflaeche,
  // kein Server-Fehler. Fehlende Felder fallen auf den bereits gespeicherten Wert zurueck, damit
  // ein Test auch ohne erneute Passwort-Eingabe moeglich ist (gleiches Muster wie
  // /mail-postfach/einstellungen/imap-testen).
  app.post<{ Body: { host?: string; port?: number; user?: string; passwort?: string } }>(
    "/systemeinstellungen/smtp-testen",
    async (req, reply) => {
      if (!nurAdmin(req, reply)) return;
      const bisherige = await aktuelleSystemeinstellungen();
      const host = req.body.host ?? bisherige.smtpHost;
      const port = req.body.port ?? bisherige.smtpPort ?? 587;
      const user = req.body.user ?? bisherige.smtpUser;
      const passwort = req.body.passwort ?? bisherige.smtpPasswort;
      if (!host || !user || !passwort) {
        return { ok: false, fehler: "Host, Benutzer und Passwort werden benötigt." };
      }
      try {
        await testeSmtpVerbindung({ host, port, user, passwort });
        return { ok: true };
      } catch (err) {
        return { ok: false, fehler: err instanceof Error ? err.message : "Verbindung fehlgeschlagen" };
      }
    },
  );
}

import type { Systemeinstellungen, SystemeinstellungenOeffentlich } from "@torball/shared";
import { findById } from "./repository";
import type { SmtpVerbindung } from "./mail/transport";

/** Singleton-Dokument, immer dieselbe feste ID (kein newId()/UUID noetig, es gibt nur eines). */
export const SYSTEMEINSTELLUNGEN_ID = "systemeinstellungen:global";

/** Ausgangswerte, solange noch keine Systemeinstellungen gespeichert wurden. Selbstregistrierung
 *  ist bewusst standardmaessig AUS (Default = sicherste Einstellung fuer eine frische Instanz). */
export const STANDARD_SYSTEMEINSTELLUNGEN: Systemeinstellungen = {
  _id: SYSTEMEINSTELLUNGEN_ID,
  docType: "systemeinstellungen",
  selbstregistrierungErlaubt: false,
  selbstregistrierungStandardRolle: "benutzer",
};

/** Die aktuell gueltigen Systemeinstellungen; Fallback auf die Standardwerte, solange noch
 *  keine gespeichert wurden (frische Installation). */
export async function aktuelleSystemeinstellungen(): Promise<Systemeinstellungen> {
  const doc = await findById<Systemeinstellungen>(SYSTEMEINSTELLUNGEN_ID);
  return doc ?? STANDARD_SYSTEMEINSTELLUNGEN;
}

/** Filtert das SMTP-Passwort heraus, bevor die Einstellungen an die Oberflaeche gehen - gleiches
 *  Muster wie oeffentlichesProfil()/oeffentlicheMailPostfachEinstellungen(). */
export function oeffentlicheSystemeinstellungen(einstellungen: Systemeinstellungen): SystemeinstellungenOeffentlich {
  return {
    selbstregistrierungErlaubt: einstellungen.selbstregistrierungErlaubt,
    selbstregistrierungStandardRolle: einstellungen.selbstregistrierungStandardRolle,
    mailversandAktiv: einstellungen.mailversandAktiv ?? false,
    smtpHost: einstellungen.smtpHost,
    smtpPort: einstellungen.smtpPort,
    smtpUser: einstellungen.smtpUser,
    smtpPasswortGesetzt: Boolean(einstellungen.smtpPasswort),
    smtpAbsender: einstellungen.smtpAbsender,
  };
}

/** Baut aus den gespeicherten Systemeinstellungen eine SmtpVerbindung fuer sendeMail() - undefined,
 *  solange der Versand nicht aktiviert ist oder Host/Benutzer/Passwort nicht vollstaendig gesetzt
 *  sind. Aufrufer (Einladung/Passwort-Reset in routes/benutzer.ts) fallen dann auf den
 *  Link-in-Antwort/Server-Log-Fallback zurueck. */
export function smtpVerbindungAus(einstellungen: Systemeinstellungen): SmtpVerbindung | undefined {
  if (!einstellungen.mailversandAktiv) return undefined;
  if (!einstellungen.smtpHost || !einstellungen.smtpUser || !einstellungen.smtpPasswort) return undefined;
  return {
    host: einstellungen.smtpHost,
    port: einstellungen.smtpPort ?? 587,
    user: einstellungen.smtpUser,
    passwort: einstellungen.smtpPasswort,
    absender: einstellungen.smtpAbsender,
  };
}

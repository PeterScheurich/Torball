import type { Systemeinstellungen, SystemeinstellungenOeffentlich } from "@torball/shared";
import { findById } from "./repository";
import { sendeMail, type SmtpVerbindung } from "./mail/transport";

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
    benachrichtigungEmpfaenger: einstellungen.benachrichtigungEmpfaenger,
    videos: einstellungen.videos ?? [],
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

/** Verschickt (best effort) eine Benachrichtigung an den konfigurierten Empfaenger, wenn sich
 *  jemand selbst registriert oder eine Einladung annimmt (Nutzer-Vorgabe) - ohne konfigurierten
 *  Empfaenger oder aktivierten/vollstaendigen SMTP-Versand passiert nichts. Ein Fehlschlag wird nur
 *  geloggt, nie an den Aufrufer durchgereicht: die Registrierung/Aktivierung selbst darf davon nie
 *  abhaengen. */
export async function benachrichtigeNeuenAccount(
  einstellungen: Systemeinstellungen,
  anlass: "registrierung" | "einladung-angenommen",
  neuerBenutzer: { name: string; email: string },
): Promise<void> {
  if (!einstellungen.benachrichtigungEmpfaenger) return;
  const smtp = smtpVerbindungAus(einstellungen);
  if (!smtp) return;
  const anlassText = anlass === "registrierung" ? "sich selbst registriert" : "eine Einladung angenommen";
  try {
    await sendeMail(smtp, {
      an: einstellungen.benachrichtigungEmpfaenger,
      betreff: "Neuer Account - Torball-Turniere",
      text: `${neuerBenutzer.name} (${neuerBenutzer.email}) hat ${anlassText}.`,
    });
  } catch (err) {
    console.error("Benachrichtigung ueber neuen Account konnte nicht versendet werden", err);
  }
}

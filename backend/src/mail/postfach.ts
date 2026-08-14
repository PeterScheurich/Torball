import type { MailPostfachEinstellungen, MailPostfachEinstellungenOeffentlich } from "@torball/shared";
import { findById } from "../repository";
import { STANDARD_AUFBEWAHRUNG_TAGE } from "./berichtHilfen";

/** Singleton-Dokument, feste ID (analog SYSTEMEINSTELLUNGEN_ID). */
export const MAIL_POSTFACH_EINSTELLUNGEN_ID = "mailPostfachEinstellungen:global";

export const STANDARD_MAIL_POSTFACH_EINSTELLUNGEN: MailPostfachEinstellungen = {
  _id: MAIL_POSTFACH_EINSTELLUNGEN_ID,
  docType: "mailPostfachEinstellungen",
  berichtszeit: "07:00",
  aufbewahrungTage: STANDARD_AUFBEWAHRUNG_TAGE,
};

/**
 * Nur auf der Entwicklungsinstanz gesetzt (`MAIL_POSTFACH_AKTIV=true` in backend/.env, analog
 * `KANBAN_SYNC`/`DEMO_SNAPSHOT_ERLAUBT`) - schaltet die komplette Funktion frei: Routen
 * (`routes/mailPostfach.ts`), Admin-Menuepunkt im Frontend und den taeglichen Job
 * (`mail/scheduler.ts`). Auf Prod/Demo bewusst weglassen.
 */
export function mailPostfachAktiv(): boolean {
  return process.env.MAIL_POSTFACH_AKTIV === "true";
}

/** Die aktuellen Betriebsparameter; Fallback auf Standardwerte, solange noch keine gespeichert
 *  wurden (frische Installation bzw. noch nie ueber die Oberflaeche angepasst). */
export async function aktuelleMailPostfachEinstellungen(): Promise<MailPostfachEinstellungen> {
  const doc = await findById<MailPostfachEinstellungen>(MAIL_POSTFACH_EINSTELLUNGEN_ID);
  return doc ?? STANDARD_MAIL_POSTFACH_EINSTELLUNGEN;
}

/** Filtert die beiden Geheimwerte heraus, bevor die Einstellungen an die Oberflaeche gehen -
 *  gleiches Muster wie oeffentlichesProfil() fuer Benutzer (Passwort-Hash/2FA-Secret). */
export function oeffentlicheMailPostfachEinstellungen(
  einstellungen: MailPostfachEinstellungen,
): MailPostfachEinstellungenOeffentlich {
  return {
    berichtszeit: einstellungen.berichtszeit,
    berichtEmpfaenger: einstellungen.berichtEmpfaenger,
    imapHost: einstellungen.imapHost,
    imapPort: einstellungen.imapPort,
    imapUser: einstellungen.imapUser,
    imapPasswortGesetzt: Boolean(einstellungen.imapPasswort),
    anthropicApiKeyGesetzt: Boolean(einstellungen.anthropicApiKey),
    aufbewahrungTage: einstellungen.aufbewahrungTage ?? STANDARD_AUFBEWAHRUNG_TAGE,
  };
}

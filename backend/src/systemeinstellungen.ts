import type { Systemeinstellungen } from "@torball/shared";
import { findById } from "./repository";

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

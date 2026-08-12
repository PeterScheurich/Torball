import { BenutzerId, CouchMeta, Zeitstempel } from "./common";
import type { GlobaleRolle } from "./benutzer";

/** Rollen, die eine Selbstregistrierung automatisch vergeben darf - bewusst ohne "admin": eine
 *  offene Selbstregistrierung darf nie automatisch Admin-Rechte verteilen. */
export type SelbstregistrierungsRolle = Exclude<GlobaleRolle, "admin">;

/**
 * Systemweite App-Einstellungen (Singleton-Dokument, immer dieselbe feste ID - siehe
 * backend/src/systemeinstellungen.ts). Anders als Systemkonfiguration/Turnierregeln bewusst NICHT
 * versioniert: es gibt hier keinen Anwendungsfall, bei dem eine aeltere Version noch gebraucht
 * wird (die Werte wirken immer nur "ab jetzt", werden nirgends in ein Turnier hineinkopiert).
 * Gedacht als Erweiterungspunkt fuer kuenftige globale Schalter, aktuell nur Selbstregistrierung.
 */
export interface Systemeinstellungen extends CouchMeta {
  docType: "systemeinstellungen";
  selbstregistrierungErlaubt: boolean;
  selbstregistrierungStandardRolle: SelbstregistrierungsRolle;
  geaendertVon?: BenutzerId;
  geaendertAm?: Zeitstempel;
}

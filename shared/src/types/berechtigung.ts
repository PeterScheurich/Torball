import { BenutzerId, CouchMeta, TurnierBerechtigungId, TurnierId, Zeitstempel } from "./common";

/**
 * Siehe Gesamtspezifikation Abschnitt 20.16/21.3. "turnierleitung" und
 * "spielleitung" sind beide Schreibrollen (Abschnitt 21.2, "Schreiben"),
 * unterscheiden sich nur im Verantwortungsbereich; "lesen" entspricht
 * dem Lesezugriff ("Lesen").
 */
export type TurnierRolle = "turnierleitung" | "spielleitung" | "lesen";

/** Siehe Gesamtspezifikation Abschnitt 20.16. */
export interface TurnierBerechtigung extends CouchMeta {
  docType: "turnierBerechtigung";
  berechtigungId: TurnierBerechtigungId;
  turnierId: TurnierId;
  benutzerId: BenutzerId;
  rolle: TurnierRolle;
  vergebenVon?: BenutzerId;
  vergebenAm: Zeitstempel;
}

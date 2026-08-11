import { BenutzerId, CouchMeta, SystemkonfigurationId, Zeitstempel } from "./common";
import { Turnierregeln } from "./turnier";

/**
 * Siehe Gesamtspezifikation Abschnitt 20.2. Jede Admin-Änderung erzeugt
 * einen neuen Datensatz (nie Update); genau ein Datensatz hat istAktuell=true.
 * Beim Anlegen eines Turniers werden die aktuellen Werte kopiert, nicht
 * referenziert (siehe Turnier.erstelltMitKonfigVersion).
 *
 * Enthält über `Turnierregeln` denselben Regel-/Wertungssatz wie ein Turnier -
 * das sind die Standardwerte, die beim Anlegen ins Turnier kopiert werden.
 */
export interface Systemkonfiguration extends CouchMeta, Turnierregeln {
  docType: "systemkonfiguration";
  konfigId: SystemkonfigurationId;
  version: number;
  istAktuell: boolean;
  gueltigAb: Zeitstempel;
  passwortMindestlaenge: number;
  geaendertVon?: BenutzerId;
  geaendertAm?: Zeitstempel;
  aenderungskommentar?: string;
}

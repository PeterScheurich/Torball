import { BenutzerId, CouchMeta, SystemkonfigurationId, Zeitstempel } from "./common";

/**
 * Siehe Gesamtspezifikation Abschnitt 20.2. Jede Admin-Änderung erzeugt
 * einen neuen Datensatz (nie Update); genau ein Datensatz hat istAktuell=true.
 * Beim Anlegen eines Turniers werden die aktuellen Werte kopiert, nicht
 * referenziert (siehe Turnier.erstelltMitKonfigVersion).
 */
export interface Systemkonfiguration extends CouchMeta {
  docType: "systemkonfiguration";
  konfigId: SystemkonfigurationId;
  version: number;
  istAktuell: boolean;
  gueltigAb: Zeitstempel;
  punkteSieg: number;
  punkteUnentschieden: number;
  forfaitErgebnis: string;
  passwortMindestlaenge: number;
  geaendertVon?: BenutzerId;
  geaendertAm?: Zeitstempel;
  aenderungskommentar?: string;
}

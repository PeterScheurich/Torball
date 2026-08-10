import { BenutzerId, CouchMeta, DokumentAnhangId, TurnierId, Zeitstempel } from "./common";

/** Siehe Gesamtspezifikation Abschnitt 20.13. */
export interface DokumentAnhang extends CouchMeta {
  docType: "dokumentAnhang";
  anhangId: DokumentAnhangId;
  turnierId: TurnierId;
  titel: string;
  beschreibung?: string;
  /** Referenz/Pfad zur Datei. */
  datei: string;
  erstelltVon?: BenutzerId;
  erstelltAm: Zeitstempel;
}

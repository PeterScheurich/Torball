import { BenutzerId, CouchMeta, SpielId, SpielprotokollId, Zeitstempel } from "./common";

export type SpielprotokollStatus = "offen" | "beendet" | "abgeschlossen";

/**
 * Siehe Gesamtspezifikation Abschnitt 20.11 (nur bei protokollierungsart=digital).
 * Die vollständige Historie mehrerer Protokollanten wird NICHT redundant
 * gespeichert, sondern aus den HANDOVER-Events plus erstelltVon berechnet
 * (konsistent zum Event-Sourcing-Prinzip, Abschnitt 22.1).
 */
export interface Spielprotokoll extends CouchMeta {
  docType: "spielprotokoll";
  protokollId: SpielprotokollId;
  spielId: SpielId;
  status: SpielprotokollStatus;
  erstelltVon?: BenutzerId;
  /** Letzter Unterzeichner ("Unterschrift"). */
  protokollantName?: string;
  protokollantBestaetigtAm?: Zeitstempel;
}

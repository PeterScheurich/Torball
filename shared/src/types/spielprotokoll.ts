import { BenutzerId, CouchMeta, SpielId, SpielprotokollId, TurnierId, Zeitstempel } from "./common";

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
  /** Denormalisiert (Kaskaden-Loeschung + Sync-Export-Validierung, analog Event.turnierId). */
  turnierId: TurnierId;
  status: SpielprotokollStatus;
  erstelltVon?: BenutzerId;
  /**
   * Name beim Protokoll-Start (abgefragt, kein Konto noetig). Die vollstaendige
   * Protokollanten-Historie = dieser Startwert plus die HANDOVER-Events (Spez. 20.11).
   */
  ersterProtokollantName: string;
  /** Letzter Unterzeichner ("Unterschrift"). */
  protokollantName?: string;
  protokollantBestaetigtAm?: Zeitstempel;
  /**
   * Nur beim konfigurierbaren Vier-Augen-Abschluss (Turnier.protokollBestaetigungErforderlich):
   * die Turnierleitungs-Bestaetigung nach der Unterschrift des Protokollanten.
   */
  turnierleitungBestaetigtAm?: Zeitstempel;
  turnierleitungBestaetigtVonName?: string;
  /** Reine Anzeige-Einstellung "welches Team links/rechts" (Spez. 7.3), aendert keine Daten. */
  seiteAVertauscht?: boolean;
}

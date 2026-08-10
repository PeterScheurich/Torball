import { CouchMeta, MannschaftId, SpielerId, TurnierId } from "./common";

export type Klassifizierung = "B1" | "B2" | "B3" | "sehend" | "AB";

export type SpielerStatus = "aktiv" | "gesperrt";

/**
 * Siehe Gesamtspezifikation Abschnitt 20.8. Spieler werden turnierbezogen
 * erfasst; dieselbe Person kann bei verschiedenen Turnieren für
 * verschiedene Mannschaften spielen.
 */
export interface Spieler extends CouchMeta {
  docType: "spieler";
  spielerId: SpielerId;
  mannschaftId: MannschaftId;
  name: string;
  vorname?: string;
  /** Normalerweise einstellig (siehe Turnier.einstelligeTrikotnummern). */
  trikotnummer: string;
  klassifizierung: Klassifizierung;
  status: SpielerStatus;
  importiertAusTurnierId?: TurnierId;
}

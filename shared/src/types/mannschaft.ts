import { CouchMeta, MannschaftId, TeamId, TurnierId, VereinId } from "./common";

/**
 * Siehe Gesamtspezifikation Abschnitt 20.7/15. teamId/vereinId sind reine
 * Herkunftsreferenzen (kein Live-Join) – alle Anzeigedaten werden bei der
 * Übernahme aus den Stammdaten kopiert, nicht verknüpft.
 */
export interface MannschaftImTurnier extends CouchMeta {
  docType: "mannschaftImTurnier";
  mannschaftId: MannschaftId;
  turnierId: TurnierId;
  teamId?: TeamId;
  vereinId?: VereinId;
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
  /**
   * Bis zu drei Trainer/Betreuer je Mannschaft (alle optional). Fachlicher Hintergrund
   * (Bundesliga): diese Personen dürfen mit auf der Auswechselbank sitzen – daher werden
   * sie an der Mannschaft und nicht als Spieler geführt. Das jeweilige
   * `betreuerNIstSchiedsrichter`-Flag markiert, dass die Person zugleich als
   * Schiedsrichter fungiert (Trainer sind häufig beides) – Anknüpfungspunkt zur
   * Schiedsrichter-Verwaltung.
   */
  betreuer1Name?: string;
  betreuer1IstSchiedsrichter?: boolean;
  betreuer2Name?: string;
  betreuer2IstSchiedsrichter?: boolean;
  betreuer3Name?: string;
  betreuer3IstSchiedsrichter?: boolean;
  importiertAusTurnierId?: TurnierId;
  /** Bei Datenuebernahme gesetzt: Verweis auf die Mannschaft im Vorgaenger-Turnier (dasselbe
   *  Team am vorherigen Spieltag). Grundlage fuer die Zuordnung bei der Gesamttabellen-Aggregation
   *  ueber beide Spieltage. */
  importiertAusMannschaftId?: MannschaftId;
  /**
   * Manuelle Sortierposition innerhalb des Turniers (nicht Teil der
   * Gesamtspezifikation, praktische Ergaenzung): steuert sowohl die
   * Anzeige-Reihenfolge der Mannschaften als auch - da erzeugePaarungen
   * die Mannschaften in dieser Reihenfolge durchlaeuft - die Reihenfolge
   * neu generierter Spielplan-Vorschlaege.
   */
  reihenfolge: number;
}

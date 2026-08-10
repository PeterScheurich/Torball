import { BenutzerId, CouchMeta, WettbewerbId, Zeitstempel } from "./common";

/** Siehe Gesamtspezifikation Abschnitt 20.3. Optional, für mehrtägige Turnierserien. */
export interface Wettbewerb extends CouchMeta {
  docType: "wettbewerb";
  wettbewerbId: WettbewerbId;
  name: string;
  saison?: string;
  anzahlSpieltage?: number;
  modus?: string;
  erstelltVon?: BenutzerId;
  erstelltAm: Zeitstempel;
}

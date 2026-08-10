import {
  BenutzerId,
  CouchMeta,
  ErgebnisAenderungId,
  ErgebnisTokenId,
  SpielId,
  TurnierId,
  Zeitstempel,
} from "./common";

/** Siehe Gesamtspezifikation Abschnitt 20.14 (nur bei protokollierungsart=manuell). */
export interface ErgebnisToken extends CouchMeta {
  docType: "ergebnisToken";
  tokenId: ErgebnisTokenId;
  turnierId: TurnierId;
  /** Zufällig, für die URL. */
  tokenWert: string;
  erstelltVon?: BenutzerId;
  erstelltAm: Zeitstempel;
  widerrufen: boolean;
  widerrufenAm?: Zeitstempel;
}

/** Siehe Gesamtspezifikation Abschnitt 20.14 (nur bei protokollierungsart=manuell). */
export interface ErgebnisAenderung extends CouchMeta {
  docType: "ergebnisAenderung";
  aenderungId: ErgebnisAenderungId;
  spielId: SpielId;
  /** Freitext, beim ersten Aufruf am Gerät abgefragt. */
  erfasserName: string;
  /** Optional, lokal generierte Geräte-Kennung. */
  geraetKennung?: string;
  alterWertA?: number;
  alterWertB?: number;
  neuerWertA: number;
  neuerWertB: number;
  zeitstempel: Zeitstempel;
}

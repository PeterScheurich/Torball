import { BenutzerId, CouchMeta, FeldId, TurnierId, WettbewerbId, Zeitstempel } from "./common";

export type TurnierStatus = "entwurf" | "aktiv" | "archiviert";

export type Protokollierungsart = "digital" | "manuell";

/** Rundenmodus für die automatische Spielplan-Erstellung (Abschnitt 8). */
export type Spielmodus = "einfach" | "doppelt";

/** Reihenfolge der Kriterien bestimmt die Tabellensortierung bei Gleichstand. */
export type TabellenKriterium =
  | "punkte"
  | "tordifferenz"
  | "tore"
  | "direkter_vergleich"
  | "freiwuerfe";

/**
 * Spielfeld ist laut Abschnitt 20.5 ein in Turnier eingebettetes
 * Werteobjekt (Array), kein eigenständiges Dokument.
 */
export interface Spielfeld {
  feldId: FeldId;
  name: string;
}

/** Siehe Gesamtspezifikation Abschnitt 20.5. */
export interface Turnier extends CouchMeta {
  docType: "turnier";
  turnierId: TurnierId;
  wettbewerbId?: WettbewerbId;
  name: string;
  /** Format YYYY-MM-DD. */
  datum: string;
  /** Format HH:mm. */
  startzeit?: string;
  status: TurnierStatus;

  spielortName?: string;
  spielortAdresse?: string;
  spielortGeo?: string;

  felder: Spielfeld[];

  protokollierungsart: Protokollierungsart;

  modus?: string;
  /** Jeder-gegen-Jeden einfach oder doppelt; steuert die Spielplan-Erzeugung (Abschnitt 8). */
  spielplanModus: Spielmodus;
  /**
   * Ob im Anlege-Assistenten ein eigener Schritt zum Erfassen der Schiedsrichter (vor dem
   * Spielplan) durchlaufen wird. Rein den Assistenten-Ablauf steuernd - die
   * Schiedsrichter-Verwaltung selbst bleibt jederzeit ueber den gleichnamigen Reiter erreichbar.
   */
  schiedsrichterPlanung?: boolean;
  spielzeitMinuten: number;
  anzahlHalbzeiten: number;
  pauseMinuten: number;
  seitenwechsel: boolean;
  timeoutsJeHalbzeit: number;
  timeoutDauerSekunden: number;
  auswechslungenJeHalbzeit: number;
  tordifferenzAbbruch: boolean;
  tordifferenzLimit: number;
  verlaengerungAktiv: boolean;
  silbernesTor: boolean;
  maxSehendeSpieler: number;
  einstelligeTrikotnummern: boolean;

  punkteSieg: number;
  punkteUnentschieden: number;
  punkteNiederlage: number;
  tabellenKriterien: TabellenKriterium[];

  spielernamenOeffentlich: boolean;

  spielplanFreigegeben: boolean;
  spielplanVersion: number;
  spielplanGeaendertAm?: Zeitstempel;

  oeffentlichTurnierinfos: boolean;
  oeffentlichAnfahrtDokumente: boolean;
  oeffentlichSpielplan: boolean;
  oeffentlichErgebnisse: boolean;

  /**
   * Rein informativ, keine Fremdschlüssel-Semantik: Die Systemkonfiguration
   * ist versioniert, der kopierte Wertesatz lebt unabhängig weiter
   * (Kopie-statt-Referenz-Prinzip, Abschnitt 20.2).
   */
  erstelltMitKonfigVersion?: number;

  turnierleitungName?: string;
  turnierleitungKontakt?: string;
  ansprechpartnerName?: string;
  ansprechpartnerKontakt?: string;
  zusatzinfo?: string;

  erstelltVon?: BenutzerId;
  erstelltAm: Zeitstempel;
  geaendertVon?: BenutzerId;
  geaendertAm?: Zeitstempel;
}

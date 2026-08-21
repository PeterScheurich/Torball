import { BenutzerId, CouchMeta, EventId, SpielerId, SpielId, SpielprotokollId, TurnierId, Zeitstempel } from "./common";

/** Siehe Gesamtspezifikation Abschnitt 22.2. */
export type EventTyp =
  | "GO" // Spielzeit starten
  | "STOP" // Spielzeit anhalten
  | "B" // Halbzeit/Pause
  | "VB" // Verlängerung beginnt
  | "End" // Spiel beendet
  | "Fin" // Abschluss
  | "W" // Wurf
  | "K" // Kontrolle (Zwei-Timer-Modell)
  | "G" // Tor
  | "F" // Foul
  | "P" // Penalty
  | "PA" // Auto-erkannter Penalty (System-Hinweis)
  | "T" // Timeout
  | "TT" // Technischer Timeout
  | "E" // Wechsel
  | "FW" // Freiwurf
  | "HANDOVER" // Protokollantenwechsel
  | "PROT" // Protest
  // Ersatzlose Streichung (Undo): nur als Korrektur-Event gueltig (istKorrektur +
  // korrigiertEventId), annulliert das referenzierte Event und zaehlt selbst nie als Ereignis.
  // Eine Korrektur mit einem ANDEREN eventTyp ist dagegen ein Ersatz: sie annulliert das
  // referenzierte Event UND zaehlt selbst normal. Ausnahme PROT: eine Nicht-ANNULLIERT-Korrektur
  // auf ein PROT-Event ist eine Ergaenzung (Turnierleitungs-Entscheidung), das PROT-Event bleibt
  // wirksam. Details: docs/digitales-protokoll-konzept.md Abschnitt 3.
  | "ANNULLIERT";

export type Mannschaftsseite = "A" | "B";

/** "1"/"2" = Halbzeit, "V1"/"V2" = Verlängerung, "FW" = Freiwurfrunde. */
export type Halbzeit = "1" | "2" | "V1" | "V2" | "FW";

/** Siehe Gesamtspezifikation Abschnitt 20.12/22 (Event-Sourcing-Kern). */
export interface Event extends CouchMeta {
  docType: "event";
  eventId: EventId;
  protokollId: SpielprotokollId;
  /**
   * Denormalisiert (das Protokoll kennt Spiel und Turnier bereits): erlaubt Kaskaden-Loeschung
   * und Sync-Export-Validierung (pruefeTurnierExportPaket prueft die Turnier-Zugehoerigkeit
   * ueber turnierId) ohne Aufloesen der Kette Event -> Protokoll -> Spiel.
   */
  turnierId: TurnierId;
  spielId: SpielId;
  /**
   * Vom SERVER beim Anhaengen vergebene laufende Nummer je Protokoll (hoechste vorhandene + 1) -
   * ordnet die Events deterministisch; der zeitstempel allein reicht nicht (Geraete-Uhr,
   * Sekundengleichheit).
   */
  sequenz: number;
  zeitstempel: Zeitstempel;
  /** Spielzeit in Sekunden. */
  spielzeit?: number;
  halbzeit?: Halbzeit;
  eventTyp: EventTyp;
  /**
   * Die HANDELNDE Mannschaft - auch beim Eigentor (istEigentor): dort ist es die Mannschaft, die
   * den Ball ins eigene Tor befoerdert hat; die Gutschrift geht an die Gegenseite
   * (Auswertung: ergebnisAusEvents, Spez. 6.10).
   */
  mannschaft?: Mannschaftsseite;
  /** Bei G: Torschütze. Bei F: Verursacher. Bei W/FW: ausführender Spieler. */
  spielerId?: SpielerId;
  /** Nur bei eventTyp="E" (Wechsel): der ausgewechselte Spieler. */
  spielerRausId?: SpielerId;
  istEigentor: boolean;
  istKorrektur: boolean;
  korrigiertEventId?: EventId;
  /**
   * Eventspezifische Zusatzdaten, z.B. {neuerProtokollant} bei HANDOVER,
   * {begruendung, entscheidung} bei PROT.
   */
  zusatz?: Record<string, unknown>;
  erstelltVon?: BenutzerId;
  /**
   * Name des Protokollanten (die Person hat i.d.R. KEIN Benutzerkonto, sondern eine
   * Protokollant-Code-Session) - beim Protokoll-Start abgefragt, Muster
   * ErgebnisAenderung.erfasserName.
   */
  erstelltVonName?: string;
}

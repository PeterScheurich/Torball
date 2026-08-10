import { BenutzerId, CouchMeta, EventId, SpielerId, SpielprotokollId, Zeitstempel } from "./common";

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
  | "PROT"; // Protest

export type Mannschaftsseite = "A" | "B";

/** "1"/"2" = Halbzeit, "V1"/"V2" = Verlängerung, "FW" = Freiwurfrunde. */
export type Halbzeit = "1" | "2" | "V1" | "V2" | "FW";

/** Siehe Gesamtspezifikation Abschnitt 20.12/22 (Event-Sourcing-Kern). */
export interface Event extends CouchMeta {
  docType: "event";
  eventId: EventId;
  protokollId: SpielprotokollId;
  zeitstempel: Zeitstempel;
  /** Spielzeit in Sekunden. */
  spielzeit?: number;
  halbzeit?: Halbzeit;
  eventTyp: EventTyp;
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
}

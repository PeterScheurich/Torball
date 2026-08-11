import { BenutzerId, CouchMeta, Zeitstempel } from "./common";

export type KanbanId = string;

/** Spalten des Boards, bewusst schlank gehalten (siehe Protokoll zur Kanban-Erweiterung).
 * Fluss: offen -> inArbeit -> testen -> erledigt. */
export type KanbanSpalte = "offen" | "inArbeit" | "testen" | "erledigt";

/** Art der Karte - grob nach der Nutzer-Vorgabe (Bug, Feature, Wunsch, ...). */
export type KanbanKategorie = "bug" | "feature" | "wunsch" | "aufgabe" | "sonstiges";

export type KanbanPrioritaet = "hoch" | "mittel" | "niedrig";

/**
 * Karte auf dem Entwicklungs-Kanban-Board (nur Admins). Bewusst eine eigenstaendige,
 * mit dem Torball-Fachmodell nicht verbundene Entitaet - dient nur der Organisation der
 * Weiterentwicklung.
 *
 * Sync-Design (JSON-Export/-Import, siehe backend/src/routes/kanban.ts): `kanbanId` ist
 * die stabile fachliche ID ueber Instanzgrenzen hinweg, `aktualisiertAm` entscheidet beim
 * Zusammenfuehren (Last-Write-Wins je Karte). `erstelltVonName` wird bewusst denormalisiert
 * mitgefuehrt, damit ein Import auf einer anderen Instanz den Autor auch dann anzeigen kann,
 * wenn es den Benutzer dort gar nicht gibt.
 */
export interface KanbanKarte extends CouchMeta {
  docType: "kanbanKarte";
  kanbanId: KanbanId;
  titel: string;
  beschreibung?: string;
  spalte: KanbanSpalte;
  kategorie: KanbanKategorie;
  prioritaet: KanbanPrioritaet;
  /** Sortierung innerhalb der Spalte, aufsteigend. */
  reihenfolge: number;
  erstelltVon?: BenutzerId;
  /** Denormalisierter Anzeigename des Erstellers (fuer instanzuebergreifenden Sync). */
  erstelltVonName?: string;
  /** Denormalisierte E-Mail (Login) des Erstellers - eindeutige Identifikation fuer
   * Rueckfragen, auch instanzuebergreifend (die Benutzer-ID `erstelltVon` ist nur auf der
   * Quell-Instanz aufloesbar). Die Funktion laeuft stets angemeldet, also immer gesetzt. */
  erstelltVonEmail?: string;
  erstelltAm: Zeitstempel;
  aktualisiertAm: Zeitstempel;
}

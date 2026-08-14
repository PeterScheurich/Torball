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
 * die stabile fachliche ID ueber Instanzgrenzen hinweg. Inhaltliche Konflikte fuehren NICHT
 * automatisch zu Last-Write-Wins ueber `aktualisiertAm` (fruehere Design-Idee, so nie
 * umgesetzt) - stattdessen entscheidet die einladende Person je Karte manuell im UI
 * (lokal/eingehend uebernehmen), `aktualisiertAm` dient dabei nur als Orientierung, welcher
 * Stand neuer ist (siehe backend/src/kanban/importMerge.ts). `erstelltVonName` wird bewusst denormalisiert
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
  /** Herkunft ausserhalb der manuellen Board-Pflege, aktuell nur das Mail-Postfach
   * (backend/src/mail/bericht.ts). Fehlt bei ganz normal von Hand angelegten Karten. */
  herkunft?: "mailPostfach";
  /** true = automatisch von der KI-Klassifikation angelegt (ungeprueft) statt von Hand -
   * im UI als "KI · ungeprüft" markieren, damit sie nicht ungeprueft weiterbearbeitet wird. */
  kiErstellt?: boolean;
  /** Bei herkunft "mailPostfach": Referenz zurueck auf die ausloesende MailNachricht. */
  quellMailId?: string;
  /** Bei herkunft "mailPostfach": Absender der Ursprungsmail (roher MailNachricht.von-Wert,
   *  z.B. "Vorname Nachname <adresse@example.com>"), zum Zeitpunkt der Kartenerstellung
   *  uebernommen. Bewusst GETRENNT von erstelltVonName/-Email - die meinen bei einer
   *  automatisch/manuell aus einer Mail erzeugten Karte die Person, die den Berichtslauf
   *  ausgeloest bzw. auf "Als Kanban-Karte uebernehmen" geklickt hat, nicht den Melder (live
   *  aufgefallen: beide Namen fielen zufaellig zusammen, im Normalfall waeren sie verschieden). */
  mailAbsender?: string;
  erstelltAm: Zeitstempel;
  aktualisiertAm: Zeitstempel;
}

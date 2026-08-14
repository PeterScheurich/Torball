import { BenutzerId, CouchMeta, Zeitstempel } from "./common";

export type KanbanId = string;

/** Spalten des Boards, bewusst schlank gehalten (siehe Protokoll zur Kanban-Erweiterung).
 * Fluss: offen -> inArbeit -> testen -> erledigt. */
export type KanbanSpalte = "offen" | "inArbeit" | "testen" | "erledigt";

/** Art der Karte - grob nach der Nutzer-Vorgabe (Bug, Feature, Wunsch, ...). */
export type KanbanKategorie = "bug" | "feature" | "wunsch" | "aufgabe" | "sonstiges";

export type KanbanPrioritaet = "hoch" | "mittel" | "niedrig";

/** Eine einzelne Notiz zu einer Karte (Aktionen/Gedanken/Aenderungsvorschlaege) - siehe
 *  KanbanKarte.notizen. Nur additiv: es gibt kein Bearbeiten/Loeschen einzelner Notizen, nur
 *  Anhaengen (analog einem Kommentarverlauf). */
export interface KanbanNotiz {
  text: string;
  erstelltAm: Zeitstempel;
  /** Freitext (Anzeigename), keine Benutzer-ID - eine Notiz kann auch von einer KI-Sitzung
   *  (angemeldet als Admin-Account, z.B. "Claude") stammen, nicht nur von Menschen. */
  erstelltVonName?: string;
}

/**
 * Karte auf dem Entwicklungs-Kanban-Board (nur Admins). Bewusst eine eigenstaendige,
 * mit dem Torball-Fachmodell nicht verbundene Entitaet - dient nur der Organisation der
 * Weiterentwicklung.
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
  /** Denormalisierter Anzeigename des Erstellers, fuer Rueckfragen ohne extra Lookup. */
  erstelltVonName?: string;
  /** Denormalisierte E-Mail (Login) des Erstellers - eindeutige Identifikation fuer
   * Rueckfragen. Die Funktion laeuft stets angemeldet, also immer gesetzt. */
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
  /** Ergaenzungen zur Karte (Aktionen/Gedanken/Aenderungsvorschlaege) - bewusst NICHT auf der
   *  Karte selbst sichtbar, nur beim Bearbeiten (siehe KanbanBoardPage.tsx). Chronologisch
   *  (aeltere zuerst), nur anhaengbar. */
  notizen?: KanbanNotiz[];
  erstelltAm: Zeitstempel;
  aktualisiertAm: Zeitstempel;
}

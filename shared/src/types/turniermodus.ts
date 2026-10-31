/**
 * Turniermodi (Vorlagen) und der daraus berechnete Ablaufplan. Auftraggeber-Konzept 31.10.2026
 * (Kanban-Karte "Turniermodi als Vorlagen"): Die Vorlage legt nur die STRUKTUR fest, die Zahlen
 * (Teams je Gruppe, Endrundengroesse) stellt die Turnierleitung je Turnier ein. Spiele spaeterer
 * Runden entstehen erst, wenn die Mannschaften feststehen - bis dahin steht der Plan mit
 * Platzhaltern ("Sieger Gruppe A - Vierter Gruppe B") am Turnier-Dokument.
 */

/** Gruppen heissen A und B; bei einer einzigen Gruppe gibt es keine Kennung. */
export type GruppenKennung = "A" | "B";

/** Siehe `schiedsrichterAnzeige`-Muster: eine Vorlage ist reine Daten, ein neuer Modus braucht keinen Code. */
export interface TurniermodusVorlage {
  /** Stabile Kennung, z. B. "gruppen-endrunde". */
  id: string;
  name: string;
  beschreibung: string;
  version: number;
  /** Mitgelieferte Vorlagen sind schreibgeschuetzt (Stufe 2: kopieren und anpassen). */
  eingebaut: boolean;
  /** Anzahl der Gruppen der Vorrunde (jeder gegen jeden je Gruppe). */
  gruppen: 1 | 2;
  /** Darf die Turnierleitung die Vorrunde als doppelt (Hin- und Rueckspiel) einstellen? */
  doppeltWaehlbar: boolean;
  /** Erlaubte Endrundengroessen (Anzahl Teilnehmer); 0 = keine Endrunde. */
  endrundeGroessen: number[];
  standardEndrunde: number;
  platz3Standard: boolean;
  platzierungsspieleStandard: boolean;
  /**
   * Auftraggeber-Regel: In Zwischen- und Endrunden ist die Teilnehmerzahl IMMER gerade. Als Einstellung
   * der Vorlage statt als fester Code, damit sie sich lockern laesst, falls es je eine parallele
   * Zwischenrunde mit ungerader Zahl geben soll.
   */
  endrundeTeilnehmerGerade: boolean;
}

/** Die je Turnier einstellbaren Zahlen und Haken. */
export interface ModusEinstellungen {
  /** Teilnehmer der Endrunde (0 = keine). Bei zwei Gruppen steigen je Gruppe die Haelfte auf. */
  endrundeGroesse: number;
  /** Spiel um Platz 3 (nur sinnvoll, wenn es Halbfinale gibt). */
  platz3: boolean;
  /** Platzierungsspiele fuer die Mannschaften ausserhalb der Endrunde. */
  platzierungsspiele: boolean;
}

/** Wer in einer Paarung steht - ein Tabellenplatz der Vorrunde oder Sieger/Verlierer eines Plan-Spiels. */
export type PlanQuelle =
  | { typ: "gruppenplatz"; gruppe?: GruppenKennung; platz: number }
  | { typ: "sieger"; planId: string }
  | { typ: "verlierer"; planId: string };

export type PlanPhase = "platzierung" | "viertelfinale" | "halbfinale" | "finale" | "platz3";

/** Ein geplantes Spiel einer spaeteren Runde. Das echte Spiel-Dokument entsteht erst beim Erzeugen. */
export interface PlanSpiel {
  /** Stabile Kennung im Plan, z. B. "VF1", "HF2", "F", "P3", "PL5". */
  planId: string;
  phase: PlanPhase;
  /** Anzeigename, z. B. "Halbfinale 1" oder "Spiel um Platz 5". */
  bezeichnung: string;
  quelleA: PlanQuelle;
  quelleB: PlanQuelle;
  /** Abhaengigkeitstiefe: 0 = haengt nur von der Vorrunde ab, 1 = von Spielen der Schicht 0, ... */
  schicht: number;
  /** Feld und geplante Startzeit - vom Planer (`planeZeiten`) vergeben, nicht gespeichert gerechnet. */
  feldId?: string;
  startzeitGeplant?: string;
  /** Von der Turnierleitung eingetragene Verschiebung (Minuten), wirkt auf abhaengige Spiele mit. */
  versatzMinuten?: number;
  /** Gesetzt, sobald das echte Spiel erzeugt wurde. */
  spielId?: string;
  /** Bei Unentschieden: die von der Turnierleitung festgelegte Siegermannschaft (Mannschafts-ID). */
  entscheidung?: string;
}

/** Stufen der Rueckmeldung (Auftraggeber 31.10.2026): nichts davon blockiert. */
export type HinweisStufe = "hinweis" | "warnung" | "offen";

export interface PlanHinweis {
  stufe: HinweisStufe;
  text: string;
}

/** Ergebnis der Planberechnung. */
export interface ModusPlan {
  spiele: PlanSpiel[];
  hinweise: PlanHinweis[];
}

/**
 * Am Turnier gespeicherter Zustand des Modus: eine KOPIE der Vorlage (Schnappschuss wie bei den
 * Turnierregeln - so laeuft ein lokal geplantes Turnier auch auf dem Server, der die Vorlage nicht
 * kennt, und eine spaetere Aenderung der Vorlage beeinflusst kein laufendes Turnier), die
 * Einstellungen und der Plan.
 */
export interface TurnierModus {
  vorlage: TurniermodusVorlage;
  einstellungen: ModusEinstellungen;
  plan: PlanSpiel[];
  /**
   * Manuelle Rangentscheidung bei Gleichstand (Turnierleitung), je Gruppe ("" bei einer Gruppe):
   * Mannschafts-IDs in der gewuenschten Reihenfolge. Wirkt NUR dort, wo die Tabellenkriterien
   * keine Entscheidung liefern.
   */
  vorrang?: Record<string, string[]>;
}

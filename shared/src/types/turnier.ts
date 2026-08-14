import { BenutzerId, CouchMeta, FeldId, TurnierId, WettbewerbId, Zeitstempel } from "./common";

/**
 * Lebenszyklus eines Turniers:
 *  - "entwurf"      – in Planung (nicht oeffentlich)
 *  - "aktiv"        – laeuft / Spieltag (oeffentlich sichtbar)
 *  - "abgeschlossen"– von der Turnierleitung bewusst beendet; erscheint in der
 *                     Uebersicht unter "Abgeschlossen", bleibt aber vollstaendig
 *                     einsehbar/bearbeitbar (Wiederoeffnen moeglich)
 *  - "archiviert"   – Langzeit-Archiv (nur Ergebnisse), spaetere Erweiterung
 * "abgeschlossen" ergaenzt bewusst das Spez-Modell (Abschnitt 10.3 kannte nur
 * entwurf/aktiv/archiviert), damit die Uebersicht geplante von abgeschlossenen
 * Turnieren trennen kann und die Turnierleitung ein Turnier gezielt abschliesst.
 */
export type TurnierStatus = "entwurf" | "aktiv" | "abgeschlossen" | "archiviert";

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

/**
 * Schnappschuss der spielplan-relevanten Basiskonfiguration zum Zeitpunkt der letzten
 * Spielplan-Erzeugung. Damit lässt sich später erkennen (und konkret anzeigen), ob und was
 * sich seither geändert hat - der bestehende Spielplan passt dann evtl. nicht mehr zur Konfig.
 */
export interface SpielplanBasis {
  spielplanModus: Spielmodus;
  felder: Spielfeld[];
  mannschaften: { id: string; name: string }[];
  spielzeitMinuten: number;
  pauseMinuten: number;
  anzahlHalbzeiten: number;
  startzeit?: string;
}

/**
 * Regel-/Wertungsparameter eines Turniers (Spielzeit, Pausen, Timeouts, Wertung, …). Als
 * eigener Typ, damit die Systemkonfiguration (Standardwerte) und das Turnier (die beim Anlegen
 * kopierten Werte) exakt dieselben Felder tragen und nicht auseinanderlaufen. Nicht enthalten
 * sind bewusst die turnierindividuellen, nicht als "Standard" sinnvollen Felder wie Name,
 * Datum, Spielfelder oder der Spielmodus.
 */
export interface Turnierregeln {
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
  /** Wertung bei Nichtantreten (Forfait), Format „Sieger:Verlierer" (z.B. „3:0"). Wird von den
   *  „nicht angetreten"-Aktionen der Ergebniserfassung verwendet. */
  forfaitErgebnis: string;
  /** Steuert, ob bei der Spielplan-Erstellung Mannschaften desselben Bundeslands moeglichst frueh
   *  gegeneinander eingeplant werden (Gesamtspezifikation Abschnitt 5.2/8, "Bundesland-Regel").
   *  Standard „nein" - eine Eigenheit fuer Wettbewerbe mit festem Regionalbezug (z.B. Bundesliga,
   *  Deutsche Meisterschaft), nicht der Normalfall. Betrifft nur die Reihenfolge im Spielplan,
   *  nicht die Schiedsrichter-Zuordnung (die hat ihre eigene, unabhaengige Vereins-Regel). */
  bundeslandBeruecksichtigen: boolean;
}

/** Siehe Gesamtspezifikation Abschnitt 20.5. */
export interface Turnier extends CouchMeta, Turnierregeln {
  docType: "turnier";
  turnierId: TurnierId;
  /** Gemeinsame Klammer mehrerer Spieltag-Turniere (Hin-/Rueckspieltag, spaeter Saison mit
   *  mehreren Tagen). Turniere mit derselben wettbewerbId gehoeren zusammen und werden fuer
   *  die Gesamttabelle aggregiert. */
  wettbewerbId?: WettbewerbId;
  /** Gesetzt, wenn dieses Turnier per Datenuebernahme aus einem abgeschlossenen Vorgaenger-
   *  Turnier (vorheriger Spieltag) abgeleitet wurde - zeigt auf dieses Vorgaenger-Turnier. */
  basisTurnierId?: TurnierId;
  /** Spieltag-Nummer innerhalb des Wettbewerbs (1 = erster Spieltag). Aktuell max. 2. */
  spieltagNummer?: number;
  /** Nur bei abgeleiteten Turnieren: Regeln sind aus dem Vorgaenger uebernommen und gesperrt
   *  (sollten ueber beide Spieltage gleich sein). Die Turnierleitung kann bewusst entsperren
   *  (Escape-Hatch) - dann wird dieses Flag false. */
  regelnGesperrt?: boolean;
  name: string;
  /** Format YYYY-MM-DD. */
  datum: string;
  /** Format HH:mm. */
  startzeit?: string;
  status: TurnierStatus;

  spielortName?: string;
  spielortAdresse?: string;
  spielortGeo?: string;

  /** Optionales, je Turnier ueberschreibbares Logo als Data-URL (clientseitig verkleinert und im
   *  Dokument abgelegt - keine separate Dateiablage). Fehlt es, wird das Standard-Torball-Logo
   *  angezeigt. */
  logoDataUrl?: string;

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

  spielernamenOeffentlich: boolean;

  spielplanFreigegeben: boolean;
  spielplanVersion: number;
  spielplanGeaendertAm?: Zeitstempel;
  /** Basiskonfiguration zum Zeitpunkt der letzten Spielplan-Erzeugung (fuer Aenderungs-Hinweis). */
  spielplanBasis?: SpielplanBasis;

  oeffentlichTurnierinfos: boolean;
  oeffentlichAnfahrtDokumente: boolean;
  oeffentlichSpielplan: boolean;
  oeffentlichErgebnisse: boolean;
  /** Ob die Turnierregeln (Spielzeit, Wertung, Timeouts …) auf der oeffentlichen Seite sichtbar sind. */
  oeffentlichRegeln: boolean;

  /**
   * Gibt PAUSCHAL allen angemeldeten Benutzern mindestens diese Zugriffsstufe auf das Turnier,
   * unabhaengig von individuell vergebenen TurnierBerechtigung-Dokumenten (siehe
   * backend/src/auth/turnierZugriff.ts). Anders als die oeffentlich*-Felder oben: die wirken nur
   * auf der nicht angemeldeten, oeffentlichen Turnierseite (nur Lesezugriff auf ausgewaehlte
   * Daten); dieses Feld wirkt in der normalen (angemeldeten) Verwaltungsoberflaeche. Gedacht u.a.
   * fuer eine Demo-Instanz, auf der beliebige neu (selbst-)registrierte Tester ein Turnier sofort
   * nutzen koennen sollen, ohne einzeln freigeschaltet zu werden - aber auch ausserhalb der Demo
   * nutzbar. Fehlt das Feld (undefined), gilt wie bisher nur Admin/Ersteller-Manager/explizite
   * TurnierBerechtigung.
   */
  zugriffFuerAlleBenutzer?: "lesen" | "schreiben";

  /**
   * Turnier-Codes (Abschnitt 21.3, Betriebsmodus "Lokales Netzwerk"): gehashte Zugangscodes
   * (bcrypt, analog zu Benutzer.passwortHash), die ohne Benutzerkonto Zugriff auf GENAU dieses
   * Turnier geben - turnierleitungCodeHash entspricht Zugriffsstufe "schreiben_voll",
   * spielleitungCodeHash "schreiben_spielbetrieb" (siehe backend/src/auth/turnierZugriff.ts).
   * Kein Klartext gespeichert, kein eigener docType (nie mehr als zwei Codes pro Turnier). Fehlt
   * ein Feld, ist der jeweilige Code-Zugang deaktiviert.
   */
  turnierleitungCodeHash?: string;
  spielleitungCodeHash?: string;

  /**
   * Turnier-Sync (Grundlage, Abschnitt 21.3/23): rein lokale Buchführung DIESER Installation,
   * welches serverseitige `TurnierCheckout` gerade fuer dieses (hier lokal gefuehrte) Turnier
   * aktiv ist - steuert, ob der periodische Check-in (`backend/src/sync/checkin.ts`) fuer dieses
   * Turnier Ergebnisse pusht. Wird beim Export NICHT gezielt herausgefiltert (harmlos, falls es
   * doch mit uebertragen wird - auf der Zielinstanz bedeutungslos), aber auch nie absichtlich
   * exportiert.
   */
  lokalerSyncCheckoutId?: string;

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
  /** Denormalisierter Name des Erstellers (fuer die Anzeige in der Liste, ohne dass jeder Benutzer
   *  die admin-only Benutzerliste braucht). */
  erstelltVonName?: string;
  erstelltAm: Zeitstempel;
  geaendertVon?: BenutzerId;
  geaendertAm?: Zeitstempel;
  /** Wer das Turnier zuletzt inhaltlich bearbeitet hat (alle Aenderungen AUSSER Ergebnis-Erfassung).
   *  Denormalisierter Name, bewusst ohne Zeitpunkt (Nutzer-Vorgabe). */
  zuletztBearbeitetVon?: BenutzerId;
  zuletztBearbeitetVonName?: string;
  /** Abschluss: wann und von wem (denormalisierter Name). */
  abgeschlossenVon?: BenutzerId;
  abgeschlossenVonName?: string;
  abgeschlossenAm?: Zeitstempel;
}

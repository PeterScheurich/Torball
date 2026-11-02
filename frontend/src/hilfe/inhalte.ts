/**
 * Inhalte der In-App-Hilfe (/hilfe).
 *
 * === Texte pflegen (auch ohne Programmierkenntnisse) ===
 * Diese Datei enthaelt NUR die Texte, kein Layout. Zum Aendern einfach die
 * Zeichenketten (die Teile in "Anfuehrungszeichen") bearbeiten. Die Darstellung
 * uebernimmt HilfePage.tsx - daran muss nichts angefasst werden.
 *
 * Aufbau:
 *  - Die Hilfe ist in THEMEN gegliedert (jede bekommt eine eigene Karte).
 *  - Jedes Thema hat einen kurzen Einleitungssatz (`kurz`) und mehrere
 *    aufklappbare ABSCHNITTE (Frage + Antwort).
 *  - Der Antwort-Text (`text`) ist eine Liste von BLOECKEN. Ein Block ist
 *    entweder ein normaler Absatz (einfacher Text), eine Aufzaehlung
 *    (`{ liste: [...] }`), ein hervorgehobener Hinweis (`{ hinweis: "..." }`)
 *    oder ein tiefer aufklappbarer "Mehr Infos"-Block fuer Details, die nur
 *    manche brauchen (`{ vertiefung: { text: [...] } }`, optional mit eigenem
 *    `titel`). Die Vertiefung enthaelt selbst wieder Bloecke.
 *
 * === Screenshot ergaenzen ===
 * Bild-Datei nach `frontend/public/hilfe/` legen und im Abschnitt ergaenzen:
 *   bild: "/hilfe/mein-screenshot.png",
 *   bildAlt: "Kurze Beschreibung des Bildinhalts fuer Screenreader",
 * `bildAlt` ist Pflicht, sobald `bild` gesetzt ist (der Typ erzwingt das) -
 * ein Screenshot ohne Alternativtext waere gerade in dieser App ein Widerspruch.
 * Optional zusaetzlich `bildUnterschrift: "..."` fuer eine sichtbare Bildunterschrift.
 *
 * === Auf einen Kopfzeilen-Menuepunkt verweisen ===
 * Verweist ein Text auf einen Menuepunkt, der in der Kopfzeile nur als Symbol dargestellt wird
 * (Einstellungen/Hilfe/Über/Mein Profil), einen Platzhalter wie "{{einstellungen}}" einsetzen -
 * wird beim Anzeigen automatisch durch einen Link mit demselben Symbol ersetzt (siehe
 * SymbolVerweis-Komponente). Verfuegbare Platzhalter: {{einstellungen}}, {{hilfe}}, {{ueber}},
 * {{profil}}.
 *
 * === Auf den Quellcode-Download verweisen ===
 * Fuer den ZIP-Download des Quellcodes (/download/torball-quellcode.zip, siehe deploy-instanz.sh)
 * den Platzhalter "{{download-quellcode}}" einsetzen - wird zu einem echten, anklickbaren Link.
 * NICHT den Pfad als reinen Text ausschreiben (frueher so, war fuer Nutzer nicht anklickbar und
 * dadurch faktisch nicht auffindbar - live als Verwirrung gemeldet).
 */

/** Ein Baustein einer Antwort: Absatz (String), Aufzaehlung, Hinweis-Kasten oder
 *  ein tiefer aufklappbarer "Mehr Infos"-Block (`vertiefung`, selbst wieder aus Bloecken). */
export type HilfeBlock =
  | string
  | { liste: string[] }
  | { hinweis: string }
  | { vertiefung: { titel?: string; text: HilfeBlock[] } };

/** Bild-Felder als Union modelliert, damit `bild` ohne `bildAlt` gar nicht kompiliert. */
type BildFelder =
  | { bild?: undefined; bildAlt?: undefined; bildUnterschrift?: undefined }
  | { bild: string; bildAlt: string; bildUnterschrift?: string };

export type HilfeAbschnitt = {
  /** Aufklappbare Ueberschrift, als Frage formuliert. */
  frage: string;
  text: HilfeBlock[];
} & BildFelder;

export interface HilfeThema {
  /** Stabiler Anker fuer Sprungmarken im Inhaltsverzeichnis (nicht uebersetzen/aendern). */
  id: string;
  titel: string;
  /** Immer sichtbarer Einleitungssatz unter der Themen-Ueberschrift. */
  kurz: string;
  abschnitte: HilfeAbschnitt[];
}

export const HILFE_THEMEN: HilfeThema[] = [
  {
    id: "erste-schritte",
    titel: "Erste Schritte",
    kurz: "Ein Überblick, wie ein Turnier von der Anlage bis zur Ergebnis-Erfassung durch die Anwendung läuft.",
    abschnitte: [
      {
        frage: "Wofür ist diese Anwendung gedacht?",
        text: [
          "Mit Torball-Turniere planst du ein Turnier und protokollierst es während der Veranstaltung am Computer: von den teilnehmenden Mannschaften über den Spielplan und die Schiedsrichter-Einteilung bis zur Ergebniserfassung im Reiter „Ergebnisse“ – dazu kommt eine öffentliche Turnierseite zum Mitverfolgen.",
        ],
      },
      {
        frage: "In welcher Reihenfolge arbeite ich ein Turnier ab?",
        text: [
          "Die einzelnen Schritte bauen aufeinander auf. Eine typische Reihenfolge ist:",
          {
            liste: [
              "Optional vorab: Vereine und Teams als Stammdaten anlegen.",
              "Turnier anlegen (Name, Datum, Anzahl der Spielfelder).",
              "Mannschaften erfassen und – wenn gewünscht – deren Kader pflegen.",
              "Schiedsrichter eintragen und die Turnierleitung festlegen.",
              "Spielplan erzeugen, die Reihenfolge und Zeiten anpassen.",
              "Schiedsrichter den Spielen zuordnen.",
              "Während des Turniers die Ergebnisse erfassen.",
              "Bei Bedarf die öffentliche Turnierseite freischalten.",
            ],
          },
          {
            hinweis:
              "Du musst nicht alles auf einmal machen. Jeder Schritt lässt sich später wieder ändern – auch ein bereits gespeicherter Spielplan.",
          },
        ],
      },
      {
        frage: "Brauche ich für alles einen Login?",
        text: [
          "Für die Planung und Verwaltung ja – dafür meldest du dich mit deinem Konto an. Zwei Bereiche funktionieren bewusst ohne Login: die Ergebnis-Erfassung über einen Erfassungslink (z. B. für Helfer an den Feldern) und die öffentliche Turnierseite zum reinen Mitlesen.",
        ],
      },
      {
        frage: "Können auch Helfer ohne eigenes Konto am Turnier mitarbeiten?",
        text: [
          "Ja, dafür gibt es zwei eigene Wege: einen Erfassungslink für die Ergebniserfassung ohne Login (siehe Thema „Ergebnisse erfassen“) sowie – für ein Turnier im lokalen Netzwerk, z. B. in einer Sporthalle – geteilte Codes, mit denen weitere Geräte ohne eigenes Konto auf genau dieses eine Turnier zugreifen können (siehe Thema „Anmelden & Einladung annehmen“).",
        ],
      },
    ],
  },
  {
    id: "turnier-anlegen",
    titel: "Turnier anlegen & Grunddaten",
    kurz: "Ein neues Turnier anlegen – ein Assistent führt in drei Schritten durch Grunddaten, Mannschaften und Spielplan.",
    abschnitte: [
      {
        frage: "Wie lege ich ein neues Turnier an?",
        text: [
          "In der Turnierliste startest du mit „Neues Turnier anlegen“. Das Anlegen läuft als Assistent in drei Schritten: zuerst die Grunddaten, dann die Mannschaften, dann der Spielplan. Am Ende landest du in der Turnierverwaltung, wo du alles später wieder ändern kannst.",
        ],
      },
      {
        frage: "Welche Grunddaten trage ich im ersten Schritt ein?",
        text: [
          "Pflicht sind Name, Datum und Startzeit. Dazu wählst du die Turnierart, die Anzahl der Spielfelder, den Turniermodus und die Protokollierung.",
          {
            hinweis:
              "Die Startzeit lässt sich nach dem Anlegen nirgends mehr ändern – trage sie deshalb gleich korrekt ein.",
          },
        ],
      },
      {
        frage: "Was ist der Unterschied zwischen einem nationalen und einem internationalen Turnier?",
        text: [
          "Die Turnierart steuert einige Voreinstellungen. Bei einem internationalen Turnier (zum Beispiel nach IBSA-Regeln) gilt „Nichtantreten“ als 5:0 statt 3:0, und bei den Mannschaften zählt das Land statt des Bundeslands – Mannschaften desselben Landes spielen dann, wenn du die Länder-Regel einschaltest, möglichst früh gegeneinander.",
          "Du kannst die Turnierart später in der Übersicht ändern. Das Ergebnis bei Nichtantreten wird dabei nur angepasst, solange es noch dem bisherigen Standard entspricht – hast du es selbst geändert, bleibt dein Wert.",
          {
            hinweis:
              "Weitere Unterschiede zwischen nationalen und internationalen Regeln können nachgerüstet werden. Wenn dir eine fehlt, gib uns Bescheid.",
          },
        ],
      },
      {
        frage: "Was bedeutet die Anzahl der Spielfelder?",
        text: [
          "Sie bestimmt, wie viele Spiele gleichzeitig laufen können. Der Normalfall ist ein Spielfeld, als Ausnahme sind zwei möglich. Die Felder bekommen zunächst Vorschlagsnamen („Halle A“, „Halle B“); im Reiter „Übersicht“ des angelegten Turniers lassen sie sich jederzeit umbenennen, zum Beispiel auf die tatsächlichen Hallennamen.",
        ],
      },
      {
        frage: "Wo stelle ich die Spielregeln ein – Spielzeit, Pausen, Punkte?",
        text: [
          "Im Reiter „Regeln“ des Turniers. Jede Änderung wird beim Verlassen eines Feldes automatisch gespeichert – einen Speichern-Knopf gibt es dort nicht; eine kurze Meldung bestätigt jedes Speichern. Ein ungültiger Wert wird nicht gespeichert, das wird angezeigt.",
          "Die „Gesamtzeit pro Spiel im Spielplan“ setzt sich aus Spielzeit mal Halbzeiten, der Halbzeitpause und der Pause bis zum nächsten Spiel zusammen. Im Standard sind das 25 Minuten (2 × 5 Minuten Spielzeit, 2 Minuten Halbzeitpause, 13 Minuten Puffer). Du kannst die Gesamtzeit auch direkt eingeben; der Puffer wird dann daraus berechnet. Der Spielplan übernimmt geänderte Zeiten erst, wenn du ihn neu erzeugst.",
          {
            hinweis:
              "Spielzeit, Halbzeiten und Pausen lassen sich nur ändern, solange noch kein Spiel begonnen hat. Neue Turniere starten mit den Standardregeln der Administration; ein bestehendes Turnier bleibt davon unberührt.",
          },
        ],
      },
      {
        frage: "Was bedeutet „einfach“ und „doppelt“ beim Turniermodus?",
        text: [
          "Bei jedem Turniermodus wählst du mit, wie die Vorrunde gespielt wird: „einfach“ – ein Spiel je Paarung – oder „doppelt“ – Hin- und Rückspiel an einem Spieltag. Bei zwei Gruppen gilt das innerhalb jeder Gruppe. Die Spiele der Endrunde (Halbfinale, Finale, Platzierungsspiele) werden immer nur einmal gespielt. In der Tabelle zählen alle Spiele der Vorrunde.",
        ],
      },
      {
        frage: "Was ist ein Turniermodus – Gruppen, Endrunde, Platzierungsspiele?",
        text: [
          "Der Turniermodus legt den Ablauf fest. „Jeder gegen Jeden“ kennt keine Endrunde. Bei „Zwei Gruppen“ spielen die Mannschaften zuerst innerhalb von Gruppe A und B, danach folgt eine Endrunde. Die Zahlen stellst du selbst ein: wie viele Mannschaften in jeder Gruppe sind (auch ungleich, z. B. 5 und 6) und wie groß die Endrunde ist.",
          {
            liste: [
              "Endrunde mit 4: Halbfinale 1.A–2.B und 1.B–2.A, dann Finale und – wenn gewünscht – das Spiel um Platz 3.",
              "Endrunde mit 6: Viertelfinale 2.A–3.B und 2.B–3.A. Die beiden Gruppensieger sind für das Halbfinale gesetzt: 1.A spielt gegen den Sieger von 2.A–3.B, 1.B gegen den Sieger von 2.B–3.A.",
              "Endrunde mit 8: Viertelfinale über Kreuz (1.A–4.B, 2.A–3.B, 1.B–4.A, 2.B–3.A), danach Halbfinale, Finale und Spiel um Platz 3.",
              "Platzierungsspiele: Wer nicht in der Endrunde steht, spielt gegen die gleich platzierte Mannschaft der anderen Gruppe (3.A–3.B um Platz 5, 4.A–4.B um Platz 7 …). Gibt es keinen Gegner, weil eine Gruppe größer ist, spielt diese Mannschaft nicht mit und wird nach dem Vorrundenergebnis eingeordnet.",
              "Die Endrunde hat immer eine gerade Zahl von Mannschaften.",
            ],
          },
          "Gewählt wird der Modus beim Anlegen oder später im Reiter „Übersicht“. Die Mannschaften teilst du im Reiter „Mannschaften“ den Gruppen zu – von Hand oder mit „Nach Reihenfolge auf Gruppen verteilen“. Im Reiter „Spielplan“ steht unter „Weiterer Ablauf“, welches Spiel wann und wo stattfindet, auch wenn die Mannschaften noch nicht feststehen („Sieger Halbfinale 1“). Die Zeiten richten sich nach der Spielzeit und sind vorläufig, solange die Vorrunde noch nicht erzeugt ist.",
          "Administratoren können unter „Admin → Turniermodi“ jede Vorlage kopieren und die Kopie anpassen (Name, mögliche Endrunden, Standardwerte). Die Zahl der Gruppen bleibt die der Quelle. Ein laufendes Turnier behält seinen Ablauf, auch wenn die Vorlage später geändert oder gelöscht wird.",
          {
            vertiefung: {
              titel: "Wie entstehen die Spiele der Endrunde?",
              text: [
                "Erst wenn die Ergebnisse feststehen, entstehen die Spiele: Sind alle Vorrundenspiele abgeschlossen, erzeugst du mit „Erzeugbare Spiele erzeugen“ die Platzierungsspiele und die erste K.-o.-Runde. Nach den Viertelfinalspielen folgen die Halbfinale, danach Finale und Spiel um Platz 3. Vorher kannst du bei jedem noch nicht erzeugten Spiel Halle und Startzeit wählen (siehe Thema „Spielplan erstellen & anpassen“) oder die Paarung von Hand wählen.",
                "Wer die Spiele nicht jedes Mal selbst erzeugen möchte, setzt in der Übersicht den Haken „Spiele der Endrunde automatisch erzeugen, sobald die Paarung feststeht“. Dann entstehen sie von allein, sobald das letzte nötige Ergebnis abgeschlossen ist – auch die nächste Stufe (Halbfinale, Finale). Halle und Startzeit der noch nicht erzeugten Spiele stellst du vorher im „Weiteren Ablauf“ ein. Bei einem Unentschieden oder einem Gleichstand in der Tabelle wartet die Automatik, bis du entschieden hast.",
                "Liegen Mannschaften nach allen Tabellenkriterien gleichauf, legst du die Reihenfolge selbst fest; endet ein K.-o.-Spiel unentschieden, bestimmst du den Sieger. Die Software warnt und schlägt vor – sie entscheidet nicht für dich.",
                "Sobald Spiele der Endrunde erzeugt wurden, lassen sich Modus, Gruppen und Spielplan nicht mehr ändern, und das Turnier lässt sich erst abschließen, wenn alle Spiele der Endrunde erzeugt sind.",
              ],
            },
          },
          {
            hinweis:
              "Die Vorlagen sieht die Administration unter „Admin → Turniermodi“. Sie sind schreibgeschützt; eigene Vorlagen folgen in einer späteren Ausbaustufe.",
          },
        ],
      },
      {
        frage: "Was ist die Protokollierung?",
        text: [
          "Sie legt fest, wie Ergebnisse erfasst werden. „Manuell“: Es werden nur die Endergebnisse pro Spiel eingetragen – direkt in der Anwendung oder über einen Erfassungslink. „Digital“: Jedes Ereignis (Wurf, Tor, Foul, Auszeit, …) wird während des Spiels live protokolliert; das Ergebnis entsteht automatisch aus dem Protokoll. Mehr dazu im Hilfe-Thema „Digitale Protokollierung (Beta)“.",
          {
            hinweis:
              "Die digitale Protokollierung ist neu und noch nicht ausgiebig in echten Spielen erprobt – für den produktiven Einsatz ist sie noch nicht freigegeben. Für ein echtes Turnier wähle vorerst „Manuell“; „Digital“ gerne zum Ausprobieren und Testen.",
          },
        ],
      },
    ],
  },
  {
    id: "turnier-uebernehmen",
    titel: "Turnier aus einem vorherigen übernehmen",
    kurz: "Für Wettbewerbe mit zwei Spieltagen (z. B. Hin- und Rückspiel): Mannschaften, Kader und Regeln aus einem abgeschlossenen Turnier übernehmen, statt alles neu einzugeben.",
    abschnitte: [
      {
        frage: "Wann ist das nützlich?",
        text: [
          "Wenn es zu einem Wettbewerb zwei Spieltage mit denselben Mannschaften gibt – zum Beispiel Hin- und Rückspiel in einer Liga. Statt Mannschaften und Kader für den zweiten Spieltag komplett neu zu erfassen, übernimmst du sie aus dem bereits abgeschlossenen ersten Spieltag.",
        ],
      },
      {
        frage: "Wie übernehme ich ein Turnier?",
        text: [
          "Beim Anlegen eines neuen Turniers beantwortest du die Frage „Daten übernehmen?“ mit einem bereits abgeschlossenen Turnier als Vorlage. Danach musst du nur noch Name, Datum und Startzeit angeben – der Rest wird für dich vorbereitet.",
        ],
      },
      {
        frage: "Was genau wird übernommen?",
        text: [
          {
            liste: [
              "Mannschaften: werden übernommen und können nicht mehr umbenannt, hinzugefügt oder entfernt werden – so bleibt der Wettbewerb über beide Spieltage vergleichbar.",
              "Kader: werden übernommen, lassen sich aber am neuen Spieltag frei ändern, falls andere Spieler antreten.",
              "Regeln: werden übernommen und sind zunächst gesperrt (damit beide Spieltage nach denselben Regeln laufen); bei Bedarf lässt sich diese Sperre im Turnier wieder aufheben.",
              "Spielplan: wird gespiegelt (wer zuhause gespielt hat, spielt jetzt auswärts) und lässt sich danach wie gewohnt anpassen.",
              "Schiedsrichter (inkl. Turnierleitung): werden übernommen und lassen sich danach wie gewohnt bearbeiten.",
            ],
          },
        ],
      },
      {
        frage: "Wie sehe ich den Gesamtstand über beide Spieltage?",
        text: [
          "Turnierverwaltung und – falls freigegeben – die öffentliche Turnierseite zeigen eine gemeinsame Tabelle über beide Spieltage. Auf der öffentlichen Seite lässt sich zusätzlich zwischen „Gesamt“ und den einzelnen Spieltagen umschalten, sobald beide Spieltage einzeln freigegeben sind.",
        ],
      },
    ],
  },
  {
    id: "turnier-verwalten",
    titel: "Turnier verwalten: Freigabe, Logo & Abschließen",
    kurz: "Im Reiter „Übersicht“ eines Turniers: für andere Benutzer freigeben, ein eigenes Logo hinterlegen und das Turnier abschließen.",
    abschnitte: [
      {
        frage: "Wie gebe ich mein Turnier für eine andere Person frei?",
        text: [
          "Im Reiter „Übersicht“ gibst du unter „Freigabe für andere Benutzer“ die E-Mail-Adresse der Person ein, mit der sie angemeldet ist, und wählst die gewünschte Zugriffsstufe. Eine Liste aller Benutzer gibt es aus Datenschutzgründen nicht – du musst die Adresse also kennen. Es gibt drei Stufen: Lesen (nur ansehen), Schreiben für Spielbetrieb (Spielplan und Ergebnisse bearbeiten) und volles Schreiben (zusätzlich Grunddaten, Mannschaften und Regeln bearbeiten).",
          {
            hinweis:
              "Wer das Turnier selbst angelegt hat sowie Administratoren haben ohnehin immer vollen Zugriff – die Freigabe ist nur für zusätzliche Personen nötig.",
          },
        ],
      },
      {
        frage: "Was hat es mit dem Turnier-Logo auf sich?",
        text: [
          "Ohne eigenes Logo zeigt die Anwendung das Standard-Torball-Logo. Im Reiter „Übersicht“ lässt sich stattdessen ein eigenes Bild hochladen (z. B. das Vereins- oder Verbandslogo), das dann in der Turnierübersicht und auf der öffentlichen Turnierseite erscheint. Ein Rücksetzen auf das Standard-Logo ist jederzeit möglich.",
        ],
      },
      {
        frage: "Wie prüfe ich, ob mit meinem Turnier alles passt?",
        text: [
          "Über den Knopf „Turnier prüfen“ im Reiter „Übersicht“ – er sammelt Auffälligkeiten wie fehlende Spielfelder, zu wenige Mannschaften, doppelte Trikotnummern oder Mannschaften mit zwei Spielen direkt hintereinander in einer Liste.",
          {
            hinweis:
              "Reine Information: Nichts wird dabei blockiert oder automatisch geändert – du entscheidest, ob und wie du reagierst. Praktisch z. B. kurz vor dem Abschließen, um nichts zu übersehen.",
          },
        ],
      },
      {
        frage: "Wie schließe ich ein Turnier ab, und was ändert sich dann?",
        text: [
          "Über den Knopf „Turnier abschließen“ im Reiter „Übersicht“ – das geht erst, wenn zu jedem Spiel ein Ergebnis erfasst ist. Ein abgeschlossenes Turnier ist gegen versehentliche Änderungen geschützt: Grunddaten, Mannschaften, Schiedsrichter, Spielplan und Ergebnisse lassen sich nicht mehr bearbeiten.",
          {
            liste: [
              "Weiterhin möglich bleiben: die öffentliche Freigabe ändern und das Turnier für andere Benutzer freigeben.",
              "Ein zuvor erzeugter Erfassungslink wird beim Abschließen automatisch ungültig.",
              "Bei Bedarf lässt sich ein abgeschlossenes Turnier über „Wieder öffnen“ erneut bearbeitbar machen.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "stammdaten",
    titel: "Stammdaten: Vereine & Teams",
    kurz: "Vereine und ihre Teams zentral pflegen – sie stehen dann für alle Turniere zur Verfügung.",
    abschnitte: [
      {
        frage: "Was sind Stammdaten?",
        text: [
          "Unter „Stammdaten“ pflegst du Vereine und ihre Teams turnierübergreifend an einer Stelle. Beim Erfassen einer Mannschaft in einem Turnier greifst du auf diese Liste zurück, statt jedes Mal alles neu einzutippen.",
        ],
      },
      {
        frage: "Wie hängen Vereine und Teams zusammen?",
        text: [
          "Ein Team gehört immer zu einem Verein. Lege also zuerst den Verein an, danach seine Teams.",
          "Beim Verein kannst du Bundesland und Land eintragen. Das Land wird bei einem internationalen Turnier als Land der Mannschaft vorgeschlagen, das Bundesland bei einem nationalen. Welche Länder zur Auswahl stehen, pflegt die Administration unter „Admin → Länder“; ein Land, das dort fehlt, kannst du trotzdem von Hand eintragen.",
          {
            vertiefung: {
              titel: "Und wenn es eine Spielgemeinschaft ohne eigenen Verein ist?",
              text: [
                "Trage die Spielgemeinschaft einfach als eigenen Verein ein. Zu jedem Team gehört ein Verein – die Spielgemeinschaft übernimmt dann diese Rolle.",
              ],
            },
          },
        ],
      },
      {
        frage: "Ändern sich laufende Turniere mit, wenn ich Stammdaten anpasse?",
        text: [
          "Nein. Beim Anlegen einer Turnier-Mannschaft werden die Stammdaten kopiert, nicht dauerhaft verknüpft. Eine spätere Änderung hier wirkt sich nicht auf bereits laufende oder abgeschlossene Turniere aus.",
        ],
      },
    ],
  },
  {
    id: "schiedsrichter-stammdaten",
    titel: "Stammdaten: Schiedsrichter",
    kurz: "Schiedsrichter turnierübergreifend pflegen – ein eigener Menüpunkt unter „Stammdaten“.",
    abschnitte: [
      {
        frage: "Was sind Schiedsrichter-Stammdaten?",
        text: [
          "Unter „Stammdaten → Schiedsrichter“ pflegst du Schiedsrichter turnierübergreifend an einer Stelle, unabhängig von Vereinen und Teams. Optional lässt sich ein Verein zuordnen. Beim Erfassen eines Schiedsrichters in einem Turnier greifst du über „Aus Stammdaten übernehmen“ auf diese Liste zurück.",
        ],
      },
      {
        frage: "Ändern sich laufende Turniere mit, wenn ich diese Stammdaten anpasse?",
        text: [
          "Nein. Beim Übernehmen in ein Turnier werden die Werte kopiert, nicht dauerhaft verknüpft. Eine spätere Änderung hier wirkt sich nicht auf bereits laufende oder abgeschlossene Turniere aus.",
        ],
      },
    ],
  },
  {
    id: "mannschaften",
    titel: "Mannschaften & Kader",
    kurz: "Teilnehmende Mannschaften erfassen und optional Spieler sowie Trainer/Betreuer hinterlegen.",
    abschnitte: [
      {
        frage: "Wie füge ich eine Mannschaft hinzu?",
        text: [
          "Im Turnier findest du den Reiter „Mannschaften“. Am bequemsten übernimmst du eine Mannschaft aus den Stammdaten (Verein und Team). Bei Bedarf lässt sie sich aber auch von Hand eingeben – ganz ohne passenden Stammdaten-Eintrag.",
        ],
      },
      {
        frage: "Kann ich eine Mannschaft wieder entfernen?",
        text: [
          "Ja, solange sie noch nicht gespielt hat – mit dem Löschen-Knopf in ihrer Zeile. Gibt es schon einen Spielplan, musst du ihn danach neu erzeugen, weil er die Mannschaft noch enthält.",
          "Hat die Mannschaft schon ein Ergebnis, lässt sie sich nicht mehr entfernen: ihre Ergebnisse zählen in der Tabelle der anderen. Tritt sie nicht mehr an, wertest du ihre übrigen Spiele über „n. a.“ (nicht angetreten).",
        ],
      },
      {
        frage: "Wie pflege ich den Kader einer Mannschaft?",
        text: [
          "Jede Mannschaft lässt sich aufklappen; darunter erfasst du die Spieler (Nummer, Name, ggf. Klassifizierung). Die kleine Zahl am Umschalter zeigt schon zugeklappt, wie viele Spieler bereits erfasst sind. Bei digitaler Protokollierung ist der Kader Pflicht: Ohne Spieler mit Trikotnummern lassen sich Würfe und Tore niemandem zuordnen.",
        ],
      },
      {
        frage: "Was hat es mit Trainern/Betreuern auf sich?",
        text: [
          "Pro Mannschaft können bis zu drei Trainer/Betreuer hinterlegt werden – sie dürfen auf der Auswechselbank sitzen. Für jede Person lässt sich vermerken, ob sie zugleich Schiedsrichter ist.",
        ],
      },
    ],
  },
  {
    id: "schiedsrichter",
    titel: "Schiedsrichter",
    kurz: "Schiedsrichter für das Turnier erfassen und die Turnierleitung bestimmen.",
    abschnitte: [
      {
        frage: "Wo trage ich Schiedsrichter ein?",
        text: [
          "Das ist eine optionale Eingabe und erfolgt im Reiter „Schiedsrichter“. Schiedsrichter gehören zum Turnier; optional lässt sich ein Verein zuordnen, dem sie angehören. Wenn das eingetragen ist, wird bei der automatischen Schiedsrichter-Zuordnung (im Spielplan) vermieden, dass ein Schiedsrichter eine Mannschaft seines eigenen Vereins pfeift.",
        ],
      },
      {
        frage: "Wie lege ich die Turnierleitung fest?",
        text: [
          "Genau eine Person je Turnier ist die Turnierleitung. Die Auswahl erfolgt über ein Optionsfeld – wählst du eine andere Person, wird die bisherige automatisch zurückgesetzt.",
        ],
      },
      {
        frage: "Muss ich jeden Schiedsrichter jedes Mal neu eintippen?",
        text: [
          "Nein. Unter „Stammdaten → Schiedsrichter“ lassen sich Schiedsrichter turnierübergreifend anlegen. Im Anlege-Formular des Turniers wählst du „Aus Stammdaten übernehmen“, um eine dort erfasste Person vorzubefüllen – oder „Meine Profildaten übernehmen“ für dich selbst. Beides füllt nur das Formular vor; erst der Klick auf „hinzufügen“ speichert die Person im Turnier.",
        ],
      },
    ],
  },
  {
    id: "spielplan",
    titel: "Spielplan erstellen & anpassen",
    kurz: "Einen Spielplan erzeugen, Reihenfolge und Zeiten anpassen und Schiedsrichter zuordnen.",
    abschnitte: [
      {
        frage: "Wie entsteht der Spielplan?",
        text: [
          "Im Reiter „Spielplan“ erzeugst du zunächst einen Vorschlag. Dieser Vorschlag wird erst zum gültigen Spielplan, wenn du ihn übernimmst. Danach lassen sich Reihenfolge, Startzeiten, Status und Hinweise jederzeit anpassen.",
        ],
      },
      {
        frage: "Was bedeutet die Nummer eines Spiels?",
        text: [
          "Jedes Spiel hat eine Nummer, die über das ganze Turnier fortlaufend zählt – auch wenn zwei Hallen gleichzeitig spielen. Sie folgt der Reihenfolge nach Zeit und Halle und ist überall dieselbe: im Spielplan, bei den Ergebnissen, auf der öffentlichen Seite und in den PDFs. Tauschen zwei Spiele ihren Platz oder ihre Halle, tauschen sie auch die Nummern.",
        ],
      },
      {
        frage: "Wie ändere ich die Halle oder die Startzeit eines Spiels?",
        text: [
          "Bei mehreren Hallen hat jedes Spiel im Spielplan eine Spalte „Halle“. Spielt in der gewählten Halle zur selben Zeit schon ein anderes Spiel, tauschen die beiden die Halle – „Rückgängig“ nimmt die Änderung zurück. Die Startzeit trägst du im Zeitfeld ein; spätere, noch nicht begonnene Spiele rücken mit.",
          "Für Spiele der Endrunde, die es noch nicht gibt, wählst du Halle und Startzeit unter „Weiterer Ablauf“. Legst du mehrere Spiele in dieselbe Halle, laufen sie hintereinander. Mit „Optional: Viertelfinale bis Finale nacheinander in [Halle] spielen“ gelingt das für die ganze Endrunde mit einem Klick; die Platzierungsspiele bleiben automatisch. „Halle und Zeit automatisch“ stellt die Berechnung wieder her.",
          {
            hinweis:
              "Halle und Startzeit lassen sich nur ändern, solange das Spiel nicht begonnen hat.",
          },
        ],
      },
      {
        frage: "Wie ordne ich Schiedsrichter den Spielen zu?",
        text: [
          "Der Spielplan-Reiter bietet die Sicht „Schiedsrichter-Einteilung“. Ein Klick erzeugt einen Vorschlag je Spiel, den du danach pro Spiel über ein Auswahlfeld ändern kannst. Dieser kann auch nach Spielende noch angepasst werden, falls ein anderer Schiedsrichter einspringen musste.",
          {
            hinweis:
              "Die Zuordnung ist ein bewusster Schritt, kein Automatismus. Ein Schiedsrichter wird nie für das Spiel der eigenen Mannschaft vorgeschlagen; spielt die eigene Mannschaft parallel, weist die Anwendung darauf hin – die Entscheidung bleibt bei der Turnierleitung.",
          },
        ],
      },
      {
        frage: "Warnt mich die Anwendung bei Regelverstößen?",
        text: [
          "Ja. Sie warnt zum Beispiel, wenn eine Mannschaft zwei Spiele direkt hintereinander hätte, trifft aber keine automatischen Entscheidungen. Die Turnierleitung darf jede Warnung bewusst übergehen.",
        ],
      },
    ],
  },
  {
    id: "ergebnisse",
    titel: "Ergebnisse erfassen",
    kurz: "Endergebnisse direkt in der Anwendung oder über einen teilbaren Erfassungslink (mit QR-Code) eintragen.",
    abschnitte: [
      {
        frage: "Wie trage ich Ergebnisse direkt ein?",
        text: [
          "Im Reiter „Ergebnisse“ trägst du pro Spiel die Tore beider Mannschaften ein (ganze Zahlen von 0 bis 999). Die Ansicht aktualisiert sich automatisch, solange sie sichtbar ist – Eingaben von anderen Geräten erscheinen also von selbst.",
        ],
      },
      {
        frage: "Was ist der Erfassungslink?",
        text: [
          "Für die Erfassung ohne Login – etwa durch Helfer an den Spielfeldern – erzeugt die Turnierleitung einen Erfassungslink. Wer den Link öffnet, kann Ergebnisse dieses Turniers eintragen, ohne ein Konto zu benötigen.",
          {
            hinweis:
              "Der Link ist der Zugang: Wer ihn hat, kann erfassen. Gib ihn nur an Personen weiter, die Ergebnisse eintragen sollen. Er lässt sich jederzeit widerrufen – danach ist ein zuvor geteilter Link ungültig.",
          },
        ],
      },
      {
        frage: "Wozu dient der QR-Code?",
        text: [
          "Statt den Erfassungslink abzutippen, können Helfer den QR-Code direkt vom Bildschirm abscannen und gelangen so zur Erfassungsseite. Der QR-Code wird lokal im Browser erzeugt und an keinen externen Dienst geschickt. Gib ihn nur an Personen weiter, die Ergebnisse erfassen sollen.",
        ],
      },
      {
        frage: "Was bedeutet der Knopf „n. a.“?",
        text: [
          "„n. a.“ steht für „nicht angetreten“ und steht direkt neben dem Tore-Feld der jeweiligen Mannschaft. Ein Klick speichert sofort das in den Turnierregeln festgelegte Forfait-Ergebnis für die andere, angetretene Mannschaft – kein weiterer Klick zum Speichern nötig.",
        ],
      },
      {
        frage: "Was passiert, wenn eine Mannschaft bei einem Spiel oder Turnier nicht antritt?",
        text: [
          "Das kann vorkommen – etwa wenn eine Mannschaft nicht genügend Spieler stellen kann (Torball wird zu dritt gespielt) oder wenn eine gemeldete Mannschaft doch nicht (mehr) antreten kann, zum Beispiel am zweiten von zwei Spieltagen.",
          "Für das betroffene Spiel hältst du das über „nicht angetreten“ (n. a.) fest; es wird dann mit dem in den Turnierregeln festgelegten Forfait-Ergebnis für die angetretene Mannschaft gewertet. Betrifft es mehrere Spiele, trägst du das entsprechend für jedes betroffene Spiel ein.",
        ],
      },
      {
        frage: "Was passiert, wenn zwei Personen gleichzeitig dasselbe Spiel erfassen?",
        text: [
          "Solange du ein Feld gerade bearbeitest, wird deine Eingabe nicht überschrieben. Ändert in der Zwischenzeit jemand anderes denselben Wert, markiert die Anwendung das als Konflikt, damit nichts unbemerkt verlorengeht.",
        ],
      },
    ],
  },
  {
    id: "digitales-protokoll",
    titel: "Digitale Protokollierung (Beta)",
    kurz: "Jedes Spielereignis live am Computer erfassen – das Ergebnis entsteht automatisch aus dem Protokoll. Diese Funktion ist neu und noch nicht für den produktiven Einsatz freigegeben.",
    abschnitte: [
      {
        frage: "Was ist die digitale Protokollierung und wie schalte ich sie ein?",
        text: [
          "Statt nur Endergebnisse einzutragen, wird jedes Ereignis während des Spiels erfasst: Würfe, Tore, Fouls, Strafwürfe, Penaltys, Auszeiten, Wechsel. Aus diesem Protokoll berechnet die Anwendung Spielstand, Restzeit, Foul- und Wurfzähler automatisch – und am Ende das Ergebnis für die Tabelle.",
          "Eingeschaltet wird sie je Turnier: beim Anlegen oder im Übersicht-Reiter unter „Protokollierung“ die Option „Digital“ wählen. Voraussetzung: Jede Mannschaft braucht einen Kader mit Trikotnummern (Reiter „Mannschaften“ – dort hilft „Kader automatisch anlegen“).",
          {
            hinweis:
              "Beta: Die digitale Protokollierung ist noch nicht ausgiebig in echten Spielen erprobt und für den produktiven Einsatz nicht freigegeben. Für echte Turniere vorerst „Manuell“ verwenden.",
          },
        ],
      },
      {
        frage: "Wie starte ich das Protokoll zu einem Spiel?",
        text: [
          "Im Reiter „Ergebnisse“ steht bei digitalen Turnieren je Spiel der Link „Protokoll“. Beim ersten Öffnen wird der Name der protokollierenden Person abgefragt – er erscheint als „Protokollführung“ auf dem Spielbericht.",
          "Danach zuerst die Aufstellung festlegen: je Mannschaft die drei Feldspieler antippen und buchen. Anschließend startet die Leertaste die Spieluhr – los geht's.",
          {
            liste: [
              "Die Erfassungs-Ansicht füllt den ganzen Bildschirm (App-Menüs sind ausgeblendet); „Vollbild an/aus“ blendet zusätzlich die Browserleisten aus.",
              "Sobald irgendein Protokoll begonnen wurde, gilt das Turnier als gestartet: Spielzeit, Turniermodus (einschließlich „einfach“ oder „doppelt“) und Protokollierungsart sind dann gesperrt – wie beim ersten manuell erfassten Ergebnis.",
              "Auch ohne Konto möglich: Über „Teilen“ lässt sich ein eigener Protokollant-Code vergeben (Link/QR-Code) – die Person sieht dann nur den Spielplan und kann protokollieren, sonst nichts.",
            ],
          },
        ],
      },
      {
        frage: "Wie funktioniert die Tastatursteuerung?",
        text: [
          "Grundprinzip: Zuerst mit A (links) oder B (rechts) die Mannschaft wählen – die Tasten folgen immer der angezeigten Seite. Der gewählte Kontext bleibt aktiv, bis die andere Team-Taste gedrückt wird.",
          {
            liste: [
              "Ziffer = Wurf: Nach der Team-Taste bucht die Spielernummer direkt einen Wurf (häufigster Fall). Beispiel: A 3 → B 5 → A 2.",
              "G nach einem Wurf = Tor zu genau diesem Wurf (kein weiterer Tastendruck nötig). G + Ziffer bucht ein Tor samt Wurf in einem Schritt.",
              "K = Kontrolle (steuert die 8-Sekunden-Anzeige). Rollt der Ball zur werfenden Mannschaft zurück, genügt K – der Kontext steht nach dem Wurf noch auf ihr.",
              "F + Ziffer = Foul, S = Strafwurf, P = Penalty, T = Auszeit, M = Technische Auszeit, R + Ziffer = Freiwurf, X + Ziffer = Wurf über die Aktionstaste.",
              "Strafwurf und Penalty sind zwei verschiedene Ereignisse: Der Strafwurf folgt auf ein einzelnes Foul, das Penalty auf das dritte Foul einer Mannschaft. Gebucht wird bei beiden die Mannschaft, die gefoult hat – geworfen wird von der Gegenseite. Erst das Penalty setzt den Foulzähler zurück.",
              "Bei Strafwurf und Penalty läuft die 8-Sekunden-Anzeige, obwohl die Spieluhr steht: Die Spielzeit ruht, die 8-Sekunden-Regel gilt trotzdem. Sie beginnt sofort, weil der Werfer den Ball direkt bekommt – ein K für „Kontrolle“ ist hier also nicht nötig.",
              "E + Ziffer + Ziffer = Wechsel (raus, rein) – oder über den „Wechsel“-Knopf mit Auswahl von Feld und Bank.",
              "Leertaste = Spieluhr starten/anhalten, H = Halbzeit (tauscht bei aktivierter Regel automatisch die Anzeigeseiten), Rücktaste = letztes Ereignis rückgängig, Esc = offene Eingabe verwerfen.",
              "Bei Tor, Eigentor, Foul, Strafwurf, Penalty und Auszeiten hält die Spieluhr automatisch an – der Schiedsrichter pfeift danach neu an, erst dann startet die Leertaste die Uhr wieder.",
            ],
          },
          "Alles geht auch per Maus oder Touch: Feldspieler-Tasten, Aktions-Knöpfe und das Wechsel-Fenster. Eine Bluetooth- oder USB-Tastatur (später auch ein eigenes Tastenfeld) funktioniert genauso.",
        ],
      },
      {
        frage: "Wie richte ich die Anzeige für den Schiedsrichter ein?",
        text: [
          "Auf einem zweiten Bildschirm am Feld kann eine eigene Anzeige laufen, die dem Schiedsrichter Spielstand und Fouls zeigt – und, wenn du es möchtest, Restzeit, die 8-Sekunden-Frist und Auszeiten. Sie wird nicht bedient und ändert nie Daten.",
          {
            liste: [
              "Was zusätzlich zu Spielstand und Fouls erscheint, stellst du je Turnier im Reiter „Übersicht“ ein (Block „Schiedsrichter-Anzeige“, nur bei digitaler Protokollierung): Restzeit, Auszeiten, Wurfzähler, 8-Sekunden-Anzeige sowie Strafwurf und Penalty lassen sich einzeln ausblenden. Spielstand und Fouls sind immer zu sehen. Die Einstellung darfst du auch während des Turniers ändern; auf der Anzeige erscheint sie nach spätestens 15 Sekunden, ohne dass du das Fenster neu laden musst.",
              "Öffnen über den Knopf „Schiedsrichter-Anzeige öffnen“ auf der Protokollseite. Das neue Fenster auf den zweiten Bildschirm ziehen und dort auf „Vollbild“ schalten.",
              "Die Seiten der Mannschaften sind vertauscht – der Schiedsrichter steht dem Protokollanten gegenüber, für ihn liegt links, was für den Protokollanten rechts liegt. Die Schrift bleibt normal lesbar. Beim Seitenwechsel zur Halbzeit tauscht auch die Anzeige automatisch mit.",
              "Die Anzeige gehört zum Feld, nicht zu einem einzelnen Spiel: Nach dem Abpfiff bleibt sie offen und zeigt das letzte Ergebnis und die nächste Begegnung, bis das nächste Spiel beginnt.",
              "Hell oder dunkel lässt sich nur für diese Anzeige umschalten – unabhängig von der Einstellung der übrigen Anwendung, weil hier die Beleuchtung in der Halle entscheidet. Die Wahl bleibt auf diesem Rechner gespeichert.",
              "Beide Fenster müssen auf demselben Rechner laufen: Sie tauschen die Zahlen direkt untereinander aus, damit die 8-Sekunden-Anzeige ohne Verzögerung mitläuft. Ist das Protokollfenster geschlossen, meldet die Anzeige das und holt die Daten ersatzweise vom Server – dann kann sie bis zu 15 Sekunden alt sein.",
            ],
          },
        ],
      },
      {
        frage: "Wie korrigiere ich Fehleingaben und wie endet das Spiel?",
        text: [
          "Die Rücktaste streicht das letzte Ereignis. Ältere Einträge korrigierst du direkt in der Ereignisliste: ✎ ändert die Spielernummer, ✕ streicht den Eintrag – gestrichene Einträge bleiben im Bericht sichtbar, zählen aber nicht mehr. Nichts wird jemals gelöscht, jede Korrektur ist nachvollziehbar.",
          "„Esc, dann Enter“ wechselt zur vollständigen Protokoll-Ansicht mit allen Einträgen (und zurück) – dort finden sich auch Protokollantenwechsel und Protest.",
          "Zum Abschluss: „Spielende erfassen“, dann unterschreibt die protokollierende Person mit ihrem Namen, danach „Protokoll abschließen“. Das Ergebnis steht ab dem ersten Tor automatisch in Tabelle und öffentlicher Seite – der Abschluss macht es endgültig. Optional kann je Turnier eine zusätzliche Bestätigung durch die Turnierleitung verlangt werden (Übersicht-Reiter, z. B. für die Bundesliga).",
        ],
      },
    ],
  },
  {
    id: "ausdrucke",
    titel: "Ausdrucke (PDF)",
    kurz: "Turnierinfos, Spielplan, Ergebnisse und Schiedsrichter-Einteilung als PDF erzeugen – zum Aushang oder Mitnehmen.",
    abschnitte: [
      {
        frage: "Welche Dokumente kann ich ausdrucken?",
        text: [
          "Vier Dokumente stehen zur Verfügung: Turnierinfos, Spielplan, Ergebnisse und Schiedsrichter-Einteilung (eine eigene Seite je pfeifender Person). Das Ergebnis-Dokument zeigt die Spiele des aktuellen Spieltags mit Ergebnis sowie die Gesamttabelle.",
        ],
      },
      {
        frage: "Wo finde ich die Ausdrucke?",
        text: [
          "Im Turnier über den entsprechenden Knopf in der Druckansicht. Öffentlich freigegebene Turniere bieten dieselben Dokumente zusätzlich auf der öffentlichen Turnierseite an – dort natürlich nur mit den freigegebenen Inhalten.",
        ],
      },
      {
        frage: "Was ist der Unterschied zwischen „Als PDF speichern“ und „PDF herunterladen“?",
        text: [
          {
            liste: [
              "„Als PDF speichern“ öffnet den Druckdialog des Browsers und erzeugt ein besonders barrierefreies PDF (z. B. für Screenreader vorgelesen).",
              "„PDF herunterladen“ lädt sofort eine fertige Datei herunter, ohne Umweg über den Druckdialog.",
            ],
          },
          "Beide Wege liefern denselben Inhalt – wähle, was dir lieber ist.",
        ],
      },
      {
        frage: "Wozu ist der QR-Code auf den Ausdrucken?",
        text: [
          "Er führt zur passenden Online-Ansicht (z. B. zur öffentlichen Ergebnisseite), damit jemand mit dem Smartphone direkt vom ausgedruckten Blatt aus dorthin gelangt.",
        ],
      },
    ],
  },
  {
    id: "oeffentliche-seite",
    titel: "Öffentliche Turnierseite",
    kurz: "Eine Seite zum Mitlesen freischalten – ohne Login, jede Sektion einzeln steuerbar.",
    abschnitte: [
      {
        frage: "Was zeigt die öffentliche Seite?",
        text: [
          "Das ist eine Seite, die Besucher ohne Login öffnen können. Fünf Bereiche lassen sich einzeln freischalten: „Turnierinfos“, „Anfahrt & Dokumente“, „Spielplan“, „Ergebnisse“ und „Regeln“. Die Freischaltung steuerst du im Reiter „Übersicht“ des Turniers. Dort werden ein Link und ein QR-Code zur Verfügung gestellt. Bei Bedarf kannst du den QR-Code herunterladen und in ein Dokument (z. B. Aushang) integrieren.",
        ],
      },
      {
        frage: "Werden dort auch die Schiedsrichter angezeigt?",
        text: [
          "Nein. Die öffentliche Seite blendet Schiedsrichter grundsätzlich aus. Sie zeigt Mannschaften, Spielplan und Ergebnisse, aber keine Schiedsrichter-Namen.",
        ],
      },
    ],
  },
  {
    id: "benutzer",
    titel: "Benutzer & Berechtigungen",
    kurz: "Konten einladen, Rollen vergeben und den Zugriff auf einzelne Turniere steuern.",
    abschnitte: [
      {
        frage: "Wie kommen neue Benutzer hinzu?",
        text: [
          "Über die Benutzerverwaltung (nur für Administrator und Manager) können neue Konten angelegt werden. Dafür ist eine E-Mail-Adresse zwingend notwendig. An diese Adresse wird dann eine Einladung verschickt. Die eingeladene Person setzt sich über den Einladungslink selbst ein Passwort.",
        ],
      },
      {
        frage: "Warum sehe ich als Manager nicht alle Konten?",
        text: [
          "Aus Datenschutzgründen sieht ein Manager nur sein eigenes Konto, die Personen, die er selbst eingeladen hat, und die Konten seines Vereins. Administratoren sehen alle Konten. Auch bei den Konten, die du siehst, bekommst du nur das Nötige angezeigt – Telefonnummer und Adresse gehören nicht dazu.",
          "Die Vereinszugehörigkeit eines Kontos vergibt ein Administrator – gleich beim Einladen im Feld „Verein“ oder später in der Spalte „Verein“ der Benutzerverwaltung; die Person selbst kann sie nicht ändern. Der Verein ist freiwillig: Wer zu keinem Verein gehört, bleibt auf „keiner“. Lädst du als Manager jemanden ein, gehört die Person automatisch zu deinem Verein. Ist dir selbst noch kein Verein zugeordnet, sprich einen Administrator an.",
          {
            hinweis:
              "Ein Turnier für jemanden aus einem anderen Verein freizugeben geht trotzdem: Du gibst im Freigabe-Dialog die E-Mail-Adresse der Person ein – eine Liste aller Konten gibt es nicht.",
          },
        ],
      },
      {
        frage: "Jemand kommt nicht mehr in sein Konto – was kann ich tun?",
        text: [
          "In der Benutzerverwaltung (nur für Administrator und Manager) gibt es je nach Fall drei Wege:",
          {
            liste: [
              "Passwort vergessen: Du kannst für ein Konto einen Zurücksetz-Link auslösen. Er geht per E-Mail an die Person, die sich damit selbst ein neues Passwort setzt – du siehst den Link nie. Ist der Mailversand nicht eingerichtet oder gerade nicht erreichbar (etwa auf einer lokalen Installation ohne Internet), kann nur ein Administrator das Zurücksetzen auslösen: Er bekommt den Link angezeigt und gibt ihn der Person persönlich weiter. Als Manager erhältst du dann eine Meldung und bittest einen Administrator darum – so kann niemand mit einem Link ein fremdes Konto übernehmen. Die betroffene Person sieht das Zurücksetzen außerdem als Hinweis in ihrem Konto.",
              "Einladung nie angekommen: Bei einem Konto, das noch nicht aktiviert wurde, lässt sich die Einladung erneut senden. Der alte Link wird dabei ungültig.",
              "Authenticator-App verloren: Nur Administratoren können die Zwei-Faktor-Anmeldung eines fremden Kontos deaktivieren – danach genügen wieder E-Mail und Passwort, und die Person kann sie neu einrichten. Für das eigene Konto geht das nicht auf diesem Weg, sondern nur im eigenen Profil – dort verlangt das Deaktivieren dein Passwort und einen aktuellen Code aus der Authenticator-App.",
            ],
          },
          "Nach fünf falschen Versuchen – ob Passwort oder Bestätigungscode – pausiert die Anmeldung übrigens nur zeitweise und gibt sich danach von selbst wieder frei – hier musst du nichts tun.",
        ],
      },
      {
        frage: "Woher weiß ich, dass etwas an meinem Konto geändert wurde?",
        text: [
          "Änderungen, die für die Sicherheit deines Kontos wichtig sind, werden dir auf zwei Wegen gemeldet: als E-Mail (wenn der Mailversand eingerichtet ist) und als Hinweis oben auf der Seite, sobald du dich das nächste Mal anmeldest. Der Hinweis bleibt stehen, bis du ihn mit „Verstanden“ bestätigst – er funktioniert deshalb auch auf einer lokalen Installation ohne Mailversand.",
          {
            liste: [
              "Gemeldet werden: Passwort geändert oder zurückgesetzt, neue E-Mail-Adresse (die alte Adresse bekommt die Mail), Zwei-Faktor-Anmeldung ein- oder ausgeschaltet und eine geänderte Rolle.",
              "Hast du die Änderung gerade selbst vorgenommen, bekommst du nur die E-Mail und keinen Hinweis oben auf der Seite. Nachlesen kannst du alles unter {{profil}} → „Letzte Änderungen an deinem Konto“.",
              "Hast du eine Änderung nicht selbst veranlasst, ändere bitte sofort dein Passwort und sag der Turnierleitung oder einer Administratorin bzw. einem Administrator Bescheid.",
            ],
          },
        ],
      },
      {
        frage: "Wer darf was?",
        text: [
          {
            liste: [
              "Administrator: voller Zugriff auf alles.",
              "Manager: voller Zugriff auf selbst erstellte Turniere; kann außerdem Benutzer verwalten sowie Stammdaten (Vereine, Teams, Schiedsrichter) bearbeiten. Die Standardregeln bleiben Administratoren vorbehalten.",
              "Weitere Zugriffe auf ein einzelnes Turnier werden gezielt freigegeben (siehe Thema „Turnier verwalten“) – in drei Stufen: Lesen, Schreiben für den Spielbetrieb (Spielplan/Ergebnisse) oder volles Schreiben (zusätzlich Grunddaten/Mannschaften/Regeln).",
            ],
          },
        ],
      },
      {
        frage: "Kann ich einen Benutzer löschen?",
        text: [
          "Benutzer werden nicht gelöscht, sondern gesperrt. Ein gesperrtes Konto kann sich nicht mehr anmelden, bleibt aber für die Nachvollziehbarkeit erhalten.",
        ],
      },
    ],
  },
  {
    id: "anmeldung",
    titel: "Anmelden & Einladung annehmen",
    kurz: "Wie du dich anmeldest und wie du als eingeladene Person deinen Zugang aktivierst.",
    abschnitte: [
      {
        frage: "Wie melde ich mich an?",
        text: [
          "Mit E-Mail-Adresse und Passwort auf der Anmeldeseite. Ist für dein Konto die Zwei-Faktor-Anmeldung aktiv, gibst du danach zusätzlich den Code aus deiner Authenticator-App ein.",
          {
            hinweis:
              "Wichtig: Ein vergessenes Passwort kannst du dir über „Passwort vergessen“ selbst neu setzen. Verlierst du den Zugang zu deiner Authenticator-App, kommst du selbst nicht mehr hinein – wende dich dann an eine Person mit Administrator-Rechten, die die Zwei-Faktor-Anmeldung für dein Konto deaktivieren kann. Anschließend meldest du dich wie gewohnt mit E-Mail und Passwort an und richtest sie neu ein.",
          },
          {
            hinweis:
              "Nach fünf falschen Versuchen hintereinander pausiert die Anmeldung für dieses Konto einige Minuten – dabei zählen falsche Passwörter und falsche Bestätigungscodes gemeinsam; bei weiteren Fehlversuchen verlängert sich die Wartezeit auf höchstens 30 Minuten. Während der Pause erscheint immer die Meldung „E-Mail oder Passwort ist falsch“, auch wenn deine Eingaben stimmen. Die Sperre läuft von selbst wieder ab – du musst also nichts weiter tun als warten. Wer nicht warten möchte, setzt sich über „Passwort vergessen“ ein neues Passwort; das hebt die Sperre sofort auf.",
          },
          {
            hinweis:
              "Ein Bestätigungscode aus der Authenticator-App gilt nur ein einziges Mal. Wurde gerade ein Code verwendet, wartest du bis zum nächsten (die App wechselt ihn etwa alle 30 Sekunden) – derselbe Code wird kein zweites Mal angenommen, auch wenn er in der App noch angezeigt wird.",
          },
        ],
      },
      {
        frage: "Ich habe einen Code für ein Turnier bekommen, statt eines eigenen Kontos – was mache ich damit?",
        text: [
          "Für ein Turnier im lokalen Netzwerk (z. B. in einer Sporthalle) kann die Turnierleitung statt einzelner Konten geteilte Codes ausgeben – einen für die Turnierleitung, einen für die Spielleitung. Über den mitgeteilten Link meldest du dich mit diesem Code direkt für genau dieses eine Turnier an, ganz ohne eigenes Konto.",
          {
            hinweis:
              "Ein Gerät ist entweder mit einem eigenen Konto oder mit einem Code angemeldet, nie beides gleichzeitig.",
          },
        ],
      },
      {
        frage: "Ich wurde eingeladen – was muss ich tun?",
        text: [
          "Öffne den Einladungslink aus der E-Mail. Dort vergibst du dein eigenes Passwort und aktivierst damit dein Konto; anschließend bist du direkt angemeldet.",
          {
            hinweis:
              "Der Einladungslink ist persönlich und nur begrenzt gültig. Öffne ihn zeitnah und gib ihn nicht weiter.",
          },
        ],
      },
      {
        frage: "Muss ich mich nach dem Schließen des Browsers neu anmelden?",
        text: [
          "Ja, wenn du auf der Anmeldeseite „Angemeldet bleiben“ nicht angehakt hast – das ist die Voreinstellung. Mit Haken bleibst du auch nach dem Schließen des Browsers angemeldet – bis du dich abmeldest oder 12 Stunden lang nichts getan hast. Deine letzte Wahl merkt sich dieser Browser und belegt den Haken bei der nächsten Anmeldung wieder vor; du kannst ihn jederzeit wieder entfernen.",
          {
            hinweis:
              "Solange du arbeitest, wirst du nie abgemeldet – auch nicht nach vielen Stunden, etwa an einem langen Turniertag. Erst wenn eine Anmeldung 12 Stunden lang nicht benutzt wurde, meldest du dich beim nächsten Mal neu an. Das gilt mit und ohne Haken. Setze den Haken nur auf einem Gerät, das nur du benutzt. Auf einem gemeinsam genutzten Rechner meldest du dich am Ende über „Abmelden“ ab.",
          },
          {
            hinweis:
              "Helfer-Geräte, die sich mit einem Turnier-Code angemeldet haben, bleiben ebenfalls angemeldet, solange gearbeitet wird, auch nach dem Schließen des Browsers.",
          },
          {
            hinweis:
              "Wird die Anmeldung mitten in der digitalen Protokollierung beendet (etwa durch eine Abmeldung auf einem anderen Gerät oder eine Passwortänderung), gehen keine Ereignisse verloren: Sie bleiben im Protokollfenster gesichert und werden gesendet, sobald du dich in einem anderen Browser-Tab neu angemeldet hast. Das Protokollfenster selbst schließt du dabei nicht.",
          },
        ],
      },
      {
        frage: "Ich habe mein Passwort vergessen.",
        text: [
          "Über „Passwort vergessen“ auf der Anmeldeseite forderst du einen Link an, mit dem du dir ein neues Passwort setzen kannst.",
        ],
      },
      {
        frage: "Ich bin Administrator und komme gar nicht mehr hinein – was nun?",
        text: [
          "Für diesen Fall gibt es einen Notzugang. Er geht bewusst nur direkt auf dem Rechner, auf dem Torball-Turniere läuft – nicht über die Webseite, denn jede solche Tür könnte auch ein Fremder nutzen. Er erzeugt einen einmaligen Link, der 60 Minuten gilt. Du öffnest ihn im Browser und wählst dort selbst ein neues Passwort; es taucht nirgends sonst auf.",
          {
            hinweis:
              "Windows: Doppelklick auf „Notzugang-Torball.cmd“ im Programmordner (Rechtsklick → „Als Administrator ausführen“). Linux und Server: Befehl admin:notzugang der Konsole, auf Linux zum Beispiel „sudo torball-turniere-konsole admin:notzugang“. Gibt es mehrere Administrator-Konten, nennt der Befehl sie, und du wählst eines mit --email. Ist auch die Authenticator-App verloren, schaltet der Zusatz --zwei-fa-zuruecksetzen die Zwei-Faktor-Anmeldung aus; Windows fragt danach.",
          },
          {
            hinweis:
              "Beim Notzugang werden alle bisherigen Anmeldungen dieses Kontos beendet, und das Konto bekommt einen Hinweis (und eine Mail, falls der Versand eingerichtet ist), dass der Notzugang genutzt wurde. Ein gesperrtes Konto bleibt gesperrt – das hebst du vorher mit dem Befehl benutzer:entsperren auf.",
          },
        ],
      },
    ],
  },
  {
    id: "profil-sicherheit",
    titel: "Mein Profil & Sicherheit",
    kurz: "E-Mail und Passwort ändern und die Zwei-Faktor-Anmeldung einrichten.",
    abschnitte: [
      {
        frage: "Wo ändere ich E-Mail oder Passwort?",
        text: [
          "Unter {{profil}} – erreichbar über das Menü oben rechts mit deinem Namen. Zur Bestätigung solcher sicherheitsrelevanten Änderungen gibst du jeweils dein aktuelles Passwort ein.",
          {
            hinweis:
              "Wenn du dein Passwort änderst, werden alle anderen angemeldeten Sitzungen beendet – die gerade genutzte bleibt bestehen.",
          },
        ],
      },
      {
        frage: "Welche Anforderungen hat ein Passwort?",
        text: [
          "Mindestens 12 Zeichen – auf Großbuchstaben, Ziffern oder Sonderzeichen kommt es nicht an. Am einfachsten sind mehrere Wörter hintereinander, etwa „halle-muenchen-dienstag“: leicht zu tippen und zu diktieren, und sicherer als ein kurzes Passwort mit Sonderzeichen. Beim Eintippen zeigt dir eine Checkliste live an, was noch fehlt.",
        ],
      },
      {
        frage: "Wie richte ich die Zwei-Faktor-Anmeldung (2FA) ein?",
        text: [
          "Unter {{profil}} → „Zwei-Faktor-Authentifizierung“ startest du die Einrichtung, scannst den angezeigten QR-Code mit einer Authenticator-App (oder gibst den Schlüssel manuell ein) und bestätigst mit dem Code aus der App. Danach fragt die Anmeldung neben dem Passwort zusätzlich diesen Code ab. Zum Abschalten oder Neu-Einrichten deaktivierst du die 2FA zuerst im selben Abschnitt – dafür brauchst du dein Passwort und einen aktuellen Code. Solange 2FA aktiv ist, lässt sich der Schlüssel nicht einfach ersetzen.",
          {
            vertiefung: {
              titel: "Was ist eine Authenticator-App?",
              text: [
                "Eine App auf deinem Smartphone, die alle 30 Sekunden einen sechsstelligen Einmalcode erzeugt. Dieser zweite Faktor schützt dein Konto zusätzlich – selbst dann, wenn jemand dein Passwort kennen würde.",
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "einstellungen",
    titel: "Darstellung & Einstellungen",
    kurz: "Farbschema, Zeilenabstand und Inhaltsbreite nach deinen Bedürfnissen einstellen.",
    abschnitte: [
      {
        frage: "Wie stelle ich Hell-/Dunkelmodus ein?",
        text: [
          "Unter {{einstellungen}} wählst du das Farbschema: „Systemeinstellung folgen“, „Hell“ oder „Dunkel“. Standardmäßig folgt die Anwendung deiner Systemeinstellung.",
        ],
      },
      {
        frage: "Was bewirkt der Zeilenabstand?",
        text: [
          "Er steuert, wie dicht Tabellen und Eingabefelder dargestellt werden („Standard“ oder „Schmal“). Das hilft, je nach Bildschirm mehr Inhalt auf einen Blick zu sehen.",
          {
            hinweis:
              "Diese Anzeige-Einstellungen gelten nur für das aktuelle Gerät bzw. den Browser. Angemeldete Benutzer können unter {{profil}} zusätzlich einen kontogebundenen Standardwert hinterlegen – der wird bei jeder Anmeldung neu angewendet und hat dann Vorrang vor der Wahl am Gerät.",
          },
        ],
      },
      {
        frage: "Was bewirkt die Inhaltsbreite?",
        text: [
          "Sie steuert, wie breit sich der Inhalt auf großen Bildschirmen ausdehnt („Standard“ oder „Breit“). „Breit“ eignet sich vor allem für große Monitore, damit z. B. Tabellen mit vielen Spalten mehr Platz bekommen.",
        ],
      },
    ],
  },
  {
    id: "lokale-installation",
    titel: "Lokale Installation & Turnier-Sync",
    kurz: "Ein Turnier bei fehlendem oder unzuverlässigem Internet vor Ort auf einem eigenen Rechner weiterverwalten.",
    abschnitte: [
      {
        frage: "Was bringt mir eine lokale Installation?",
        text: [
          "Eine lokale Installation ist eine eigene Kopie der Anwendung auf einem Rechner, den du zum Turnier mitnimmst. Ein Turnier lässt sich dorthin herunterladen und dort auch ohne (oder mit unzuverlässiger) Internetverbindung vor Ort weiterverwalten. Ergebnisse übertragen sich automatisch zurück zum Server, sobald wieder eine Verbindung besteht.",
        ],
      },
      {
        frage: "Wie sichere ich meine Daten vor einem Turnier?",
        text: [
          "Alle Daten liegen in einer Datenbank auf genau diesem einen Rechner. Fällt er am Spieltag aus, wäre das laufende Turnier verloren – deshalb vor jedem Turnier eine Sicherung anlegen.",
          "Unter „Admin → Systemeinstellungen“ ganz unten steht dafür der Knopf „Sicherung herunterladen“. Es entsteht eine einzelne Datei mit allem: Turnieren, Mannschaften, Spielen, Protokollen, Stammdaten, Benutzerkonten und Einstellungen.",
          {
            hinweis:
              "Die Datei enthält auch Zugangsdaten. Sie gehört auf einen USB-Stick oder einen anderen sicheren Ort – nicht in eine Cloud-Freigabe und nicht als E-Mail-Anhang.",
          },
          {
            vertiefung: {
              titel: "Und wie spiele ich eine Sicherung zurück?",
              text: [
                "Das geschieht bewusst nicht per Knopfdruck, sondern über die Konsole: Es überschreibt im Zweifel einen laufenden Turnierbestand und soll ein bewusster Schritt sein.",
                "Eine Eingabeaufforderung als Administrator im Programmordner (C:\\Torball-Turniere\\App) öffnen und eingeben: Konsole-Torball.cmd sicherung:einspielen --datei=\"C:\\Pfad\\zur\\datei.json\"",
                "Standardmäßig werden nur fehlende Daten ergänzt, vorhandene bleiben unangetastet. Erst mit dem zusätzlichen Wort --ueberschreiben werden auch vorhandene ersetzt. Der übliche Fall – frisch installierter Ersatzrechner – braucht das nicht.",
              ],
            },
          },
        ],
      },
      {
        frage: "Etwas funktioniert nicht – was kann ich weitergeben?",
        text: [
          "Bei der lokalen Installation schreibt der Server ein Protokoll in den Ordner C:\\Torball-Turniere\\logs. Das bleibt auch nach einem Neustart erhalten.",
          "Für eine Rückmeldung an die Entwicklung: eine Eingabeaufforderung als Administrator im Programmordner (C:\\Torball-Turniere\\App) öffnen und Konsole-Torball.cmd diagnose eingeben. Das schreibt eine Textdatei mit Version, Einstellungen, Datenbank-Zustand und den letzten Protokollzeilen. Passwörter stehen nicht darin – die Datei kann also unbesehen mitgeschickt werden.",
        ],
      },
      {
        frage: "Wie richte ich eine lokale Installation ein?",
        text: [
          "Unter Windows gibt es ein fertiges Installationspaket: die ZIP-Datei „Torball-Turniere-Windows-….zip“ von der Seite der Veröffentlichungen („Releases“) des Projekts herunterladen und entpacken. Darin die Datei „Setup.cmd“ per Doppelklick starten – das Programm richtet alles Nötige automatisch ein (Node.js oder ein Build sind nicht nötig, es steckt alles im Paket) und stellt nur wenige Fragen. Die Anwendung läuft danach im Hintergrund als Windows-Dienst und startet mit dem Rechner von selbst. Eine ausführliche Schritt-für-Schritt-Anleitung liegt als „Installations-Anleitung.html“ direkt im entpackten Ordner.",
          {
            hinweis:
              "Dafür ist beim Installieren und beim Aktualisieren eine Internetverbindung nötig – dazwischen läuft die lokale Installation komplett offline.",
          },
          "Unter Linux (Debian, Ubuntu und davon abgeleitete Systeme) funktioniert es mit dem Quellcode ({{download-quellcode}}, direkt von diesem Server): ZIP entpacken und im Ordner „bash Setup-Linux.sh“ starten. Der Installer erklärt jeden Schritt und fragt vorher um Zustimmung; die Schritt-für-Schritt-Anleitung heißt „INSTALLATION-LINUX.md“ und liegt im entpackten Ordner. Diese Linux-Variante ist neu und noch nicht auf vielen Systemen erprobt – über Rückmeldungen freuen wir uns.",
          "Für macOS gibt es bisher keine Installation. Bei Fragen dazu wende dich an deine Turnierleitung bzw. die technische Betreuung.",
        ],
      },
      {
        frage: "Wie aktualisiere ich die lokale Installation?",
        text: [
          "Im Startmenü unter „Torball-Turniere“ auf „Torball-Turniere aktualisieren“ klicken (oder im Programmordner die Datei „Aktualisieren-Torball.cmd“ doppelklicken) und die Windows-Nachfrage bestätigen. Das Programm sieht selbst nach, ob es eine neuere Version gibt, lädt sie herunter, prüft sie und tauscht sie aus – es muss nichts von Hand heruntergeladen werden. Die Turnierdaten und deine Einstellungen bleiben dabei unverändert.",
          "Die Anwendung zeigt Administratoren am oberen Rand einen Hinweis, sobald es eine neue Version gibt. Eine neue Version steht erst bereit, wenn sie ausdrücklich veröffentlicht wurde – nicht schon mit jeder Änderung an der Entwicklung.",
          {
            hinweis:
              "Bitte nicht mitten in einem Turnier aktualisieren: Während des Austauschs ist die Anwendung etwa eine Minute lang nicht erreichbar. Antwortet die neue Version nicht, stellt das Programm automatisch den bisherigen Stand wieder her.",
          },
        ],
      },
      {
        frage: "Ist mein Konto auf der lokalen Installation dasselbe wie auf dem Server?",
        text: [
          "Nein. Beim Installieren fragt der Installer nach dem ersten Konto (Name, E-Mail-Adresse, Passwort) – wer das überspringt, legt es beim ersten Öffnen der Seite im Browser an (Ersteinrichtung). Dieses Konto ist ein Administrator-Konto mit eigenem Passwort. Es ist unabhängig vom Konto auf dem Server – die beiden werden nicht abgeglichen. Für die Kopplung mit dem Server brauchst du trotzdem zusätzlich ein Konto auf dem Server (dort erzeugst du den Kopplungscode).",
          "Das heißt: Änderst du ein Passwort, gilt die Änderung nur dort, wo du sie vorgenommen hast. Ein auf dem Server zurückgesetztes Passwort ändert nichts am lokalen Konto und umgekehrt.",
          {
            hinweis:
              "Du darfst für beide dieselbe E-Mail-Adresse und auch dasselbe Passwort verwenden – es bleibt aber Handarbeit, sie gleich zu halten. Ein Passwort-Manager nimmt dir das ab und ist hier die einfachste Lösung.",
          },
          "Die Verbindung zum Server läuft nicht über das lokale Passwort, sondern über den Kopplungscode, den du im Profil deines Server-Kontos erzeugst. Ein anderes lokales Passwort stört die Kopplung deshalb nicht.",
        ],
      },
      {
        frage: "Wie arbeiten am Turniertag weitere Geräte (Smartphones/Tablets) mit?",
        text: [
          "Alle Geräte müssen dafür im selben lokalen Netzwerk sein wie der Turnier-Rechner – zum Beispiel über einen mitgebrachten WLAN-Router (nur Strom nötig, kein Internet!), das Hallen-WLAN oder notfalls einen Handy-Hotspot. Die Helfer-Geräte brauchen keine eigene App: Sie öffnen die Anwendung einfach im Browser über die Netzwerk-Adresse des Turnier-Rechners.",
          "Für die reine Ergebniserfassung genügt der Erfassungslink samt QR-Code (Reiter „Ergebnisse“ → „Link erzeugen“); mehr Rechte gibt es über die Turnier-Codes (Reiter „Übersicht“ → „Teilen“). Auf einer lokalen Installation verwenden Link, QR-Code und die angezeigte Anmelde-Adresse automatisch die Netzwerk-Adresse des Rechners.",
          {
            hinweis:
              "Eine ausführliche Schritt-für-Schritt-Anleitung (Netzwerk-Varianten, Ablauf, Fehlersuche) liegt als „Lokales-Netzwerk-Anleitung.html“ direkt im Projektordner der lokalen Installation – neben „Setup.cmd“ und der Installations-Anleitung. Voraussetzung: Beim Installieren wurde die Frage zum Netzwerkzugriff mit „Ja“ beantwortet (nachholbar durch erneutes Ausführen von „Setup.cmd“).",
          },
        ],
      },
      {
        frage: "Wie verbinde ich die lokale Installation mit dem Server?",
        text: [
          "Auf dem Server (dort, wo das Turnier normalerweise verwaltet wird) erzeugst du unter {{profil}} → „Verbundene Instanzen“ einen Kopplungscode (15 Minuten gültig). Dazu gibst du noch einmal dein Passwort ein, weil der Code eine lokale Installation dauerhaft mit deinem Konto verbindet.",
          "Auf der lokalen Installation gibst du unter {{einstellungen}} → „Turnier-Sync“ die Server-Adresse und diesen Code ein. Ab dann sind beide dauerhaft verbunden und die lokale Installation meldet sich automatisch regelmäßig beim Server.",
        ],
      },
      {
        frage: "Wie bekomme ich ein Turnier auf die lokale Installation?",
        text: [
          "In der Turnier-Übersicht (Reiter „Übersicht“) findest du den Abschnitt „Turnier-Sync“. Dort wählst du die verbundene Instanz aus und klickst „Für lokale Nutzung herunterladen“ – optional mit den Vereins-/Team-Stammdaten. Der Download kommt binnen kurzer Zeit automatisch auf der lokalen Installation an, ganz ohne Datei-Transfer.",
          {
            hinweis:
              "Ein Turnier kann immer nur an eine lokale Installation gleichzeitig heruntergeladen werden. Erst wenn die Freigabe dort wieder aufgehoben wird, ist ein erneuter Download möglich.",
          },
        ],
      },
      {
        frage: "Was passiert mit Änderungen, während das Turnier lokal verwaltet wird?",
        text: [
          "Alles, was auf der lokalen Installation geändert wird – Ergebnisse, aber auch Mannschaften, Regeln, Schiedsrichter und mehr – überträgt sich automatisch zum Server, sobald eine Verbindung besteht (etwa alle 45 Sekunden), auch nach einem zwischenzeitlichen Verbindungsausfall. Die lokale Installation gilt für die Dauer des Downloads als der maßgebliche Stand.",
        ],
      },
      {
        frage: "Warum ist der Turniername auf dem Server rot und trägt den Zusatz „(gesperrt)“?",
        text: [
          "Das erscheint, sobald ein Turnier an eine lokale Installation heruntergeladen wurde. Weil die lokale Installation ab diesem Zeitpunkt der maßgebliche Stand ist, lässt sich das Turnier auf dem Server bewusst nicht mehr bearbeiten – eine Änderung dort würde beim nächsten automatischen Abgleich ohnehin wieder überschrieben. Lesen (z. B. den Spielplan ansehen) bleibt weiterhin möglich.",
          {
            hinweis:
              "Betrifft nur den Server – auf der lokalen Installation selbst lässt sich das Turnier ganz normal weiterbearbeiten.",
          },
        ],
      },
      {
        frage: "Wie gebe ich ein Turnier wieder frei?",
        text: [
          "Im „Turnier-Sync“-Abschnitt auf dem Server über „Freigabe aufheben“. Danach gilt ausschließlich der Serverstand als gültig, die rote Kennzeichnung verschwindet und das Turnier ist auf dem Server wieder normal bearbeitbar – die lokale Installation kann aber nichts mehr automatisch übertragen. Das ist eine bewusste Aktion, die nur die Turnierleitung selbst auslöst (z. B. bei Verlust oder Defekt des lokalen Rechners).",
        ],
      },
    ],
  },
  {
    id: "geplante-funktionen",
    titel: "Noch geplante Funktionen",
    kurz: "Ein Überblick über Erweiterungen, die für spätere Versionen der Anwendung vorgesehen, aber noch nicht umgesetzt sind.",
    abschnitte: [
      {
        frage: "Was ist für spätere Versionen geplant?",
        text: [
          "Diese Anwendung wird nach und nach weiterentwickelt. Die folgenden Erweiterungen sind für spätere Versionen vorgesehen – für einen festen Zeitpunkt gibt es aber noch keine Zusage:",
          {
            liste: [
              "Eine Möglichkeit, die Anwendung komplett eigenständig auf einem einzelnen Computer zu nutzen, ganz ohne Internetzugang und ohne zentralen Server im Hintergrund – ergänzend zur bereits vorhandenen lokalen Installation (siehe oben).",
              "Ausbau der neuen digitalen Live-Protokollierung (aktuell im Beta-Test, siehe eigenes Hilfe-Thema): unter anderem eine Torschützen-Liste über das Turnier, ein druckbarer Spielbericht und frei belegbare Tasten.",
              "Die Anwendung zusätzlich auf Italienisch, Französisch und Englisch nutzen können, nicht nur auf Deutsch.",
              "Dateien direkt am Turnier hinterlegen können, zum Beispiel eine Ausschreibung, einen Hallenplan oder eine Anfahrtsskizze, sichtbar für alle Beteiligten.",
              "Zusätzliche Regeln speziell für Wettbewerbe mit mehreren Spieltagen (zum Beispiel eine Bundesliga-Saison): etwa, dass eine Person innerhalb einer Saison nicht für zwei verschiedene Vereine spielen darf, oder dass sich der Kader einer Mannschaft nach ihrem ersten Spiel nur noch eingeschränkt ändern lässt.",
            ],
          },
          {
            hinweis:
              "Rückmeldungen und Wünsche dazu sind jederzeit willkommen – Kontaktmöglichkeiten stehen auf der Seite {{ueber}}.",
          },
        ],
      },
    ],
  },
];

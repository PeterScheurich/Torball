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
          "Pflicht sind Name, Datum und Startzeit. Dazu wählst du die Anzahl der Spielfelder, den Spielmodus und die Protokollierung.",
          {
            hinweis:
              "Die Startzeit lässt sich nach dem Anlegen nirgends mehr ändern – trage sie deshalb gleich korrekt ein.",
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
        frage: "Was bedeutet der Spielmodus?",
        text: [
          "Er legt fest, wie oft jede Mannschaft gegen jede andere spielt: „Jeder gegen Jeden (einfach)“ – ein Spiel je Paarung – oder „Jeder zweimal gegen Jeden (doppelt)“ – Hin- und Rückspiel an einem Spieltag.",
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
          "Im Reiter „Übersicht“ trägst du unter „Freigabe für andere Benutzer“ die Person und die gewünschte Zugriffsstufe ein. Es gibt drei Stufen: Lesen (nur ansehen), Schreiben für Spielbetrieb (Spielplan und Ergebnisse bearbeiten) und volles Schreiben (zusätzlich Grunddaten, Mannschaften und Regeln bearbeiten).",
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
          "Im Reiter „Ergebnisse“ trägst du pro Spiel die Tore beider Mannschaften ein. Die Ansicht aktualisiert sich automatisch, solange sie sichtbar ist – Eingaben von anderen Geräten erscheinen also von selbst.",
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
          "Statt nur Endergebnisse einzutragen, wird jedes Ereignis während des Spiels erfasst: Würfe, Tore, Fouls, Strafwürfe, Auszeiten, Wechsel. Aus diesem Protokoll berechnet die Anwendung Spielstand, Restzeit, Foul- und Wurfzähler automatisch – und am Ende das Ergebnis für die Tabelle.",
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
              "Sobald irgendein Protokoll begonnen wurde, gilt das Turnier als gestartet: Spielzeit, Spielmodus und Protokollierungsart sind dann gesperrt – wie beim ersten manuell erfassten Ergebnis.",
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
              "F + Ziffer = Foul, P = Strafwurf, T = Auszeit, M = Technische Auszeit, R + Ziffer = Freiwurf, X + Ziffer = Wurf über die Aktionstaste.",
              "E + Ziffer + Ziffer = Wechsel (raus, rein) – oder über den „Wechsel“-Knopf mit Auswahl von Feld und Bank.",
              "Leertaste = Spieluhr starten/anhalten, H = Halbzeit (tauscht bei aktivierter Regel automatisch die Anzeigeseiten), Rücktaste = letztes Ereignis rückgängig, Esc = offene Eingabe verwerfen.",
              "Bei Tor, Eigentor, Foul, Strafwurf und Auszeiten hält die Spieluhr automatisch an – der Schiedsrichter pfeift danach neu an, erst dann startet die Leertaste die Uhr wieder.",
            ],
          },
          "Alles geht auch per Maus oder Touch: Feldspieler-Tasten, Aktions-Knöpfe und das Wechsel-Fenster. Eine Bluetooth- oder USB-Tastatur (später auch ein eigenes Tastenfeld) funktioniert genauso.",
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
              "Wichtig: Ein vergessenes Passwort kannst du dir über „Passwort vergessen“ selbst neu setzen. Verlierst du aber den Zugang zu deiner Authenticator-App, ist eine Anmeldung derzeit nicht mehr möglich – auch ein Administrator kann die Zwei-Faktor-Anmeldung aktuell nicht zurücksetzen. Bewahre den Zugang daher sicher auf.",
          },
          {
            hinweis:
              "Nach 10 falschen Passwort-Versuchen hintereinander wird ein Konto zum Schutz vor Missbrauch automatisch gesperrt. „Passwort vergessen“ hebt eine so entstandene Sperre wieder auf.",
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
        frage: "Ich habe mein Passwort vergessen.",
        text: [
          "Über „Passwort vergessen“ auf der Anmeldeseite forderst du einen Link an, mit dem du dir ein neues Passwort setzen kannst.",
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
          "Mindestens 8 Zeichen, darunter ein Großbuchstabe, eine Zahl und ein Sonderzeichen. Beim Eintippen zeigt dir eine Checkliste live an, welche Bedingungen bereits erfüllt sind.",
        ],
      },
      {
        frage: "Wie richte ich die Zwei-Faktor-Anmeldung (2FA) ein?",
        text: [
          "Unter {{profil}} → „Zwei-Faktor-Authentifizierung“ startest du die Einrichtung, scannst den angezeigten QR-Code mit einer Authenticator-App (oder gibst den Schlüssel manuell ein) und bestätigst mit dem Code aus der App. Danach fragt die Anmeldung neben dem Passwort zusätzlich diesen Code ab.",
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
                "Im Ordner „backend“ eine Eingabeaufforderung öffnen und eingeben: npm run torball -- sicherung:einspielen --datei=\"C:\Pfad\zur\datei.json\"",
                "Standardmäßig werden nur fehlende Daten ergänzt, vorhandene bleiben unangetastet. Erst mit dem zusätzlichen Wort --ueberschreiben werden auch vorhandene ersetzt. Der übliche Fall – frisch installierter Ersatzrechner – braucht das nicht.",
              ],
            },
          },
        ],
      },
      {
        frage: "Etwas funktioniert nicht – was kann ich weitergeben?",
        text: [
          "Bei der lokalen Installation schreibt der Server ein Protokoll in den Ordner C:\Torball-Turniere\logs. Das bleibt auch nach einem Neustart erhalten – anders als die Ausgabe im minimierten Server-Fenster.",
          "Für eine Rückmeldung an die Entwicklung: im Ordner „backend“ eine Eingabeaufforderung öffnen und npm run torball -- diagnose eingeben. Das schreibt eine Textdatei mit Version, Einstellungen, Datenbank-Zustand und den letzten Protokollzeilen. Passwörter stehen nicht darin – die Datei kann also unbesehen mitgeschickt werden.",
        ],
      },
      {
        frage: "Wie richte ich eine lokale Installation ein?",
        text: [
          "Unter Windows gibt es einen Ein-Klick-Installer: {{download-quellcode}} (direkt von diesem Server) und danach entpacken. Starte darin die Datei „Setup.cmd“ auf der obersten Ebene per Doppelklick – das Skript richtet alles Nötige automatisch ein und bietet dabei an, den Ordner an seinen dauerhaften Platz (C:\\Torball-Turniere\\App) zu verlegen; diese Frage am besten mit „Ja“ beantworten, damit die Installation nicht im Downloads-Ordner hängen bleibt. Eine ausführliche Schritt-für-Schritt-Anleitung liegt als „Installations-Anleitung.html“ direkt im entpackten Ordner.",
          {
            hinweis:
              "Dafür ist einmalig eine Internetverbindung nötig (für die Downloads) – danach läuft die lokale Installation komplett offline.",
          },
          "Für andere Betriebssysteme oder Fragen dazu wende dich an deine Turnierleitung bzw. die technische Betreuung.",
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
          "Auf dem Server (dort, wo das Turnier normalerweise verwaltet wird) erzeugst du unter {{profil}} → „Verbundene Instanzen“ einen Kopplungscode (15 Minuten gültig).",
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

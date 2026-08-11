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
 *    (`{ liste: [...] }`) oder ein hervorgehobener Hinweis (`{ hinweis: "..." }`).
 *
 * === Screenshot ergaenzen ===
 * Bild-Datei nach `frontend/public/hilfe/` legen und im Abschnitt ergaenzen:
 *   bild: "/hilfe/mein-screenshot.png",
 *   bildAlt: "Kurze Beschreibung des Bildinhalts fuer Screenreader",
 * `bildAlt` ist Pflicht, sobald `bild` gesetzt ist (der Typ erzwingt das) -
 * ein Screenshot ohne Alternativtext waere gerade in dieser App ein Widerspruch.
 * Optional zusaetzlich `bildUnterschrift: "..."` fuer eine sichtbare Bildunterschrift.
 */

/** Ein Baustein einer Antwort: Absatz (String), Aufzaehlung oder Hinweis-Kasten. */
export type HilfeBlock = string | { liste: string[] } | { hinweis: string };

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
          "Mit Torball-Turniere planst du ein Turnier und protokollierst es während der Veranstaltung am Computer: von den teilnehmenden Mannschaften über den Spielplan und die Schiedsrichter-Einteilung bis zu den Ergebnissen und einer öffentlichen Turnierseite zum Mitverfolgen.",
        ],
      },
      {
        frage: "In welcher Reihenfolge arbeite ich ein Turnier ab?",
        text: [
          "Die einzelnen Schritte bauen aufeinander auf. Eine typische Reihenfolge ist:",
          {
            liste: [
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
    ],
  },
  {
    id: "turnier-anlegen",
    titel: "Turnier anlegen & Grunddaten",
    kurz: "Ein neues Turnier mit Name, Datum und Spielfeldern anlegen.",
    abschnitte: [
      {
        frage: "Wie lege ich ein neues Turnier an?",
        text: [
          "In der Turnierliste führt „Neues Turnier“ zum Anlegeformular. Pflicht sind Name und Datum; außerdem legst du die Anzahl der Spielfelder fest.",
        ],
      },
      {
        frage: "Was bedeutet die Anzahl der Spielfelder?",
        text: [
          "Sie bestimmt, wie viele Spiele gleichzeitig laufen können. Der Normalfall ist ein Spielfeld, als Ausnahme sind zwei möglich.",
        ],
      },
      {
        frage: "Was ist die Protokollierungsart?",
        text: [
          "Sie legt fest, wie Ergebnisse erfasst werden. Aktuell steht die manuelle Erfassung zur Verfügung: Endergebnisse werden pro Spiel eingetragen – entweder direkt in der Anwendung oder über einen Erfassungslink.",
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
          "Im Turnier findest du den Reiter „Mannschaften“. Eine Mannschaft wird aus den Stammdaten (Verein und Team) übernommen. Sind noch keine Stammdaten vorhanden, legst du sie zuvor unter „Stammdaten“ an.",
        ],
      },
      {
        frage: "Wie pflege ich den Kader einer Mannschaft?",
        text: [
          "Jede Mannschaft lässt sich aufklappen; darunter erfasst du die Spieler (Nummer, Name, ggf. Klassifizierung). Die kleine Zahl am Umschalter zeigt schon zugeklappt, wie viele Spieler bereits erfasst sind.",
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
          "Im eigenen Reiter „Schiedsrichter“ zwischen „Mannschaften“ und „Spielplan“. Schiedsrichter gehören zum Turnier; optional lässt sich einer Mannschaft zuordnen, wem er angehört.",
        ],
      },
      {
        frage: "Wie lege ich die Turnierleitung fest?",
        text: [
          "Genau eine Person je Turnier ist die Turnierleitung. Die Auswahl erfolgt über ein Optionsfeld – wählst du eine andere Person, wird die bisherige automatisch zurückgesetzt.",
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
          "Im Reiter „Spielplan“ erzeugst du einen Vorschlag. Reihenfolge, Startzeiten, Status und Hinweise lassen sich anschließend jederzeit anpassen.",
        ],
      },
      {
        frage: "Wie ordne ich Schiedsrichter den Spielen zu?",
        text: [
          "Der Spielplan-Reiter bietet die Sicht „Schiedsrichter-Einteilung“. Ein Klick erzeugt einen Vorschlag je Spiel, den du danach pro Spiel über ein Auswahlfeld ändern kannst.",
          {
            hinweis:
              "Die Zuordnung ist ein bewusster Schritt, kein Automatismus. Ein Schiedsrichter wird nie für das Spiel der eigenen Mannschaft vorgeschlagen; spielt die eigene Mannschaft parallel, weist die Anwendung darauf hin – die Entscheidung bleibt bei der Turnierleitung.",
          },
        ],
      },
      {
        frage: "Warnt mich die Anwendung bei Regelverstößen?",
        text: [
          "Ja. Sie warnt z. B. bei Back-to-Back-Spielen einer Mannschaft, trifft aber keine automatischen Entscheidungen. Die Turnierleitung darf jede Warnung bewusst übergehen.",
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
          "Zum Erfassungslink gehört ein QR-Code, den du herunterladen (als SVG zum Aushängen oder als PNG) und in der Halle aufhängen kannst. Er wird lokal im Browser erzeugt und an keinen externen Dienst geschickt.",
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
    id: "oeffentliche-seite",
    titel: "Öffentliche Turnierseite",
    kurz: "Eine Seite zum Mitlesen freischalten – ohne Login, jede Sektion einzeln steuerbar.",
    abschnitte: [
      {
        frage: "Was zeigt die öffentliche Seite?",
        text: [
          "Sie ist ein frei teilbarer Link je Turnier, den Besucher ohne Login öffnen können. Vier Bereiche lassen sich einzeln freischalten: Turnierinfos, Anfahrt, Spielplan und Ergebnisse.",
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
          "Über die Benutzerverwaltung (nur für Administrator und Manager) werden neue Konten per Einladung angelegt. Die eingeladene Person setzt sich über den Einladungslink selbst ein Passwort.",
        ],
      },
      {
        frage: "Wer darf was?",
        text: [
          {
            liste: [
              "Administrator: voller Zugriff auf alles.",
              "Manager: voller Zugriff auf selbst erstellte Turniere; kann Benutzer verwalten.",
              "Weitere Zugriffe werden pro Turnier gezielt vergeben (Lesen oder Schreiben).",
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
    id: "einstellungen",
    titel: "Darstellung & Einstellungen",
    kurz: "Farbschema und Zeilenabstand nach deinen Bedürfnissen einstellen.",
    abschnitte: [
      {
        frage: "Wie stelle ich Hell-/Dunkelmodus ein?",
        text: [
          "Unter „Einstellungen“ wählst du das Farbschema. Standardmäßig folgt die Anwendung deiner Systemeinstellung; du kannst hell oder dunkel aber auch fest wählen.",
        ],
      },
      {
        frage: "Was bewirkt der Zeilenabstand?",
        text: [
          "Er steuert, wie dicht Tabellen und Eingabefelder dargestellt werden („Standard“ oder „Schmal“). Das hilft, je nach Bildschirm mehr Inhalt auf einen Blick zu sehen.",
          {
            hinweis:
              "Diese Anzeige-Einstellungen gelten nur für das aktuelle Gerät bzw. den Browser. Angemeldete Benutzer können im Profil zusätzlich einen kontogebundenen Standardwert hinterlegen.",
          },
        ],
      },
    ],
  },
];

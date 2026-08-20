# Schiedsrichter-Stammdaten + Vereins- statt Mannschafts-Bezug

**Datum:** 14.08.2026

## Ausgangslage

`SchiedsrichterImTurnier` referenzierte bisher per `mannschaftId` direkt eine Turnier-Mannschaft,
um den „eigenen Verein" für die Konflikt-Erkennung der Schiedsrichter-Zuordnung zu bestimmen.
Zwei Probleme:

1. Fachlich gehört ein Schiedsrichter zu einem **Verein**, nicht zu einer einzelnen
   Turnier-Mannschaft.
2. Bei zwei Mannschaften desselben Vereins im selben Turnier (I-/II-Mannschaft) erkannte die
   Zuordnung nur die direkt referenzierte Mannschaft als „eigene" – die zweite blieb unerkannt.

Außerdem stand der Backlog-Punkt „akkreditierte Schiedsrichter" (wiederverwendbare
Schiedsrichter-Stammdaten analog Verein/Team) offen – beide Änderungen brauchen dieselbe
Datengrundlage und wurden deshalb zusammen umgesetzt.

## Entscheidungen

**Vereins-Bezug:** `SchiedsrichterImTurnier.vereinId` referenziert jetzt einen Verein (optional,
neutrale Personen ohne Vereinsbindung zulässig). Da Vereine – anders als die frühere
`mannschaftId` – turnierübergreifend sind, entfällt die alte Kaskade „beim Mannschaft-Löschen die
Referenz lösen" ersatzlos. Bewusst hingenommene Einschränkung: eine Ad-hoc-Mannschaft ohne
Stammdaten-Bezug (keine `vereinId`) kann nie als „eigener Verein" erkannt werden.

**Schiedsrichter-Stammdaten:** neuer turnierübergreifender Typ `Schiedsrichter`
(`docType: "schiedsrichter"`, Route `backend/src/routes/schiedsrichterStammdaten.ts`,
`/schiedsrichter-stammdaten`) als wiederverwendbare Vorlage. Gepflegt auf einer **eigenen**
Stammdaten-Seite mit eigenem Menüpunkt „Stammdaten → Schiedsrichter"
(`SchiedsrichterStammdatenPage.tsx`) – bewusst **nicht** als Unterabschnitt der
Vereine/Teams-Seite (Nutzer-Vorgabe: der erste Wurf hatte es dort eingebaut, war nicht gelungen;
es besteht keine zwingende fachliche Abhängigkeit). Gleiches Rechtemodell wie Vereine/Teams:
Lesen für jede Anmeldung, Schreiben nur Admin/Manager.

**Keine Live-Verknüpfung:** die Übernahme in ein Turnier **kopiert** die Werte
(`importiertAusStammdatenSchiedsrichterId` als reiner Herkunftsverweis) – deshalb bewusst keine
Referenz-Prüfung beim Löschen von Stammdaten-Schiedsrichtern (anders als bei Verein/Team gibt es
keine Verknüpfung, die verwaisen könnte).

## Umsetzung

- Konflikt-Erkennung (`backend/src/spielplan/schiedsrichterZuordnung.ts` + Frontend-Duplikat
  `schiedsrichterKonflikt.ts`) läuft über die Auflösung `mannschaftId → vereinId` der
  Turnier-Mannschaften, nicht mehr über direkten ID-Vergleich.
- In `SchiedsrichterVerwaltung.tsx` zusätzlich zum bestehenden „Meine Profildaten
  übernehmen"-Knopf eine Auswahl „Aus Stammdaten übernehmen" (füllt das Anlege-Formular vor).
- Nebenbefund gefixt: der Turnier-Sync-Export vergaß Vereine, die nur über Schiedsrichter (nicht
  über Mannschaften) referenziert sind.
- Demo-Beispieldaten (`backend/src/demo/beispieldaten.ts`) zeigen die neuen Stammdaten +
  vereinsbasierte Konflikterkennung mit.

## Im selben Zeitraum (Randnotizen, eigene Commits)

- `deploy-instanz.sh` überschreibt `backend/.env` bei Updates nicht mehr (schrieb sie vorher bei
  jedem Lauf neu und drehte damit u. a. ein manuell gesetztes `DEMO_SNAPSHOT_ERLAUBT=true`
  zurück) – nur noch bei der Erstanlage.
- Neuer UI-Standard für Anlege-Formulare in Verwaltungs-Listen (Tabellen-Form, ab ca. 4–5
  Feldern zuklappbar) – Details in `CLAUDE.md`, Abschnitt „Barrierefreiheit & Theming".

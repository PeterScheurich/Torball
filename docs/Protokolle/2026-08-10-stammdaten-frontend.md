# 2026-08-10: Stammdaten-Oberfläche (Vereine/Teams) + kleinere Nachbesserungen

## Ausgangslage

Die Backend-Routen für Vereine/Teams (Abschnitt 15 der Gesamtspezifikation)
existierten bereits aus einer frühen Session (Commits `52b36ac`,
`08bacee`), aber ohne Oberfläche - Stammdaten ließen sich nur direkt über die
API pflegen. Diese Änderung ergänzt die fehlende Frontend-Seite und die
Verzahnung mit der Mannschaftserfassung im Turnier, plus einige kleinere,
beim Umsetzen aufgefallene Nachbesserungen.

## Umgesetzt

**Stammdaten-Seite (`/stammdaten`, neu: `StammdatenPage.tsx`,
`VereineVerwaltung.tsx`, `TeamsVerwaltung.tsx`)**
- Vollständiges CRUD für Vereine (Name, Bundesland, Ansprechpartner,
  Logo-URL) und Teams (Name + zugehöriger Verein), Inline-Bearbeitung mit
  Auto-Save bei Blur/Änderung, analog zu den bereits bestehenden Mustern
  (`MannschaftenListe.tsx`, `BenutzerVerwaltung.tsx`).
- Nav-Link "Vereine & Teams" in der Kopfzeile ergänzt (`App.tsx`), erreichbar
  für jeden angemeldeten Benutzer (keine Turnier-Berechtigung nötig, da
  Stammdaten nicht an ein Turnier gebunden sind).

**Verzahnung mit der Mannschaftserfassung (`MannschaftenListe.tsx`)**
- Neues Auswahlfeld "Aus Stammdaten übernehmen (optional)" beim Anlegen einer
  Turnier-Mannschaft: wählt man ein Team, werden Name (`<Verein> <Team>`)
  und Bundesland als Vorschlag in die Formularfelder übernommen - **kopiert,
  nicht live verknüpft** (Abschnitt 15: spätere Stammdaten-Änderungen dürfen
  laufende/abgeschlossene Turniere nicht rückwirkend verändern), danach frei
  weiter bearbeitbar.
- Bereits in diesem Turnier verwendete Teams verschwinden aus der Auswahl
  (nicht nur eine Warnung) - serverseitig zusätzlich abgesichert durch einen
  neuen 409-Check in `backend/src/routes/mannschaft.ts`
  (`teamBereitsVerwendet()`): ein Team darf pro Turnier nur einmal als
  Mannschaft auftreten.

**Spielplan-Regenerierungssperre auch auf die Vorschau angewendet
(`backend/src/routes/spielplan.ts`, `SpielplanVerwaltung.tsx`)**
- Der bestehende Check "kein neuer Spielplan, wenn schon Spiele
  laufen/Ergebnisse erfasst sind" saß bisher nur beim Persistieren (POST),
  nicht beim Vorschau-Abruf (GET) - wurde in den gemeinsam genutzten
  Vorschau-Berechnungs-Helper verschoben, greift jetzt für beide Wege
  (passend zur CLAUDE.md-Regel, dass Prüfregeln für Vorschlag UND
  gespeicherten Plan gelten müssen). Frontend zeigt zusätzlich einen
  erklärenden Hinweistext statt nur den Button zu deaktivieren.

**Kleinere UI-Nachbesserungen**
- `.status-zelle` (capitalize) auf die Status-Spalte der Turnierliste und
  des Spielplans angewendet (war bisher nur auf der Turnier-Übersicht).
- "Speichern"/"Abschließen" in der Ergebniserfassung (authentifiziert und
  öffentlich per Token) von Text- auf Icon-Buttons (💾/✓) umgestellt, globales
  Button-Padding dafür von `8px 16px` auf `4px 8px` verkleinert.
- "Link kopieren" (Zwischenablage) für den öffentlichen
  Ergebniserfassungs-Link ergänzt (`ErgebnisVerwaltung.tsx`).

## Verifikation

- `npm run build --workspace=shared && npm run build` - alle drei
  Workspaces fehlerfrei.
- `npm run lint --workspace=frontend` - keine neuen Warnungen.
- `npm run test --workspace=backend` - 18 grün, 1 übersprungen (Integration
  ohne `COUCHDB_*`, wie erwartet).
- E2E gegen die echte CouchDB: temporären Manager-Benutzer direkt per
  CouchDB-Dokument angelegt (Passwort-Hash mit `bcryptjs`, gleiche
  Parameter wie `backend/src/auth/passwort.ts`), damit angemeldet,
  Verein-/Team-Listen auf `/stammdaten` geprüft, ein Testturnier angelegt,
  zwei Mannschaften über "Aus Stammdaten übernehmen" hinzugefügt (Name/
  Bundesland-Übernahme und Verschwinden aus der Auswahl bestätigt),
  anschließend Testturnier und Testbenutzer wieder gelöscht.

## Offen

- Kein Bearbeiten/Löschen-Schutz, falls ein Verein/Team noch in aktiven
  Turnieren als Mannschaft "kopiert" vorkommt - ist by design unkritisch
  (Kopie, keine Live-Verknüpfung), aber ein Hinweis in der UI ("wird in
  N Turnieren verwendet") wäre nutzerfreundlicher.
- Keine Import/Export-Funktion für Stammdaten (z. B. CSV) - aktuell nur
  Einzel-CRUD.

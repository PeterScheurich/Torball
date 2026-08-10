# 2026-08-11 – Spieler, Schiedsrichter, Live-Aktualisierung, QR-Codes

Umfangreiche Sitzung: mehrere neue Funktionsbereiche gebaut, dazu UI-Feinschliff
und ein zurückgestellter Sicherheitsverdacht. Alle Änderungen sind committet und
gepusht (siehe `git log`, Bereich `9d3e3ce … 22e611b`).

## Neue Funktionsbereiche

- **Spieler-/Kaderverwaltung** (erste Iteration, reines CRUD):
  `backend/src/routes/spieler.ts`, ausklappbarer Kader je Mannschaft in
  `MannschaftenListe.tsx` (`SpielerKader.tsx`), Spielerzahl-Plakette am
  zugeklappten Umschalter. Spieler hängen am `mannschaftId`, Kaskaden-Löschung
  pro Mannschaft (Mannschaft- **und** Turnier-Delete).
- **Trainer/Betreuer an der Mannschaft:** bis zu drei, jeweils mit
  „ist Schiedsrichter"-Checkbox. Erst als Tabellenspalten, dann bewusst in den
  Kader-Bereich verschoben. Ohne Namen ist die Checkbox deaktiviert; wird der
  Name geleert, fällt das Flag auf `false`.
- **Schiedsrichter-Verwaltung:** neuer Tab zwischen Mannschaften und Spielplan
  (`SchiedsrichterVerwaltung.tsx`, `backend/src/routes/schiedsrichter.ts`).
  Turnierleitung als Single-Select-Radio (genau eine je Turnier).
- **Schiedsrichter-Zuordnung zum Spielplan** als bewusster Button
  (kein Automatismus), Vorschlag mit Gewichtung P1 (nie eigene Mannschaft,
  höchste Priorität) / P2 (nicht während eigene Mannschaft gleichzeitig spielt),
  danach je Spiel manuell änderbar. Konflikt-Hinweise im UI. Unit-Tests für die
  Vorschlagslogik.
- **Spielplan-Tab in zwei Sichten** getrennt („Spielplan" schlank vs.
  „Schiedsrichter-Einteilung"), Spalten „Nr."/„Feld" schmaler, Feldname statt
  roher `feldId`, `min-width` gegen Spalten-Kollaps auf schmalen Schirmen.
- **Automatisches Aktualisieren (Polling)** für interne Ergebnisverwaltung,
  Token-Ergebniserfassung und die öffentliche Turnierseite – inkl.
  Konflikt-Erkennung, wenn zeitgleich auf beiden Seiten gespeichert wird
  (`frontend/src/useErgebnisEingaben.ts`).
- **QR-Codes** für den Ergebnis-Erfassungslink und die öffentliche
  Turnierseite (`QrCode.tsx`, Abhängigkeit `qrcode`), lokal erzeugt, Download
  als SVG/PNG (zum Aushängen in der Halle).
- **Passwort-Anforderungen als Live-Checkliste** (rot ○ → grün ✓) auf allen
  „neues Passwort"-Seiten und beim Profil-Passwortwechsel.
- **Stammdaten:** Vereine/Teams-Tabellen nach Namen sortiert, Vereins-
  Anlegeformular einklappbar (zugeklappt, sobald Vereine existieren).

## Behobene Fehler / Feinschliff

- Optionale Felder bei Verein/Mannschaft (und neu Spieler/Schiedsrichter)
  lassen sich wieder leeren (`null` statt `undefined`; Schema `["string","null"]`).
- Nicht editierbare Felder als solche kenntlich (gestrichelter Rahmen).
- Übersichts-Eingabefelder breiter; `.button-link` auf `inline-block`
  (Button/Link-Paare gleich hoch); Profil-Passwort-Widget unter dem *neuen*
  Passwort.
- Stammdaten-Übernahme bleibt sichtbar und erklärt den leeren Zustand
  (Ursache war: neue **Vereine** ohne **Teams** – die Übernahme bietet Teams an).

## Wichtige Erkenntnisse / Entscheidungen

- Weitere bewusste Frontend↔Backend-Duplikate (shared ist CommonJS):
  `schiedsrichterKonflikt.ts` ↔ `schiedsrichterZuordnung.ts`,
  `passwortAnforderungen.ts` ↔ `passwort.ts`.
- Spielgemeinschaften ohne echten Verein werden als „Pseudo-Verein" erfasst
  (`Team.vereinId` ist Pflicht) – Modell bewusst unverändert.
- Vite/Windows: Datei-Umbenennung mit Groß-/Kleinschreibungs-Kollision
  (`PasswortRegeln.tsx` vs. `passwortRegeln.ts`) führte zu HMR-Fehlern; Dev-
  Server-Neustart und eindeutige Dateinamen (`passwortAnforderungen.ts`) lösten es.

## Zurückgestellt / offen

- Digitaler Live-Protokollierungspfad (Spez. 22) – weiterhin nicht gebaut.
- Spieler: Sperre „Kaderänderung nur bis zum ersten Spiel" (5.3), Kader-Import
  aus früherem Turnier.
- Schiedsrichter: Interessenkonflikt-Warnung schon bei der Spielplan-Erzeugung,
  Betreuer→Schiedsrichter-Übernahme (mit Dedup), Verein- statt Mannschafts-
  Zuordnung; Audit-Log genehmigter Ausnahmen.
- „Ergebnis zurücksetzen/löschen"-Endpunkt fehlt (nur überschreiben möglich).
- **Sicherheitsverdacht (vom Nutzer zurückgestellt):** Ein Link ließ sich von
  Chrome nach Edge übernehmen, ohne erneute Anmeldung. Nächste Sitzung prüfen:
  welcher Link (geschützte Route vs. bewusst öffentlicher/Token-Link),
  Session-Cookie-Flags (HttpOnly/Secure/SameSite), ob eine geschützte Route in
  einem frischen Browser ohne Cookie wirklich Login verlangt.

## Ausgeführte Befehle (wiederkehrend)

```bash
npm run build --workspace=shared   # nach Typ-Änderungen in shared/src zuerst
npm run build && npm run lint --workspace=frontend && npm run test --workspace=backend
npm install qrcode --workspace=frontend
npm install -D @types/qrcode --workspace=frontend
```

## Stand

Turnierplanung und -durchführung ohne digitales Protokoll ist end-to-end
möglich (Stammdaten → Mannschaften/Kader/Betreuer → Schiedsrichter → Spielplan
inkl. Schiedsrichter-Einteilung → Ergebniserfassung intern/per Token/live →
öffentliche Seite mit QR). Detailliertere Tests stehen noch aus.

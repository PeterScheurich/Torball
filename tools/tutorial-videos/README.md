# Werkzeuge für die Tutorial-Videos

Kein Teil der Anwendung und kein npm-Workspace (eigenes `package.json`, eigener `node_modules`). Gedacht für die Reihe
„Torball-Turniere – Tutorial-Videos“ (Sprechskripte unter `docs/Tutorial-Videos/`, Medien unter `D:\Projekte\Videos\Tutorials\Torball`).

## Idee: Tutorial als Code

Statt jedes Video von Hand mitzuklicken, führt ein Skript die Schritte in der echten Anwendung durch und nimmt dabei auf.
Ändert sich die Oberfläche, bricht das Skript an der betroffenen Stelle ab („Knopf … nicht gefunden“) - das ist der Hinweis, dass
das Video veraltet ist. Dann wird nur dieser Schritt angepasst und neu aufgenommen.

## Stand

- Playwright 1.64.1 mit Chromium (Installation: `npm install`, dann `npx playwright install chromium`).
- `rauchtest.mjs` zeigt die Aufnahme-Schnittstelle (`page.screencast`: Aufnahme als WebM, `showActions` markiert Klicks,
  `showChapter` blendet Kapitel ein).
- Anbindung an DaVinci Resolve Studio 21.1.2 per Python-Skript-Schnittstelle getestet (lesend). Voraussetzung in Resolve:
  Preferences > System > General > External scripting using = Local.

## Regeln

- Aufnahmen NUR gegen Testdaten (Dev- oder Demo-Instanz), nie gegen echte personenbezogene Daten.
- Zugangsdaten (z. B. ElevenLabs-Schlüssel) gehören nie ins Repository, sondern in eine Datei außerhalb des Projekts oder eine
  Umgebungsvariable.

## Zeitleiste in Resolve bauen (Stand 03.11.2026)

Reihenfolge nach einer Aenderung: Sprache (`erzeuge-video-XX-...mjs`), danach `node mp3-zu-wav.mjs` (Resolve dekodiert manche mp3-Dateien nicht bis zum
Ende - per Testrender belegt -, die WAV-Kopien sind vollstaendig), Aufnahme (`aufnahme-video-XX.mjs`), dann `python resolve_zeitleiste_video.py "<Ordner>" "<Name>"`.
Aufbau ausser Bild und Ton (Intro nach welchem Satz, Kapitelueberschriften, Outro) steht in `aufbau.json` im Ordner des Videos. Jeder Bau bekommt einen
eigenen Media-Pool-Ordner mit Kopien der Dateien; fruehere Zeitleisten (mit Anmerkungen) bleiben unberuehrt. Anmerkungen lesen: `resolve_anmerkungen_lesen.py`,
Regeln zum Anmerken: `ANMERKUNGEN.md`. Pruefen: `pruefe-bildrand.mjs` (graue Raender), `pruefe-satzende.mjs` (Satzenden in den Dateien).

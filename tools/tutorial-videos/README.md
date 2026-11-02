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

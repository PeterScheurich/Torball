# Dokumentation

Diese Dateien sind die führende Fassung der Projektdokumentation.
Änderungen bitte hier vornehmen und anschließend mit
`node scripts/bookstack-push.mjs` nach BookStack übertragen (das Skript
überträgt die Markdown-Dateien direkt in diesem Ordner – ohne diese
`README.md` und ohne Unterordner). Die `scripts/bookstack-*`-Dateien liegen
bewusst nur lokal auf der Entwicklungsinstanz (git-ignoriert) – ein frischer
Checkout dieses Repos hat sie nicht.

## Inhalt

- [Installation / Konfiguration](installation-konfiguration.md)
- [Testumgebung starten](testumgebung-starten.md)
- [Besonderheiten der Entwicklungs-Umgebung](entwicklungs-umgebung.md)
- [Besonderheiten der Demo-Umgebung](demo-umgebung.md)
- [Entwicklungs-Kanban-Board](kanban-board.md)
- [Digitale Protokollierung – Konzept](digitales-protokoll-konzept.md)
- [Torball-Protokoll-Panel – Konzept](torball-protokoll-panel-konzept.md)
- [Torball – Gesamtspezifikation (fachlich & technisch)](torball_gesamtspezifikation.md)

## Weitere Ordner

- [`Protokolle/`](Protokolle/) – datierte Sitzungsprotokolle zu größeren
  Entscheidungen und dabei gefundenen Bugs (nicht nach BookStack übertragen).
- `Archiv/` – ältere, ersetzte Fassungen (u. a. die frühere Aufteilung in
  fachliche und technische Spezifikation) nur zur Nachschau. Der Ordner ist
  **git-ignoriert** (nur lokal vorhanden).

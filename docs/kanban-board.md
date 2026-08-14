# Entwicklungs-Kanban-Board

Kleines Kanban-Board zur Organisation der Weiterentwicklung. Es hat fachlich
**nichts** mit den Torball-Turnieren zu tun, sondern dient nur der internen
Aufgabenverwaltung. Sichtbar und bedienbar ausschließlich für **Admins**, und
zwar **nur auf der Entwicklungsinstanz**.

Erreichbar über das Menü **Admin → Entwicklungs-Board** (nur Admin) unter
der Route `/entwicklungs-board`.

## Funktionsumfang

- Vier Spalten: **Offen**, **In Arbeit**, **Testen**, **Erledigt**
  (Fluss von links nach rechts).
- Karte: Titel, Beschreibung, **Kategorie** (Bug, Feature, Wunsch, Aufgabe,
  Sonstiges) und **Priorität** (Hoch, Mittel, Niedrig). Zusätzlich wird der
  Ersteller-Name und der Zeitpunkt der letzten Änderung angezeigt.
- Verschieben ohne Drag & Drop (barrierefrei): ▲/▼ ordnet innerhalb der Spalte,
  ◀/▶ verschiebt in die vorherige/nächste Spalte.
- Bearbeiten und Löschen je Karte.

## Datenhaltung

Die Karten liegen als eigener Dokumenttyp `kanbanKarte` in derselben CouchDB wie
alle übrigen Daten (kein zusätzlicher Server, keine zusätzliche Datenbank). Die
Route liegt in `backend/src/routes/kanban.ts`, der Typ in
`shared/src/types/kanban.ts`.

## Nur auf der Entwicklungsinstanz

Das Board ist über das Flag **`KANBAN_BOARD_AKTIV=true`** in `backend/.env`
freigeschaltet – gesetzt nur auf der Entwicklungsinstanz (analog
`MAIL_POSTFACH_AKTIV`). Auf Prod/Demo (Flag aus) sind sämtliche `/kanban`-Routen
gesperrt (403) und der Menüpunkt bleibt ausgeblendet (`GET /kanban/verfuegbar`,
öffentlich abfragbar, steuert das im Frontend).

**Warum kein Board auf Prod/Demo mehr?** Feedback und Fehlermeldungen aus dem
laufenden Betrieb kommen inzwischen über das Mail-Postfach herein (zentrales
Feedback-Postfach der Software, IMAP-Abruf + KI-Klassifikation, siehe
`docs/Protokolle/2026-08-13-mail-postfach.md`) – das legt erkannte
Anforderungen ohnehin automatisch als Kanban-Karte auf der Entwicklungsinstanz
an. Ein separates Board auf Prod/Demo mit anschließendem
Abgleich der Kartenstände (früher: JSON-Export/-Import mit manueller
Konfliktauflösung je Karte, siehe Git-Historie dieser Datei) ist damit
überflüssig geworden.

## Bekannte Grenze

Da das Board nur auf einer einzigen Instanz existiert, gibt es keinen
Abgleich-Mechanismus (und keinen Bedarf dafür). Eine gelöschte Karte ist
unwiderruflich weg (kein Tombstone/Papierkorb).

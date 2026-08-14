# 2026-08-15 – Entwicklungs-Kanban-Board: nur noch auf der Entwicklungsinstanz, Export/Import entfernt

Ausgangspunkt: bei der Arbeit an der Verlinkung zwischen Mail-Postfach und Kanban-Karten (siehe
`2026-08-13-mail-postfach.md`, Ergänzung „Absender auf der Karte + Link zurück zur Ursprungsmail")
fiel Peter auf, dass das Entwicklungs-Board bislang auf **jeder** Instanz sichtbar war, auch für
Admins auf Prod/Demo. Zwei zusammenhängende Vereinfachungen:

1. **Board nur noch dev-only.** Neues Flag `KANBAN_BOARD_AKTIV` (ersetzt `KANBAN_SYNC`, gleiches
   Muster wie `MAIL_POSTFACH_AKTIV`): `GET /kanban/verfuegbar` (öffentlich, kein Login nötig) steuert
   im Frontend, ob der Menüpunkt „Entwicklungs-Board" erscheint; alle übrigen `/kanban`-Routen liefern
   ohne das Flag 403.
2. **Export/Import komplett entfernt.** Der bisherige Zweck – Kartenstände zwischen Dev und Prod
   abgleichen, weil auf Prod ebenfalls Karten entstehen konnten – entfällt: Feedback/Fehlermeldungen
   aus dem laufenden Betrieb laufen inzwischen über das Mail-Postfach herein, das erkannte
   Anforderungen ohnehin automatisch als Kanban-Karte **auf der Entwicklungsinstanz** anlegt. Ein
   Board auf Prod/Demo, auf dem unabhängig Karten entstehen könnten, gibt es dann gar nicht mehr –
   der Abgleich-Mechanismus wurde damit gegenstandslos, nicht nur ungenutzt.

## Entfernt

- `backend/src/kanban/importMerge.ts` + `.test.ts` (die drei Spalten-/Kategorie-/Prioritäts-Listen
  daraus sind jetzt direkt in `backend/src/routes/kanban.ts` deklariert, einziger verbleibender
  Verwender).
- Routen `POST /kanban/import/vorschau` und `POST /kanban/import/anwenden`.
- Frontend: der komplette Abschnitt „Abgleich zwischen den Umgebungen" in `KanbanBoardPage.tsx`
  (Export-Knopf, Datei-Import, Konflikt-Auflösung je Karte) inkl. der zugehörigen
  API-Funktionen/Typen in `frontend/src/api.ts` (`kanbanImportVorschau`, `kanbanImportAnwenden`,
  `KanbanImportVorschau`, `KanbanImportErgebnis`, `KanbanKonfliktWahl`, `KanbanKonflikt`).
- `syncAktiv` aus der `GET /kanban`-Antwort (kein Zweck mehr ohne Import).

## Umbenannt/ergänzt

- `KANBAN_SYNC` → `KANBAN_BOARD_AKTIV` in `backend/.env(.example)`, `deploy/deploy-instanz.sh`,
  `deploy/installieren-windows.ps1`, `docs/entwicklungs-umgebung.md`, `docs/demo-umgebung.md`,
  diversen Code-Kommentaren.
- Neu: `GET /kanban/verfuegbar` (analog `GET /mail-postfach/verfuegbar`), `kanbanBoardVerfuegbar()`
  in `frontend/src/api.ts`, `kanbanBoardDaAktiv`-State in `App.tsx`.

## Ausgeführte Befehle

```bash
npm run build --workspace=shared && npm run build
npm run lint --workspace=frontend
npm run test --workspace=backend   # 59 statt zuvor 69 (die 10 importMerge-Tests sind mitentfallen)
```

Live im Dev-Browser geprüft: `GET /kanban/verfuegbar` liefert auf der lokalen Entwicklungsinstanz
weiterhin `{ verfuegbar: true }` (Flag lokal in `backend/.env` von `KANBAN_SYNC=true` auf
`KANBAN_BOARD_AKTIV=true` umgestellt), das Board selbst lädt unverändert, der
Export/Import-Abschnitt ist verschwunden.

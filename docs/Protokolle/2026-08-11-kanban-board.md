# 2026-08-11 – Entwicklungs-Kanban-Board (admin-only) mit JSON-Sync

## Anlass / Wunsch

Ein kleines, überschaubares Kanban-Board – **nur für Admins** – zur besseren
Strukturierung der Weiterentwicklung. Ausdrücklich **ohne** zusätzlichen Server
oder zusätzliche zentrale DB, ohne Konfigurations-/Erreichbarkeits-Aufwand.
Claude soll Zugriff haben; andere Tester (Admins) sollen ebenfalls Einträge
anlegen können; gleicher Stand auf Test/Dev und Prod ist erwünscht.

## Vorab geklärte Entscheidungen

- **Datenhaltung:** neuer `docType` `kanbanKarte` in der bestehenden CouchDB
  (kein neuer Server) – gewählt gegenüber einer Datei im Repo.
- **Prod/Dev-Topologie:** Prod ist noch nicht final definiert (wird voraussichtlich
  auf demselben Host PVE-MS01 laufen, eigene DB, nur `127.0.0.1`). Automatischer
  Sync zwischen zwei gegenseitig nicht erreichbaren Loopback-Instanzen braucht
  prinzipiell einen dritten, erreichbaren Punkt = der unerwünschte zentrale
  Server. Daher für jetzt **JSON-Export/-Import** (topologie-unabhängig).
- **Umfang:** „Etwas mehr Struktur" + **Kategorie** (Bug, Feature, Wunsch,
  Aufgabe, Sonstiges), zusätzlich Priorität und Autor+Datum.
- **Nachtrag des Nutzers:** Der Sync soll **nur von Dev aus** möglich sein →
  umgesetzt als Env-Flag `KANBAN_SYNC=true` (nur Dev), das den **schreibenden
  Import** freischaltet. Export bleibt überall möglich (nur so kommen die auf
  Prod erfassten Karten heraus).

## Umgesetzt

**shared:**
- `shared/src/types/kanban.ts` – Typ `KanbanKarte` (+ Spalte/Kategorie/Priorität),
  in Union `TorballDokument` aufgenommen.

**backend:**
- `backend/src/routes/kanban.ts` – CRUD + Verschieben + Import, alle Endpunkte
  admin-gated (`requireRolle(["admin"])`):
  - `GET /kanban` → `{ karten, syncAktiv }`
  - `POST /kanban/karten`, `PUT /kanban/karten/:id`, `DELETE /kanban/karten/:id`
  - `PUT /kanban/karten/:id/position` (▲/▼ innerhalb der Spalte, Nachbar-Tausch)
  - `POST /kanban/import/vorschau` + `POST /kanban/import/anwenden`
    (nur bei `KANBAN_SYNC=true`, sonst 403)
- `backend/src/kanban/importMerge.ts` – reine, testbare Merge-Logik
  (Normalisierung, Konfliktermittlung je `kanbanId`, Konfliktauflösung).
- `backend/src/kanban/importMerge.test.ts` – Unit-Tests (Neu, Identisch,
  Konflikt statt Last-Write-Wins, Auflösung lokal/eingehend/offen, Spalte
  „testen", Enum-Defaults, Pflichtfelder).
- Route in `backend/src/index.ts` registriert.
- `KANBAN_SYNC` in `backend/.env.example` dokumentiert.

**frontend:**
- `frontend/src/pages/KanbanBoardPage.tsx` – Board mit vier Spalten
  (Offen → In Arbeit → Testen → Erledigt), Anlege-/
  Bearbeiten-Formular, ▲▼◀▶-Verschieben, Export (Client-seitig als Blob) und
  Import (nur wenn `syncAktiv`).
- API-Funktionen in `frontend/src/api.ts`, Route + admin-only Menüeintrag in
  `frontend/src/App.tsx`, Stile in `frontend/src/index.css`.

**Doku:** `docs/kanban-board.md` (führende Fassung, BookStack-Spiegelung).

## Sync-Design (JSON, Merge)

- Export: `{ typ, formatVersion, exportiertAm, karten }`.
- **Zweistufiger Import** (`/kanban/import/vorschau` + `/anwenden`): kein
  automatisches Last-Write-Wins mehr. Die Vorschau teilt in Neu / Unverändert /
  Konflikt; **Konflikte legt das UI je Karte zur Entscheidung vor** (lokal vs.
  eingehend), der neuere Stand ist nur als „(neuer)" markiert. Vorbelegt „lokal
  behalten", plus „Alle lokal/importiert". (Nutzer-Vorgabe 2026-08-11: bei
  Sync-Problemen fragen, wer gewinnt – nicht einfach den neuesten übernehmen.)
- Konfliktkriterium: inhaltlicher Vergleich der redaktionellen Felder (Titel,
  Beschreibung, Spalte, Kategorie, Priorität); `reihenfolge`/Provenienz zählen
  nicht (reines Umsortieren ist kein Konflikt).
- Anwenden rechnet den Plan zum Anwendungszeitpunkt neu (lokaler Stand kann sich
  seit der Vorschau geändert haben); eingehender `_rev` wird verworfen, lokaler
  `_id/_rev` bleibt (kein 409).
- **Bekannte Grenze:** Löschungen synchronisieren nicht (kein Tombstone) –
  bewusst so für ein kleines internes Board.
- Späterer Ausbau ohne Datenmodell-Änderung: native CouchDB-Replikation,
  von Prod ausgehend initiiert (Prod bleibt `127.0.0.1`-only inbound), ggf.
  gefiltert nur auf `kanbanKarte`.

## Nachträge (2026-08-11, gleiche Sitzung)

- **Vierte Spalte „Testen"** ergänzt (Fluss Offen → In Arbeit → Testen →
  Erledigt); `KANBAN_SPALTEN`-Reihenfolge steuert Sortierung + ◀▶.
- **Konfliktbasierter Import** statt Last-Write-Wins (siehe oben).
- **Ersteller-E-Mail** zusätzlich zum Namen denormalisiert gespeichert und als
  `mailto`-Link angezeigt (`erstelltVonEmail`). Klarstellung: „denormalisiert"
  ist nicht „anonymisiert" – es ist der echte Name/die echte E-Mail; sie reisen
  als Kopie mit, weil die Benutzer-ID auf einer anderen Instanz nicht auflösbar
  ist. Für Rückfragen ist so immer der tatsächliche Benutzer eindeutig bekannt.

## Ausgeführte Befehle / Prüfungen

```bash
npm run build --workspace=shared
npm run build            # frontend + backend + shared: grün
npm run lint --workspace=frontend   # nur bestehende Warnung in auth.tsx
npm run test --workspace=backend    # 30 pass, 1 skip (COUCHDB_* nicht gesetzt)
```

## Offen / Nicht verifiziert

- **Live-Browser-Prüfung blockiert:** In diesem Ordner lief parallel der
  Dev-Server einer anderen Sitzung auf Port 3000 (Backend bindet fix auf 3000,
  Vite-Proxy zielt dorthin). Eine isolierte Instanz mit der neuen Route ließ
  sich daher nicht hochziehen. Korrektheit ist über TypeScript-Typecheck,
  Vite-Build und die Merge-Unit-Tests abgesichert; die UI folgt bestehenden
  Mustern. Manuelle Sichtprüfung nachzuholen, sobald Port 3000 frei ist.
- `KANBAN_SYNC=true` wurde lokal in `backend/.env` (git-ignoriert) gesetzt,
  damit der Import auf dieser Dev-Instanz aktiv ist.

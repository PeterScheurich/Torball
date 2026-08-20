# Integrationstests mit eigener CouchDB-Testdatenbank

**Datum:** 13.08.2026

## Ausgangslage

Mehrere Backend-Testdateien (u. a. `turnier-delete.integration.test.ts`, `auth-sperre.test.ts`,
`turnierSync.test.ts`) überspringen sich selbst, wenn die `COUCHDB_*`-Umgebungsvariablen nicht
gesetzt sind – es gibt in diesem Projekt bewusst kein Mock-/Fake-DB-Setup. Folge: der normale
Lauf `npm run test --workspace=backend` deckte diese Tests **nie** ab; sie wurden lokal seit
ihrer Einführung immer still übersprungen (zeitweise 14 Tests), ohne dass das auffiel.

## Entscheidung

Eigene, kleine CouchDB-Testdatenbank auf der Dev-CouchDB, analog zum bestehenden Muster
`torball_backend`/`torball` (eigener eingeschränkter Benutzer `torball_test`, kein Server-Admin –
Einrichtung nach dem Muster in `docs/Protokolle/2026-08-10-couchdb-backend-setup.md`). Kein
Docker/In-Memory-Ersatz: die Tests sollen gegen eine echte CouchDB laufen, genau wie der
Produktivcode.

## Umsetzung

- Neues npm-Script **`npm run test:integration --workspace=backend`** – liest
  `backend/.env.test.local` (git-ignoriert, lokal einmalig anzulegen mit `COUCHDB_URL`,
  `COUCHDB_DB=torball_test`, `COUCHDB_USER=torball_test`, `COUCHDB_PASSWORD`) und führt damit
  auch die sonst übersprungenen Tests aus.
- Der bisherige `npm run test`-Lauf bleibt unverändert (ohne DB-Zugang, überspringt die
  Integrationstests weiterhin) – für schnelle Läufe ohne Netzverbindung.
- **Vor jedem Release ist der vollständige Lauf verpflichtend** (siehe Abschnitt
  „Release-Prozess" in `CLAUDE.md`), damit die Integrationstests nicht wieder dauerhaft
  unbemerkt ausfallen.

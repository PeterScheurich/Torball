# Torball-Turniere

Eine Web-Anwendung, um **Torball-Turniere zu planen und während des Turniers am
Computer zu protokollieren** – von den teilnehmenden Mannschaften über Spielplan
und Schiedsrichter-Einteilung bis zu Ergebnissen, einer öffentlichen
Turnierseite und einer barrierefreien Bedienung.

## Funktionsüberblick

- **Turnierplanung** per Assistent: Grunddaten, Mannschaften (mit Kader und
  Trainer/Betreuern), Schiedsrichter, Spielplan.
- **Stammdaten** für Vereine und Teams, turnierübergreifend wiederverwendbar;
  zusätzlich **Kontakt-/Stammdaten am Benutzerprofil**, die sich als
  Turnierleitung/Schiedsrichter ins Turnier übernehmen lassen.
- **Spielplan-Vorschlag** mit Regel-Warnungen (z. B. zwei Spiele hintereinander)
  und **Schiedsrichter-Zuordnung** als bewusster Schritt (kein Automatismus).
- **Ergebniserfassung** direkt in der App oder über einen teilbaren
  Erfassungslink (mit QR-Code) ohne Login – z. B. für Helfer an den Spielfeldern.
- **Datenübernahme zwischen Spieltagen** (Hin-/Rückspieltag): ein neues Turnier
  aus einem abgeschlossenen ableiten, mit Gesamttabelle über beide Spieltage.
- **Ausdrucke (PDF)** für Turnierinfos, Spielplan, Ergebnisse und
  Schiedsrichter-Einteilung – wahlweise als getaggtes, barrierefreies PDF über
  den Druckdialog oder als Direkt-Download; jeweils mit Link und QR-Code.
- **Turnier-Logo** je Turnier (Standard: Torball-Logo, überschreibbar).
- **Öffentliche Turnierseite** je Turnier (ohne Login), Bereiche einzeln
  freischaltbar, mit QR-Code zum Öffnen auf dem Smartphone – plus eine
  **öffentliche Startseite**, die alle freigegebenen Turniere auflistet.
- **Turnier-Codes** für den kontolosen Zugriff im lokalen Netzwerk: weitere
  Geräte am Spielort greifen über einen geteilten Code statt eines eigenen
  Kontos auf genau ein Turnier zu (getrennt für Turnier- und Spielleitung).
- **Turnier-Sync für echten Offline-Betrieb**: ein auf der zentralen Plattform
  geplantes Turnier lässt sich auf eine **lokale Installation** herunterladen
  und dort auch ohne (oder mit unzuverlässiger) Internetverbindung am
  Spielort weiterverwalten – Ergebnisse laufen automatisch zurück, sobald
  wieder eine Verbindung besteht (siehe „Lokal auf einem Windows-Rechner
  nutzen" unten).
- **Benutzerverwaltung** mit Rollen, Einladungs-Flow, Zwei-Faktor-Anmeldung,
  optionaler Selbstregistrierung sowie Login-Sperre nach Fehlversuchen; die
  Turnierliste zeigt, wer ein Turnier angelegt/zuletzt bearbeitet/abgeschlossen hat.
- **In-App-Hilfe** unter `/hilfe` sowie kontextbezogene Hilfe auf öffentlichen
  Seiten.
- **Barrierefreiheit & Theming** von Anfang an: Tastaturbedienung, sichtbarer
  Fokus, Hell-/Dunkelmodus, Zeilenabstand und Inhaltsbreite einstellbar.

## Technischer Aufbau

Monorepo mit drei npm-Workspaces:

| Workspace | Rolle | Stack |
|---|---|---|
| `shared` | gemeinsame Typen/Logik | TypeScript (CommonJS) |
| `backend` | API | Fastify, CouchDB (via `nano`) |
| `frontend` | Web-Oberfläche | React, Vite, React Router |

Datenhaltung: eine einzige CouchDB-Datenbank, alle Entitäten über ein
`docType`-Feld unterschieden. Authentifizierung: server-seitige Sessions per
Cookie (kein JWT).

## Installation

Je nach Zweck gibt es drei Wege – ausführlich beschrieben in
[`docs/installation-konfiguration.md`](docs/installation-konfiguration.md):

| Zweck | Kurzform | Details |
|---|---|---|
| Entwickeln/Beitragen (jede Plattform) | Abschnitt „Schnellstart" unten | `docs/installation-konfiguration.md` |
| Lokal auf einem Windows-Rechner nutzen (z. B. offline am Spielort) | `Setup.cmd` doppelklicken | Abschnitt „Lokale Installation unter Windows" |
| Produktiv auf einem Linux-Server betreiben | `deploy/provision.sh` + `deploy/deploy-instanz.sh` | Abschnitt „Produktive Installation (Debian-LXC/VM)" |

Für die lokale Windows-Installation wird der Quellcode benötigt: mit Zugriff
auf das interne Repo per `git clone`, sonst bietet jede laufende Instanz ihn
zusätzlich als ZIP-Download unter `/download/torball-quellcode.zip` an (bei
jedem Deploy neu erzeugt) – entpacken und danach `Setup.cmd` auf der obersten
Ebene starten. Spätere Updates: `Aktualisieren-Torball.cmd` (siehe
`AKTUALISIEREN.md`), Deinstallieren: `Deinstallieren-Torball.cmd` – beide
ebenfalls auf der obersten Ebene.

### Schnellstart (Entwicklung)

**Voraussetzungen:** Node.js (aktuelles LTS) mit npm, sowie eine erreichbare
CouchDB-Instanz (lokal oder im Netz – siehe `docs/installation-konfiguration.md`
bzw. die kompaktere `docs/testumgebung-starten.md`).

```bash
# Abhängigkeiten installieren
npm install

# Backend-Konfiguration anlegen und ausfüllen (CouchDB-Zugang etc.)
cp backend/.env.example backend/.env

# shared IMMER zuerst bauen (backend/frontend lösen @torball/shared gegen shared/dist auf)
npm run build --workspace=shared
npm run build            # baut anschließend alle Workspaces
```

Entwicklungs-Server (in zwei Terminals):

```bash
npm run dev:backend      # Fastify auf Port 3000
npm run dev:frontend     # Vite auf Port 5173 (proxied /api -> localhost:3000)
```

Sobald Installation und Konfiguration einmal durchgelaufen sind, reichen für
den Alltag die beiden `npm run dev:*`-Befehle oben – ein Neubau ist nur nach
Änderungen an `shared/src` bzw. vor dem produktiven Start nötig (siehe
„Befehle" in `CLAUDE.md`).

Beim allerersten Start (noch kein Benutzer vorhanden) weist die Anmeldeseite auf
die einmalige Ersteinrichtung eines Admin-Kontos hin.

## Tests & Lint

```bash
npm run test --workspace=backend      # node:test via tsx
npm run lint --workspace=frontend     # oxlint
```

Eine einzelne Testdatei (im Ordner `backend/`):

```bash
npx tsx --test src/spielplan/planung.test.ts
```

## Konsolen-Tool

Administrative Aufgaben ohne Web-Login – z. B. einen gesperrten Admin entsperren,
`backend/.env`-Werte wie Port oder SMTP nachträglich ändern, oder die Installation
aktualisieren (Git-Pull falls vorhanden + Neubau):

```bash
npm run torball --workspace=backend -- --hilfe
```

## Dokumentation

Die führende Projektdokumentation liegt unter [`docs/`](docs/README.md); die
verbindliche fachliche Referenz ist
[`docs/torball_gesamtspezifikation.md`](docs/torball_gesamtspezifikation.md).
Größere Entscheidungen sind als datierte Protokolle unter `docs/Protokolle/`
festgehalten. Änderungen je Version stehen im [`CHANGELOG.md`](CHANGELOG.md).
Hinweise speziell für die Arbeit mit Claude Code stehen in
[`CLAUDE.md`](CLAUDE.md).

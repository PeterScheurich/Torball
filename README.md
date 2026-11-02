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
  Spielort weiterverwalten – der vollständige Turnierstand (Ergebnisse,
  Regeln, Mannschaften, Freigaben) läuft automatisch zurück, sobald wieder
  eine Verbindung besteht; das Server-Turnier ist währenddessen gegen
  direkte Änderungen gesperrt und entsprechend gekennzeichnet (siehe
  „Lokal auf einem Windows-Rechner nutzen" unten).
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
| Lokal auf einem Windows-Rechner nutzen (z. B. offline am Spielort) | Installationspaket `Torball-Turniere-Windows-….zip` entpacken, `Setup.cmd` doppelklicken | `Installations-Anleitung.html` (im Paket), [`AKTUALISIEREN.md`](AKTUALISIEREN.md) |
| Lokal auf einem Linux-Rechner nutzen (Debian/Ubuntu; **auf Debian 13, Ubuntu 26.04 und Linux Mint 22.3 erprobt**) | `bash Setup-Linux.sh` | [`INSTALLATION-LINUX.md`](INSTALLATION-LINUX.md) |
| Produktiv auf einem Linux-Server betreiben | `deploy/provision.sh` + `deploy/deploy-instanz.sh` | Abschnitt „Produktive Installation (Debian-LXC/VM)" |

Für die lokale Windows-Installation gibt es ein **fertig gebautes Paket**
(`Torball-Turniere-Windows-<Version>.zip`, enthält die Anwendung samt Node.js – es muss nichts weiter installiert
oder gebaut werden). Es wird als Anhang der **GitHub-Releases** des Projekts veröffentlicht: ZIP herunterladen,
entpacken, `Setup.cmd` starten. Die Anwendung läuft danach als Windows-Dienst; **Aktualisieren** geht mit einem Klick
(Startmenü → Torball-Turniere → „Torball-Turniere aktualisieren“, siehe [`AKTUALISIEREN.md`](AKTUALISIEREN.md)) und holt
die neueste veröffentlichte Version selbst. Ein Update steht erst bereit, wenn ein Release veröffentlicht wurde – nicht
schon mit jedem Commit. Deinstallieren: `Deinstallieren-Torball.cmd`. Das Paket baut `node scripts/baue-windows-paket.mjs`
(Release-Prozess: siehe `CLAUDE.md`).

Wer den Quellcode nutzt (Entwicklung, `git clone` oder das Quellcode-ZIP, das jede laufende Instanz unter
`/download/torball-quellcode.zip` anbietet), kann `Setup.cmd` auch dort ausführen – dann wird wie früher aus dem
Quellcode gebaut (Node.js und `npm install` nötig, kein Dienst).

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
`backend/.env`-Werte wie den Port nachträglich ändern, oder die Installation
aktualisieren (Git-Pull falls vorhanden + Neubau). Der E-Mail-Versand (SMTP)
wird dagegen in der Oberfläche gepflegt (Admin → Systemeinstellungen):

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

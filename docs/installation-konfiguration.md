# Installation / Konfiguration

Diese Seite beschreibt die Installation – **lokal (Windows)** zum Entwickeln/Testen und
**produktiv (Debian-LXC)** – sowie die Konfigurationswerte.

Zum reinen **Starten** der lokalen Umgebung siehe die kompaktere Anleitung
`docs/testumgebung-starten.md`.

## Voraussetzungen (Windows, lokal)

- Visual Studio Code (empfohlen) oder ein anderer Editor
- Node.js (aktuelles LTS) inklusive npm
- Erreichbarkeit der CouchDB-Datenbank (Entwicklungsinstanz unter
  `couchdb-host`)

## Erstinstallation

Im Projektordner:

```bash
npm install
```

Danach die Backend-Konfiguration anlegen (Vorlage kopieren und ausfüllen):

```bash
cp backend/.env.example backend/.env
```

`shared` muss vor `backend`/`frontend` gebaut werden (diese lösen
`@torball/shared` gegen `shared/dist` auf):

```bash
npm run build --workspace=shared
npm run build
```

## Konfiguration (`backend/.env`)

`backend/.env` liegt nur lokal (nicht im Repository) und wird **nur beim Start**
des Backends gelesen (`--env-file`) – nach Änderungen den `npm run dev:backend`-
Prozess neu starten.

| Variable | Zweck |
|---|---|
| `PORT` / `HOST` | Port/Host des Backends (Default `3000` / `0.0.0.0`). Lokal weglassen; in Produktion je Instanz eigener `PORT` (mehrere Instanzen auf einem Host, siehe `deploy/`). |
| `COUCHDB_URL` | URL der CouchDB (z. B. `http://couchdb-host:5984`) |
| `COUCHDB_DB` | Datenbankname |
| `COUCHDB_USER` / `COUCHDB_PASSWORD` | CouchDB-Zugang |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | E-Mail-Versand (Einladungen, Passwort-Reset). Optional – ohne diese Werte fällt das Backend auf Link-in-Antwort/Server-Log zurück. |
| `FRONTEND_URL` | Basis-URL des Frontends für Links in E-Mails |
| `COOKIE_SECURE` | Session-Cookie mit `Secure`-Flag ausliefern (nur über HTTPS gültig). **Lokal (HTTP) weglassen bzw. `false`**, sonst setzt der Browser das Cookie nicht und der Login schlägt fehl. **In Produktion hinter HTTPS zwingend `true`.** |
| `SERVE_FRONTEND` | Einzelprozess-Modus: Backend liefert `frontend/dist` gleich mit aus (siehe Windows-Installer unten). Auf dem Debian-Produktivserver weglassen/`false` – dort übernimmt nginx das Ausliefern. |

**Werte mit Sonderzeichen** (z. B. `#`, Leerzeichen) immer in Anführungszeichen
setzen (`SMTP_PASSWORD="Geheim#123"`) – ohne Anführungszeichen wird alles ab
einem `#` als Kommentar abgeschnitten.

## Ersteinrichtung des ersten Admin-Kontos

Solange noch kein Benutzer existiert, weist die Anmeldeseite auf die einmalige
Ersteinrichtung eines Admin-Kontos hin. Danach laufen weitere Konten
ausschließlich über den Einladungs-Flow (Benutzerverwaltung).

## Standardregeln (Systemkonfiguration)

Die Standardwerte für neue Turniere (Spielzeit, Pausen, Wertung,
Forfait-Ergebnis usw.) pflegt ein Admin in der Oberfläche unter
**Stammdaten → Standardregeln**. Jede Änderung legt eine neue Version an; neue
Turniere übernehmen die jeweils aktuelle Version, bestehende Turniere bleiben
unverändert (jedes trägt seine eigene Kopie und ist im Reiter „Regeln" einzeln
anpassbar).

## Produktive Installation (Debian-LXC/VM) – Schritt für Schritt

Aufbau: lokale CouchDB (nur `127.0.0.1`), containerlokale nginx (Frontend statisch + `/api`-Proxy
zum Backend als systemd-Service). Mehrere Instanzen (z. B. `prod` + `demo`) laufen über eigene
Ports/DBs auf **einem** Host. Zwei Skripte im Ordner `deploy/` erledigen alles:

Auf dem Server **als `root`** (auf minimalem Debian ist `sudo`/`curl`/`git` nicht vorinstalliert –
`provision.sh` installiert sie mit):

```bash
# 0) nur falls git fehlt:
apt-get update && apt-get install -y git

# 1) Repo holen (Server muss das Git-Repo erreichen; SSH-Deploy-Key oder HTTP-Token)
git clone <REPO_URL> /root/torball-src && cd /root/torball-src

# 2) Basis installieren (Node LTS, CouchDB single-node/127.0.0.1, nginx, systemd-Template)
bash deploy/provision.sh

# 3) Instanz(en) ausrollen  ->  deploy-instanz.sh <name> <frontend_port> <backend_port>
REPO_URL=<REPO_URL> bash deploy/deploy-instanz.sh prod 8080 3001
REPO_URL=<REPO_URL> bash deploy/deploy-instanz.sh demo 8081 3002
```

Erreichbar (im Netz des Servers): `http://<server-ip>:8080` (prod), `:8081` (demo). Logs:
`journalctl -u torball@prod -f`. Vollständige Erklärung, Zwei-Instanzen-Layout, Caveats (u. a.
CouchDB-Apt-Repo für Debian 13) und die später folgende externe Erreichbarkeit (bestehende nginx als
TLS-Endpunkt → dann `COOKIE_SECURE=true` + `FRONTEND_URL=https://…`):
`docs/Protokolle/2026-08-12-produktiv-installation.md`. Zielbild/Begründung:
`docs/Protokolle/2026-08-11-zielbild-produktivumgebung.md`.

### Aktualisieren

Zwei unabhängige Dinge lassen sich aktualisieren, die leicht verwechselt werden:

- **Betriebssystem** (Debian selbst, System-Pakete): `apt-get update && apt-get dist-upgrade`.
- **App-Code** (dieses Repo, per Git): das Deploy-Skript erneut laufen lassen (git pull + Rebuild +
  Neustart des Dienstes) – `bash deploy/deploy-instanz.sh prod 8080 3001`. `REPO_URL` wird dafür
  **nicht mehr** gebraucht, sobald die Instanz einmal existiert – die Git-Adresse steckt bereits im
  `origin`-Remote ihres Checkouts unter `/opt/torball/<name>` und wird automatisch wiederverwendet;
  nötig ist `REPO_URL` nur beim allerersten Deploy einer neuen Instanz.

**`deploy/aktualisieren.sh`** erledigt **beides in einem Rutsch**, mit Rückfrage an den Stellen, wo
eine echte Entscheidung ansteht (ob System-Updates überhaupt eingespielt werden sollen; ob nach
einem Kernel-Update jetzt neu gestartet wird) – für den App-Teil ruft es intern einfach
`deploy-instanz.sh` mit denselben Parametern auf:

```bash
bash deploy/aktualisieren.sh prod 8080 3001
```

`provision.sh` legt dafür zusätzlich einen Symlink `/usr/local/bin/torball-aktualisieren` an, sodass
derselbe Befehl **von jedem Verzeichnis aus** funktioniert (kein `cd` in den Checkout nötig):

```bash
torball-aktualisieren prod 8080 3001
```

Aktualisiert **nicht** sich selbst (den Checkout unter `~/torball-src`) – falls sich die
Deploy-Skripte seit dem letzten Lauf geändert haben, vorher dort `git pull` ausführen (der Symlink
zeigt auf die Datei im Checkout, zieht die Änderung also automatisch nach).

## Lokale Installation unter Windows

Für einen lokalen Betrieb auf einem Windows-Rechner (z. B. offline am Spielort) – zwei Wege:

### Ein-Klick-Installer (empfohlen)

**Systemanforderungen:** Windows 10/11 (64-bit), lokale Administratorrechte (für die
Node-/CouchDB-Installation), einmalig Internetzugang für die Downloads – danach läuft die App
komplett offline (auch geeignet für den Einsatz ohne Netz am Spielort). Keine besonderen
Hardware-Ansprüche: Node.js und CouchDB sind genügsam, 2 CPU-Kerne/2 GB RAM reichen, 4 GB RAM
empfohlen, wenn nebenbei noch ein Browser laufen soll.

**Speicherplatz** (Richtwerte, an diesem Rechner gemessen bzw. per Download-Größe ermittelt):
Node.js ≈ 90 MB, CouchDB-Installer-Download ≈ 115 MB (installiert in ähnlicher Größenordnung, dazu
die wachsenden Datenbankdateien), Projektordner inkl. sämtlicher `node_modules` ≈ 165 MB. Insgesamt
also **grob 400–450 MB** für App + Laufzeitumgebung, zzgl. der CouchDB-eigenen Installation.
Turnierdaten selbst sind klein (reines Text/JSON, keine Dateianhänge außer dem optionalen,
clientseitig auf max. 1 MB begrenzten Turnier-Logo je Turnier) – über eine Saison typischerweise nur
einige weitere Megabyte.

Voraussetzung: der Projektordner liegt bereits lokal vor (`git clone` oder ZIP entpackt).
`deploy/Installieren-Windows.cmd` per Doppelklick starten (fragt bei Bedarf per UAC nach
Administratorrechten – nötig für die Node-/CouchDB-Installation). Das Skript
(`deploy/installieren-windows.ps1`) übernimmt automatisiert:

- **Node.js LTS** per `winget`, falls nicht vorhanden.
- **Apache CouchDB** als Windows-Dienst über den offiziellen MSI-Installer (unbeaufsichtigt,
  eigenes Zufalls-Admin-Passwort, Prüfsumme wird vor der Installation verifiziert) – läuft bereits
  eine CouchDB, fragt das Skript stattdessen nach deren Admin-Zugang. Läuft lokal unter
  `http://127.0.0.1:5984`.
- **App-Datenbank + eigener eingeschränkter CouchDB-Benutzer** (`torball_backend`, kein
  Admin-Zugriff) – analog zu `deploy/deploy-instanz.sh` auf der Linux-Seite.
- **Bauen** (`npm install`, `shared` zuerst, dann alle Workspaces).
- **`backend/.env`** – nur angelegt, falls noch keine vorhanden ist; fragt dabei interaktiv den
  **Port** (Standard `3000`) sowie optional **SMTP-Zugangsdaten** für den Mailversand ab (jeweils
  mit vorgeschlagenem Standardwert, einfach Enter drücken zum Übernehmen). Setzt zusätzlich
  `SERVE_FRONTEND=true` (siehe unten).
- **`Start-Torball.cmd`** + **`Aktualisieren-Torball.cmd`** im Projektordner sowie eine Verknüpfung
  „Torball-Turniere" auf dem Desktop (startet `Start-Torball.cmd`).

Erneutes Ausführen ist unschädlich (Idempotenz wie bei den Linux-Skripten): vorhandene `.env` bleibt
unangetastet (keine erneute Abfrage), Node/CouchDB werden nur bei Bedarf nachinstalliert, die App
wird neu gebaut. Start über die Desktop-Verknüpfung (öffnet den Browser auf dem gewählten Port);
beim allerersten Start führt die Anmeldeseite durch die einmalige Ersteinrichtung des Admin-Kontos.

**Einzelprozess-Modus (`SERVE_FRONTEND=true`):** Anders als beim Debian-Produktivbetrieb (nginx
liefert das Frontend + proxied `/api`, siehe unten) liefert das Backend hier das gebaute Frontend
selbst mit aus (`@fastify/static`, SPA-Fallback auf `index.html`) – ein einziger Prozess, kein
separater Webserver nötig. Das Frontend ruft die API weiterhin unter `/api/*` auf; das Backend
streift dieses Präfix in diesem Modus selbst ab (`rewriteUrl` in `backend/src/index.ts`), genau das,
was sonst nginx bzw. der Vite-Dev-Proxy übernehmen.

**Konfiguration später anpassen oder die App aktualisieren:** Für Änderungen nach der Installation
(z. B. Port oder SMTP nachträglich setzen) muss nicht der komplette Installer erneut durchlaufen
werden – dafür hat das Konsolen-Tool `torball` (siehe unten) eigene Befehle:

```bash
npm run torball --workspace=backend -- konfiguration:anzeigen
npm run torball --workspace=backend -- konfiguration:setzen --schluessel="PORT" --wert="3005"
npm run torball --workspace=backend -- aktualisieren
```

(Backend danach neu starten, damit `.env`-Änderungen wirken – siehe oben.) Unter Windows genügt für
das Aktualisieren (Git-Pull falls Git-Repo, `npm install`, Neubau) auch ein Doppelklick auf
`Aktualisieren-Torball.cmd` im Projektordner.

### Manuell

1. **Node.js LTS** installieren (`winget install OpenJS.NodeJS.LTS` oder von nodejs.org).
2. **CouchDB** installieren – Apache CouchDB bietet einen Windows-Installer (MSI); bei der Einrichtung
   ein Admin-Passwort vergeben, CouchDB lauscht dann lokal (`http://127.0.0.1:5984`).
3. **App holen und bauen** (im Projektordner):
   ```powershell
   npm install
   npm run build --workspace=shared
   npm run build
   ```
4. **`backend/.env`** aus `backend/.env.example` anlegen und auf die lokale CouchDB zeigen lassen
   (`COUCHDB_URL=http://127.0.0.1:5984`, `COUCHDB_USER`/`COUCHDB_PASSWORD` = der CouchDB-Zugang;
   `COUCHDB_DB=torball`). `COOKIE_SECURE` weglassen/`false` (lokal über HTTP).
5. **Starten** (zwei Prozesse): `npm run dev:backend` und `npm run dev:frontend`, dann
   `http://localhost:5173` im Browser öffnen. Beim ersten Start durch die Ersteinrichtung des
   Admin-Kontos gehen.

> **Geplant – Option B, verteilbarer Installer:** Für eine spätere Bereitstellung als Download-Knopf
> auf der Webseite ist zusätzlich ein kompiliertes MSI/EXE vorgesehen (z. B. Inno Setup, bündelt
> portables Node + gebaute App), damit Anwender nicht erst den Quellcode besorgen müssen. Umsetzung
> als eigener Schritt.

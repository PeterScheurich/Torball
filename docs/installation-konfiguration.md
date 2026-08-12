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

Erreichbar (im Netz des Servers): `http://<server-ip>:8080` (prod), `:8081` (demo). **Update** einer
Instanz = das Deploy-Skript erneut laufen lassen (git pull + Rebuild + Restart). Logs:
`journalctl -u torball@prod -f`. Vollständige Erklärung, Zwei-Instanzen-Layout, Caveats (u. a.
CouchDB-Apt-Repo für Debian 13) und die später folgende externe Erreichbarkeit (bestehende nginx als
TLS-Endpunkt → dann `COOKIE_SECURE=true` + `FRONTEND_URL=https://…`):
`docs/Protokolle/2026-08-12-produktiv-installation.md`. Zielbild/Begründung:
`docs/Protokolle/2026-08-11-zielbild-produktivumgebung.md`.

## Lokale Installation unter Windows

Für einen lokalen Betrieb auf einem Windows-Rechner (z. B. offline am Spielort) aktuell manuell:

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

> **Geplant – einfacher Windows-Installer:** Für nicht-IT-affine Anwender soll das zu einer
> Ein-Klick-Installation werden (Bündelung von Node + CouchDB + App, das Backend liefert dann das
> Frontend gleich mit aus, Start per Verknüpfung/Autostart). Umsetzung als eigener Schritt – die
> Richtung (PowerShell-Installer vs. kompiliertes MSI/EXE, Online- vs. Offline-Bundle) wird noch
> festgelegt.

# Installation / Konfiguration

Diese Seite beschreibt die lokale Installation zum Entwickeln/Testen und die
Konfigurationswerte. Das produktive Deployment ist noch nicht umgesetzt – das
Zielbild dafür steht in `docs/Protokolle/2026-08-11-zielbild-produktivumgebung.md`.

Zum reinen **Starten** der lokalen Umgebung siehe die kompaktere Anleitung
`docs/testumgebung-starten.md`.

## Voraussetzungen (Windows, lokal)

- Visual Studio Code (empfohlen) oder ein anderer Editor
- Node.js (aktuelles LTS) inklusive npm
- Erreichbarkeit der CouchDB-Datenbank (Entwicklungsinstanz unter
  `192.168.188.96`)

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
| `COUCHDB_URL` | URL der CouchDB (z. B. `http://192.168.188.96:5984`) |
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

## Produktives Deployment

Noch nicht umgesetzt. Vorgesehen ist ein Debian-LXC auf dem Proxmox-Host mit
lokaler CouchDB (nur `127.0.0.1`), einer containerlokalen nginx (Frontend
statisch + `/api`-Proxy zum Backend als systemd-Service) und der bestehenden
nginx als öffentlichem TLS-Endpunkt für eine Subdomain. Dort ist
`COOKIE_SECURE=true` zu setzen. Details und Begründung:
`docs/Protokolle/2026-08-11-zielbild-produktivumgebung.md`.

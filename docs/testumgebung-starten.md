# Testumgebung starten

Kurzanleitung, um die Anwendung lokal zum Testen zu starten, ohne dafür extra
nachzufragen.

## Voraussetzungen (einmalig erledigt, nur zur Info)

- Node.js ist installiert.
- Im Projektordner wurde einmal `npm install` ausgeführt.
- `backend/.env` existiert und enthält die Zugangsdaten zur CouchDB-Datenbank
  (liegt nur lokal, nicht im Repository).
- Der Rechner muss den Entwicklungsserver `couchdb-host` erreichen können
  (dort läuft die CouchDB-Datenbank) – gleiches Netzwerk wie bisher.

**Wichtig bei Änderungen an `backend/.env`:** Der laufende `npm run
dev:backend`-Prozess liest die Datei nur beim Start (`--env-file`), nicht
laufend mit - anders als Quelltext-Änderungen, die automatisch neu geladen
werden. Nach jeder Änderung an `.env` muss der Backend-Prozess neu gestartet
werden (siehe „Falls Port 3000 schon belegt ist" unten), sonst wirkt die
Änderung nicht.

**Werte mit Sonderzeichen** (z. B. `#`, Leerzeichen) in `backend/.env` immer
in Anführungszeichen setzen (`COUCHDB_PASSWORD="Geheim#123"`) - ohne Anführungs-
zeichen wird alles ab einem `#` als Kommentar abgeschnitten, was zu
schwer nachvollziehbaren Fehlern führt (z. B. „Authentication credentials
invalid" bei einem eigentlich korrekten Passwort).

**`COOKIE_SECURE` lokal auf `false` bzw. weglassen:** Lokal läuft alles über
HTTP. Wäre `COOKIE_SECURE=true` gesetzt, würde der Browser das Session-Cookie
verwerfen und der Login schlüge ohne erkennbaren Grund fehl. Das Flag gehört
erst in Produktion (hinter HTTPS) auf `true`.

## Server starten

Zwei Server laufen parallel, am einfachsten in zwei separaten Terminal-Fenstern
(PowerShell oder Git Bash), jeweils im Projektordner:

**Fenster 1 – Backend** (Fastify, Port 3000, verbindet sich mit der CouchDB auf
`couchdb-host`):
```bash
npm run dev:backend
```

**Fenster 2 – Frontend** (Vite, Port 5173, leitet `/api`-Aufrufe an das Backend
auf Port 3000 weiter):
```bash
npm run dev:frontend
```

Beide Befehle laufen dauerhaft (Server-Prozess) und geben laufend Log-Zeilen
aus – das ist normal, kein Fehler. Änderungen am Code werden automatisch neu
geladen, ohne dass die Server neu gestartet werden müssen.

## Öffnen

Im Browser: **http://localhost:5173**

## Beenden

In beiden Fenstern **Strg+C** drücken.

## Falls Port 3000 schon belegt ist

Passiert z. B., wenn ein alter Backend-Prozess nicht richtig beendet wurde.
In PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <gefundene PID> -Force
```
Danach `npm run dev:backend` erneut ausführen.

## Konsolen-Befehle ("torball")

Für administrative Aufgaben, die keinen Web-Login voraussetzen (Haupt-
Anwendungsfall: der einzige Admin-Account ist gesperrt), gibt es
`backend/src/cli/torball.ts`. Aufruf aus dem Projektordner:

```bash
npm run torball --workspace=backend -- <befehl> [--option="wert" ...]
```

Ohne Befehl oder mit `--hilfe` zeigt es die verfügbaren Befehle. Aktuell:

- `benutzer:liste` – listet alle Benutzer mit E-Mail, Rolle und Sperr-Status.
- `benutzer:entsperren --email="admin@example.com"` – entsperrt einen Benutzer.
- `konfiguration:anzeigen` – zeigt die aktuelle `backend/.env` (Passwörter maskiert).
- `konfiguration:setzen --schluessel="PORT" --wert="3005"` – ändert gezielt einen
  `.env`-Wert (feste Allowlist, Neustart des Backends nötig).
- `aktualisieren` – Git-Pull (falls Git-Repo), `npm install`, Neubau aller
  Workspaces (v. a. für die lokale Windows-Installation gedacht).
- `demo:beispieldaten` / `demo:snapshot:erstellen` /
  `demo:snapshot:wiederherstellen` – Demo-Instanz-Befehle, nur bei
  `DEMO_SNAPSHOT_ERLAUBT=true` (siehe `docs/demo-umgebung.md`).
- `mail:bericht:erstellen` – manueller Mail-Postfach-Berichtslauf, nur bei
  `MAIL_POSTFACH_AKTIV=true` (siehe `docs/entwicklungs-umgebung.md`).

Läuft unabhängig vom Backend-Server (keine laufende `npm run dev:backend`-
Instanz nötig), verbindet sich aber direkt mit derselben CouchDB (braucht also
ebenfalls `backend/.env`). Weitere Befehle werden im `BEFEHLE`-Objekt in
dieser Datei ergänzt.

## E-Mail-Versand (optional)

Der SMTP-Versand (für Einladungen und Passwort-Reset) wird **nicht** mehr über
`backend/.env` konfiguriert, sondern in der Oberfläche: **Admin →
Systemeinstellungen → „E-Mail-Versand (SMTP)"** (Host, Port, Zugangsdaten,
Absender; „Verbindung testen"-Knopf; eigener Schalter „E-Mail-Versand
aktivieren"). In `backend/.env` gehört nur noch `FRONTEND_URL` (Basis-URL für
die Links in den Mails, lokal `http://localhost:5173`).

Ist der Versand nicht aktiviert oder unvollständig konfiguriert, fällt das
Backend automatisch auf die alte Lösung zurück: Der Einladungslink kommt
direkt in der API-Antwort zurück, der Passwort-Reset-Link landet im
Server-Log. Kein Absturz, keine Fehlermeldung - einfach kein Mailversand.

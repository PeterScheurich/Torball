# Testumgebung starten

Kurzanleitung, um die Anwendung lokal zum Testen zu starten, ohne dafür extra
nachzufragen.

## Voraussetzungen (einmalig erledigt, nur zur Info)

- Node.js ist installiert.
- Im Projektordner wurde einmal `npm install` ausgeführt.
- `backend/.env` existiert und enthält die Zugangsdaten zur CouchDB-Datenbank
  (liegt nur lokal, nicht im Repository).
- Der Rechner muss den Entwicklungsserver `192.168.188.96` erreichen können
  (dort läuft die CouchDB-Datenbank) – gleiches Netzwerk wie bisher.

**Wichtig bei Änderungen an `backend/.env`:** Der laufende `npm run
dev:backend`-Prozess liest die Datei nur beim Start (`--env-file`), nicht
laufend mit - anders als Quelltext-Änderungen, die automatisch neu geladen
werden. Nach jeder Änderung an `.env` muss der Backend-Prozess neu gestartet
werden (siehe „Falls Port 3000 schon belegt ist" unten), sonst wirkt die
Änderung nicht.

**Werte mit Sonderzeichen** (z. B. `#`, Leerzeichen) in `backend/.env` immer
in Anführungszeichen setzen (`SMTP_PASSWORD="Geheim#123"`) - ohne Anführungs-
zeichen wird alles ab einem `#` als Kommentar abgeschnitten, was zu
schwer nachvollziehbaren Fehlern führt (z. B. „Authentication credentials
invalid" bei einem eigentlich korrekten Passwort).

## Server starten

Zwei Server laufen parallel, am einfachsten in zwei separaten Terminal-Fenstern
(PowerShell oder Git Bash), jeweils im Projektordner:

**Fenster 1 – Backend** (Fastify, Port 3000, verbindet sich mit der CouchDB auf
`192.168.188.96`):
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

Läuft unabhängig vom Backend-Server (keine laufende `npm run dev:backend`-
Instanz nötig), verbindet sich aber direkt mit derselben CouchDB (braucht also
ebenfalls `backend/.env`). Weitere Befehle werden im `BEFEHLE`-Objekt in
dieser Datei ergänzt.

## E-Mail-Versand (optional)

Für Einladungen und Passwort-Reset per echter Mail in `backend/.env`:

```
SMTP_HOST=smtp.beispiel.de
SMTP_PORT=587
SMTP_USER=turniere@beispiel.de
SMTP_PASSWORD="das-passwort"
SMTP_FROM="Torball-Turniere <turniere@beispiel.de>"
FRONTEND_URL=http://localhost:5173
```

Fehlen diese Variablen (oder eine davon), fällt das Backend automatisch auf
die alte Lösung zurück: Der Einladungslink kommt direkt in der API-Antwort
zurück, der Passwort-Reset-Link landet im Server-Log. Kein Absturz, keine
Fehlermeldung - einfach kein Mailversand.

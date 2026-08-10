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

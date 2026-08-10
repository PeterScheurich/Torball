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

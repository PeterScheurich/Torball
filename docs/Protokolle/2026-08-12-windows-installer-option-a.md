# 2026-08-12 – Windows-Installer Option A (Ein-Klick, PowerShell)

## Ausgangslage

`docs/installation-konfiguration.md` beschrieb die lokale Windows-Installation bisher nur manuell
(Node + CouchDB einzeln installieren, `.env` von Hand anlegen, zwei Prozesse starten). Am Ende der
vorigen Sitzung (Teil 6) stand die Entscheidung zwischen zwei Richtungen für einen einfacheren
Windows-Installer für nicht-IT-affine Anwender an:

- **A** – PowerShell-Ein-Klick-Skript (schnell, risikoarm)
- **B** – kompiliertes MSI/EXE (aufwendiger, für einen späteren öffentlichen Download-Knopf auf der
  Webseite gedacht – dieser Zusatzpunkt kam in dieser Sitzung dazu)

Entscheidung: erst A, B als späterer Ausbau.

## Umsetzung

### 1. Backend: Einzelprozess-Modus (`SERVE_FRONTEND=true`)

Damit der Windows-Installer keinen separaten Webserver braucht, liefert das Backend optional das
gebaute Frontend selbst mit aus:

- `backend/src/index.ts`: `rewriteUrl` (Fastify-Konstruktor-Option) streift `/api/` vom
  Request-Pfad, bevor geroutet wird – exakt das, was sonst nginx bzw. der Vite-Dev-Proxy
  übernehmen (`frontend/src/api.ts` ruft die API fest unter `/api/*` auf). Danach `@fastify/static`
  für `frontend/dist` registriert, plus `setNotFoundHandler`, der bei `GET`-Requests `index.html`
  ausliefert (SPA-Fallback für React-Router-Pfade wie `/turniere/:id/verwalten`, analog zu nginx'
  `try_files $uri /index.html`).
- Bewusst hinter einem Flag (`SERVE_FRONTEND`, Default `false`/nicht gesetzt) – der
  Debian-Produktivbetrieb (`deploy/deploy-instanz.sh`, nginx liefert das Frontend) bleibt dadurch
  unverändert.
- Abhängigkeit ergänzt: `@fastify/static@^10.1.3` (Fastify-v5-kompatible Majorversion,
  `backend/package.json`).
- `backend/.env.example` um `SERVE_FRONTEND` ergänzt.

**Verifiziert** (lokal, gegen die bestehende Dev-CouchDB, temporärer Prozess auf Port 3099,
danach wieder gestoppt):

```
SERVE_FRONTEND=true PORT=3099 node --env-file=.env dist/index.js
curl http://127.0.0.1:3099/                          -> 200, index.html
curl http://127.0.0.1:3099/turniere/abc/verwalten     -> 200, index.html (SPA-Fallback)
curl http://127.0.0.1:3099/api/oeffentlich/turniere   -> 200, echte Turnierliste (Rewrite auf /oeffentlich/turniere)
```

### 2. Installer-Skript

`deploy/Installieren-Windows.cmd` (Doppelklick-Einstieg, `ExecutionPolicy Bypass` nur für diesen
einen Aufruf) startet `deploy/installieren-windows.ps1`. Das Skript:

1. Elevatiert sich selbst per UAC (`Start-Process -Verb RunAs -NoExit`), falls nicht bereits
   Administrator (nötig für Node-/CouchDB-Installation).
2. **Node.js LTS** via `winget install -e --id OpenJS.NodeJS.LTS --silent`, falls `node` fehlt.
3. **CouchDB**: prüft `http://127.0.0.1:5984/`. Läuft bereits eine Instanz, fragt das Skript nach
   deren Admin-Zugang (interaktiv). Sonst: lädt den offiziellen Windows-MSI-Installer herunter,
   prüft die SHA-256-Prüfsumme, installiert unbeaufsichtigt als Windows-Dienst mit generiertem
   Zufalls-Admin-Passwort:
   ```
   msiexec /i apache-couchdb-3.5.2-1.msi /quiet /norestart INSTALLSERVICE=1 ADMINUSER=admin ADMINPASSWORD=<zufällig>
   ```
   (MSI-Eigenschaften laut offizieller CouchDB-Doku,
   <https://docs.couchdb.org/en/stable/install/windows.html>). Das Admin-Passwort landet in
   `%ProgramData%\Torball\couchdb-admin.txt` (ACL auf Administratoren beschränkt) – analog zu
   `/etc/torball/couchdb-admin` auf der Linux-Seite.

   **Wichtiger Fund bei der Recherche:** Apache hostet den Windows-MSI seit Version 3.3.0 nicht
   mehr selbst (`dlcdn.apache.org/couchdb/binary/win/` listet nur noch 3.3.0). Aktuelle
   Windows-Builds (3.5.2-1) werden über den offiziellen, auf der CouchDB-Downloadseite verlinkten
   Partner Neighbourhoodie vertrieben: `https://couchdb.neighbourhood.ie/downloads/3.5.2-1/win/`.
   Das Skript verifiziert deshalb zusätzlich die mitgelieferte `.sha256`-Prüfsumme vor der
   Installation.
4. Legt die App-Datenbank `torball` + einen eigenen, eingeschränkten CouchDB-Benutzer
   `torball_backend` an (nur Zugriff auf diese eine DB, kein Admin) – dieselbe Logik wie
   `deploy/deploy-instanz.sh` (PUT DB, PUT `_users`-Dokument, PUT `_security`).
5. Baut die App (`npm install`, `shared` zuerst, dann alle Workspaces).
6. Schreibt `backend/.env` **nur wenn noch keine vorhanden ist** (inkl. `SERVE_FRONTEND=true`,
   `PORT=3000`, generiertes DB-Passwort) – bestehende Konfiguration bleibt bei erneutem Ausführen
   unangetastet.
7. Erzeugt `Start-Torball.cmd` (startet das Backend in einem eigenen Konsolenfenster, öffnet nach
   3 Sekunden den Standardbrowser auf `http://localhost:3000`) sowie eine Desktop-Verknüpfung
   „Torball-Turniere".

Idempotent: jeder Schritt prüft vorher den Ist-Zustand; erneutes Ausführen dient zugleich als
Update (Neubau, generierte Zugangsdaten/`.env` bleiben erhalten).

**Nicht automatisch ausgeführt** (Sicherheitsgrund: installiert echte Software/einen Windows-Dienst
und legt eine Desktop-Verknüpfung an – das muss der Nutzer selbst auf einer echten
Windows-Maschine anstoßen, inkl. UAC-Bestätigung). Nur die Backend-Änderung wurde wie oben
beschrieben lokal verifiziert.

### 3. Dokumentation

- `docs/installation-konfiguration.md`: neuer Abschnitt „Ein-Klick-Installer" (empfohlener Weg) vor
  dem bisherigen manuellen Weg; `SERVE_FRONTEND` in der Variablentabelle ergänzt; Hinweis auf
  Option B (verteilbares MSI/EXE, für einen späteren Download-Knopf auf der Webseite) aktualisiert.
- `CLAUDE.md`: Abschnitt „Betrieb / Infrastruktur" um den neuen Installer + Einzelprozess-Modus
  ergänzt.

## Offen (Option B)

Verteilbares MSI/EXE für einen Download-Knopf auf der (künftigen) Webseite – Anwender sollen dafür
nicht erst den Quellcode besorgen müssen. Noch nicht begonnen.

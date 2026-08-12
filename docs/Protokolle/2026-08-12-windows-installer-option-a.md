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

## Nachtrag (selbe Sitzung): interaktive Parameter, Konfiguration/Update per CLI, Systemanforderungen

Nutzer-Feedback nach dem ersten Durchlauf, noch bevor ein echter Windows-Test stattfand (der wird
zurückgestellt, bis ein Testrechner vorbereitet ist):

### 1. Interaktive Parameterabfrage im Installer

`deploy/installieren-windows.ps1` fragt jetzt bei einer **Neu**anlage von `backend/.env` (nicht bei
einem erneuten Lauf mit bereits vorhandener `.env`) interaktiv:

- **Port** (Standard `3000`, mit Zahlen-Validierung).
- **SMTP-Mailversand jetzt einrichten?** (Standard: Nein/überspringen). Bei „Ja": Host, Port
  (Standard `587`), Benutzer, Passwort (maskierte Eingabe wie beim CouchDB-Admin-Passwort) und
  Absender-Adresse (Standard wie in `.env.example`).

`FRONTEND_URL` wird aus dem gewählten Port abgeleitet. Der tatsächlich wirksame Port wird danach
**aus der Datei zurückgelesen** (nicht aus der Eingabevariable), damit `Start-Torball.cmd` bei einem
erneuten Lauf (vorhandene `.env`, keine erneute Abfrage) trotzdem den richtigen Port zum
Öffnen des Browsers verwendet.

### 2. Konfiguration/Update im Standard-CLI-Tool (`backend/src/cli/torball.ts`)

Drei neue Befehle im bestehenden `BEFEHLE`-Objekt (kein neues Tool, bewusst im etablierten
"torball"-Einstiegspunkt):

- `konfiguration:anzeigen` – gibt die aktuelle `backend/.env` aus, `COUCHDB_PASSWORD`/
  `SMTP_PASSWORD` maskiert ("(gesetzt)"/"(leer)").
- `konfiguration:setzen --schluessel="PORT" --wert="3005"` – ändert einen Wert in `backend/.env`
  (Zeile ersetzt oder angehängt). Nur eine feste Allowlist ist änderbar (`PORT`, `HOST`,
  `FRONTEND_URL`, `COOKIE_SECURE`, `SMTP_*`, `SERVE_FRONTEND`) – bewusst **ohne** `COUCHDB_*` (ein
  Tippfehler würde die DB-Verbindung sofort kappen; diese Werte verwaltet der Installer bzw.
  `deploy-instanz.sh`) und ohne `KANBAN_SYNC` (nur für die Entwicklungsinstanz relevant). Quotet
  Werte mit Leerzeichen/`#` automatisch (gleiche Regel wie an anderer Stelle in CLAUDE.md
  dokumentiert).
- `aktualisieren` – `git pull` (nur falls `.git` im Projekt-Wurzelverzeichnis existiert), dann
  `npm install` + Build (`shared` zuerst, dann alle Workspaces). Live-Ausgabe der Unterbefehle
  (`stdio: "inherit"`).

Beide `konfiguration:*`-Befehle **verifiziert** gegen eine Kopie der echten Dev-`.env` in einem
Scratch-Verzeichnis (nicht gegen die echte Datei) – erlaubter Schlüssel wird korrekt gesetzt,
gesperrter Schlüssel (`COUCHDB_PASSWORD`) korrekt mit Exit-Code 1 abgelehnt.

Der Windows-Installer generiert dafür zusätzlich `Aktualisieren-Torball.cmd` (Doppelklick →
`npm run torball -- aktualisieren`) neben dem bereits vorhandenen `Start-Torball.cmd` – beide sind
individuelle, pro Installation generierte Artefakte im Projekt-Wurzelverzeichnis und deshalb neu in
`.gitignore` gelistet (`/Start-Torball.cmd`, `/Aktualisieren-Torball.cmd`).

### 3. Systemanforderungen / Speicherplatz dokumentiert

In `docs/installation-konfiguration.md` (Abschnitt „Ein-Klick-Installer") ergänzt, mit an diesem
Rechner tatsächlich gemessenen bzw. per Content-Length ermittelten Werten (nicht geschätzt):

- Node.js 22 LTS (offizielles Windows-x64-Binary): **≈ 87 MB** (Content-Length 86.997.320 Bytes).
- CouchDB-3.5.2-1-Windows-Installer (Neighbourhoodie-Download): **≈ 114 MB**
  (Content-Length 119.607.296 Bytes).
- `node_modules` des gesamten Monorepos (alle drei Workspaces, gehoisted): **≈ 162 MB**
  (`Get-ChildItem -Recurse | Measure-Object Length -Sum`).
- App-Quellcode + Build-Output (`*/dist`): **≈ 2 MB** (vernachlässigbar).

Daraus grob **400–450 MB** für App + Laufzeitumgebung insgesamt, zzgl. CouchDB-eigener
Installation. Systemanforderungen (Windows 10/11 64-bit, Admin-Rechte für die Installation, 2
CPU-Kerne/2 GB RAM ausreichend, 4 GB empfohlen, Internet nur einmalig für die Downloads) ebenfalls
ergänzt.

### 4. README.md generalisiert + Installationswege ergänzt

`README.md`: neuer Abschnitt „Installation" mit einer Übersichtstabelle der drei Wege
(Entwicklung/Windows-Ein-Klick/Produktiv-Linux) inkl. Verweisen auf
`docs/installation-konfiguration.md`; bisheriger „Schnellstart"-Inhalt darunter als Unterabschnitt
„Schnellstart (Entwicklung)" erhalten, plus Hinweis, dass nach einmaliger Installation im Alltag nur
noch die beiden `npm run dev:*`-Befehle nötig sind. „Konsolen-Tool"-Abschnitt erwähnt jetzt auch
Konfiguration-Ändern/Aktualisieren, nicht nur das Entsperren gesperrter Admin-Konten.

### Ausblick

Der eigentliche Test auf einer echten Windows-Maschine bleibt zurückgestellt, bis ein Testrechner
vorbereitet ist. Der Nutzer plant im Anschluss außerdem die **produktive Linux-Installation** live
nach `docs/installation-konfiguration.md` (Abschnitt „Produktive Installation") durchzuführen – diese
Doku wurde in dieser Sitzung inhaltlich nicht verändert, ist also unverändert Stand aus der vorigen
Sitzung.

## Nachtrag: erster echter Produktiv-Deploy (selbe Sitzung) – zwei reale Probleme gefunden

Der Nutzer hat direkt im Anschluss die produktive Linux-Installation live auf einem neuen
Debian-13-LXC (`torball-prod`) durchgeführt, nach `docs/installation-konfiguration.md`. Dabei kamen
zwei reale, bis dahin unbemerkte Probleme zum Vorschein:

### 1. Falscher SSH-Benutzername in den Anweisungen (mein Fehler, kein Bug im Repo)

Als Auth-Weg für `REPO_URL` (Git-Zugriff ohne interaktiven Login) wurde ein SSH-Deploy-Key
empfohlen und angelegt (`ssh-keygen -t ed25519` auf dem Prod-Server, öffentlicher Schlüssel unter
Gitea → Repo-Settings → Deploy Keys hinterlegt). Erster Versuch schlug mit Passwort-Prompt fehl,
weil ich `git@<gitea-host>` als SSH-User genannt hatte – tatsächlich läuft diese Gitea-Instanz mit
SSH-User `gitea` (siehe der bereits konfigurierte `origin`-Remote dieses Repos:
`gitea@<gitea-host>:...`). Nach Korrektur des Benutzernamens weiterhin Passwort-Prompt; `ssh -vT`
zeigte `Offering public key ... / Authentications that can continue: publickey,password` – der
Schlüssel wurde angeboten, aber vom Server abgelehnt (Datei-Rechte waren in Ordnung, Fingerprint
lokal via `ssh-keygen -lf` verifiziert). Ursache: der Deploy-Key war beim ersten Versuch nicht
korrekt in Gitea gespeichert (vermutlich Übertragungsfehler beim Copy-Paste). Nach erneutem
Eintragen des kompletten Schlüssels funktionierte `ssh -T gitea@<gitea-host>` (Gitea-typische
Meldung „does not provide shell access" = Erfolg) und danach auch `git clone` ohne Passwort-Abfrage.

### 2. Echter Bug im Deploy-Skript: CouchDB-Sicherheitsdoku zu restriktiv

Nach erfolgreichem Deploy (`deploy-instanz.sh` lief fehlerfrei durch, Service wurde als „gestartet"
gemeldet) zeigte die öffentliche Startseite `Backend antwortet nicht (Status 502)`. `journalctl -u
torball@prod` zeigte den eigentlichen Absturz direkt beim Start:

```
Error: Unknown error while saving the design document: forbidden
  ... errid: non_200, error: error_saving_ddoc, statusCode: 500 (CouchDB antwortete mit "forbidden")
Main process exited, code=exited, status=1/FAILURE
```

**Ursache:** `ensureIndexes()` (`backend/src/db.ts`) legt beim jedem Start einen Mango-Index auf
`docType` an – technisch ein CouchDB-Design-Dokument. CouchDB verlangt dafür **Admin-Rechte auf der
Datenbank**, nicht nur normale Lese-/Schreibrechte. `deploy-instanz.sh` trug den App-Benutzer
(`torball_<name>`) in `_security` bisher nur als `members` ein:

```json
{"admins":{"names":[],"roles":[]},"members":{"names":["torball_prod"],"roles":[]}}
```

**Sofort-Fix auf dem laufenden Server** (Nutzer unblockiert, bevor die Skript-Korrektur gepusht
war):

```bash
COUCH_ADMIN_PASS=$(cat /etc/torball/couchdb-admin)
curl -u admin:"$COUCH_ADMIN_PASS" -X PUT http://127.0.0.1:5984/torball_prod/_security \
  -H "Content-Type: application/json" \
  -d '{"admins":{"names":["torball_prod"],"roles":[]},"members":{"names":["torball_prod"],"roles":[]}}'
systemctl restart torball@prod
```

**Dauerhafter Fix im Repo** (beide Provisionierungs-Skripte trugen denselben Fehler – der
Windows-Installer war schlicht noch nie live getestet worden):

- `deploy/deploy-instanz.sh`: `_security`-PUT trägt den Instanz-Benutzer jetzt zusätzlich in
  `admins` ein.
- `deploy/installieren-windows.ps1`: identische Korrektur (`$securityBody`).
- Beides bleibt strikt auf **genau diese eine Datenbank** beschränkt (kein CouchDB-Server-Admin,
  keine anderen Instanzen/Datenbanken sichtbar) – nur die Admin/Member-Unterscheidung *innerhalb*
  dieser einen DB ändert sich.
- Als Gotcha in `CLAUDE.md` (Betrieb/Infrastruktur) dokumentiert, damit ein künftiger dritter
  Provisionierungsweg (z. B. Option B) denselben Fehler nicht wiederholt.

**Für den Nutzer wichtig:** Ein erneutes Ausführen von `deploy/deploy-instanz.sh` auf dem
Prod-Server **überschreibt** `_security` jedes Mal neu (kein `|| true` an dieser Stelle) – die
manuelle Sofort-Korrektur würde also von der *alten* (noch nicht aktualisierten) Skriptversion
wieder zurückgesetzt. Vor dem nächsten Lauf daher erst im `~/torball-src`-Checkout
`git pull` ausführen, um die Korrektur zu übernehmen.

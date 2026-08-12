# Protokoll: Entwicklungsserver-Zugriff, Datenmodell und CouchDB-Backend

**Datum:** 10.08.2026
**Ziel dieser Sitzung:** Arbeitsfähigkeit herstellen (Repo- und Server-Zugriff), das
Datenmodell aus der Spezifikation als TypeScript-Typen umsetzen, und das Backend an
eine echte CouchDB-Datenbank anschließen (CRUD für Verein/Team/Turnier).

Dieses Dokument hält die tatsächlich ausgeführten Schritte samt Befehlen fest –
zur Nachvollziehbarkeit und zum Nachlesen/Verstehen der getroffenen Entscheidungen.
Zugangsdaten (Passwörter) sind bewusst durch Platzhalter ersetzt; die echten Werte
liegen ausschließlich in `backend/.env` (durch `.gitignore` vom Repository ausgeschlossen).

---

## 1. Zugriff auf Repository und Entwicklungsserver prüfen

**Warum:** Bevor inhaltlich weitergearbeitet wird, muss klar sein, ob überhaupt
geschrieben/gepusht bzw. auf dem Entwicklungsserver gearbeitet werden kann.

```bash
git remote -v
```
→ Ergebnis: Repository liegt auf einem selbst gehosteten Gitea (`gitea@gitea-host`),
nicht auf GitHub. Push/Pull über normale Git-Befehle funktionieren ohne weiteres Tooling.

**Entwicklungsserver (`torball-dev`) erreichen:**

Die hinterlegte SSH-Config (`~/.ssh/config`) verwies auf eine veraltete IP
(`alt-host`). Erreichbarkeitsprüfung:

```powershell
Test-NetConnection -ComputerName alt-host -Port 22
Test-NetConnection -ComputerName alt-host -Port 5984
```
→ beide nicht erreichbar, während Gitea (`.188`) und BookStack (`.114`) erreichbar waren.
Der Nutzer nannte die korrekte IP (`couchdb-host`):

```powershell
Test-NetConnection -ComputerName couchdb-host -Port 22
Test-NetConnection -ComputerName couchdb-host -Port 5984
```
→ beide erreichbar.

```bash
ssh -o BatchMode=yes -o ConnectTimeout=5 -i ~/.ssh/id_ed25519 root@couchdb-host "hostname && uptime"
```
→ Login erfolgreich, Hostname `torball-dev` bestätigt.

**Korrektur der SSH-Config**, damit `ssh torball-dev` künftig direkt funktioniert:

```
# ~/.ssh/config, Eintrag torball-dev
Host torball-dev
    HostName couchdb-host   # vorher: alt-host
    User root
    IdentityFile C:\Users\MultiMedia-PC\.ssh\id_ed25519
```

Diese Datei liegt lokal auf dem Entwicklungsrechner, nicht im Repository – sie wird
hier nur dokumentiert, weil sie den Zugriffsweg für künftige Sitzungen erklärt.

---

## 2. Spezifikation konsolidiert (Commit `b326268`)

Der Nutzer hatte eine neue, konsolidierte Gesamtspezifikation
(`docs/torball_gesamtspezifikation.md`) sowie ein Datenmodell-Diagramm-Skript
(`docs/torball_datenmodell_drawdb.sql`) bereitgestellt und die alten Einzeldokumente
nach `docs/Archiv/` verschoben.

```bash
git add docs/entwicklungs-workflow.md docs/spezifikation-ergaenzugen-2026-07-20.md \
        docs/spezifikation-fachlich.md docs/spezifikation-technisch.md \
        docs/Archiv docs/torball_datenmodell_drawdb.sql docs/torball_gesamtspezifikation.md
git commit -m "Spezifikation konsolidiert und alte Einzeldokumente archiviert"
git push
```

**Warum als Rename statt Löschen+Neu:** Git erkennt inhaltlich identische
verschobene Dateien automatisch als Rename (`git status` zeigte `renamed:`), das
hält die Historie nachvollziehbar.

---

## 3. Datenmodell als TypeScript-Typen (Commit `52b36ac`)

**Warum:** Der Code enthielt bis dahin nur einen Platzhalter-Typ (`Turnier` mit vier
Feldern). Damit Backend und Frontend später mit denselben, spezifikationskonformen
Typen arbeiten, wurde Abschnitt 20 der Gesamtspezifikation vollständig in
`shared/src/types/` übersetzt (17 Dateien, eine je Entität, plus `common.ts` für
gemeinsame ID-Typen und ein Barrel-`index.ts`).

Wichtige Entscheidungen dabei:
- Jede Entität bekommt `_id`/`_rev` (CouchDB-Pflichtfelder) plus ein `docType`-Feld,
  damit mehrere Dokumenttypen in einer einzigen CouchDB-Datenbank unterscheidbar sind.
- `Spielfeld` (`felder`) ist laut Abschnitt 20.5 ein in `Turnier` **eingebettetes**
  Array, kein eigenständiges Dokument – alle anderen Entitäten mit eigener
  Abschnittsnummer (20.6–20.17) sind eigene Dokumenttypen mit Referenzfeld
  (z. B. `turnierId`).
- Feldnamen sind camelCase (TypeScript-Konvention), behalten aber die deutschen
  Fachbegriffe aus der Spezifikation bei.

Build-Verifikation nach dem Anlegen:
```bash
npm run build --workspace=shared
npm run build --workspace=backend
npm run build   # gesamtes Monorepo (shared, backend, frontend)
```

```bash
git add shared/src/index.ts shared/src/types
git commit -m "Datenmodell aus Gesamtspezifikation als TypeScript-Typen in shared umgesetzt"
git push
```

---

## 4. CouchDB-Zugang einrichten

**Ausgangslage:** CouchDB läuft auf `torball-dev` (Version 3.5.2), verlangt aber
Admin-Authentifizierung – niemand kannte mehr das Passwort.

```bash
curl -s http://couchdb-host:5984/_membership
# → {"error":"unauthorized","reason":"You are not a server admin."}
```

**Wichtig zu wissen – zwei Config-Dateien für Admins:** CouchDB liest
`/opt/couchdb/etc/local.ini` und danach zusätzlich alle Dateien in
`/opt/couchdb/etc/local.d/*.ini` – **letztere gewinnen bei Konflikten**, weil sie
zuletzt geladen werden. Der erste Versuch, das Admin-Passwort direkt in
`local.ini` zu ändern, wirkte deshalb nicht: Es existierte zusätzlich eine
`local.d/10-admins.ini` ("Package-introduced administrative user", von der
Erstinstallation), die weiterhin das alte Passwort enthielt und die Änderung
überschrieb. Das wurde per SSH aufgespürt:

```bash
ssh torball-dev "find / -maxdepth 6 -iname 'local.ini'"
ssh torball-dev "ls -la /opt/couchdb/etc/local.d/"
```

Erst nachdem der Nutzer **beide** Dateien angepasst und CouchDB neu gestartet
hatte (`systemctl restart couchdb`), funktionierte der Login:

```bash
curl -s -u 'admin:<admin-passwort>' http://couchdb-host:5984/_membership
# → {"all_nodes":["couchdb@127.0.0.1"], ...}
```

---

## 5. Dedizierter Service-User und Datenbank für das Backend

**Warum ein eigener User statt des Admin-Accounts:** Das Backend soll nicht mit
Server-Admin-Rechten laufen (Prinzip der geringsten Rechte) – ein kompromittiertes
Backend dürfte im schlimmsten Fall nur die eigene Datenbank beschädigen, nicht das
ganze CouchDB-System (`_users`, andere Datenbanken, Serverkonfiguration).

**Service-User anlegen** (zufälliges Passwort erzeugt, keine Rolle zugewiesen):
```bash
SERVICE_PW=$(openssl rand -base64 24 | tr -d '=+/' | head -c 32)
curl -u 'admin:<admin-passwort>' -X PUT http://couchdb-host:5984/_users/org.couchdb.user:torball_backend \
  -H "Content-Type: application/json" \
  --data-binary "{\"name\":\"torball_backend\",\"password\":\"$SERVICE_PW\",\"roles\":[],\"type\":\"user\"}"
```

**Datenbank anlegen:**
```bash
curl -u 'admin:<admin-passwort>' -X PUT http://couchdb-host:5984/torball
```

**Zugriff einschränken** über das `_security`-Dokument der Datenbank:
```bash
curl -u 'admin:<admin-passwort>' -X PUT http://couchdb-host:5984/torball/_security \
  -H "Content-Type: application/json" \
  --data-binary '{"admins":{"names":["torball_backend"],"roles":[]},"members":{"names":[],"roles":[]}}'
```

**Wichtig zu wissen – DB-Admin vs. Server-Admin:** Ein erster Versuch, den
Service-User nur als `members` (normaler Lese-/Schreibzugriff) einzutragen,
scheiterte beim Anlegen eines Mango-Index (siehe Abschnitt 6) mit einem
`forbidden`-Fehler: CouchDB erlaubt das Schreiben von *Design-Dokumenten* (dazu
zählen auch Mango-Indizes) nur Datenbank-Admins, nicht normalen Mitgliedern.
Deshalb wurde `torball_backend` stattdessen als **`admins` der Datenbank `torball`**
eingetragen – das ist unabhängig von Server-Admin-Rechten und bleibt strikt auf
diese eine Datenbank beschränkt (siehe Testergebnis unten).

**Verifikation der Rechte:**
```bash
curl -u "torball_backend:$SERVICE_PW" http://couchdb-host:5984/torball
# → Zugriff erfolgreich

curl -u "torball_backend:$SERVICE_PW" http://couchdb-host:5984/_users/_all_docs
# → {"error":"unauthorized","reason":"You are not a server admin."}
```

Das generierte Passwort wurde ausschließlich in `backend/.env` (siehe Abschnitt 7,
git-ignoriert) abgelegt und danach aus der Shell-Historie/temporären Dateien entfernt.

---

## 6. Backend-Code: CouchDB-Anbindung (Commit `08bacee`)

**Abhängigkeit hinzugefügt:**
```bash
npm install nano --workspace=backend
```
`nano` ist der offizielle, schlanke CouchDB-Client für Node.js und bringt eigene
TypeScript-Typen mit.

**Neue/geänderte Dateien:**

- [`backend/src/db.ts`](../../backend/src/db.ts) – baut die Verbindung aus den
  Umgebungsvariablen `COUCHDB_URL`, `COUCHDB_DB`, `COUCHDB_USER`,
  `COUCHDB_PASSWORD` auf und stellt `ensureIndexes()` bereit, das beim Start
  einen Mango-Index auf `docType` anlegt (damit Abfragen wie „alle Vereine“ nicht
  die gesamte Datenbank durchsuchen müssen).
- [`backend/src/repository.ts`](../../backend/src/repository.ts) – generische
  CRUD-Hilfsfunktionen (`newId`, `findAllByType`, `findAllBySelector`, `findById`,
  `insertDoc`, `deleteDoc`), die von allen Routen wiederverwendet werden.
- [`backend/src/routes/verein.ts`](../../backend/src/routes/verein.ts),
  [`team.ts`](../../backend/src/routes/team.ts),
  [`turnier.ts`](../../backend/src/routes/turnier.ts) – REST-Endpunkte
  (GET/POST/PUT/DELETE) je Entität.
- `backend/.env` (nicht im Repository) / `backend/.env.example` (Vorlage) –
  Zugangsdaten zur Datenbank.
- `backend/package.json` – `dev`/`start`-Skripte laden jetzt `.env` per
  Node-eigenem `--env-file`-Flag (ab Node 20.6 verfügbar, hier Node 24).

**Fachliche Regeln, die dabei mit umgesetzt wurden** (aus dem Datenmodell,
Abschnitt 20 der Spezifikation bzw. den `ON DELETE`-Kommentaren im
DrawDB-SQL-Skript):

- **Turnier-Defaults beim Anlegen:** Ein neues Turnier braucht vom Client nur
  `name` und `datum` – alle ~25 Regel-/Konfigurationsfelder (Spielzeit,
  Halbzeiten, Punktevergabe, Sichtbarkeits-Flags, …) werden mit den in
  Abschnitt 20.5 dokumentierten Defaultwerten befüllt.
- **Referenzielle Integrität "Team → Verein":** Ein Team kann nur angelegt
  werden, wenn die referenzierte `vereinId` tatsächlich existiert (sonst `400`).
- **`RESTRICT`-Regel "Verein → Team":** Ein Verein mit noch zugeordneten Teams
  kann nicht gelöscht werden (`409 Conflict`) – entspricht der im SQL-Modell
  dokumentierten Absicht, dass Stammdaten nicht versehentlich mit hängenden
  Referenzen gelöscht werden.

**Build-Verifikation:**
```bash
npm run build --workspace=backend
```
(Ein Zwischenfehler – `MangoSelector` vs. `Record<string, unknown>` –
wurde durch einen präziseren Typ aus `nano` behoben.)

---

## 7. End-to-End-Test gegen die echte CouchDB

**Warum echt statt gemockt:** Ziel war, die Datenmodell-Typen und die
Zugriffsrechte einmal vollständig im Zusammenspiel zu sehen, nicht nur isoliert
im TypeScript-Compiler.

```bash
npm run dev --workspace=backend   # startet Fastify auf Port 3000, lädt backend/.env
```

Durchgeführte Prüfungen (jeweils per `curl` gegen `http://localhost:3000`):

1. Verein anlegen (`POST /vereine`) → `201`, Dokument mit `_id`, `docType`, `vereinId`
2. Team mit gültiger `vereinId` anlegen (`POST /teams`) → `201`
3. Team mit **ungültiger** `vereinId` anlegen → `400` (Referenzprüfung greift)
4. Verein löschen, während das Team noch existiert → `409` (RESTRICT greift)
5. Turnier nur mit Pflichtfeldern anlegen (`POST /turniere`) → `201`,
   alle Default-Werte aus Abschnitt 20.5 korrekt gesetzt
6. Turnier ohne Pflichtfeld `datum` anlegen → `400` (Schema-Validierung greift)
7. Listen-Endpunkte (`GET /vereine`, `/teams`, `/turniere`) → korrekte Anzahl

Nach dem Test wurden alle Testdokumente wieder gelöscht (Team → Verein → Turnier,
in dieser Reihenfolge wegen der RESTRICT-Regel) und der Dev-Server gestoppt:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <gefundene PID> -Force
```

---

## 8. Commits und Push

```bash
git add backend/package.json backend/src/index.ts backend/.env.example \
        backend/src/db.ts backend/src/repository.ts backend/src/routes package-lock.json
git commit -m "CouchDB-Anbindung und CRUD-Endpunkte fuer Verein/Team/Turnier"
git push
```
→ `52b36ac..08bacee main -> main`

---

## 9. Nebenbei entdeckt, aber bewusst nicht in diesem Schritt behoben

`npm install nano` brachte `npm audit` dazu, zwei unabhängige High-Severity-Lücken
in transitiven Fastify-Abhängigkeiten zu melden (`fast-uri`, `find-my-way`) – beide
ohne Bezug zu diesem Feature. Das wurde als eigener Hintergrund-Task ausgelagert,
statt die aktuelle Änderung damit zu vermischen, und lief anschließend in einer
separaten Session.

---

## 10. Bugfix: Turnier-Löschung kaskadierte nicht auf Unterobjekte (Commit `9baed35`)

**Wie entdeckt:** Beim manuellen Testen des Frontends fielen nach dem Löschen von
Test-Turnieren verwaiste Dokumente auf, die von Hand in CouchDB aufgeräumt werden
mussten.

**Ursache:** `DELETE /turniere/:id` (`backend/src/routes/turnier.ts`) löschte bis
dahin ausschließlich das `Turnier`-Dokument selbst. `MannschaftImTurnier`- und
`Spiel`-Dokumente, die per `turnierId` auf das Turnier verweisen, blieben als
Datenleichen zurück. Das widerspricht dem Datenmodell
(`docs/torball_datenmodell_drawdb.sql`): Turnier-Unterobjekte „haben KEINE
eigenständige Existenz außerhalb ihres Turniers“ (`ON DELETE CASCADE`) –
dieselbe Regel, die schon für „Verein → Team“ als `RESTRICT` umgesetzt ist
(siehe Abschnitt 6), gilt hier in der Gegenrichtung als `CASCADE`.

**Fix:** Der DELETE-Handler lädt vor dem Löschen des Turniers zunächst alle
zugehörigen `MannschaftImTurnier`- und `Spiel`-Dokumente über
`findAllBySelector` (bestehender Helper aus `backend/src/repository.ts`,
bereits genutzt in `mannschaft.ts`/`spiel.ts`/`spielplan.ts`) und löscht sie
per `deleteDoc`, bevor das Turnier-Dokument selbst gelöscht wird.

**Test:** Da es in diesem Projekt noch keine Mock-/Fake-DB-Infrastruktur gibt
(alle bisherigen Tests unter `backend/src/spielplan/*.test.ts` sind reine
Logik-Tests ohne DB-Zugriff), wurde ein Integrationstest gegen die echte
CouchDB-Dev-Instanz ergänzt:
[`backend/src/routes/turnier-delete.integration.test.ts`](../../backend/src/routes/turnier-delete.integration.test.ts).
Er überspringt sich selbst (`node:test`-`skip`), wenn die `COUCHDB_*`-Umgebungsvariablen
nicht gesetzt sind, damit `npm test` auch ohne Zugriff auf die Dev-DB nicht
fehlschlägt – `db.ts` wirft sonst schon beim Modul-Import, nicht erst bei
tatsächlicher Nutzung.

**Verifikation:**
```bash
npm run build --workspace=backend
npx tsx --env-file=.env --test src/routes/turnier-delete.integration.test.ts
```
Zusätzlich manuell per `curl` gegen die echte CouchDB-Dev-Instanz geprüft:
Turnier mit einem Spielfeld, zwei Mannschaften und einem per Spielplan
generierten Spiel angelegt, Turnier gelöscht (`204`) und anschließend
verifiziert, dass Turnier, beide Mannschaften und das Spiel alle `404`
liefern. Es blieben keine Testdokumente zurück (das Aufräumen erledigt der
Fix selbst).

```bash
git add backend/src/routes/turnier.ts backend/src/routes/turnier-delete.integration.test.ts
git commit -m "Turnier-Loeschung kaskadiert jetzt auf Mannschaft-im-Turnier und Spiel"
git push
```
→ `acddaa6..9baed35 main -> main`

---

## Offene Punkte für die nächste Sitzung

- Weitere Entitäten (Spieler, Spielprotokoll/Events, Benutzer, Berechtigungen)
  haben noch keine CRUD-Routen.
- Der offene technische Punkt „Spielplan-Algorithmus" (Abschnitt 28 der
  Gesamtspezifikation) ist als Nächstes vorgesehen.
- Es gibt noch keine Mock-/Fake-DB-Infrastruktur für Tests; DB-nahe Tests
  laufen bislang als Integrationstests gegen die echte Dev-CouchDB und werden
  ohne `COUCHDB_*`-Umgebungsvariablen übersprungen.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Diese Datei wird bei jeder Sitzung in diesem Projektordner automatisch
eingelesen – Ergänzungen hier wirken sofort in der nächsten Sitzung, ohne dass
du sie im Chat wiederholen musst. Kurze, konkrete Regeln funktionieren besser
als lange Prosa. Einfach unter der passenden Überschrift eine neue
Aufzählung ergänzen, oder eine neue Überschrift für ein neues Thema anlegen.

Kurzbeschreibung des Projekts (aus der README): eine Anwendung, um
Torball-Turniere zu planen und während des Turniers am Computer zu
protokollieren.

## Befehle

Monorepo mit drei npm-Workspaces: `shared`, `backend`, `frontend`.

**Build:**
```bash
npm run build --workspace=shared   # IMMER zuerst nach Aenderungen in shared/src (siehe Architektur)
npm run build                       # baut danach alle Workspaces
```
`shared` wird als CommonJS nach `shared/dist` kompiliert; `backend`/`frontend`
lösen `@torball/shared` gegen dieses `dist` auf, nicht gegen die Quellen. Der
Root-Build (`npm run build --workspaces`) läuft in der Wurzel-`package.json` deklarierten
Workspace-Reihenfolge (`frontend`, `backend`,
`shared`) – **nicht** in Abhängigkeitsreihenfolge. Nach einer Typ-Änderung in
`shared/src` zuerst `npm run build --workspace=shared` separat ausführen,
sonst prüfen Backend/Frontend gegen einen veralteten Stand.

**TypeScript-Versionen sind je Workspace unterschiedlich gepinnt:** `frontend` nutzt
TypeScript `~6.0` (eigene Kopie in `frontend/node_modules`), `backend`/`shared` `^5.7`
(gehoistet in der Wurzel-`node_modules`). Der Frontend-Code setzt teils TS-6-Verhalten
voraus (z. B. iterierbares `NodeListOf`, obwohl `lib` in `tsconfig.app.json` kein
`DOM.Iterable` enthält) – mit einem 5.x-Compiler schlägt der Frontend-Build in
**unverändertem** Code fehl (TS2488 in `KopfzeilenMenue.tsx`). Praktisch relevant in
Git-Worktrees (`.claude/worktrees/…`): ohne eigenes `npm install` im Worktree löst Node
`node_modules` über die Verzeichnis-Hierarchie zum Haupt-Checkout hin auf und findet dort
nur das Wurzel-TypeScript 5.x. **In jedem frischen Worktree deshalb zuerst `npm install`
ausführen** (live erlebt 2026-08-21).

**Lint:**
```bash
npm run lint --workspace=frontend   # oxlint
```
`backend` hat aktuell kein Lint-Script (`npm run lint` im Root überspringt es
stillschweigend über `--if-present`).

**Tests (nur Backend, node:test via tsx):**
```bash
npm run test --workspace=backend
```
Einzelne Testdatei direkt ausführen (im Ordner `backend/`):
```bash
npx tsx --test src/spielplan/planung.test.ts
```
Mehrere Testdateien (u. a. `turnier-delete.integration.test.ts`,
`auth-sperre.test.ts`, `turnierSync.test.ts`) überspringen sich selbst, wenn
die `COUCHDB_*`-Umgebungsvariablen nicht gesetzt sind (kein Mock/Fake-DB-Setup
in diesem Projekt) – `npm run test --workspace=backend` allein deckt sie also
nicht ab. Für den vollständigen Lauf (**vor jedem Release verpflichtend**)
gibt es eine eigene, kleine CouchDB-Testdatenbank auf der Dev-CouchDB
(analog `torball_backend`/`torball` – eigener eingeschränkter Benutzer,
kein Server-Admin, siehe `docs/Protokolle/2026-08-10-couchdb-backend-setup.md`
fürs Muster):
```bash
npm run test:integration --workspace=backend
```
Liest `backend/.env.test.local` (git-ignoriert, lokal einmalig anzulegen mit
`COUCHDB_URL`/`COUCHDB_DB=torball_test`/`COUCHDB_USER=torball_test`/
`COUCHDB_PASSWORD`). Es gibt keine Frontend-Tests.

**Dev-Server** (niemals über Bash starten, siehe Hinweis zu Preview-Tools):
```bash
npm run dev:backend    # Fastify auf Port 3000
npm run dev:frontend   # Vite auf Port 5173, proxied /api -> localhost:3000
```
`backend` liest `.env` nur beim Start (`--env-file`) – nach Änderungen an
`backend/.env` muss der Prozess neu gestartet werden, reiner Code-Reload
reicht nicht (siehe „Betrieb / Infrastruktur" unten).

**Konsolen-Tool** (administrative Aufgaben ohne Web-Login, z. B. gesperrten
Admin-Account entsperren):
```bash
npm run torball --workspace=backend -- <befehl> [--option="wert"]
npm run torball --workspace=backend -- --hilfe
```
Neue Befehle werden im `BEFEHLE`-Objekt in `backend/src/cli/torball.ts`
ergänzt. Enthält u. a. `konfiguration:anzeigen`/`konfiguration:setzen`
(gezielte `backend/.env`-Werte ändern, ohne die Datei von Hand zu bearbeiten –
nur eine feste Allowlist, bewusst ohne `COUCHDB_*`) und `aktualisieren`
(`git pull` falls Git-Repo + `npm install` + Build; gedacht v. a. für die
Windows-Installation, siehe unten). `konfiguration:setzen` quotet Werte mit
Leerzeichen/`#` automatisch (gleiche Sonderzeichen-Regel wie in
„Betrieb / Infrastruktur").

**npm-Override `deepmerge-ts: ^8.0.0`** (Root-`package.json`, 2026-08-21): behebt
GHSA-ggr8-5vv4-36mx („3 high severity vulnerabilities", in Wahrheit eine Kette
`mailparser` → `html-to-text` → `deepmerge-ts<8`) – `html-to-text@10` pinnt `^7`, der Fix steckt
erst in 8. Kann entfallen, sobald `html-to-text` selbst auf `deepmerge-ts@8` geht (bei
`mailparser`-/`html-to-text`-Updates prüfen). Zudem laufen `npm install`/`npm ci` in den drei
Betriebs-Läufen (Windows-Installer, `torball aktualisieren`, `deploy-instanz.sh`) mit
`--no-audit --no-fund` – Audit-Hinweise verunsichern die Zielgruppe nur; beobachtet und behoben
werden Schwachstellen in der Entwicklung (dort `npm install` ohne Flags).

## Architektur

**CouchDB als einzige Datenquelle, ein `docType`-Discriminator statt vieler
Tabellen:** Alle Entitäten (`Turnier`, `MannschaftImTurnier`, `Spiel`,
`Benutzer`, `Session`, `ErgebnisToken`, `ErgebnisAenderung`,
`TurnierBerechtigung`, `Verein`, `Team`, …) liegen in einer einzigen CouchDB-
Datenbank und werden über ein `docType`-Feld unterschieden (Union-Typ
`TorballDokument` in `shared/src/types/index.ts`). `backend/src/repository.ts`
stellt die generischen CRUD-Helfer bereit (`findAllByType`,
`findAllBySelector`, `findById`, `insertDoc`, `deleteDoc`), die von allen
Routen-Dateien verwendet werden – nie direkt `db.find(...)` ohne `limit`
aufrufen: CouchDBs Mango-`_find` liefert ohne explizites `limit` nur die
ersten 25 Treffer, `findAllByType`/`findAllBySelector` blättern das intern
bereits korrekt per `bookmark` durch.

**`shared` ist CommonJS – keine Laufzeit-Logik für das Frontend:**
`shared/tsconfig.json` kompiliert nach `module: commonjs`. Das Backend (auch
CommonJS) kann daraus problemlos Funktionen importieren, Vite/das Frontend
(ESM/Bundler-Modus) dagegen nur **Typen** (die beim Kompilieren wegfallen).
Ein Import einer echten Funktion aus `@torball/shared` im Frontend schlägt
fehl bzw. wird zur Laufzeit zu `undefined`. Jede Geschäftslogik, die beide
Seiten brauchen, wird deshalb bewusst dupliziert (kleine, identische Kopie
statt Shared-Import) oder erfordert eine Umstellung von `shared` auf ESM.
Bestehende Duplikate (Frontend-Kopie ↔ Backend-Original, bei Änderung **beide**
anpassen):

- Spieldauer/Startzeit: `frontend/src/zeitplanung.ts` ↔
  `backend/src/spielplan/zeitplanung.ts`
- Schiedsrichter-Konflikte: `frontend/src/schiedsrichterKonflikt.ts` ↔
  `backend/src/spielplan/schiedsrichterZuordnung.ts`
- Passwort-Regeln: `frontend/src/passwortAnforderungen.ts` ↔
  `backend/src/auth/passwort.ts` (`passwortRegelVerstoss`)

**Auth: Server-seitige Sessions per Cookie, kein JWT.** Beim Login wird ein
zufälliger Token erzeugt; nur der SHA-256-Hash davon wird als CouchDB-Doc-ID
(`session:<hash>`) gespeichert – erlaubt einen direkten `findById`-Lookup pro
Request statt einer Query, der Klartext-Token selbst wird nie persistiert.
`backend/src/auth/plugin.ts`s `authPreHandler` löst daraus `req.benutzer` und
`req.sessionId` auf. **Muss direkt auf der Root-Fastify-Instanz registriert
werden** (`server.addHook(...)` in `backend/src/index.ts`, vor allen
Routen-Plugins), nicht innerhalb eines verschachtelten Plugins – Fastifys
Verkapselung würde `req.benutzer` sonst nur innerhalb dieses einen Scopes
sichtbar machen, nicht in den als Geschwister-Plugins registrierten
Routen-Dateien (`verein.ts`, `turnier.ts`, …).

**Berechtigungsmodell:** `backend/src/auth/turnierZugriff.ts` berechnet pro
Turnier eine **dreistufige** `Zugriffsstufe` (`lesen` < `schreiben_spielbetrieb`
< `schreiben_voll`, seit Abschnitt 21.2/21.3 – vorher binär `lesen`/`schreiben`,
in einer einzelnen Migration überall hochgezogen) für den anfragenden
**Akteur** (`Zugriffsakteur` = `{ benutzer? , turnierCode? }`, s. u.):
Admin hat immer `schreiben_voll`; Manager hat immer `schreiben_voll` auf
selbst erstellte Turniere (`turnier.erstelltVon`); alle anderen Fälle richten
sich nach explizit vergebenen `TurnierBerechtigung`-Dokumenten (`rolle` dort
mappt 1:1 auf eine Stufe). `schreiben_spielbetrieb` deckt bewusst nur noch
Spielplan (Status/Zeiten/Schiedsrichter-Zuordnung) und Ergebniserfassung ab,
nicht Grunddaten/Mannschaften/Regeln – passend zur fachlichen Trennung
Turnierleitung/Spielleitung. Jede Route, die Turnier-/Mannschaft-/Spiel-/
Spielplan-/Ergebnis-Daten anfasst, muss das per `hatMindestens(turnier, req,
<mindeststufe>)` prüfen; `verein`/`team` (Stammdaten) verlangen dagegen keine turnierbezogene
Prüfung, sondern eine **globale** Rollenprüfung: Lesen (`GET`) genügt jede
Anmeldung (wird z. B. bei der Mannschaftserfassung gebraucht, um aus den
Stammdaten auszuwählen), Schreiben (`POST`/`PUT`/`DELETE`) ist auf
Admin/Manager beschränkt (`requireRolle(["admin", "manager"])`) – die
Spezifikation kennt hier zwar keine Rollen, aber „jede Person kann
systemweite Stammdaten ändern" widerspräche dem sonstigen Rollenmodell
(Abschnitt 21.1), das der Rolle „Benutzer" bewusst wenig zutraut. Frontend
spiegelt das über ein `disabled`-`<fieldset>` in `VereineVerwaltung.tsx`/
`TeamsVerwaltung.tsx` (Lesen bleibt sichtbar, nur die Eingaben sind gesperrt).
**Analog bei den Standardregeln** (`/systemkonfiguration`, `StandardregelnPage`):
`GET` ist für jede Anmeldung offen (war serverseitig schon immer so), `PUT`
bleibt Admin-only; der Menüpunkt ist jetzt für alle angemeldeten Personen
sichtbar (vorher admin-only versteckt), das Formular für Nicht-Admins über
dasselbe `disabled`-`<fieldset>`-Muster gesperrt.

**Turnier-Codes (Abschnitt 21.3, Betriebsmodus „Lokales Netzwerk", kontoloser
Zugriff):** ein Rechner hostet Backend+CouchDB lebend im LAN; weitere Geräte
greifen über einen geteilten Code statt eines eigenen Kontos auf **genau ein**
Turnier zu – kein Offline-Datenmodell, keine Synchronisation nötig, da alle
Geräte durchgehend gegen dieselbe erreichbare Datenbank arbeiten (anders als
Turnier-Sync unten). Drei optionale gehashte Felder direkt am `Turnier`-Dokument
(`turnierleitungCodeHash`/`spielleitungCodeHash`/`protokollantCodeHash`, analog
`passwortHash` – kein eigener docType, da nie mehr als drei Codes pro Turnier;
der Protokollant-Code kam 2026-08-21 mit der digitalen Protokollierung dazu,
siehe eigener Abschnitt unten). Setzen/Ändern der
Codes braucht `schreiben_voll` (`PUT/GET /turniere/:id/codes`,
`backend/src/routes/turnierCode.ts`); die Anmeldung selbst ist öffentlich
(`POST /turniere/:id/code-anmeldung`, analog zum `ErgebnisToken`-Muster der
Ergebniserfassung) und legt eine `TurnierCodeSession` an (`sessionArt: "code"`,
`shared/src/types/session.ts`) – **dieselbe** Cookie-Infrastruktur wie eine
normale `BenutzerSession`, ein Gerät ist entweder als Benutzer oder per Code
angemeldet, nie beides. `authPreHandler` löst daraus `req.turnierCode`
(statt `req.benutzer`) auf; `turnierZugriffsstufe()` prüft `req.turnierCode`
**vor** den Benutzer-Pfaden (Turnierleitung-Code → `schreiben_voll`,
Spielleitung-Code → `schreiben_spielbetrieb` – für „lesen" gibt es bewusst
keinen eigenen Code). Ohne Benutzerkonto gibt es keine `BenutzerId` für
Audit-/Denormalisierungs-Felder (`erstelltVon` etc.) – `zuschreibung()`
liefert dafür einen erkennbaren Platzhalter-Namen („Turnierleitung-Code"/
„Spielleitung-Code") statt daran zu scheitern. **Frontend-Besonderheit:** die
Routen `/turniere/:id/code/turnierleitung` (volle `TurnierVerwaltenPage`) und
`/turniere/:id/code/spielleitung` (`SpielleitungCodePage`, eingeschränkt auf
Spielplan/Ergebnisse) liegen **außerhalb** von `GeschuetzteRoute` – die
Zugriffskontrolle läuft rein serverseitig über das Cookie, nicht über
`useAuth()`/`req.benutzer` im Frontend-State.

**Turnier-Sync (Instanz-Kopplung, `docs/Protokolle/2026-08-13-turnier-sync-grundlage.md`):**
deckt den Fall ab, dass ein Turnier auf der Zentralen Plattform geplant wurde,
am Spieltag aber kein/unzuverlässiges Internet besteht – anders als
Turnier-Codes oben arbeiten hier zwei **getrennte** CouchDB-Instanzen
(Server + lokale Installation), die sich zeitweise synchronisieren müssen.
Bewusst **kein** genereller Sync mit Merge-/Konfliktlogik, sondern eine
strikte **1:1-Beziehung** („Checkout"): zu jedem Zeitpunkt ist ein
Server-Turnier entweder frei oder an genau eine lokale Installation
ausgecheckt (`TurnierCheckout`, Zustand `angefordert→aktiv→freigegeben`,
`shared/src/types/sync.ts`). Kein manueller Datei-Download/-Upload, sondern
eine dauerhafte **Instanz-Kopplung**: Download wird ausschließlich vom Server
angestoßen, Upload ausschließlich vom Client. Die lokale Instanz meldet sich
dabei aktiv per **Check-in** (alle 45s, `backend/src/sync/checkin.ts`, ein
`setInterval` in `index.ts` – bewusst backend-seitig, nicht an einen offenen
Browser-Tab gebunden) beim Server, da der Server die lokale Installation wegen
NAT/Firewall i. d. R. nicht direkt erreichen kann; ein serverseitig
angestoßener Download wird als Auftrag hinterlegt und beim nächsten Check-in
im selben Response mitgeliefert (kein zweiter Roundtrip). Kopplung läuft über
einen kurzlebigen **Kopplungscode** (im Profil erzeugt, `benutzer.ts`), den
die lokale Installation einmalig gegen ein dauerhaftes, gehashtes
Instanz-Token tauscht (`VerbundeneInstanz`); Check-in/Kopplung
(`backend/src/routes/instanzSync.ts`) authentifizieren sich per
`Authorization: Bearer <instanzToken>` – **kein** Cookie/Session, da hier zwei
Backend-Prozesse statt Browser↔Server sprechen. Download/Freigabe/Upload
(`backend/src/routes/turnierSync.ts`) laufen dagegen über die normale
turnierbezogene `requireZugriff`+`hatMindestens`-Prüfung wie andere
Turnier-Routen. Export/Import-Umfang (`backend/src/sync/export.ts` bzw.
`import.ts`) orientiert sich an der bestehenden Kaskaden-Lösch-Logik in
`turnier.ts`; `BenutzerId`-Referenzen werden beim Import verworfen (auf der
Zielinstanz bedeutungslos), die denormalisierten `*Name`-Felder bleiben als
Historie erhalten. Volle bidirektionale PouchDB↔CouchDB-Synchronisation
(Abschnitt 17/23) bleibt bewusst zurückgestellt – deutlich komplexer, als für
diesen (häufigeren) Anwendungsfall nötig.

**Bugfix 2026-08-19: alle drei ausgehenden Instanz-zu-Instanz-Aufrufe fehlte das `/api`-Präfix.**
`sync/checkin.ts`, `routes/sync.ts` (Kopplung einlösen) und `routes/turnierSync.ts` (Upload) riefen
`${serverUrl}/instanzen/...` bzw. `${serverUrl}/turniere/sync-import` direkt auf – der
Zentrale-Plattform-Server läuft aber normalerweise als eigener Prozess hinter nginx
(`SERVE_FRONTEND=false`), dessen Backend-Routen intern zwar an der Wurzel liegen, von außen aber
nur unter dem von nginx durchgereichten `/api`-Präfix erreichbar sind (`location /api/` in
`deploy-instanz.sh`). Ohne dieses Präfix landete die Anfrage stattdessen bei nginx' normaler
SPA-Auslieferung (`location /`) – **200 OK mit HTML statt der erwarteten JSON-Antwort**, `.json()`
scheiterte dabei still (`.catch(() => ({}))`), wodurch die Kopplung mit der nichtssagenden
Meldung „Kopplung fehlgeschlagen." scheiterte statt einer aussagekräftigen Fehlermeldung. Live
beim ersten echten Kopplungsversuch von einer lokalen Windows-Installation gegen die echte
Prod-Domain aufgefallen, per `curl` verifiziert (ohne `/api`: 405 + `text/html`; mit `/api`: 404 +
korrekte JSON-Fehlermeldung „Kopplungscode ist ungültig oder abgelaufen."). Das komplette
Turnier-Sync-Feature war dadurch seit seiner Einführung (2026-08-13) gegen eine echte
nginx-gefrontete Zentrale Plattform nie funktionsfähig, nur eine direkte Backend-zu-Backend-
Verbindung ohne nginx dazwischen hätte funktioniert (im bisherigen Testbetrieb offenbar nie geprüft).

**Check-in überträgt seit 2026-08-19 den vollständigen Turnierstand, nicht mehr nur Ergebnisse
(Nutzer-Entscheidung nach Live-Test):** Live beim ersten echten Kopplungsversuch aufgefallen, dass
Regel-/Mannschafts-/Schiedsrichter-Änderungen sowie die `oeffentlich*`-Freigabe-Häkchen NIE zum
Server zurückgemeldet wurden – der Check-in (`backend/src/sync/checkin.ts`, alle 45s) pushte bisher
nur ausgewählte Spiel-Felder (`ergebnisA/B`, `status`, …). Der bestehende „Zum Server hochladen"-
Knopf sah wie ein manueller Ausweg aus, funktioniert aber bei einem bereits ausgecheckten Turnier
serverseitig gar nicht (409 „wird gerade aktiv verwaltet", greift unabhängig vom `ersetzen`-Flag).
Abgewogene Alternativen: (a) Check-in um eine vollständige Übertragung erweitern (jede lokale
Änderung landet automatisch beim nächsten Zyklus auf dem Server), oder (b) nur den 409-Guard für die
eigene Instanz lockern (rein manuell ausgelöst). Nutzer-Entscheidung für (a) – bewusst **kein**
echter bidirektionaler Konfliktabgleich („wer hat Recht"), sondern derselbe Export/Import-
Mechanismus wie beim initialen Download/Upload (`sammleTurnierExport`/`importiereTurnierExport`,
`ersetzen: true`), jetzt bei **jedem** Check-in statt nur einmalig. Hält den Server-Stand
automatisch „relativ aktuell", solange eine Verbindung besteht; „Freigabe aufheben" bleibt der
bewusste manuelle Notausstieg bei Rechnerverlust/-defekt der lokalen Installation (dann gilt der
letzte erfolgreich übertragene Stand). `CheckinBody.ergebnisPush` (nur Spiel-Felder) ist komplett
entfallen, ersetzt durch `vollstaendigeUebertragung` (`{turnierId, export: TurnierExportPaket}[]`).

**Server-seitige Schreibsperre für ausgecheckte Turniere (2026-08-19, Nutzer-Vorgabe, direkte Folge
der Voll-Synchronisation oben):** Ohne die Voll-Synchronisation war die Gefahr eher theoretisch (nur
Ergebnisse gingen automatisch zurück); mit ihr würde eine direkte Server-Änderung spätestens beim
nächsten Check-in ohnehin überschrieben – ein Sperren verhindert also nur eine sinnlose, unbemerkt
verpuffende Änderung, verhindert aber vor allem Verwirrung bei mehreren Personen mit Zugriff auf
dasselbe (geteiltes) Turnier. `turnierAusgecheckt(turnierId)` (`backend/src/auth/turnierZugriff.ts`)
prüft per `findeAktivesCheckout()`, ob ein `TurnierCheckout` mit Status `angefordert` **oder**
`aktiv` existiert (beide zählen als gesperrt – auch der kurze Zeitraum zwischen Anfordern und
Bestätigung soll keine Server-Änderungen mehr zulassen). Anders als `turnierGesperrt()`
(abgeschlossenes Turnier) **ohne** Ausnahme für die Öffentlich-Freigabe: die `oeffentlich*`-Felder
werden durch die Voll-Synchronisation ebenfalls automatisch vom lokalen Stand überschrieben, eine
direkte Server-Änderung wäre also ohnehin sinnlos. Eingebaut an denselben Stellen, die bereits
`turnierGesperrt()` prüfen (`turnier.ts` inkl. `/abschliessen`, `/wieder-oeffnen`,
`/regeln-entsperren`, DELETE; `mannschaft.ts`, `spieler.ts`, `schiedsrichter.ts`, `spiel.ts`
(zentral in `pruefeSpielZugriff`, wirkt automatisch auch in `ergebnis.ts`), `spielplan.ts`) sowie
zusätzlich in `ergebnisToken.ts`s öffentlicher (kein Login) `PUT /ergebnis-erfassung/:tokenWert/…`
– ein alter, noch aktiver externer Erfassungslink hätte sonst am Sperr-Mechanismus vorbei
weiterschreiben können. **Nachtrag 2026-08-20:** `turnierCode.ts` (`PUT /turniere/:id/codes`) hatte
die Prüfung als einzige turnierbezogene Schreib-Route übersehen (Nebenbefund aus dem Backend-Review)
– jetzt ebenfalls `turnierAusgecheckt()` (bewusst nur diese, nicht `turnierGesperrt()`: Codes/Teilen
bleiben bei bloß abgeschlossenem Turnier erlaubt).

**Sicherheitsprüfung des Sync-Imports (2026-08-20, aus einer Sicherheitsdurchsicht):**
`importiereTurnierExport` (`backend/src/sync/import.ts`) schreibt jedes Paket-Dokument unter seiner
mitgelieferten `_id` (bei `ersetzen: true` holt es die `_rev` des Zieldokuments selbst) – die
Schreib-Adresse ist also die `_id`, während Queries (`findAllByType`) über das `docType`-**Feld**
laufen. Ohne Prüfung konnte eine gekoppelte Instanz darüber **beliebige** Dokumente überschreiben
oder anlegen (fremdes Turnier, `benutzer:<x>` mit `globaleRolle:"admin"`, `systemeinstellungen:global`,
…) und sich so zum Admin machen – erreichbar für jeden, der ein Turnier mit `schreiben_voll`
auschecken kann (Manager auf eigenem Turnier; per `zugriffFuerAlleBenutzer` auf der Demo sogar ein
„benutzer"). Fix: die reine Funktion `pruefeTurnierExportPaket` (`backend/src/sync/validierung.ts`,
ohne DB, daher im normalen `npm test` getestet) prüft je Dokument **`_id`-Präfix UND `docType`-Feld**
(beide nötig – s. o.) sowie die Turnier-Zugehörigkeit (`turnierId`/`mannschaftId`), inklusive der
create-only-Stammdaten (sonst ließe sich über das `vereine`-Array ein `benutzer:`-Dokument
**anlegen**). Aufgerufen (fail closed) als nicht umgehbare erste Zeile in `importiereTurnierExport`
(wirft bei Verstoß) **und** vorab in beiden Routen: `POST /instanzen/checkin` (flaches Body-Schema
ergänzt, das zuvor fehlte; manipulierter Eintrag wird verworfen+geloggt statt die ganze Anfrage
abzubrechen, `erwarteteTurnierId = eintrag.turnierId`) und `POST /turniere/sync-import` (400 bei
Verstoß). **Bei jeder Erweiterung von `TurnierExportPaket` (neuer Dokumenttyp im Export) auch die
Validierung mitziehen** – sonst würde ein neuer Typ entweder fälschlich abgelehnt oder ungeprüft
durchgelassen. Details: `docs/Protokolle/2026-08-20-turnier-sync-import-absicherung.md`.

**Frontend-Kennzeichnung der Sperre (2026-08-19, bewusst schlank statt vollständigem
`istGesperrt`-Muster):** Nutzer-Vorgabe: statt jedes einzelne Feld wie bei `turnierGesperrt()`
proaktiv zu deaktivieren, wird nur der Turniername in der `<h1>` (erscheint auf jedem Reiter, da
`TurnierVerwaltenPage` eine einzige Komponente mit allen Tabs ist, nicht separate Routen) rot
(`color: var(--danger)`) mit Zusatz „(gesperrt)" dargestellt, sobald `GET /turniere/:id/checkout-status`
`ausgecheckt: true` liefert – der Rest bleibt bewusst unverändert bedienbar und zeigt die
serverseitige 409-Fehlermeldung erst beim tatsächlichen Speicherversuch; Details erklärt stattdessen
das Hilfe-Thema „Lokale Installation & Turnier-Sync" (neue Frage „Warum ist der Turniername auf
dem Server rot…"). `TurnierSync.tsx` bekommt dafür einen neuen optionalen `onCheckoutGeaendert`-
Callback (nach erfolgreichem Download-Anfordern/Freigabe-aufheben), damit die Kennzeichnung in der
einbettenden Seite sofort reagiert, ohne denselben Status doppelt zu pollen. Dieselbe Behandlung
zusätzlich in `SpielleitungCodePage.tsx` (eigene, unabhängige `<h1>` – nutzt `TurnierVerwaltenPage`
nicht mit).

**Nachtrag 2026-08-20: „schlank" zurückgenommen – Felder werden jetzt doch proaktiv deaktiviert**
(Nutzer-Vorgabe nach einer Feedback-Mail: „Feldinhalte lassen sich trotz Sperre bearbeiten", der
Server lehnte zwar mit 409 ab, aber die bedienbaren Felder wirkten wie ein nicht greifender Schutz).
`TurnierVerwaltenPage`/`SpielleitungCodePage` berechnen jetzt `eingabeGesperrt = istGesperrt ||
ausgecheckt` und deaktivieren damit ALLE Eingaben. **`ausgecheckt` sperrt genau das, was auch der
Server bei ausgechecktem Turnier ablehnt** – also mehr als `istGesperrt` (Abschluss): zusätzlich die
`oeffentlich*`-Checkboxen, die Status-Buttons (abschließen/wieder-öffnen), `regeln-entsperren` und –
per `disabled`-`<fieldset>` – das Teilen/die Turnier-Codes (`TurnierFreigabe`) sowie die
Ergebnis-Erfassung (`ErgebnisVerwaltung` hat keinen eigenen `gesperrt`-Prop). **Einzige aktiv
bleibende Aktion: „Freigabe aufheben" in `TurnierSync`** (Nutzer-Vorgabe) – deshalb steht TurnierSync
außerhalb aller Sperr-`<fieldset>`. Beim bloß **abgeschlossenen** (nicht ausgecheckten) Turnier bleibt
Teilen/Öffentlich-Freigabe unverändert bedienbar (nur `ausgecheckt` sperrt sie, nicht `istGesperrt`).
Prüf-Hinweis (schon früher notiert): Controls in einem `disabled`-`<fieldset>` melden `.disabled ===
false` – effektive Sperre mit `el.matches(':disabled')` prüfen (im Browser end-to-end verifiziert).
Details: `docs/Protokolle/2026-08-20-checkout-sperre-frontend.md`. **Nachtrag (Nutzer-Fund nach dem
Ausrollen):** Die Spielplan-Steuerung (Startzeit-Felder, ▲▼/Drag-Reihenfolge, „Neuer Vorschlag"/
„Spielplan erzeugen"/„Rückgängig") verließ sich bisher allein auf den Spiel-Status (`!== "geplant"`)
– bei einem lediglich ausgecheckten Turnier sind die Spiele aber weiterhin „geplant", die
Startzeiten blieben so als einzige Felder bedienbar. `SpielplanVerwaltung`s `gesperrt`-Prop
deaktiviert jetzt zusätzlich alle diese Stellen (nicht mehr nur die Schiedsrichter-Einteilung).

**Kennzeichnung auch in der Turnierliste (2026-08-19, Nutzer-Vorschlag):** `GET /turniere`
reichert jedes Turnier um ein reines Anzeige-Feld `ausgecheckt: boolean` an (eine einzige
`findAllBySelector`-Abfrage über alle aktiven `TurnierCheckout`s, kein Datenbank-Zugriff pro
Zeile) – Frontend-Typ `TurnierMitSyncStatus` (`frontend/src/api.ts`, `extends Turnier`, nicht Teil
des gespeicherten Dokuments). `TurnierListePage.tsx` zeigt dafür statt des `TurnierLogo` ein
Stop-Schild-Emoji (🛑, `role="img"` + `aria-label`/`title`) vor dem Namen. Im Browser verifiziert
(per direkt in CouchDB angelegtem `TurnierCheckout`-Testdokument).

**Lokale Installation optisch erkennbar (2026-08-20, Nutzer-Feedback):** neue Komponente
`LokaleInstallationBanner.tsx`, analog `UmgebungsBanner.tsx` aber – anders als dieses – zur
Laufzeit per `GET /sync/status` (`istLokaleInstallation`) statt build-zeit-gesteuert ermittelt, da
dieselbe gebaute Anwendung sowohl als Zentrale Plattform als auch als lokale Installation läuft
(`SERVE_FRONTEND`-Flag). Grund: bei mehreren offenen Browser-Reitern (z. B. während der
Turnier-Sync-Kopplung) war bisher nur an der URL zu erkennen, auf welcher Instanz man sich gerade
befindet. **Bewusst NICHT in `--danger`/Rot wie `umgebungs-banner-demo`** (Nutzer-Vorgabe) – das
ist hier kein Warnhinweis vor Datenverlust, nur eine Standort-Kennzeichnung: neue CSS-Klasse
`.umgebungs-banner-lokal` mit `var(--focus-ring)` (der vorhandene, bisher nur für Fokus-Ringe
genutzte Blauton) als ruhigerer, trotzdem deutlich abgehobener Hintergrund.

**Spielzeit/Spielmodus/Protokollierung gesperrt, sobald der Spielplan läuft (2026-08-20,
Nutzer-Vorgabe):** `TurnierVerwaltenPage.tsx` lädt dafür einen eigenen schlanken `spiele`-State
(nur für diese Sperre, unabhängig vom vollen Spielplan-State in `SpielplanVerwaltung.tsx`) und
berechnet `spielplanGesperrt` mit derselben Bedingung wie dort (`spiele.some(s => s.status !==
"geplant" || s.ergebnisAbgeschlossen)`). `TurnierregelnFormular.tsx` bekommt dafür einen neuen
optionalen Prop `spielzeitGesperrt`, der **gezielt nur** `spielzeitMinuten`/`anzahlHalbzeiten`/
`pauseMinuten` deaktiviert (nicht das ganze Formular wie beim bestehenden `istGesperrt`/
`turnierGesperrt()`-Mechanismus für abgeschlossene Turniere) – alle anderen Regel-Felder wirken
sich nur auf Anzeige/Ergebnistabelle aus und bleiben änderbar. Dieselbe `spielplanGesperrt`-
Bedingung sperrt zusätzlich die Dropdowns „Spielmodus"/„Protokollierung" im Übersicht-Reiter (dort
bereits vorhandenes `disabled={istGesperrt}` um `|| spielplanGesperrt` ergänzt). Im Browser
verifiziert (Test-Turnier mit bereits gespielten Spielen: alle drei Felder + beide Dropdowns
gesperrt; ein Turnier ohne begonnenen Spielplan bleibt unverändert änderbar).

**Login-Seite: Ersteinrichtung als Button (2026-08-20):** `LoginPage.tsx` zeigt den Hinweis „Es
existiert noch kein Benutzer" jetzt mit einem `.button-link`-gestylten Link statt eines reinen
Text-Links (Nutzer hatte ihn live übersehen, siehe Backlog-Notiz oben in dieser Session) –
dieselbe Klasse, die z. B. „Neues Turnier anlegen" in `TurnierListePage.tsx` schon verwendet.

**Offline-/Lokal-Betrieb ist laut Spezifikation (Abschnitt 17/19) ein
Kernfeature mit drei Betriebsmodi (Standalone, Lokales Netzwerk, Zentrale
Plattform), kein optionales Extra** – bei neuen Architektur-Entscheidungen
(neue Auth-Pfade, neue Datenzugriffs-Patterns) mitdenken, ob sie den noch
offenen dritten Modus erschweren würden, statt online-only als
selbstverständliche Annahme zu behandeln. „Lokales Netzwerk" (Turnier-Codes,
oben) und diese Instanz-Kopplung decken die ersten beiden Ausprägungen ab;
der reine **Standalone-Modus** (ein Rechner, kein externer Server, volle
PouchDB-Synchronisation im Browser) ist für ein kommendes Release fest
eingeplant, aber noch nicht gebaut.

**`GET /sync/status` liefert zusätzlich `istLokaleInstallation`** (`= SERVE_FRONTEND === "true"`,
siehe `backend/src/index.ts`): `EinstellungenPage.tsx`s Kopplungsformular ("Turnier-Sync (Lokale
Installation)") blendet sich damit komplett aus, wenn diese Instanz keine echte lokale
Windows-Installation ist – ohne dieses Signal zeigte das Formular sich bisher auf **jeder**
Instanz (Dev/Prod/Demo, im normalen Browser), obwohl eine Kopplung "als lokale Installation" dort
nie sinnvoll ist (live beim Nutzer aufgefallen, 2026-08-14). Bewusst nur eine UI-Blende, keine
serverseitige Sperre von `POST /sync/verbinden` – dafür gab es keinen konkreten Anlass.

**Eigenes „Admin"-Menü in der Kopfzeile** (`App.tsx`, neben „Stammdaten"):
bündelt Funktionen, die *ausschließlich* der Rolle Admin vorbehalten sind
(„Systemeinstellungen", „Entwicklungs-Board") – wird für alle anderen Rollen
komplett nicht gerendert, nicht nur einzelne Einträge darin versteckt.
**Bewusst nicht mit umgezogen: „Benutzerverwaltung"** – die bleibt im
„Stammdaten"-Menü und für Admin **und** Manager zugänglich (Manager dürfen
laut Spezifikation 21.1 Benutzer-/Manager-Accounts anlegen); ein rein
admin-sichtbares Menü hätte das gebrochen. Bei einem neuen admin-only
Menüpunkt: erst prüfen, ob die Funktion wirklich *nur* für Admin gedacht ist,
nicht nur gerade zufällig admin-only umgesetzt wurde.

**Zwei parallele Wege zum Spielergebnis – beide umgesetzt, digital als Beta (2026-08-21):** Ein
Turnier ist entweder `protokollierungsart: "manuell"` (Endergebnisse per Formular oder per
Token-Link ohne Login, `backend/src/routes/ergebnis.ts` + `ergebnisToken.ts`, Tabellenberechnung in
`backend/src/ergebnisse/tabelle.ts`) oder `"digital"` (vollständiges Live-Ereignisprotokoll je
Wurf/Foul/Tor, siehe nächster Abschnitt). Der digitale Pfad ist bewusst als **Beta**
gekennzeichnet (Hinweise an der Auswahl + Hilfe-Thema „Digitale Protokollierung (Beta)") – noch
nicht für den produktiven Einsatz freigegeben; ErgebnisVerwaltung zeigt bei digital keine
Direkteingabe mehr, sondern je Spiel einen „Protokoll"-Link.

**Digitale Protokollierung (Abschnitt 22, in einem Tag inkl. sechs Feedback-Runden gebaut –
maßgebliches Design-Dokument mit allen Entscheidungen: `docs/digitales-protokoll-konzept.md`):**
Event-Sourcing je Spiel: `Spielprotokoll` (Singleton je Spiel) + append-only `Event`-Strom (beide
docTypes tragen `turnierId` **denormalisiert** – dadurch funktionieren Kaskaden-Löschung in
`turnier.ts` und die Sync-Export-Validierung ohne Kettenauflösung; `sequenz` vergibt der Server).
Events werden NIE geändert/gelöscht; Korrektur-Semantik (`backend/src/protokoll/ereignisse.ts`):
ein Korrektur-Event annulliert sein Ziel, `ANNULLIERT` streicht ersatzlos (Undo), jeder andere Typ
ist Ersatz und zählt selbst; Korrektur der Korrektur lässt das Original wieder aufleben; einzige
Typ-Sonderregel: Nicht-ANNULLIERT-Korrektur auf `PROT` = Ergänzung (Protest-Entscheidung), Ziel
bleibt wirksam. Die UI-Aktion „Tor" erzeugt ein W+G-Doppel-Event mit `zusatz.torPaar` am W – nur
so markierte Paare werden bei Undo/Streichen GEMEINSAM gestrichen (ein per `G` an einen echten
separaten Wurf angehängtes Tor lässt den Wurf stehen). **Der volle Live-Reducer läuft NUR im
Frontend** (`frontend/src/protokoll/stand.ts` – alle Spez.-Prüfungen sind Warnungen, keine
Blockaden); das Backend hat nur `ergebnisAusEvents()` – der Annullierungs-Filter existiert dadurch
bewusst doppelt (ereignisse.ts ↔ stand.ts, bei Änderung BEIDE anpassen). Integration in den
Bestand läuft komplett darüber, dass `routes/protokoll.ts` die vorhandenen `Spiel`-Felder pflegt
(erstes GO → `laeuft`, Tore → Live-`ergebnisA/B`, `End` → `beendet`, `Fin`/Bestätigung →
`abgeschlossen`) – Tabelle/öffentliche Seite/PDFs blieben unangetastet; das torlose 0:0 wird
bewusst erst bei `End` geschrieben (sonst stünde ein angepfiffenes Spiel als Remis in der
Tabelle). `AUF`-Event (`zusatz.spielerIds`) setzt die Feldbesetzung, `E`-Wechsel schreiben sie
fort. Vier-Augen-Abschluss je Turnier über `protokollBestaetigungErforderlich` (Checkbox
Übersicht, `POST /protokolle/:id/bestaetigen`, `schreiben_voll`).

**Protokoll-UI: EINE Route (`/turniere/:turnierId/spiele/:spielId/protokoll`, außerhalb
`GeschuetzteRoute`), zwei Ansichten in `ProtokollPage.tsx`:** die **Erfassungs-Ansicht**
(Standard) ist ein Vollbild-Layout – eine body-Klasse `protokoll-vollbild-aktiv` blendet
App-Kopfzeile/Banner/Fußzeile aus, alle großen Elemente skalieren per `clamp()` mit der
Viewport-Höhe plus zwei `max-height`-Kompaktstufen (760/640px), Scrollen nur als Sicherheitsnetz;
`Esc`, dann `Enter` wechselt zur **Verlauf-Ansicht** (volle Ereignisliste, ✎/✕-Korrekturen,
Abschluss-Workflow) und zurück. Eingabe über die reine Zustandsmaschine
`frontend/src/protokoll/eingabe.ts` + `TASTATUR_BELEGUNG` (Bildschirm-Buttons, Tastatur und das
später geplante HID-Panel treiben DIESELBE Maschine). Bedienregeln (alle Nutzer-Vorgaben):
Team-Taste A = links / B = rechts angezeigte Mannschaft (bei `seiteAVertauscht` mappt `taste()`
auf die andere Datenseite); Ziffer ohne Aktions-Taste bucht direkt einen Wurf; bei einstelligen
Trikotnummern buchen ALLE Aktionen mit der letzten Ziffer bzw. 0-Nummern-Aktionen sofort (kein
Enter); `G` unmittelbar nach einem Wurf = Tor zu genau diesem Wurf; `H` (Halbzeit) tauscht bei
aktivierter Regel `seitenwechsel` automatisch die Anzeigeseiten; 8-Sekunden-Anzeige zählt nach
einem Wurf neutral auf BEIDEN Seiten, erst `K` legt die Seite fest. **Lehre aus einem Live-Bug:
Befehle/Seiteneffekte NIE im setState-Updater ausführen** (React-StrictMode ruft Updater doppelt
auf → doppelt gebuchte Events samt Sequenz-Kollisionen) – `eingabeRef`-Muster in ProtokollPage.
**Automatischer Uhr-Stopp (Nutzer-Vorgabe 2026-08-21):** Tor/Eigentor (auch über den „`G` nach
Wurf"-Schnellpfad), Foul, Strafwurf, Auszeit und technische Auszeit buchen bei laufender Uhr ein
`STOP` hinterher (`uhrAutoStopp()`) – auf all das pfeift der Schiedsrichter neu an, im Torball
zählt Netto-Spielzeit. Der Neustart bleibt bewusst manuell (Leertaste), das `STOP` ist ein
normales, korrigierbares Ereignis. Kontrolle/Fehlwurf/Freiwurf/Wechsel stoppen NICHT.
**Rückmeldung bei Regelverstößen:** die Statusanzeige unterscheidet „NOCH NICHT GESTARTET"/
„PAUSE"/„SPIEL BEENDET"/„UNTERBROCHEN" (`spielGestartet`/`inPause` in `stand.ts`, `B`/`VB` setzen
die Pause, `GO` löscht sie); das Wurf-Badge am Spieler wird ab dem 4. Wurf rot; und eine NEU
auftauchende Warnung lässt den Bildschirm 0,5 s rot aufblitzen (`protokoll-fehler-blitz`, Remount
per Zähler-`key` startet die CSS-Animation neu – kein Timeout-State). Der Blitz vergleicht dafür
`stand.hinweise` auf Neuheit, **deshalb muss ein wiederholbarer Verstoß seine Zahl im Text
tragen** (der Hinweis ab dem 4. Wurf zählt mit: „5. Wurf in Folge", „6. …" – jeder weitere Wurf
ohne Unterbrechung ist strafbewehrt und soll erneut blitzen); Aufstellungs-Hinweise sind bewusst
ausgenommen (ändern sich beim Einrichten mit jedem Klick).
Zugang: dritter Turnier-Code „Protokollant" (`TurnierCodeRolle`, Stufe `lesen` + eigenes Prädikat
`darfProtokollieren()` in `turnierZugriff.ts` – bewusst KEINE vierte Zugriffsstufe), eigene Seite
`ProtokollantCodePage`. Sobald irgendein Spielprotokoll existiert, gilt das Turnier als begonnen:
`GET /turniere/:id/spielprotokolle` speist dieselbe Sperre wie beim ersten manuellen Ergebnis
(`spielplanGesperrt` in TurnierVerwaltenPage, lädt bei Fenster-Fokus nach) – bei digital sperrt
sie zusätzlich das GANZE Regel-Formular samt Vier-Augen-Checkbox (die Regeln wirken dort direkt
in die Live-Erfassung). Seit 2026-08-21 greift sie außerdem an der Spielplan-Erzeugung selbst:
`spielplan.ts` lehnt Vorschlag (GET) und Persistieren (POST, beide Pfade) mit 409 ab, wenn
Spielprotokolle existieren, und `SpielplanVerwaltung.tsx` sperrt „Neuer Vorschlag"/„Spielplan
erzeugen" mit – ein Protokoll entsteht schon bei der Protokollant-Eingabe, während das Spiel noch
„geplant" ist; der reine Spiel-Status-Check hätte in diesem Fenster das Löschen aller Spiele
durchgelassen und Protokoll+Events verwaist zurückgelassen. **Bewusst
zurückgestellt** (Konzept Abschnitt 11): konfigurierbare Tastenbelegung (erst wenn das Protokoll
rund läuft – Nutzer-Vorgabe), PDF-Spielbericht, Beamer-Sicht, Torschützen-Statistik,
Freiwurf-Führung, „kurzzeitig ausgesetzt"-Status, Tablet-Layout/Wake-Lock, Panel-Firmware.

**Automatisch gespeicherte Felder brauchen eine ANGESAGTE Rueckmeldung
(`components/SpeicherHinweis.tsx`, 2026-08-22):** Der Grossteil der Anwendung speichert beim
Verlassen eines Feldes (onBlur) ohne Speichern-Knopf – gemeldet wurde das bisher aber nur in der
Ergebniserfassung, und dort ohne `role="status"`. Vereine/Teams/Mannschaften/Kader/
Schiedsrichter/Spielplan/Turnier-Uebersicht speicherten voellig stillschweigend. Ohne Knopf fehlt
sonst jedes wahrnehmbare Ereignis – fuer die Zielgruppe dieser Anwendung der entscheidende Punkt.
`useSpeicherHinweis()` + `<SpeicherHinweis>` liefern eine Live-Region; **jede neue Stelle mit
onBlur-Speicherung zieht sie mit** (Aufruf `meldeGespeichert("… gespeichert.")` direkt nach dem
erfolgreichen `await`, Region einmal je Liste direkt unter der `role="alert"`-Fehlerzeile).
Zwei Fallstricke, die dabei geloest sind: (1) Die Live-Region muss schon VOR der Meldung im DOM
stehen – ein Element, das erst mit seinem Text erscheint, sagen viele Screenreader nicht an
(deshalb rendert sie immer, leer, mit reservierter Hoehe per `.speicher-status`). (2) Zweimal
derselbe Text hintereinander aendert nichts am DOM und wird nicht erneut angesagt – `melde` leert
deshalb erst und setzt gleich darauf neu. Bewusst per `setTimeout(…, 0)` und **nicht**
`requestAnimationFrame`: dessen Rueckruf laeuft nur, solange die Seite gezeichnet wird – in einem
Hintergrund-Tab bliebe die Meldung sonst dauerhaft aus (live in der Vorschau erwischt).

**Profil-Stammdaten speichern seit 2026-08-22 feldweise** (Nutzer-Vorgabe): „Mein Profil" war die
letzte Stelle, an der dieselben Felder, die die Schiedsrichter-Verwaltung laengst per onBlur
pflegt, noch einen „Stammdaten speichern"-Knopf hatten – und das direkt unter den
Voreinstellungen (Theme/Dichte/Breite), die schon immer sofort speicherten. `PUT /benutzer/mich`
konnte partielle Aenderungen bereits (`!== undefined`-Pruefung je Feld, leerer String leert das
Feld) – **keine Backend-Aenderung noetig**. Der Lizenz-Schalter speichert beim Umschalten, der
Pflicht-Name wird bei leerer Eingabe zurueckgesetzt statt gespeichert.

**Bewusst NICHT umgestellt** (Stand 2026-08-22, Begruendung je Fall): Standardregeln
(`/systemkonfiguration`) – jede Speicherung legt eine neue Version an, feldweises Speichern
erzeugte pro Tastendruck eine Version; Systemeinstellungen + Mail-Postfach – Passwort-/Key-Felder
mit „leer = unveraendert"-Semantik, zusammengehoerige Verbindungsdaten und „Verbindung testen"
prueft den Formularstand; E-Mail/Passwort/2FA – brauchen Passwort-Bestaetigung bzw. Wiederholung;
Wartungsmodus – die Sperre trifft sofort alle Nutzer, das soll ein bewusster zweiter Schritt
bleiben; Turnierregeln am Turnier – „Auf Standardwerte zuruecksetzen" fuellt das ganze Formular
und lebt davon, dass man vor dem Speichern prueft; Turnier-Codes und Kanban-Kartendialog –
bewusste Einzelaktion bzw. Dialog-Semantik (Schliessen verwirft).

**Optionale Textfelder leeren: `null` senden, nicht `undefined`.**
`JSON.stringify` entfernt Felder mit Wert `undefined` komplett aus dem
Request-Body; die Backend-Routen mergen PUT-Bodies typischerweise per
`{ ...bestehend, ...req.body }` (z. B. `turnier.ts`, `verein.ts`,
`mannschaft.ts`) – ein fehlender Schlüssel lässt den alten Wert dann
unverändert stehen, ein leeres Feld lässt sich so **nie** wirklich
zurücksetzen. Umgesetzt u. a. in `updateTurnier` (`TurnierVerwaltenPage.tsx`),
`VereineVerwaltung.tsx`, `MannschaftenListe.tsx`, `SpielerKader.tsx`,
`SchiedsrichterVerwaltung.tsx` und der Schiedsrichter-Zuordnung
(`spielAnpassen`): leere optionale Felder senden explizit `null` statt
`wert || undefined`. **Wichtig:** Wo die Route ein Fastify-`body`-Schema hat
(`verein.ts`, `mannschaft.ts`, `spieler.ts`, `schiedsrichter.ts`, `spiel.ts`),
muss das betroffene Feld dort `type: ["string", "null"]` erlauben – sonst weist
die Schema-Validierung das `null` mit 400 ab (`turnier.ts`s PUT hat gar kein
Schema, deshalb fiel das dort nicht auf). Der Backend-Body-**TS-Typ** bleibt
dabei bewusst `string` (nicht `string | null`), damit der `{ ...bestehend,
...req.body }`-Merge das `null` nach dem `string | undefined`-Feld schreiben
darf – TS kennt den Laufzeit-`null` nicht. `TeamsVerwaltung.tsx` ist bewusst
nicht betroffen: `Team` hat nur Pflichtfelder (`vereinId`, `name`).

**Öffentliche Startseite (Root für Gäste):** Die Route `/` ist **öffentlich** und rendert über
`StartRoute` (App.tsx) je nach Anmeldung: angemeldet → die Verwaltungs-`TurnierListePage`, sonst →
`OeffentlicheStartseitePage`. Diese listet (Endpunkt `GET /oeffentlich/turniere`, kein Login) alle
Turniere mit `oeffentlichTurnierinfos=true` – nur **Name/Datum/Spielort**, getrennt nach aktuell/
abgeschlossen, plus Link zur Anmeldung. Damit landet ein Besucher der Server-Adresse nicht mehr auf
`/login`, sondern auf dieser Übersicht. (Die übrigen geschützten Routen bleiben in `GeschuetzteRoute`.)

**Öffentliche Turnierseite ohne Login** (`backend/src/routes/oeffentlich.ts`,
`frontend/src/pages/OeffentlicheTurnierseitePage.tsx`, Route
`/turniere/:id/oeffentlich`): Die Turnier-ID selbst ist die Adresse, anders
als beim Ergebnis-Token (`ergebnisToken.ts`) gibt es keinen zweiten
Geheimwert – reiner Lesezugriff ist unkritisch, die eigentliche Freigabe
steuern vier `oeffentlich*`-Boolean-Felder am Turnier (je Sektion
Turnierinfos/Anfahrt/Spielplan/Ergebnisse einzeln). Mannschafts-/Feldnamen
werden in der Response immer mitgeliefert, nicht hinter einem der vier
Felder versteckt, weil Spielplan/Ergebnisse sonst die ID-Referenzen nicht
auflösen könnten.

**Spieler/Kader hängen an der Mannschaft, nicht am Turnier:** `Spieler`
(`docType: "spieler"`) referenziert `mannschaftId` (turnierbezogen, da die
Mannschaft turnierbezogen ist), CRUD in `backend/src/routes/spieler.ts`
(Zugriff über das Turnier der Mannschaft, `turnierZugriff`). Weil Spieler nur
das `mannschaftId` kennen, muss die Kaskaden-Löschung sie **pro Mannschaft**
mitnehmen – umgesetzt sowohl beim Mannschaft-Löschen (`mannschaft.ts`) als
auch beim Turnier-Löschen (`turnier.ts`, in der Mannschafts-Schleife). UI:
ausklappbarer Kader je Mannschaft in `MannschaftenListe.tsx`
(`SpielerKader.tsx`). **Bewusst zurückgestellt (erste Iteration = reines
CRUD):** die fachliche Sperre „Kaderänderung nur bis zum ersten Spiel der
Mannschaft, danach nur Namen" (Spez. 5.3) und die Übernahme des Kaders aus
einem früheren Turnier (`importiertAusTurnierId` existiert im Typ, wird aber
noch nicht gesetzt).

**Trainer/Betreuer an der Mannschaft:** bis zu drei (`betreuer1..3Name` an
`MannschaftImTurnier`), jeder mit `betreuerNIstSchiedsrichter`-Flag – gepflegt
im ausklappbaren Kader-Bereich (`MannschaftenListe.tsx`). Hintergrund: sie
dürfen (Bundesliga) mit auf der Auswechselbank sitzen. Dieselbe Person kann bei
mehreren Mannschaften eines Vereins stehen – für eine spätere Ableitung von
Schiedsrichtern aus diesen Flags ist deshalb eine Dedup nötig (noch offen).

**Schiedsrichter (turnierbezogen):** `SchiedsrichterImTurnier`
(`docType: "schiedsrichterImTurnier"`) hängt direkt am `turnierId`, CRUD in
`backend/src/routes/schiedsrichter.ts`, eigener Tab zwischen Mannschaften und
Spielplan (`SchiedsrichterVerwaltung.tsx`). Genau eine Person je Turnier hat
`istTurnierleitung` – das Frontend erzwingt das per Radio-Single-Select (die
bisherige Turnierleitung wird beim Wechsel zurückgesetzt). Kaskaden: beim
Turnier-Löschen mitlöschen. Der `turnier.ts`-Delete löscht damit
`mannschaftImTurnier` + `spieler` + `schiedsrichterImTurnier` + `spiel`
kaskadierend (Integrationstest deckt das ab, überspringt aber ohne
`COUCHDB_*`).

**Vereins- statt Mannschafts-Bezug (2026-08-14 umgestellt, vorher `mannschaftId`):**
`SchiedsrichterImTurnier.vereinId` referenziert einen Verein, nicht eine
Turnier-Mannschaft – fachlich korrekter (ein Schiedsrichter gehört zu einem
Verein) und erkennt dadurch automatisch auch eine zweite Mannschaft desselben
Vereins im selben Turnier (z. B. I-/II-Mannschaft), was die vorherige direkte
`mannschaftId`-Zuordnung nicht konnte. Nebeneffekt: eine Mannschaft ohne
Stammdaten-Bezug (Ad-hoc-Erfassung ohne `vereinId`) kann dadurch nie als
"eigener Verein" erkannt werden – bewusst hingenommene Einschränkung. Da
Vereine (anders als die frühere `mannschaftId`) turnierübergreifend sind,
entfällt die alte Kaskade "beim Mannschaft-Löschen die Referenz lösen"
ersatzlos – ein Vereins-Bezug wird von einer Mannschafts-Löschung nicht
berührt.

**„Verein" in den Stammdaten ist nicht zwingend ein realer Sportverein:**
Eine Spielgemeinschaft (SG) ohne eigenen Trägerverein wird bewusst als
eigener „Verein"-Eintrag erfasst (Name z. B. „SG Hoffeld/Landshut"), damit
darunter ein `Team` angelegt werden kann – `Team.vereinId` ist ein
Pflichtfeld, jedes Team braucht also einen Verein-Datensatz. Nutzer-Vorgabe
(2026-08-11): bewusst keine Modelländerung (kein team-ohne-verein), der
Verein-Eintrag ist konzeptionell ohnehin „die Trägerorganisation hinter dem
Team" und eine SG passt dort hinein. Beim Umgang mit Vereinen/Teams also
nicht annehmen, dass jeder „Verein"-Datensatz ein echter Sportverein ist.

**Schiedsrichter-Stammdaten (turnierübergreifend, analog Verein/Team):**
`Schiedsrichter` (`docType: "schiedsrichter"`, eigener Typ + eigene Route
`backend/src/routes/schiedsrichterStammdaten.ts`, `/schiedsrichter-stammdaten`)
dient als wiederverwendbare Vorlage, gepflegt auf einer **eigenen** Stammdaten-Seite
(`SchiedsrichterStammdatenPage.tsx` + `SchiedsrichterStammdatenVerwaltung.tsx`, eigener
Menüpunkt „Stammdaten → Schiedsrichter" in `App.tsx`) – bewusst **nicht** als Unterabschnitt
der Vereine/Teams-Seite (`StammdatenPage.tsx`), da keine zwingende fachliche Abhängigkeit
besteht (Nutzer-Vorgabe 2026-08-14: erster Wurf hatte es dort mit eingebaut, war nicht
gelungen). Gleiches Rechtemodell wie Vereine/Teams: Lesen für jede Anmeldung, Schreiben
nur Admin/Manager. Referenziert wie die turnierbezogene Variante einen Verein
(optional, neutrale Personen ohne Vereinsbindung sind zulässig). Bewusst
**keine** Referenz-Prüfung beim Löschen (anders als Verein/Team) – die
Übernahme in ein Turnier kopiert die Werte (`importiertAusStammdatenSchiedsrichterId`
als reiner Herkunftsverweis), es gibt keine Live-Verknüpfung, die verwaisen
könnte. In `SchiedsrichterVerwaltung.tsx` zusätzlich zum bestehenden „Meine
Profildaten übernehmen"-Knopf eine Auswahl „Aus Stammdaten übernehmen" (füllt
das Anlege-Formular mit einer beliebigen Stammdaten-Person vor, analog dem
Profil-Knopf). War ursprünglich als Backlog-Punkt "akkreditierte
Schiedsrichter" zurückgestellt, im Zuge des Vereins-Bezugs-Umbaus (siehe oben)
gleich mit umgesetzt, da beide Aenderungen dieselbe Datengrundlage brauchen.

**Paarungs-Priorität bei der Spielplan-Erstellung:** `backend/src/spielplan/paarungen.ts`
erzeugt alle Begegnungen eines Turniers und weist jeder eine `PaarungsPrioritaet` zu
(`verein` > `bundesland` > `neutral`, Gesamtspezifikation Abschnitt 8), die `planung.ts`
beim Einplanen bevorzugt berücksichtigt (Vereins-Duelle/Bundesland-Derbys werden
frühzeitig eingeplant, nicht erst wenn nichts anderes mehr passt). **Vereins-Duelle**
(gleiche `vereinId`) gelten immer; die **Bundesland-Stufe** greift nur, wenn
`Turnierregeln.bundeslandBeruecksichtigen` aktiv ist (Standard „nein" – Eigenheit für
Wettbewerbe mit festem Regionalbezug wie Bundesliga/Deutsche Meisterschaft, siehe
„Turnierregeln als gemeinsamer Typ" oben). Der Bundesland-Abgleich
(`MannschaftImTurnier.bundesland`) normalisiert Groß-/Kleinschreibung und Leerzeichen,
damit ein Tippfehler die Regel nicht stillschweigend aushebelt.

**Schiedsrichter-Zuordnung ist ein bewusster Schritt, kein Automatismus:** ein
Button in der Spielplan-Sicht „Schiedsrichter-Einteilung" ruft
`POST /turniere/:id/schiedsrichter-zuordnung` und erzeugt einen *Vorschlag* je
Spiel (`backend/src/spielplan/schiedsrichterZuordnung.ts`), danach je Spiel per
Dropdown änderbar (`schiedsrichterId` an `Spiel`, via `PUT /spiele/:id`, per
`null` lösbar). Gewichtung (Nutzer-Vorgabe): **P1** (höchste Priorität) – ein
Schiedsrichter pfeift nie das Spiel einer Mannschaft seines eigenen Vereins
(wird nicht vorgeschlagen); **P2** (nachrangig) – möglichst nicht pfeifen,
während eine Mannschaft des eigenen Vereins gleichzeitig auf einem
Parallelfeld spielt. Aufgelöst über die Mannschaften des Turniers (`mannschaftId`
→ `vereinId`), nicht per direktem ID-Vergleich (siehe oben). Beide Konflikte
werden im UI als Hinweis angezeigt (`schiedsrichterKonflikt.ts`).

**Benutzer-Stammdaten → Turnier-Übernahme:** `Benutzer` trägt neben `name`/`email`/`telefon` auch
`vorname`, `lizenzVorhanden`, `vereinVerband`, `adresse` (alle optional, gepflegt unter „Mein
Profil" → Abschnitt „Kontakt- und Stammdaten", `PUT /benutzer/mich`, nicht sicherheitsrelevant →
**ohne** Passwort-Bestätigung). Sie lassen sich ins Turnier übernehmen: **automatisch** – `POST
/turniere` legt die anlegende Person direkt als Turnierleitung-Schiedsrichter aus ihrem Profil an
(nur der normale Anlege-Pfad, **nicht** `/ableiten`, das kopiert aus dem Vorgänger) – **und manuell**
über den Knopf „Meine Profildaten übernehmen" in `SchiedsrichterVerwaltung` (füllt das Anlege-
Formular vor, setzt bewusst **nicht** automatisch die Turnierleitung). `SchiedsrichterImTurnier`
trägt zusätzlich `nurTurnierleitung` (Kennzeichen „pfeift nicht", nur bei `istTurnierleitung`
sinnvoll – Backend setzt es ohne Turnierleitung auf `false` zurück): solche Personen fallen in
`schiedsrichterZuordnung.ts` aus dem Kandidatenpool. Details:
`docs/Protokolle/2026-08-12-benutzer-stammdaten.md`.

**Der Spielplan-Tab hat zwei Sichten** (Umschalter): „Spielplan" (Planung:
Reihenfolge/Zeiten/Status/Hinweis) und die abgespeckte
„Schiedsrichter-Einteilung". Die Spielplan-Tabellen nutzen
`table-layout: fixed` mit festen Spaltenbreiten (`.spalte-*`) plus einer
`min-width` – ohne die kollabieren die nicht bemessenen Mannschaftsspalten auf
schmalen Schirmen; der `.tabellen-wrapper` scrollt dann horizontal.

**Live-Aktualisierung per Polling (kein WebSocket):** Ergebnisverwaltung
(`ErgebnisVerwaltung.tsx`), Token-Ergebniserfassung (`ErgebnisErfassungPage`)
und die öffentliche Seite aktualisieren sich per `setInterval` (10–15 s), aber
**nur** bei `document.visibilityState === "visible"`, plus sofort bei `focus`/
`visibilitychange`. Für die Ergebnis-Eingabefelder kapselt
`frontend/src/useErgebnisEingaben.ts` die Sync-Logik: Zeilen ohne offene
Eigen-Eingabe übernehmen automatisch den Serverwert (so erscheinen Ergebnisse
der jeweils anderen Erfassungs-Seite), offene Eingaben bleiben erhalten und
werden bei zwischenzeitlicher Fremdänderung als Konflikt markiert. Wichtig: der
Dirty-Vergleich läuft gegen den zuletzt gesyncten **Basiswert**, nicht gegen
den aktuellen Server – sonst gälte eine unberührte Zeile fälschlich als
„geändert", sobald der Server sich ändert.

**QR-Codes komplett im Browser erzeugt** (`frontend/src/components/QrCode.tsx`,
Abhängigkeit `qrcode`): für den Ergebnis-Erfassungslink und die öffentliche
Turnierseite. Bewusst lokal – die URL bzw. das Token wird an keinen externen
QR-Dienst geschickt. Download als SVG (skalierbar, für Aushang) und PNG.

**Ausdrucke / PDFs – ein Modell, zwei Ausgaben (clientseitig, nichts serverseitig abgelegt):**
`frontend/src/pdf/dokumente.ts` definiert ein quellen-agnostisches Dokument-Modell (`PdfDokument`)
+ Builder (`baueInfoDokument`/`baueSpielplanDokument`/`baueSchiedsrichterDokument`/
`baueErgebnisDokument`), die **bereits formatierte** Werte bekommen (Datum/Uhrzeit formatiert der
Aufrufer) – so speisen sie intern (volle Turnierdaten, `DruckansichtPage`,
`?doc=info|spielplan|ergebnisse|schiedsrichter`) **und** öffentlich (nur freigegebene Daten,
`OeffentlicheDruckansichtPage`, `?doc=info|spielplan|ergebnisse`) dieselben Dokumente. Das
**Ergebnis-Dokument** zeigt die Spiele **nur des aktuellen Spieltags** (mit Ergebnis), die Tabelle
aber als **Gesamtstand** (bei Wettbewerben summiert – intern via `getTabelle`, öffentlich via
`daten.wettbewerb.gesamttabelle`; sonst die Turniertabelle, Überschrift „Tabelle" statt
„Gesamttabelle"). Aus
dem Modell werden **zwei** Ausgaben erzeugt: `DruckDokument.tsx` rendert **semantisches HTML** (genau
ein `<h1>`, `<h2>` je Abschnitt, echte `<table>`, QR mit lesbarem Ziel-Link) → über den Druckdialog
(„Als PDF speichern") liefert Chrome ein **getaggtes, barrierefreies** PDF; `erzeugeJsPdf.ts` (jsPDF
+ jspdf-autotable, **dynamisch importiert** = Lazy-Chunk) erzeugt den **Direktdownload** (Best-Effort
barrierefrei, aber **ohne** echte Struktur-Tags – jsPDF kann kein PDF/UA). Beide Wege sind bewusst
parallel gebaut (Nutzer entscheidet später, ob einer entfällt). Druck-CSS in `index.css`
(`@media print`) blendet Kopfzeile + `.kein-druck`/`.druck-aktionen` aus; `.druck-seitenumbruch` für
je eine Schiedsrichter-Seite. QR-Ziele: Info → öffentliche Turnierseite, Spielplan/Schiedsrichter →
öffentliche Ergebnisseite (`?tab=ergebnisse`). Schiedsrichter-Blatt: eine Seite je pfeifender Person
(`nurTurnierleitung` ausgeschlossen). Details: `docs/Protokolle/2026-08-12-pdf-ausdrucke.md`.

**Turnier-Logo (je Turnier überschreibbar, als Data-URL):** `Turnier.logoDataUrl` – ein optionales
Logo, das clientseitig verkleinert (`frontend/src/logoBild.ts`, Canvas, max. 256 px lange Kante,
PNG-Data-URL; Upload auf 1 MB begrenzt, Seitenverhältnis bleibt erhalten) und **direkt am
Turnier-Dokument** gespeichert wird (bewusst **keine** separate
Dateiablage – ein allgemeines Datei-Anhänge-Feature am Turnier (z. B. Ausschreibung, Hallenplan)
ist spezifiziert, aber bewusst auf ein späteres Release zurückgestellt). Fehlt es, zeigt die
Komponente `TurnierLogo` das **Standard-Torball-Logo** (`frontend/public/images/torball-logo*.svg`,
theme-abhängig über dieselbe `.logo-hell`/`.logo-dunkel`-Umschaltung wie die Kopfzeile). Angezeigt in
der Turnier-Übersicht (dort auch Hochladen/Zurücksetzen, gesperrt bei abgeschlossenem Turnier) und
auf der öffentlichen Seite (`oeffentlich.ts` liefert `logoDataUrl` immer mit – Branding, nicht
sensibel). Gesetzt/geleert über `PUT /turniere/:id` (`logoDataUrl` bzw. `null`; das PUT hat kein
Schema). **Bewusst (noch) nicht in den PDFs** – für ein späteres Release vorgesehen.

**Turnierregeln als gemeinsamer Typ + Systemkonfiguration:** Die Regel-/
Wertungsparameter (Spielzeit, Pausen, Timeouts, Wertung, `forfaitErgebnis`, …)
liegen im gemeinsamen Typ `Turnierregeln` (`shared/src/types/turnier.ts`), den
**sowohl `Turnier` als auch `Systemkonfiguration` per `extends` tragen** – so
laufen die kopierten Turnierwerte und die Standardwerte nicht auseinander. Die
Standardwerte pflegt der Admin über `/systemkonfiguration` (Route
`backend/src/routes/systemkonfiguration.ts`, UI `StandardregelnPage`): jede
Änderung legt **eine neue Version an** (nie Update, `istAktuell`-Flag), neue
Turniere **kopieren** die aktuelle Version (`erstelltMitKonfigVersion`),
bestehende bleiben unberührt. Wichtig: Die fest verdrahteten Standardregeln
(`STANDARD_TURNIERREGELN`) und die Helfer liegen in `backend/src/konfiguration.ts`
– **nicht in `shared`**, weil das Frontend aus `shared` (CommonJS) keine
Laufzeit-Konstante ziehen könnte (siehe CommonJS-Regel oben). `turnierDefaults()`
in `turnier.ts` liest die Regeln daraus. Bearbeitet werden die Regeln über das
wiederverwendete `TurnierregelnFormular` (Reiter „Regeln" je Turnier via
`updateTurnier`, Standardregeln-Seite via `updateSystemkonfiguration`, und der
Assistenten-Schritt). Die „n. a."-Aktionen der Ergebniserfassung lesen
`turnier.forfaitErgebnis` (Format „Sieger:Verlierer", Fallback „3:0").

**Pause zwischen Spielen fehlte in der Spezifikation komplett (2026-08-20, live vom Nutzer selbst
bemerkt):** `zeitplanung.ts`s `spieldauerMinuten()` enthielt bis dahin nur Spielzeit ×
Halbzeiten + Halbzeitpause – keinen Puffer zwischen zwei aufeinanderfolgenden Spielen auf
demselben Feld, obwohl genau das schon als „konfigurierbare Toleranz" in Abschnitt 8 der
Spezifikation erwähnt war (dort aber nie als eigenes Feld modelliert). Neues Feld
`Turnierregeln.pauseZwischenSpielenMinuten` (Standardwert `10`, Nutzer-Einschätzung: realistisch,
da im Torball nur Netto-Spielzeit gezählt wird und Spiele dadurch üblicherweise länger dauern als
die angegebene Spielzeit) – fließt zusätzlich zur Halbzeitpause in `spieldauerMinuten()` ein
(Backend **und** Frontend-Duplikat `frontend/src/zeitplanung.ts`, `?? 0`-Absicherung für Turniere
ohne das Feld). Wegen des einen gemeinsamen `Turnierregeln`-Typs technisch harmlos, aber
**mechanisch breit gestreut** – betroffen: `STANDARD_TURNIERREGELN`, `TurnierregelnFormular.tsx`
(neues Eingabefeld, gesperrt über denselben `spielzeitGesperrt`-Mechanismus wie
Spielzeit/Halbzeiten/Halbzeitpause), `SpielplanBasis`-Typ + alle drei Stellen, die einen
Schnappschuss davon anlegen (`spielplan.ts`, `turnier.ts` „ableiten", `beispieldaten.ts`),
`spielplanBasisDiff.ts` (neuer Änderungs-Hinweis), die öffentliche Turnierseite
(`oeffentlich.ts`/`OeffentlicheTurnierseitePage.tsx`) sowie `REGEL_FELDER` in `turnier.ts`
(Regeln-gesperrt-Gate bei abgeleiteten Turnieren). Migration bestehender Turniere ohne das Feld
bewusst nicht behandelt (Nutzer-Vorgabe: noch in der alleinigen Testphase, bestehende Test-Spiele
werden ohnehin gelöscht) – `beispieldaten.ts` (Demo-Basisdaten) wurde trotzdem mitgezogen, da die
Demo-Instanz sich nächtlich aus diesen Basisdaten neu aufbaut. Im Browser Ende-zu-Ende verifiziert
(Wert im Formular gespeichert, per `GET .../spielplan-vorschlag` bestätigt: Slot-Abstand
enthält korrekt Spielzeit + Halbzeitpause + neue Pause).

**Anlage-Assistent (mehrstufig, per Route, nicht als Wizard-Komponente):**
Grunddaten (`TurnierAnlegenPage`) → Regeln (`SpielregelnErfassenPage`) →
Mannschaften (`MannschaftenErfassenPage`) → **optional** Schiedsrichter
(`SchiedsrichterErfassenPage`) → Spielplan (`SpielplanErstellenPage`). Der
optionale Schiedsrichter-Schritt hängt am `Turnier.schiedsrichterPlanung`-Flag
(beim Anlegen gewählt). Es gibt **keinen zentralen Wizard-Zustand**: jede Seite
lädt das Turnier selbst und berechnet ihre „Schritt X von N"-Anzeige aus dem
Flag (`? 5 : 4`). Bei einer Änderung des Ablaufs müssen die Schrittzahlen auf
**allen** Seiten mitgezogen werden.

**Basiskonfig-Schnappschuss (`spielplanBasis`):** Beim Persistieren des
Spielplans (`spielplan.ts` POST) wird ein Schnappschuss der spielplan-relevanten
Konfiguration am Turnier abgelegt. `frontend/src/spielplanBasisDiff.ts` vergleicht
den aktuellen Stand damit und listet konkret auf, was sich seither geändert hat
(Modus/Felder/Mannschaften/Zeiten) – angezeigt als Hinweis auf dem Spielplan.
Zusätzlich warnen `TurnierVerwaltenPage`/`MannschaftenListe` proaktiv beim Ändern
von Modus bzw. Mannschaften, solange ein Spielplan existiert.

**Ergebnis-Erfassung speichert sofort (onBlur), kein Speichern-Knopf:** Sobald
beide Tore gültig ausgefüllt sind und das Feld verlassen wird, wird gespeichert.
Ein Konflikt (zwischenzeitlich anderweitig gespeichert) unterdrückt das
Auto-Speichern und bietet zwei Knöpfe „Vorhandenes übernehmen"
(`useErgebnisEingaben.uebernehmeServer`) / „Mit meinem Wert überschreiben". Der
„n. a."-Knopf (Forfait) sitzt direkt beim jeweiligen Team und existiert **nur in
der internen Verwaltung** (`ErgebnisVerwaltung`), nicht auf der externen
Token-Seite (`ErgebnisErfassungPage`).

**Architektur-Bauplan (`docs/architektur-bauplan.html`, 2026-08-22):** eine eigenstaendige
HTML-Seite mit sechs handgezeichneten SVG-Diagrammen (Schichten/Auslieferungsformen,
Modul-Landkarte inkl. der bewussten Duplikate, Request-Pipeline + Berechtigungsmodell,
Datenmodell, die zwei Ergebnis-Wege, Betriebsmodi + Instanz-Kopplung) plus dem Inventar aller
docTypes und den tragenden Regeln. **Einzige Nicht-Markdown-Datei in `docs/`** – SVG laesst sich
dort nicht sinnvoll abbilden; vom BookStack-Push (nur `.md`) daher nicht erfasst. Nutzt dieselben
Farbtokens wie die App (heller Akzent bewusst leicht abgedunkelt: `#2e7d32` auf Panel-Grund ergab
nur 4,45:1). Diagramme sind per Klick vergroesserbar (natives `<dialog>` + Zoom bis 500 %),
Schriftgroesse der Seite ueber `--skala` einstellbar – **die Beschriftungen IN den SVGs skalieren
bewusst nicht mit** (feste Koordinaten, sie wuerden aus ihren Kaesten laufen; dafuer ist die Lupe
da). Beim Klonen eines Diagramms in die Lupe werden die Marker-IDs umbenannt, sonst zeigen die
Pfeilspitzen der Kopie auf die Definitionen des Originals (gleiche ID, erstes Vorkommen gewinnt).
**Ausgeliefert wird die Datei vom Backend** (`backend/src/routes/doku.ts`, `GET /doku/:name` mit
fester Allowlist statt Pfad-Parameter) hinter `requireAuth` – bewusst nicht aus
`frontend/public/`, wo sie fuer jeden abrufbar waere. `requireAuth` statt `requireZugriff`: ein
Turnier-Code genuegt nicht, es braucht ein Konto (wie bei `/ueber` und der Gesamtspezifikation).
Verlinkt auf `/hilfe` in einem Abschnitt, der nur bei bestehender Anmeldung gerendert wird.

**In-App-Hilfe, datengetrennt:** `/hilfe` (`HilfePage`) rendert Inhalte aus
`frontend/src/hilfe/inhalte.ts` (Texte getrennt vom Layout, dreistufig: Kurz →
`<details>`-Abschnitt → verschachteltes „Mehr Infos"). Screenshots gehören nach
`frontend/public/hilfe/` (Alt-Text per Typ erzwungen). Öffentliche/externe Seiten
(öffentliche Turnierseite, Ergebnis-Erfassung per Link) zeigen **kein** globales
`/hilfe`, sondern die Komponente `KontextHilfe`; für nicht angemeldete Besucher
rendert die Kopfzeile (`App.tsx`) dort eine **minimale Variante** (Marke als
reiner Text, keine Nav – behebt zugleich, dass die Marke sonst zur Anmeldung
führte).

**Regel-Prüfung ohne Sperre:** `frontend/src/turnierPruefung.ts` (reine Logik) +
`TurnierPruefung` (Knopf „Turnier prüfen" in der Übersicht) sammeln
Regelverstöße/Auffälligkeiten in einer Liste, **blockieren aber nichts** –
konsistent mit dem Grundsatz „warnen, nicht entscheiden". Neue Prüfungen dort
ergänzen. Der Schiedsrichter-Punkt erscheint bewusst immer (bei ausgeschalteter
Planung als „nicht aktiviert").

**Turnier-Freigabe (`TurnierFreigabe`, Reiter Übersicht):** vergibt/entzieht
`TurnierBerechtigung` an andere Benutzer (Backend-Route existierte längst, nur
die UI fehlte). **Admin kann fremde 2FA deaktivieren** (admin-only Route
`POST /benutzer/:id/2fa/deaktivieren`, eigenes Konto ausgenommen) – für
ausgesperrte Nutzer mit verlorener Authenticator-App. **Zusätzlich pauschaler Zugriff für ALLE
angemeldeten Benutzer** (`Turnier.zugriffFuerAlleBenutzer`, `"lesen"|"schreiben"`, optional):
anders als die einzeln vergebenen `TurnierBerechtigung`-Dokumente gilt das fuer jede angemeldete
Person, auch fuer erst spaeter (z. B. per Selbstregistrierung) hinzukommende Konten – gedacht v. a.
fuer die Demo-Instanz (siehe „Demo-Snapshot/Reset" unten), aber generisch nutzbar. Wird in
`turnierZugriffsstufe()` (`backend/src/auth/turnierZugriff.ts`) **nach** den individuellen
`TurnierBerechtigung`-Pruefungen als Fallback geprueft.

**Systemeinstellungen (`docType: "systemeinstellungen"`, Route `/systemeinstellungen`,
admin-only lesend wie schreibend):** ein **Singleton-Dokument** (feste `_id`
`systemeinstellungen:global`, `backend/src/systemeinstellungen.ts`) für systemweite
App-Einstellungen – bewusst **nicht versioniert** wie `Systemkonfiguration`/Turnierregeln,
weil hier nichts in ein Turnier kopiert wird und es keinen Anwendungsfall für eine alte
Version gibt. Gedacht als Erweiterungspunkt für künftige globale Schalter; aktuell die
**Selbstregistrierung** und der **E-Mail-Versand** (siehe unten): `selbstregistrierungErlaubt` (Default `false`) +
`selbstregistrierungStandardRolle` (`benutzer`/`manager` – **„admin" ist im Schema bewusst
nicht erlaubt**, sowohl Backend-Enum als auch Frontend-Select, damit eine offene
Selbstregistrierung nie automatisch Admin-Rechte vergeben kann). Ist sie aktiviert, kann sich
jede:r unter `/registrieren` ohne Einladung selbst einen Account anlegen (`POST
/auth/registrieren`, öffentlich, prüft Duplikat-E-Mail wie der Einladungs-Flow); die
Login-Seite zeigt dann zusätzlich einen „Jetzt registrieren"-Link (Abfrage
`GET /auth/registrierung-verfuegbar`, öffentlich, analog zu `bootstrap-verfuegbar`). Gedacht
u. a. für eine Demo-Instanz, an der mehrere Tester parallel eigene Accounts brauchen, ohne dass
jemand sie einzeln einladen muss.

**E-Mail-Versand (SMTP) ist seit 2026-08-15 kein `.env`-Wert mehr, sondern Teil der
Systemeinstellungen** (`smtpHost`/`smtpPort`/`smtpUser`/`smtpPasswort`/`smtpAbsender` +
`mailversandAktiv`, Oberfläche unter Admin → Systemeinstellungen → „E-Mail-Versand (SMTP)") –
Nutzer-Vorgabe, analog zum bereits `.env`-freien Mail-Postfach (IMAP-Zugang/Anthropic-Key).
**`mailversandAktiv` ist ein eigener Schalter, unabhängig von vollständig gesetzten
Zugangsdaten:** so lässt sich SMTP eintragen und über den „Verbindung testen"-Knopf
(`POST /systemeinstellungen/smtp-testen`, `nodemailer`s `transporter.verify()`) prüfen, bevor
Einladungs-/Passwort-Reset-Mails tatsächlich live verschickt werden. `smtpPasswort` wird nie über
GET zurückgegeben (nur `smtpPasswortGesetzt`, gleiches Muster wie beim Mail-Postfach).
`backend/src/mail/transport.ts` ist dafür komplett auf Parameter statt `process.env` umgestellt
(`sendeMail(verbindung, optionen)`, analog `imapClient.ts`); `smtpVerbindungAus()`
(`backend/src/systemeinstellungen.ts`) baut daraus die Verbindung oder liefert `undefined`, wenn
nicht aktiviert/vollständig konfiguriert – die drei Aufrufstellen in `routes/benutzer.ts`
(Einladung, admin-ausgelöster Reset, Self-Service „Passwort vergessen") fallen dann weiterhin auf
Link-in-Antwort/Server-Log zurück, unverändert zum bisherigen Verhalten. **Auch der
Mail-Postfach-Bericht-Versand** (`mail/bericht.ts`, an `berichtEmpfaenger`) läuft jetzt über
dieselbe zentrale SMTP-Konfiguration statt einer eigenen – ein Admin pflegt nur noch eine
Zugangsdaten-Stelle für sämtlichen ausgehenden App-Mailversand. Der `torball`-Konsolenbefehl
`konfiguration:setzen` kennt `SMTP_*` entsprechend nicht mehr (Allowlist bereinigt); der
Windows-Installer fragt SMTP beim Ersteinrichten ebenfalls nicht mehr ab.

**Benachrichtigung bei neuem Account** (`Systemeinstellungen.benachrichtigungEmpfaenger`, Nutzer-
Vorgabe): eine feste, optionale Zieladresse (Feld unterhalb des SMTP-Zugangs) bekommt eine kurze
Mail, sobald sich jemand selbst registriert (`POST /auth/registrieren`) oder eine Einladung
annimmt (`POST /benutzer/einladung/:token/annehmen`) – **nicht** bei der Bootstrap-Ersteinrichtung
des allerersten Admin-Kontos. `backend/src/systemeinstellungen.ts::benachrichtigeNeuenAccount()`
buendelt die Logik fuer beide Aufrufstellen (haengt an `smtpVerbindungAus()`, also ebenfalls an
`mailversandAktiv` + vollstaendigen Zugangsdaten) und ist bewusst best effort – ein Fehlschlag wird
nur geloggt (`console.error`, kein `app.log`, da die Funktion ausserhalb eines Request-Handlers
liegt), blockiert aber nie die eigentliche Registrierung/Aktivierung.

**Konfigurierbare Video-URLs (2026-08-17, Nutzer-Vorgabe):** `Systemeinstellungen.videos?:
VideoEintrag[]` (`{schluessel, url}`) statt eines im Code fest verdrahteten YouTube-Links – Auslöser
war ein Tippfehler im ursprünglich hart codierten Link. `frontend/src/videoSlots.ts` definiert die
**bekannten Einbindungsstellen** (aktuell nur `VIDEO_SLOT_STARTSEITE_INTRO`, mit Label +
Beschreibung fürs Admin-Formular) – eine **neue** Einbindungsstelle braucht nur einen neuen Eintrag
dort (erscheint automatisch als Zeile in „Admin → Systemeinstellungen → Video-URLs") und eine
Stelle im UI, die ihre URL per `schluessel` nachschlägt; die Speicherung selbst ist bereits ein
generisches Array, keine Schema-Änderung nötig. `GET /systemeinstellungen/videos` ist bewusst
**öffentlich** (kein Login), anders als die sonst admin-only `GET /systemeinstellungen` – URLs sind
nicht sensibel, werden aber auf öffentlichen Seiten (aktuell die Gäste-Startseite) gebraucht.
`frontend/src/youtube.ts::youtubeEmbedUrl()` wandelt eine beliebige YouTube-URL-Form (`youtu.be/…`
oder `youtube.com/watch?v=…`) in eine `youtube-nocookie.com`-Embed-URL um (setzt erst bei
tatsächlicher Wiedergabe Tracking-Cookies) – liefert `undefined` bei nicht erkannter URL, der
jeweilige Video-Slot wird dann einfach nicht gerendert statt eine kaputte Einbettung zu zeigen.

**Wartungsmodus (`docType: "wartung"`, Singleton-Dokument, eigene Route `/wartung`, eigener Admin-
Menüpunkt „Wartungsmodus"):** bewusst **zwei unabhängige, manuell gesetzte Schalter statt einer
Automatik** (Nutzer-Vorgabe) – keiner schaltet den anderen um. **Ankündigung**
(`angekuendigtAb`/`angekuendigtBis`, beide optional) zeigt nur einen Warnhinweis: auf der
Startseite (`StartRoute` in `App.tsx`, für jede Person sichtbar, auch nicht angemeldete Gäste),
solange der Beginn in der Zukunft liegt, und zusätzlich einen dringlicheren Kurzfrist-Hinweis in
der Kopfzeile für **angemeldete** Personen ab 15 Minuten vorher (`WartungKurzfristHinweis`) – „bitte
Arbeit abschließen, um Datenverlust zu vermeiden". **Sperre** (`aktiv`) blockiert davon unabhängig
die komplette App für alle außer angemeldeten Admins, sowohl im Frontend (`App.tsx` rendert dann
nur `WartungPage` statt der `Routes`) als auch im Backend – doppelt abgesichert, damit ein direkter
API-Aufruf oder ein Frontend-Bug die Sperre nicht umgeht. Der Backend-Teil
(`backend/src/wartung.ts::wartungPreHandler`) wird als `preHandler`-Hook **innerhalb**
`registerApiRoutes()` registriert (nicht global auf der Root-Instanz wie `authPreHandler`) – im
Einzelprozess-Modus (`SERVE_FRONTEND`) ist das ein eigener, per `/api`-Präfix verkapselter
Plugin-Kontext, sodass die Sperre nur die API-Routen trifft und nicht das Ausliefern der
statischen `frontend/dist`-Dateien (sonst könnte die SPA-Hülle selbst während aktiver Wartung
nicht mehr laden). **Bewusst 403 statt 503** als Statuscode für die Sperre: `frontend/src/api.ts`
behandelt 502/503/504 pauschal als „Backend nicht erreichbar" und verwirft dabei jede eigene
Fehlermeldung. Eine feste Ausnahmeliste (`/wartung/status`, `/auth/login`, `/auth/logout`,
`/auth/me` im Backend; `/login`, `/passwort-vergessen`, `/passwort-reset/:token`,
`/ersteinrichtung` im Frontend) bleibt immer erreichbar – sonst könnte sich während aktiver Sperre
niemand mehr als Admin anmelden, um sie wieder aufzuheben. `WartungPage` (die Sperr-Seite selbst)
verlinkt deshalb explizit auf `/login`. Frontend pollt `GET /wartung/status` (öffentlich, kein
Login nötig) alle 30 s bei sichtbarem Tab plus sofort bei `visibilitychange` – analog dem übrigen
Live-Aktualisierung-per-Polling-Muster im Projekt (siehe unten).

**Demo-Snapshot/Reset (`backend/src/demo/`, CLI-Befehle `demo:*`):** die Demo-Instanz bekommt einen
nächtlichen Reset auf CouchDB-Ebene statt eines App-seitigen Löschens. `beispieldaten.ts` erzeugt
einmalig einen festen Satz Demo-Stammdaten (Vereine/Teams, mehrere Turniere inkl. einer
zweigleisigen Bundesliga-Saison mit echter Spieltag-Spiegelung wie bei `/ableiten`, siehe
Datenimport oben) im Besitz eines eigenen **„Demo-Datenpflege"-Kontos** (`docType: "benutzer"`,
Rolle `manager`, bewusst **ohne** `passwortHash` – kann sich nie einloggen, dient nur als
`erstelltVon`-Referenz). `snapshot.ts` (`erstelleSnapshot`/`stelleSnapshotWiederher`) gleicht den
Inhalt der Live-Datenbank mit einer zweiten CouchDB-Datenbank `<COUCHDB_DB>_golden` ab (per-Dokument
`_bulk_docs` mit korrekten `_rev`s statt Loeschen+Neuanlage, um CouchDB-Tombstone-Konflikte zu
vermeiden) – **kein** App-Code loescht/erzeugt hier taeglich Turniere neu, nur zwei Datenbanken
werden angeglichen. Nächtlich per systemd-Timer aufgerufen (`deploy/demo-snapshot-einrichten.sh`).
Alle drei Befehle sind hinter `DEMO_SNAPSHOT_ERLAUBT=true` (`backend/.env`, `schutz.ts`) gesperrt –
**bewusst nie automatisch auf Prod aktiv**, diese Befehle ersetzen/loeschen ganze Datenbestaende.
**Wichtig: `istGeschuetzt()` in `snapshot.ts` entscheidet, was vom Abgleich ausgenommen bleibt** –
zwei unabhängige Regeln: (1) die Instanz-Einstellungs-`docType`s in `NIE_ZURUECKSETZEN` (`session`,
`systemeinstellungen`, `systemkonfiguration`, `kanbanKarte`); (2) **nur** `benutzer`-Dokumente mit
`globaleRolle: "admin"` (Nutzer-Vorgabe, 2026-08-13: ursprünglich waren ALLE Benutzer-Konten
ausgenommen – bewusst verworfen, weil sonst bei aktivierter Selbstregistrierung liegen gebliebene
Spam-/Scam-Accounts sich dauerhaft ansammeln könnten). Dadurch bleibt **nur** der eigene
Admin-Account der Demo-Instanz über jeden Reset hinweg bestehen; das „Demo-Datenpflege"-Konto und
jedes selbst-registrierte Tester-Konto werden wie normaler Inhalt täglich mitzurückgesetzt (das
Demo-Datenpflege-Konto also aus der `_golden`-Datenbank neu erzeugt, sofern es vor dem letzten
`demo:snapshot:erstellen` bereits existierte). `NIE_ZURUECKSETZEN` bewusst als **Ausschluss**- statt
Einschluss-Liste für die Instanz-Einstellungen: ein künftig neuer Inhalts-`docType` landet
automatisch im Reset, ohne diese Liste pflegen zu müssen – nur echte Instanz-Einstellungen müssen
hier bewusst ergänzt werden. **Bei
Änderungen am Datenmodell (`shared/src/types/*`) oder an Business-Logik, die `beispieldaten.ts`
mitnutzt (Spielplan-Erzeugung, `aktuelleTurnierregeln()`, `turnierZugriffsstufe()`), prüfen, ob das
Seed-Skript mitgezogen werden muss** – es baut Dokumente direkt über das Repository auf (nicht über
die HTTP-Routen) und bekommt Typ-/Schema-Änderungen daher nicht automatisch mit, nur über
`tsc`-Fehler beim nächsten Build.

**Entwicklungs-Kanban-Board (admin-only, kein Turnier-Bezug, nur Entwicklungsinstanz):**
eigenständiges Werkzeug zur Organisation der Weiterentwicklung, `docType: "kanbanKarte"` in
derselben CouchDB (`shared/src/types/kanban.ts`, `backend/src/routes/kanban.ts`,
`frontend/src/pages/KanbanBoardPage.tsx`, Route `/entwicklungs-board`, Menü unter „Admin").
**Freischaltung nur über `KANBAN_BOARD_AKTIV=true`** (Env-Flag, gleiches Muster wie
`MAIL_POSTFACH_AKTIV`: öffentlich abfragbares `GET /kanban/verfuegbar` blendet den Menüpunkt
aus, alle übrigen `/kanban`-Routen liefern ohne das Flag 403) – **auf 2026-08-15 umgestellt,
vorher war das Board auf jeder Instanz sichtbar** und ein JSON-Export/-Import (mit manueller
Konfliktauflösung je Karte) glich die Kartenstände zwischen Dev und Prod ab
(`backend/src/kanban/importMerge.ts`, seitdem ersatzlos entfernt). Grund für die Umstellung:
Feedback/Fehlermeldungen aus dem laufenden Betrieb laufen inzwischen über das Mail-Postfach
(unten) herein, das erkannte Anforderungen ohnehin automatisch als Kanban-Karte auf der
Entwicklungsinstanz anlegt – ein eigenes Board auf Prod/Demo samt Abgleich-Mechanismus war
damit überflüssig geworden. Details: `docs/kanban-board.md`. Löschungen sind unwiderruflich
(kein Tombstone/Papierkorb).

**Notizen je Karte (`KanbanKarte.notizen`, `KanbanNotiz[]`):** Aktionen/Gedanken/
Änderungsvorschläge zu einer Karte – bewusst **nicht auf der Karte selbst sichtbar**, nur im
Detail-Dialog einer Karte (`KanbanBoardPage.tsx`, Abschnitt „Notizen" unterhalb des
Bearbeiten-Formulars). Nur **anhängbar** (`POST /kanban/karten/:id/notizen`, eigener Endpunkt statt
über das generische PUT, damit zwei gleichzeitig hinzugefügte Notizen sich nicht überschreiben)
– kein Bearbeiten/Löschen einzelner Einträge, analog einem Kommentarverlauf. `erstelltVonName`
je Notiz kommt vom eingeloggten Account (auch KI-Sitzungen, die über den Admin-Account arbeiten,
z. B. „Claude" auf der Dev-Instanz) – gedacht auch für Einschätzungen/Vorschläge aus einer
Claude-Code-Sitzung, nicht nur menschliche Notizen.

**Karten auf dem Board zeigen bewusst nur das Nötigste (2026-08-15, Nutzer-Vorgabe):** Titel +
Badges (Kategorie/Priorität/KI/Notizen-Anzahl) + die fünf Schnellaktionen (▲▼◀▶✕) – Beschreibung,
Absender und das Bearbeiten-Formular saßen vorher immer sichtbar direkt auf der Karte bzw. in
einem permanent eingeblendeten Formular oben auf der Seite und nahmen dadurch zu viel Platz ein.
Ein Klick auf den Titel (als `<button>` gerendert, nicht die ganze Karte – vermeidet verschachtelte
interaktive Elemente mit den Schnellaktions-Buttons) öffnet ein natives `<dialog>` (`showModal()`,
übernimmt Fokus-Falle + Esc-Handling vom Browser) mit den vollen Details, dem Bearbeiten-Formular
und den Notizen. Das obere Formular auf der Seite dient seitdem nur noch dem Neuanlegen, nicht mehr
dem Bearbeiten. Dialogbreite bewusst 760px statt des CSS-Standards `form { max-width: 420px }`, den
man dafür explizit über `.kanban-detail-dialog form { max-width: none }` aushebeln muss – live als
Bug aufgefallen: Freitext-Felder blieben sonst trotz breitem Dialog schmal.

**Mail-Postfach (admin-only, nur Entwicklungsinstanz, `backend/src/mail/`):** liest per IMAP ein
zentrales Feedback-Postfach der Software (Fehlermeldungen/Lob/Anregungen/Kritik/Spam), fasst neue
Mails per KI (Anthropic, Modell `claude-sonnet-5`) zusammen und legt erkannte Anforderungen
automatisch, aber klar als `kiErstellt: true`/„KI · ungeprüft" markiert (`KanbanKarte`-Felder
`herkunft`/`kiErstellt`/`quellMailId`), im Entwicklungs-Kanban-Board an – zusätzlich ein manueller
„Als Kanban-Karte übernehmen"-Knopf pro Mail, auch ohne KI-Treffer. **Freischaltung nur über das
Env-Flag `MAIL_POSTFACH_AKTIV`** (analog `KANBAN_BOARD_AKTIV`) – bewusst NICHT über die Oberfläche
umschaltbar, weil ein UI-Schalter versehentlich auch auf Prod/Demo aktivierbar wäre. **Alle
übrigen Konfigurationsdaten (IMAP-Host/Port/Benutzer/Passwort, Anthropic-API-Key,
Bericht-Empfänger, Berichtszeit) dagegen bewusst über die Oberfläche** (Singleton-Dokument
`mailPostfachEinstellungen`, `MailPostfachPage.tsx`) statt in `backend/.env` – Nutzer-Vorgabe.
IMAP-Passwort/API-Key liegen unverschlüsselt in CouchDB, write-only (nie über GET zurückgegeben,
gleiches Muster wie das TOTP-Secret) – zwei Test-Knöpfe („Verbindung testen"/„API-Key testen")
prüfen die aktuell im Formular stehenden Werte gegen den echten Server, ohne zu speichern. Die
IMAP-UID wird bewusst **sofort nach dem Einlesen** fortgeschrieben, noch vor der KI-Klassifikation
(`mail/bericht.ts`) – schlägt die Klassifikation fehl, werden Mails beim nächsten Lauf erneut
klassifiziert, aber nicht nochmal per IMAP abgerufen. Täglicher Berichtslauf über `mail/scheduler.ts`
(`setInterval`-Uhrzeitvergleich, keine Cron-Abstraktion im Projekt, analog `sync/checkin.ts`) oder
manuell per Knopf/CLI-Befehl `mail:bericht:erstellen`. `MailBericht` speichert `kiInputTokens`/
`kiOutputTokens` aus `response.usage` für eine grobe Kostenabschätzung direkt im Bericht. Details:
`docs/Protokolle/2026-08-13-mail-postfach.md`.

**Mail-Anhänge (2026-08-16):** `mailparser`s `simpleParser` liefert Anhänge bereits fertig geparst
mit; `imapClient.ts::baueAnhaenge()` filtert auf `contentDisposition === "attachment"` (keine
inline eingebetteten Signatur-Bilder) und speichert sie als Base64-Data-URLs direkt am
`MailNachricht`-Dokument (`anhaenge: MailAnhang[]`, gleiches Muster wie `Turnier.logoDataUrl` –
bewusst keine separate Dateiablage). **`MAX_ANHANG_GESAMT_BYTES` (5 MB je Mail)** begrenzt die
Summe der Anhänge einer Mail – ein einzelner Anhang, der den Deckel sprengen würde, wird
übersprungen (kleinere Anhänge derselben Mail bleiben erhalten), nicht die ganze Mail verworfen.
Bewusst kein zusätzlicher Aufräum-Mechanismus über die ohnehin bestehende Aufbewahrungsfrist
hinaus (Anhänge hängen am Mail-Dokument und verschwinden automatisch mit) – bei diesem
Nutzungsvolumen (kleines internes Feedback-Postfach, keine dauerhafte Anhäufung, da nur an
`"kanban"`-Mails dauerhaft gebunden) kein reales Platzproblem. UI: Spalte „Anhänge" in
`MailPostfachPage.tsx` – Bild-Anhänge als kleine Vorschau, andere Typen als Download-Link, jeweils
mit `download`-Attribut auf den Original-Dateinamen.

**Mail-Postfach ↔ Kanban, drei zusammenhängende Ergänzungen (2026-08-15, Nutzer-Vorgabe):**
(1) Die Aufbewahrungsfrist für erledigte/ignorierte Mails (`MailPostfachEinstellungen.aufbewahrungTage`,
Fallback `STANDARD_AUFBEWAHRUNG_TAGE = 7`) ist über die Oberfläche konfigurierbar statt fest verdrahtet.
(2) Sobald zu einer Mail eine Kanban-Karte entsteht (automatisch oder über „Als Kanban-Karte
übernehmen"), bekommt sie den dritten `MailManuellerStatus`-Wert `"kanban"` statt weiter als „offen" zu
gelten – der zählt aber **bewusst nicht** für `istVeraltet()` (anders als erledigt/ignoriert): die Mail
ist die Quelle/Referenz der Karte und soll nicht verschwinden, solange die Karte noch offen ist.
(3) `KanbanKarte.mailAbsender` speichert den rohen `MailNachricht.von`-Wert zum Zeitpunkt der
Kartenerstellung, **getrennt** von `erstelltVonName`/`erstelltVonEmail` – die meinen bei einer aus einer
Mail erzeugten Karte die Person, die den Berichtslauf ausgelöst bzw. auf „übernehmen" geklickt hat,
nicht den Melder (live aufgefallen: ohne dieses Feld war der tatsächliche Absender einer Meldung auf der
Karte nicht mehr erkennbar). Zusätzlich verlinkt die Karte über das bereits bestehende `quellMailId` per
Link auf `/mail-postfach?mail=<id>`; `MailPostfachPage.tsx` liest den `mail`-Query-Parameter, hebt die
Zeile hervor (`.mail-zeile-hervorgehoben`) und scrollt einmalig dorthin, wobei der Status-Filter dafür
auf „Alle" statt dem sonstigen Default „offen" startet. Wird die verlinkte Mail zwischenzeitlich gelöscht,
zeigt die Seite einen Hinweis statt eines stillen Leerlaufs. **Bekannte Einschränkung:** Es gibt keine
Route, um `MailNachricht.kanbanKartenId` gezielt zurückzusetzen – wird die zugehörige Kanban-Karte
gelöscht, bleibt der Verweis auf der Mail bestehen (zeigt dann „nicht gefunden") und der „Als
Kanban-Karte übernehmen"-Knopf taucht nicht wieder auf.

**Turnier-Lebenszyklus / Abschließen:** `TurnierStatus` ist
`entwurf | aktiv | abgeschlossen | archiviert` (Spez 10.3 entsprechend
aktualisiert). Die Turnierübersicht (`TurnierListePage`) trennt **geplant**
(entwurf/aktiv, inkl. laufend) von **abgeschlossen** (abgeschlossen/archiviert);
der „Neues Turnier anlegen"-Knopf steht oberhalb. Abschließen/Wiederöffnen sind
eigene schreibgeschützte Endpunkte (`POST /turniere/:id/abschliessen` bzw.
`/wieder-oeffnen`), nur mit Schreibzugriff (= Turnierleitung). **Vorbedingung
fürs Abschließen:** jedes Spiel hat ein erfasstes Ergebnis; noch nicht
finalisierte Ergebnisse werden dabei auf „Fertig" (`abgeschlossen`) gesetzt.
**Ist ein Turnier abgeschlossen, sind Inhalte schreibgeschützt** (409 über
`turnierGesperrt()` an den Schreib-Pfaden von turnier/mannschaft/spieler/
schiedsrichter/spiel/spielplan/ergebnis) – bewusst NICHT gesperrt bleiben die
Öffentlich-Freigabe (`oeffentlich*`/`spielernamenOeffentlich`, Whitelist im
turnier-PUT) und das Teilen (`turnierBerechtigung`); beide ändern nichts am
Turnier selbst. **Die Sperre wird im Frontend durchgängig gespiegelt** (nicht nur
serverseitig): `TurnierVerwaltenPage` berechnet `istGesperrt` aus dem Status und
deaktiviert die Turnierdaten-Eingaben aller Reiter – Übersicht (außer den
Freigabe-Checkboxen + „Wieder öffnen"), Regeln-Formular, sowie die Tab-Komponenten
über eine `gesperrt`-Prop: `MannschaftenListe` (gezielt, damit das **Kader-
Ausklappen zum Ansehen** aktiv bleibt), `SchiedsrichterVerwaltung` (ganzer Inhalt
in einem `disabled`-`<fieldset>`), `SpielplanVerwaltung` (Reihenfolge/Zeit/Status
sind schon über den Spiel-Status gesperrt, zusätzlich die Schiedsrichter-
Einteilung) und `ErgebnisVerwaltung` (Ergebnisfelder ohnehin über
`ergebnisAbgeschlossen`; zusätzlich „Alle abschließen" deaktiviert und die externe
Erfassungslink-Sektion ausgeblendet). **Beim Abschließen wird zudem ein aktiver
Ergebnis-Token widerrufen** (`abschliessen`-Endpunkt), damit der externe Link
zurückgesetzt ist. Prüf-Hinweis: über ein `disabled`-`<fieldset>` gesperrte
Controls melden `.disabled === false` (das IDL-Attribut spiegelt nur das eigene
Attribut) – effektive Sperre mit `el.matches(':disabled')` prüfen. Details:
`docs/Protokolle/2026-08-11-turnier-abschliessen.md`.

**Turnier-Metadaten in der Liste (angelegt/bearbeitet/abgeschlossen):** `TurnierListePage` zeigt je
Turnier eine Meta-Zeile – offen: „Angelegt am … von … · zuletzt bearbeitet von …"; abgeschlossen:
„Abgeschlossen am … von …". Die Namen sind am `Turnier` **denormalisiert** (`erstelltVonName`,
`zuletztBearbeitetVonName`, `abgeschlossenVonName`), weil `GET /benutzer` admin-only ist und jeder
Benutzer die Liste sehen soll. **„Zuletzt bearbeitet" umfasst alle Turnier-Änderungen AUSSER der
Ergebnis-Erfassung** (Nutzer-Vorgabe; bewusst **ohne** Zeitpunkt). Umsetzung: `markiereTurnierBearbeitet()`
(`backend/src/turnier/bearbeitet.ts`, best-effort – Metadaten dürfen die eigentliche Operation nie
scheitern lassen) wird von **allen** Schreib-Routen aufgerufen, die Turnierdaten ändern
(mannschaft/spieler/schiedsrichter, spiel-Anpassung/Reihenfolge/Startzeit/Schiedsrichter-Zuordnung,
turnier-PUT, spielplan-POST) – **nicht** aber von den Ergebnis-Pfaden (`ergebnis.ts`,
`ergebnisToken.ts`, spiel `…/abschliessen`). **Wichtig:** jede NEUE turnierbezogene Schreib-Route (außer
Ergebnisse) muss diesen Touch mitziehen, sonst „vergisst" die Liste die Bearbeitung. `abschliessen`
setzt `abgeschlossenVon/Name/Am`; `wieder-oeffnen` setzt `zuletztBearbeitet` und räumt die
Abschluss-Felder wieder ab. **Diese Zuschreibungs-/Identitätsfelder setzt ausschließlich der Server**
(Sicherheitsdurchsicht 2026-08-20): `turnier.ts`s POST/PUT strippen `NUR_SERVER_FELDER` (`_id`/
`docType`/`turnierId`, `erstelltVon*`, `zuletztBearbeitetVon*`, `abgeschlossen*`, `geaendertAm`) per
`ohneServerFelder()` aus `req.body`, bevor sie ihn übernehmen – sonst ließen sie sich über die
Schnittstelle fälschen (POST spreizte `...req.body` über die Server-Felder). `status` bleibt bewusst
erlaubt (entwurf↔aktiv); Abschluss/Archivierung nur über die eigenen Endpunkte.

**Body-Feld-Injektion generell abgesichert (2026-08-20, Backend-Review, Karten A1–A3):** Fastify
reicht unbekannte Body-Felder **standardmäßig durch** (AJV `removeAdditional: false`, kein
`additionalProperties: false` in den Schemata – empirisch verifiziert). Jede Route, die den Body per
`{ ...serverFelder, ...req.body }` oder `{ ...bestehend, ...req.body }` übernimmt, muss deshalb die
server-kontrollierten Felder vorher strippen (`ohneFelder()` aus `backend/src/eingabe.ts`,
`IDENTITAETS_FELDER` = `_id`/`_rev`/`docType`) – sonst ließe sich über `_id`/`docType` ein
Fremd-Dokument **anlegen** (POST mannschaft/verein/team → z. B. Admin-`benutzer`, Rechteausweitung)
oder ein sensibles Feld in ein bestehendes Dokument **injizieren** (PUT `/benutzer/:id`:
`passwortHash`/2FA → Konto-Übernahme). Umgesetzt an mannschaft/verein/team (POST+PUT),
schiedsrichter/spiel/spieler (PUT); `benutzer`-PUT nutzt bewusst eine **Whitelist** (nur
`name`/`globaleRolle`/`gesperrt`). **Bewusst KEIN globales AJV `removeAdditional`/`additionalProperties:
false`**: die Turnier-Routen brauchen Passthrough (Regeln/`oeffentlich*`-Flags), und ein globales
Whitelist-Stripping würde legitime Frontend-Round-trips (ganzes Objekt inkl. `_id`/`_rev`/`docType`
zurückgesendet) still verändern bzw. mit 400 abweisen. **Bei jeder NEUEN Schreib-Route, die
`...req.body` spreizt, `ohneFelder()` mitziehen** (POST-Routen, die das Dokument Feld für Feld
explizit aufbauen – spieler/schiedsrichter/turnierBerechtigung –, sind nicht betroffen). Details:
`docs/Protokolle/2026-08-20-body-feld-injektion.md`.

**Öffentliche Regeln:** fünftes `oeffentlich*`-Flag `oeffentlichRegeln` – zeigt
die Turnierregeln auf der öffentlichen Seite in einem ein-/ausklappbaren Bereich
(`<details>`, eigener Reiter „Regeln"). `forfaitErgebnis` fällt in der Anzeige
auf „3:0" zurück, wenn ein (älteres) Turnier das Feld nicht gesetzt hat.

**Über-/Kontaktseite (`/ueber`, nur intern):** kurze Info zu Idee/Entwicklung
(mit KI) + Entwicklerkontakt. Nur für angemeldete Nutzer (hinter
`GeschuetzteRoute`, Menülink nur bei Anmeldung – bewusst nicht öffentlich,
Scam-/Spam-Schutz). Kontaktdaten stehen aktuell in der Konstante `ENTWICKLER`
(`UeberPage.tsx`); sollen später aus der (noch nicht gebauten) Mail-/
Betriebskonfiguration kommen.

**App-Version:** menschenlesbarer Anzeigetext in `frontend/src/version.ts`
(`APP_VERSION`, aktuell „0.9.0 Beta"), Badge neben der Marke in der Kopfzeile;
die maschinelle semver-Version steht in den `package.json` (`0.9.0-beta`). Bei
einem Versionswechsel **beide** Stellen anpassen.

**Turnier-Datenimport (Spieltag-Ableitung, teilweise umgesetzt):** Ein neues
Turnier lässt sich per `POST /turniere/:id/ableiten` aus einem **abgeschlossenen**
Vorgänger ableiten (zweiter Spieltag, Bundesliga Hin-/Rückspiel): kopiert
Mannschaften (hart gesperrt, `importiertAusMannschaftId`) + Kader (editierbar,
`importiertAusSpielerId`), übernimmt Regeln gesperrt (`regelnGesperrt`,
entsperrbar über `/regeln-entsperren`) und spiegelt den Spielplan (Heim/Auswärts
getauscht). Gruppierung über `wettbewerbId` (+ `basisTurnierId`, `spieltagNummer`).
Die Gesamttabelle über beide Spieltage rechnet `berechneGesamttabelle()` (Mapping
über die Herkunfts-Wurzel auf die Mannschaften des Anzeige-Turniers);
`GET /turniere/:id/tabelle` liefert sie bei gesetzter `wettbewerbId`. Angelegt
über die Frage „Daten übernehmen?" in `TurnierAnlegenPage`. **Öffentliche
Gesamt-/Spieltag-Ansicht (Stufe 4):** `GET /oeffentlich/turniere/:id` liefert bei
Wettbewerbs-Turnieren einen `wettbewerb`-Block; der Ergebnis-Reiter der öffentlichen
Seite zeigt dann die Unter-Navigation „Gesamt | Spieltag 1 | Spieltag 2" (Gesamt =
Summentabelle + Spiele des aktuellen Spieltags, je Spieltag eigene Tabelle/Spiele).
Aggregiert wird bewusst **nur über Spieltage mit eigener `oeffentlichErgebnisse`-
Freigabe** (kein Durchsickern nicht freigegebener Spieltage), Navigation erst ab
zwei freigegebenen Spieltagen. **Noch offen:** die Torschützen-Summe (erst mit
digitalem Protokoll; Herkunft ist bereits vorbereitet). Details:
`docs/Protokolle/2026-08-12-turnier-datenimport.md`.

**Fachliche Referenz:** `docs/torball_gesamtspezifikation.md` ist die
verbindliche Spezifikation für Geschäftsregeln; bei Unklarheiten dort
nachschlagen statt zu raten. `docs/Protokolle/` enthält datierte
Sitzungsprotokolle zu größeren Entscheidungen und dabei gefundenen Bugs.

## Git / Workflow

- Nach jedem `git commit` sofort `git push`, ohne vorher nachzufragen.
- Neue Commits statt `--amend`, außer explizit anders gewünscht.
- Vor dem Committen: `npm run build`, `npm run lint --workspace=frontend`,
  `npm run test --workspace=backend` – alle drei müssen grün sein.
- Commit-Messages auf Deutsch, beschreiben das *Warum*, nicht nur das Was.
- **Keine Zugangsdaten/Secrets in getrackte Dateien** (CLAUDE.md, Doku, Code,
  Tests …) – das Repo wird geteilt/synchronisiert. Test-Logins, Passwörter,
  Tokens, API-Keys gehören in den lokalen Claude-Memory-Ordner (außerhalb des
  Repos) bzw. in die git-ignorierte `backend/.env`, nie ins Repository. Vor dem
  Committen im Zweifel kurz prüfen (`git grep`/`git log -S` nach dem Geheimwert).

## Release-Prozess

Versionsnummer folgt Semantic Versioning (`Major.Minor.Patch`, z. B. `0.9.1`), aktuell mit
`-beta`-Zusatz (`0.9.0-beta`) – der Zusatz fällt erst weg, wenn die Software nicht mehr als
Beta/Produktiv-Test gilt (Nutzer-Entscheidung, kein rein technisches Kriterium). Bislang **kein**
förmlicher Release-Prozess (keine Git-Tags, kein `CHANGELOG.md` vor Version `0.9.0-beta`) – ab
dieser Version gilt der folgende Ablauf:

1. **Versionsnummer festlegen** (Patch = nur Bugfixes, Minor = neue Funktionen, Major =
   einschneidende Änderungen).
2. **Version an beiden Stellen synchron ändern** (sonst zeigt die Kopfzeile eine andere Version
   als die `package.json`s): den vier `package.json` (Root, `shared`, `backend`, `frontend`) sowie
   `frontend/src/version.ts` (`APP_VERSION`, menschenlesbar z. B. „0.9.1 Beta“).
3. **`CHANGELOG.md`** den Abschnitt „Unveröffentlicht“ in einen datierten Versionsabschnitt
   umwandeln, Einträge in einfachen, nutzerverständlichen Worten (kein Rohauszug aus Commit-
   Messages).
4. **Alle Prüfungen grün:** `npm run build`, `npm run lint --workspace=frontend`,
   `npm run test --workspace=backend` **und zusätzlich** `npm run test:integration --workspace=backend`
   (braucht `backend/.env.test.local`, siehe Abschnitt „Befehle“ oben – deckt Tests ab, die
   `npm test` allein mangels CouchDB-Zugang überspringt).
5. **Committen + pushen** (z. B. „Version 0.9.1“).
6. **Git-Tag setzen:** `git tag v0.9.1 && git push --tags` – markiert den Release-Commit
   nachvollziehbar, unabhängig vom jeweils aktuellen `main`-Stand.
7. **Deployen:** `torball-aktualisieren <name> <fe_port> <be_port>` je Instanz bzw. das lokale
   Sammel-Skript für Prod+Demo (siehe „Betrieb / Infrastruktur“ unten).
8. **Verifizieren:** Versions-Badge in der Kopfzeile der laufenden Instanz prüfen, kurzer
   Rauchtest der Kernfunktionen.

## Testdaten

- Eigene Testdaten (Turniere, Mannschaften, Spiele) dürfen jederzeit frei
  gelöscht oder verändert werden, außer im Einzelfall anders angegeben.
- `docs/Archiv/` ist nur für Versionierung/Nachschau gedacht – nicht bearbeiten,
  nicht löschen. Der Ordner ist **git-ignoriert** (nur lokal vorhanden, siehe
  `.gitignore`), taucht also nicht mehr im Repository auf.

## Barrierefreiheit & Theming

- Von Anfang an mitdenken, nicht als Nachrüstung: sichtbarer Fokus-Indikator,
  passende ARIA-Rollen (z. B. Tabs), Tastatur-Bedienbarkeit für jede
  Maus-Interaktion (z. B. ▲/▼-Buttons als Alternative zu Drag & Drop).
- **Textfarbe: nie `--text-muted`/`.feld-hinweis` für Haupttext.** Diese
  gedämpfte Farbe ist nur für echte Nebeninfos gedacht (z. B. ein Hinweis
  direkt unter einem Eingabefeld), nicht für Einleitungssätze oder sonstigen
  Fließtext, der gelesen werden soll. Der Kontrast reicht zwar formal für
  WCAG AA (`--text-muted` auf `--bg`: ca. 5,7:1 im Hellmodus), fühlt sich in
  der Praxis aber merklich schwerer lesbar an - besonders bei der kleineren
  Schriftgröße von `.feld-hinweis` (0.85rem), und diese App ist für eine
  Sportart von/für blinde und sehbehinderte Menschen, Barrierefreiheit ist
  hier kein Nice-to-have. Im Zweifel immer volle Textfarbe (`var(--text)`,
  meist ein `<p>` ohne Sonderklasse) wählen. Schon zweimal unabhängig
  aufgetreten: bei den Hilfe-Themen-Einleitungssätzen (Kommentar „bewusst
  volle Textfarbe" in `index.css`) und bei `FehlerMeldenPage.tsx` - bei jeder
  neuen Seite/Komponente von Anfang an einplanen, nicht erst auf Hinweis hin
  korrigieren.
- **CSS-Klassen, die sowohl auf `<a>`/`<Link>` als auch auf `<button>`
  angewendet werden, brauchen `box-sizing: border-box` explizit**
  (`.button-link`, `.kopfzeile-menue-eintrag`) – `<button>` ist im
  Browser-UA-Stylesheet standardmäßig `border-box`, `<a>` dagegen
  `content-box`; bei identischem Padding wird ein als Button gestyltes
  `<a>` sonst sichtbar höher/breiter als ein echter `<button>` mit
  demselben Text. Ist in dieser Codebase bereits zweimal unabhängig
  aufgetreten – bei einer neuen gemeinsamen Klasse gleich mit einplanen.
- **Löschen-/Entfernen-Buttons: immer `className="button-loeschen"`** (definiert bei
  `.button-sekundaer` in `index.css`) statt nur `color: var(--danger)` zu setzen – der globale
  `button`-Hintergrund ist grün (`--accent`), rotbrauner Text darauf ist praktisch unlesbar (live
  aufgefallen, zuerst am Kanban-Board). `.button-loeschen` setzt transparenten Hintergrund +
  Rahmen/Text in `--danger` (gleiches Umriss-Muster wie `.button-sekundaer`, nur mit `--danger`
  statt `--accent`). Bei einem Icon-Button zusätzlich `symbol-button button-loeschen` (zwei
  Klassen). Der Bestätigungsdialog (`window.confirm(...)`) vor dem eigentlichen Löschen bleibt
  davon unabhängig – jede neue Löschen-Aktion braucht beides: die Klasse UND die Rückfrage.
- **Pflichtfelder werden markiert.** In `.feld`-Formularen automatisch per CSS
  (`.feld:has(input:required, …) > label::after`), in der Turnier-Übersicht
  (Label/Wert-Tabelle) per `.uebersicht-tabelle`-Regel. In reinen Datentabellen
  ohne eigene Feld-Labels (Vereine/Teams/Schiedsrichter/Kader/Mannschaften) wird
  stattdessen der **Spaltenkopf** markiert (`<span className="pflicht-stern">`).
  Neue Pflichtfelder: `required` setzen (`.feld`) bzw. den Spaltenkopf markieren.
- **Standard für Anlege-Formulare in Verwaltungs-Listen** (Stammdaten, Benutzerverwaltung,
  vergleichbare Listen-Seiten): Tabellen-Form statt gestapelter `.feld`-Blöcke – Label **neben**
  (nicht über) dem Eingabefeld, also `.uebersicht-tabelle` in einem `.tabellen-wrapper` (liefert
  die Pflichtfeld-Markierung oben "for free"). Das `<form>` selbst braucht zusätzlich die Klasse
  `.stammdaten-formular`, sonst quetscht das globale `form { max-width: 420px }` (gedacht für
  schmale `.feld`-Formulare wie Login) die Tabelle sichtbar zusammen. Spart bei Formularen mit
  mehreren Feldern deutlich Höhe (Nutzer-Vorgabe 2026-08-14, siehe `VereineVerwaltung.tsx`/
  `TeamsVerwaltung.tsx`/`SchiedsrichterStammdatenVerwaltung.tsx`/`BenutzerverwaltungPage.tsx`) –
  **gilt für jedes künftige Anlege-Formular dieser Art**, nicht nur die genannten Stellen.
  Zusätzlich ab ca. 4–5 Feldern **zuklappbar**, Startzustand **zu** (nicht offen mit
  anschließendem Zuklappen – sonst blitzt das Formular bei jedem Seitenaufruf kurz auf, bevor der
  Lade-Effekt es schließt) und nur bei der allerersten echten Ersterfassung (Liste nach dem ersten
  erfolgreichen Laden tatsächlich leer) automatisch aufklappen; danach entscheidet die Person
  selbst per Umschalter (`aria-expanded`/`aria-controls`, Muster in `VereineVerwaltung.tsx`:
  `erstLadungFertig`-State + `autoEntschieden`-Ref). Kurze Formulare (2–3 Felder, z. B. Team
  anlegen, Benutzer einladen) brauchen die Zuklapp-Mechanik nicht, nur die Tabellen-Form.
- **Tab-Gruppen (`role="tablist"`): immer über die gemeinsame `TabListe`-Komponente**
  (`frontend/src/components/TabListe.tsx`) statt handgebauter Button-Reihen – sie liefert
  Roving-Tabindex plus Pfeil-/Home-/End-Bedienung, die `role="tab"` Screenreadern ankündigt
  (Frontend-Review Teil 3, 2026-08-20; vorher hatten die kleineren Tab-Gruppen nur die Rollen,
  nicht die Bedienung). Ausnahme: die Haupt-Reiter in `TurnierVerwaltenPage` behalten ihre
  eigene, vollständige Umsetzung (inkl. `aria-controls`/`tabpanel`-Verdrahtung). Wichtig:
  `TabListe` nie in einer im Komponentenrumpf definierten Wrapper-Komponente rendern – die
  bekommt bei jedem Render eine neue Identität, remountet und verliert den per Pfeiltaste
  gesetzten Fokus (live beobachtet, siehe Kommentar in `SpielplanVerwaltung.tsx`).
- Farbschema folgt standardmäßig der Systemeinstellung
  (`prefers-color-scheme`), mit manuellem Umschalter (`[data-theme]`) als
  Override. Zusätzlich Tabellendichte/Zeilenabstand (`[data-dichte]`,
  „Standard"/„Schmal") und Inhaltsbreite (`[data-breite]`, „Standard"/„Breit":
  `#root` max-width 960px ↔ 1400px) nach demselben Muster.
- **Zwei-Ebenen-Modell für alle drei Einstellungen** (`frontend/src/theme.ts`,
  `frontend/src/dichte.ts`, `frontend/src/breite.ts`): ein gesetzter kontogebundener
  Standardwert (`Benutzer.standardTheme`/`standardDichte`/`standardBreite`) **hat immer
  Recht** - er wird bei jedem Sitzungsstart (Login wie Wiederherstellen per `/auth/me`)
  angewendet und überschreibt dabei die geräte-/browserlokale Wahl
  (`uebernimmKontoStandards()` in `frontend/src/auth.tsx`). Die lokale Ebene
  (`localStorage`, Seite `/einstellungen`, auch ohne Login erreichbar) gilt dauerhaft
  nur für nicht angemeldete Geräte bzw. Konten ohne gesetzten Standard, angemeldet nur
  bis zum nächsten Sitzungsstart. **Bewusst so herum seit 2026-08-20 (Nutzer-Vorgabe,
  Frontend-Review):** vorher galt „lokal gewinnt, Konto-Standard wird nur ohne lokale
  Wahl übernommen" - da die Übernahme selbst aber als lokale Wahl gespeichert wurde,
  erreichte eine spätere Änderung des Konto-Standards ein Gerät nie mehr. **Ein neues
  solches Zwei-Ebenen-Setting braucht überall dieselben Stellen:** `<name>.ts`
  (localStorage + `[data-*]`), `<Name>Umschalter`, Init in `main.tsx`, Abschnitt in
  `EinstellungenPage`, `Benutzer.standard<Name>` (shared) + Profil-Select +
  `voreinstellungAendern`, `PUT /benutzer/mich` (Body-Typ/Schema-Enum/Handler) und
  `uebernimmKontoStandards`.
- **Initialisierung gehört nach `main.tsx`, nicht in eine Komponente:**
  `themeInitialisieren()`/`dichteInitialisieren()`/`breiteInitialisieren()` werden
  dort vor dem ersten Render aufgerufen (rein lesend, kein `localStorage`-Schreiben).
  Würde man das stattdessen nur beim Mounten von `ThemeUmschalter`/
  `DichteUmschalter`/`BreiteUmschalter` setzen, fehlt das `data-*`-Attribut nach
  einem Reload auf jeder Seite, auf der diese Komponenten nicht eingebunden sind
  (schon einmal genau so live erlebt).

## Datum/Uhrzeit

- Anzeige folgt den Systemeinstellungen des Geräts (kein festes Locale wie
  „de-DE" erzwingen), aber Tag und Monat immer zweistellig mit führenden
  Nullen.

## Turnier-Fachregeln

- Normalfall: 1 Spielfeld, Ausnahmefall: 2. Mehr Felder ergeben erst mit
  Gruppenphasen Sinn (noch nicht umgesetzt).
- Die Software warnt bei Regelverstößen (z. B. Back-to-Back-Spiele), trifft
  aber keine automatischen Entscheidungen – die Turnierleitung darf jede
  Automatik händisch überschreiben.
- Prüfregeln (z. B. „kein Team zweimal im selben Zeit-Slot") müssen sowohl für
  den Spielplan-Vorschlag als auch für den bereits gespeicherten, manuell
  änderbaren Spielplan gelten – nicht nur für die Erst-Erzeugung.

## Benutzer-Fachregeln

- Kein Benutzer-Löschen-Endpunkt: „Sperren" (`gesperrt: true`) ist der laut
  Spezifikation (Abschnitt 25.3) vorgesehene Mechanismus, kein Hard-Delete.
  Für noch nicht aktivierte Accounts (offene Einladung, `hatPasswort: false`)
  gibt es stattdessen **„Einladung erneut senden"** (`POST
  /benutzer/:id/einladung-erneut-senden`, ✉-Symbol-Button in der
  Benutzerverwaltung, nur bei offener Einladung sichtbar) – frischer Token,
  alter wird ungültig. Gedacht für den Fall, dass die Original-Mail nie ankam
  (z. B. weil SMTP zum Einladungszeitpunkt noch nicht eingerichtet war);
  Fallback-Verhalten (Token in der Antwort statt Mail) identisch zur
  Erst-Einladung und zum admin-ausgelösten Passwort-Reset.
- Sensible Felder (Passwort-Hash, 2FA-Secret, Einladungs-/Reset-Token-Hashes)
  dürfen nie über die API zurückgegeben werden - immer über
  `oeffentlichesProfil()` (`backend/src/auth/benutzerProfil.ts`) filtern.
- **Login-Antwortzeit gleich halten** (Sicherheitsdurchsicht 2026-08-20): `/auth/login` ruft an den
  Pfaden, die sonst ohne bcrypt sofort zurückkehren würden (Konto existiert nicht / Konto in
  Abkühlzeit), `verbrenneLoginZeit()` (`backend/src/auth/passwort.ts`, bcrypt-Vergleich gegen einen
  festen Dummy-Hash) auf – sonst verriete die Antwortzeit, ob eine E-Mail registriert ist. Bei einer
  neuen Login-artigen Prüfung dasselbe Muster mitziehen.
- Sensible Selbst-Service-Änderungen am eigenen Account (E-Mail, Passwort,
  2FA deaktivieren) verlangen das aktuelle Passwort zur Bestätigung -
  gilt für jede künftige Erweiterung in diese Richtung, nicht nur die
  bestehenden Felder.
- Globale Rolle und Sperr-Status sind nie über die Selbst-Service-Route
  (`PUT /benutzer/mich`) änderbar, nur über die admin/manager-gated
  `PUT /benutzer/:id` - sonst könnte sich ein Benutzer selbst zum Admin
  machen.
- **`vorname` ist seit 2026-08-16 auch beim Admin-Einladen setzbar** (vorher nur
  über Selbstregistrierung/Ersteinrichtung/„Mein Profil" – ein admin-eingeladener
  Account hatte bis dahin nie einen Vornamen, es sei denn, die Person trug ihn
  nachträglich selbst nach). **Anzeige-Konvention „Vorname Name" (Leerzeichen,
  Vorname zuerst) gilt jetzt einheitlich überall**, wo Vorname+Name zu einem
  String kombiniert werden (Benutzerverwaltung-Liste, Schiedsrichter-Zuordnung im
  Spielplan, Schiedsrichter-„Aus Stammdaten übernehmen"-Auswahl, PDF-Dokument
  „Schiedsrichter-Einteilung") – vorher nutzte die Schiedsrichter-Seite
  uneinheitlich „Name, Vorname" (Komma), das ist bewusst vereinheitlicht worden
  (Nutzer-Vorgabe: Vornamen sind meist eher bekannt als Nachnamen). Reine
  Tabellenspalten-Darstellungen (Name/Vorname nebeneinander, z. B.
  Schiedsrichter-Stammdaten, Schiedsrichter-Verwaltung Haupttabelle) sind davon
  nicht betroffen, nur zusammengesetzte Anzeige-Strings.

## Betrieb / Infrastruktur

- **CouchDB verlangt fuer das Anlegen von Design-Dokumenten (u. a. Mango-Indizes,
  `ensureIndexes()` in `backend/src/db.ts`) Admin-Rechte auf der jeweiligen Datenbank** – ein
  Benutzer, der nur als `members` in `_security` eingetragen ist, bekommt beim ersten Start
  `"Unknown error while saving the design document: forbidden"` und der Prozess stürzt sofort ab
  (`exit-code`-Fehler in systemd). Live erlebt beim ersten echten Produktiv-Deploy: `deploy/
  deploy-instanz.sh` und `deploy/installieren-windows.ps1` trugen den App-DB-Benutzer bisher nur
  als `members` ein. Fix: denselben Benutzer zusätzlich in `admins` eintragen (bleibt trotzdem
  strikt auf genau diese eine Datenbank beschränkt, kein CouchDB-Server-Admin) – in beiden
  Skripten bereits so umgesetzt; bei einer künftigen dritten Provisionierungs-Stelle (weiterer
  Installationsweg, Option B, …) dasselbe Muster verwenden.
- **Git verweigert (auch für `root`, seit neueren Git-Versionen kein automatischer Vorrang mehr)
  jeden Zugriff auf ein Repository, das einem anderen Benutzer gehört** (`"detected dubious
  ownership in repository"`, CVE-2022-24765-Absicherung). Trifft `deploy-instanz.sh`: der erste
  Deploy klont noch als `root` (Verzeichnis gehört zu dem Zeitpunkt `root`), danach wird per
  `chown -R torball:torball` auf den Service-Benutzer umbesitzt – jeder **zweite** Lauf (Update
  über `git fetch`/`reset --hard`, nicht `clone`) lief seither ins Leere, weil das nie zuvor über
  einen echten zweiten Skript-Lauf getestet wurde (alle bisherigen Fixes liefen über manuelle
  Workarounds). Fix: `git -c safe.directory="$DIR" -C "$DIR" fetch/reset` – nur als
  Kommandozeilen-Override für genau diesen Aufruf, keine dauerhafte `~/.gitconfig`-Änderung für
  `root` nötig (die würde für alle künftigen Instanzen mit unterschiedlichen `$DIR` sowieso nicht
  reichen). Bei eigenen Lesezugriffen auf `/opt/torball/<name>` (z. B. über einen unprivilegierten
  Diagnose-Account) gilt dasselbe – dort ebenfalls `-c safe.directory=<pfad>` statt einer
  dauerhaften Konfigurationsänderung verwenden.
- Werte in `backend/.env` mit Sonderzeichen (z. B. `#`) immer in
  Anführungszeichen setzen - unquotiert wird alles ab einem `#` als
  Kommentar abgeschnitten (schwer zu findender Bug, einmal live erlebt:
  ein abgeschnittenes SMTP-Passwort führte zu "Authentication credentials
  invalid").
- Änderungen an `backend/.env` wirken erst nach einem Neustart des
  `npm run dev:backend`-Prozesses (`--env-file` wird nur beim Start
  gelesen) - anders als Quelltext-Änderungen, die automatisch neu geladen
  werden.
- Die CouchDB-Entwicklungsinstanz läuft im LAN des Nutzers (die konkrete Adresse
  steht im Claude-Memory, bewusst nicht im geteilten Repo) - der Rechner, auf dem
  `npm run dev:backend` läuft, muss dieses Netzwerk erreichen können, sonst
  schlagen alle DB-Zugriffe fehl.
- Das Session-Cookie wird nur mit `Secure`-Flag ausgeliefert, wenn
  `COOKIE_SECURE=true` gesetzt ist (`backend/src/auth/plugin.ts`). In Produktion
  hinter HTTPS zwingend `true`; lokal (HTTP) weglassen/`false`, sonst setzt der
  Browser das Cookie nicht und der Login schlägt ohne erkennbaren Grund fehl.
- **Rate-Limiting + Brute-Force-Schutz (2026-08-20, Sicherheitsdurchsicht #2):** `@fastify/rate-limit`
  ist in `backend/src/index.ts` global registriert (Konfiguration zentral in
  `backend/src/rateLimit.ts`): großzügiges globales Limit (`1000/min` je IP, reine Flut-Absicherung –
  bewusst hoch, weil Spielort-Geräte hinter NAT eine IP teilen und das Frontend alle 10–30 s pollt),
  plus strengere Limits an sensiblen Routen über `config.rateLimit` (`SENSIBEL_RATE_LIMIT` 20/10min
  auf registrieren/bootstrap-admin/passwort-vergessen/kopplung-einloesen, `CODE_ANMELDUNG_RATE_LIMIT`
  60/10min auf code-anmeldung). **Login selbst bekommt bewusst kein IP-Limit** – die zeitbasierte
  Konto-Sperre (unten) drosselt Passwort-Raten IP-unabhängig (hinter NAT würde ein IP-Limit einen
  ganzen Spielort blockieren). Damit das Limit die echte Client-IP kennt, setzt `index.ts`
  `trustProxy` aus `TRUST_PROXY` (`ermittleTrustProxy()`); **Default** (unset) vertraut Loopback +
  privaten Netzbereichen – korrekt für externen NPM **und** LAN, von außen nicht fälschbar (die
  `X-Forwarded-For`-Auswertung endet bei der ersten öffentlichen IP). **Fallstrick (live gefixt):**
  `@fastify/rate-limit` *wirft* den Rückgabewert des `errorResponseBuilder`; der globale
  `setErrorHandler` macht daraus `reply.send(error)`, das nur bei einem echten **`Error`-Objekt**
  den `statusCode` (429) übernimmt – ein Plain-Object wurde als **200** mit 429-Body gesendet.
  Deshalb gibt der Builder bewusst ein `Error` zurück. **Zeitbasierte Login-Sperre statt harter
  Sperre:** ab `FEHLVERSUCHE_SCHWELLE = 5` Fehlversuchen setzt `auth.ts` eine eskalierende Abkühlzeit
  `Benutzer.loginKontoGesperrtBis` (bis 30 Min. gedeckelt), keine dauerhafte `gesperrt`-Sperre mehr
  (die war ein DoS-Vektor: fremdes Konto per Falscheingaben dauerhaft aussperrbar). Während der
  Abkühlzeit wird das Passwort nicht geprüft, Antwort bleibt die generische Anmelde-Fehlermeldung
  (keine Enumeration). Erfolgreicher Login/Passwort-Reset/Admin-Entsperren löschen die Abkühlzeit.
  `gesperrt`/`gesperrtGrund` (bewusste Admin-Sperre, Spec 25.3) bleiben unverändert; `"fehlversuche"`
  entsteht nicht mehr neu, wird für Altbestände aber weiter von einem Reset aufgehoben. Details:
  `docs/Protokolle/2026-08-20-rate-limiting-und-login-sperre.md`.
- **Sicherheits-Header (2026-08-20, Sicherheitsdurchsicht #3):** gesetzt an ZWEI Auslieferungswegen –
  backend-seitig als onSend-Hook auf der Root-Instanz (`backend/src/sicherheitsHeader.ts`, deckt API
  + im `SERVE_FRONTEND`-Modus die statischen Frontend-Dateien) UND in der nginx-Site
  (`deploy/deploy-instanz.sh`, im `location /`-Block – bewusst NICHT global, sonst bekämen die vom
  Backend gesetzten `/api`-Header ein Duplikat). Satz: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'` (bewusst
  KEINE Skript-/Style-CSP – würde die Vite-SPA/Google-Fonts/YouTube-Embed brechen), `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy`. **HSTS nur bei `COOKIE_SECURE=true`, ohne
  `includeSubDomains`** (die Instanzen teilen die Parent-Domain `*.blindentorball.de` mit anderen
  Diensten – includeSubDomains würde HTTPS geschwisterweit erzwingen), `max-age` 180 Tage; robusteste
  Stelle bleibt der externe TLS-Endpunkt (NPM). Details:
  `docs/Protokolle/2026-08-20-security-header.md`.
- **Produktions-Installation ist skript-basiert** (`deploy/`): `provision.sh`
  richtet den Debian-Host ein (Node LTS via NodeSource, CouchDB single-node nur
  `127.0.0.1`, nginx, systemd-Template `torball@.service`, Service-User `torball`);
  `deploy-instanz.sh <name> <frontend_port> <backend_port>` rollt je Instanz aus
  (Git-Checkout + Build unter `/opt/torball/<name>`, eigene CouchDB-DB + DB-User,
  `backend/.env`, nginx-Site, systemd-Service) und dient zugleich als Update
  (pull + rebuild + restart). **`REPO_URL` nur beim allerersten Deploy einer neuen Instanz
  nötig** – danach steckt die Git-Adresse im `origin`-Remote des bestehenden Checkouts und wird
  automatisch wiederverwendet (Nutzer-Vorgabe: Update soll ohne wiederholte Repo-Angabe
  funktionieren). **`backend/.env` wird nur bei dieser Erstanlage geschrieben, ein Update lässt
  eine bereits vorhandene Datei unverändert** – live erlebt: das Skript schrieb sie ursprünglich
  bei *jedem* Lauf komplett neu aus einem festen Template (u. a. `DEMO_SNAPSHOT_ERLAUBT=false`,
  `COOKIE_SECURE=false`), wodurch ein `torball-aktualisieren demo` unbemerkt das zuvor von
  `demo-snapshot-einrichten.sh` gesetzte `DEMO_SNAPSHOT_ERLAUBT=true` wieder zurückdrehte. Wer
  einzelne Werte nachträglich ändern will, nutzt `torball konfiguration:setzen` (siehe „Befehle“
  oben) oder bearbeitet die Datei direkt. Prod läuft **API-only** über `npm start`
  (`node --env-file=.env dist/index.js`), nginx serviert das Frontend statisch +
  proxied `/api`. Mehrere Instanzen (prod/demo) auf einem Host über eigenen `PORT`
  + eigene DB. Backend-Routen liegen an der Wurzel (nicht unter `/api`) – der
  Vite-Dev-Proxy **und** die nginx-Site strippen das `/api`-Präfix. Details:
  `docs/Protokolle/2026-08-12-produktiv-installation.md`,
  `docs/installation-konfiguration.md`. **`.sh`-Dateien müssen LF-Zeilenenden
  haben** (erzwungen über `.gitattributes`; CRLF scheitert auf Linux).
- **`deploy-instanz.sh` erzeugt bei jedem Lauf ein downloadbares Quellcode-ZIP**
  (`git archive --format=zip` nach `<DIR>/downloads/torball-quellcode.zip`, über nginx unter
  `/download/` ausgeliefert, stabiler Dateiname statt Versionierung – immer nur der jeweils
  aktuelle Stand). Grund: der interne Gitea-Server ist nur im LAN erreichbar, für die lokale
  Windows-Installation (`Setup.cmd`, siehe unten) an einem Turnierort ohne Zugriff auf
  dieses Netz wäre der Quellcode sonst gar nicht zu bekommen – jede laufende Instanz bietet ihn
  so als Alternative zu `git clone` an (siehe README, Abschnitt „Installation").
- **`FRONTEND_URL` fällt beim Erstanlegen auf die primäre Host-IP zurück, nicht auf `_`**
  (`FRONTEND_HOST` in `deploy-instanz.sh`) – `SERVER_NAME` selbst bleibt für nginx bei `_`
  (korrekter Catch-all), aber `FRONTEND_URL=http://${SERVER_NAME}:${FE_PORT}` hätte ohne diesen
  Fallback wörtlich `http://_:8080` ergeben, weil der optionale 4. Parameter (`server_name`) in den
  dokumentierten Deploy-Befehlen nie mitgegeben wird. Live erlebt (2026-08-15): genau dieser kaputte
  Link stand in einer Passwort-Reset-Mail auf Prod – blieb seit dem allerersten Deploy unbemerkt
  stehen, weil `backend/.env` bei Updates nie überschrieben wird (siehe oben). **Nach dem Umstieg
  auf eine echte Domain/HTTPS muss `FRONTEND_URL` weiterhin manuell per `torball
  konfiguration:setzen --schluessel="FRONTEND_URL" --wert="https://…"` + Neustart aktualisiert
  werden** – der Fallback greift nur beim allerersten Deploy.
- **`deploy/aktualisieren.sh` bündelt System- und App-Update in einem Befehl** (Nutzer-Vorgabe,
  nachdem `apt-get dist-upgrade` und das App-Deploy live verwechselt wurden): ruft `apt-get update`
  + zeigt verfügbare Pakete, fragt **vor** `dist-upgrade` nach (bewusst **ohne**
  `DEBIAN_FRONTEND=noninteractive` – native dpkg-Rückfragen bei Konfigurationsdatei-Konflikten
  sollen interaktiv bleiben, das ist der Punkt, an dem echte Entscheidungen anfallen), prüft danach
  per `/var/run/reboot-required` **und** einem Kernel-Versionsvergleich, ob ein Neustart nötig ist
  und fragt auch dafür nach, statt automatisch neu zu starten. Für den App-Teil delegiert es
  komplett an `deploy-instanz.sh` (dieselben Parameter durchgereicht) – keine doppelte Logik.
  Aktualisiert bewusst **nicht** sich selbst/den umgebenden Checkout (Risiko, ein laufendes
  Bash-Skript durch `git reset --hard` unter sich selbst zu verändern); bei Änderungen an den
  Deploy-Skripten muss vorher manuell `git pull` im Checkout laufen. Damit das nicht in
  Vergessenheit gerät, endet jeder Lauf mit genau diesem Hinweis + fertigem `cd ... && git pull`-
  Befehl (Pfad wird zur Laufzeit ermittelt, kein Platzhalter). **`provision.sh` legt zusätzlich
  einen Symlink `/usr/local/bin/torball-aktualisieren` an** (Schritt `[7/7]`), damit derselbe
  Befehl von jedem Verzeichnis aus aufrufbar ist, nicht nur relativ aus dem Checkout heraus – der
  Symlink zeigt auf die Datei im Checkout, ein späteres `git pull` dort wirkt sich also automatisch
  auch auf den globalen Befehl aus. **Wichtig für `aktualisieren.sh` selbst:** löst seinen eigenen
  Pfad über `readlink -f "${BASH_SOURCE[0]}"` auf statt direkt über `BASH_SOURCE`, sonst würde es
  bei Aufruf über den Symlink `/usr/local/bin` (statt den echten `deploy/`-Ordner) als eigenen
  Ordner annehmen und `deploy-instanz.sh` nicht mehr finden.
- **`deploy/instanz-entfernen.sh <name>` ist das Gegenstück zu `deploy-instanz.sh`** (Nutzer-Vorgabe,
  2026-08-16, für den Fall eines Instanz-Umzugs auf einen neuen Namen): stoppt/deaktiviert den
  systemd-Service, entfernt die nginx-Site, löscht die CouchDB-Datenbank **und** den zugehörigen
  CouchDB-Benutzer (braucht dafür erst dessen aktuelle `_rev` aus `_users` abzurufen, CouchDB
  verlangt die zum Löschen) sowie den kompletten Checkout unter `/opt/torball/<name>` und die
  generierte Passwort-Datei. Bewusst **kein** `--force`/`-y`-Flag – fragt den Instanznamen zur
  Bestätigung nochmal zum Eintippen ab (kein simples „ja/nein", das sich bei ähnlich klingenden
  Namen wie `prod`/`prod-neu` zu leicht versehentlich wegklicken ließe) und weist vorher explizit
  darauf hin, dass Systemeinstellungen dieser Instanz (SMTP-Zugangsdaten, Benachrichtigungs-
  Empfänger, Wartungsmodus, …) nur in dieser einen Datenbank stecken und beim Löschen mit weg sind.
  Externe DNS-/Reverse-Proxy-Einträge (Nginx Proxy Manager) muss die aufrufende Person weiterhin
  selbst anpassen – das kann das Skript nicht wissen.
- **Umgebungs-Banner (`UmgebungsBanner.tsx`) markiert Nicht-Prod-Umgebungen unübersehbar** – gegen
  versehentliches Pflegen von „echten" Daten auf einer Demo-/Entwicklungsinstanz (oder umgekehrt).
  Rein build-zeit-gesteuert, **kein Laufzeit-API-Aufruf**: `import.meta.env.DEV` kommt direkt von
  Vite (`npm run dev:frontend`); `VITE_INSTANZ_NAME` schreibt `deploy-instanz.sh` vor jedem Build
  in ein `frontend/.env` (Wert = der Instanzname, den das Skript ohnehin schon als Parameter
  bekommt, z. B. `demo`/`test`) – auf `prod` sowie beim Windows-Installer (kein `VITE_INSTANZ_NAME`
  gesetzt) erscheint bewusst kein Banner. `frontend/.env` ist über die bestehende `.env`-Regel in
  `.gitignore` automatisch mit abgedeckt, kein zusätzlicher Eintrag nötig. **Zwei Stufen bei
  Nicht-Prod (seit 2026-08-16):** exakt `VITE_INSTANZ_NAME === "demo"` zeigt den spezifischen
  Hinweis auf den automatischen nächtlichen Reset; jeder andere Nicht-Prod-Name (z. B. ein manueller
  Test-Deploy wie `test`) bekommt stattdessen einen generischen „Nicht-Produktivumgebung"-Hinweis
  ohne diese Behauptung – live aufgefallen, als eine Instanz `test` fälschlich den Demo-Reset-Text
  zeigte, obwohl dort gar kein automatischer Reset eingerichtet ist (der läuft nur für `demo`, siehe
  `deploy/demo-snapshot-einrichten.sh`).
- **Interne LAN-Adressen gehören NICHT ins Repo** (Nutzer-Vorgabe): Dev-CouchDB,
  Gitea-Repo, BookStack usw. stehen im Repo nur als Platzhalter (`couchdb-host`,
  `gitea-host`, `bookstack-host`); die konkreten Adressen liegen im Claude-Memory.
- **Lokale Windows-Installation ist ebenfalls skript-basiert** (`Setup.cmd` auf der obersten Ebene
  des entpackten Quellcode-ZIPs/Checkouts → ruft nur `deploy/Installieren-Windows.cmd` auf →
  `deploy/installieren-windows.ps1`, Option A der geplanten Installationswege). `Setup.cmd` existiert
  bewusst zusätzlich (2026-08-19, Nutzer-Vorgabe): nach dem Entpacken des Quellcode-ZIPs sieht man
  auf der obersten Ebene sonst nur den ganzen Repo-Ordnerbaum (`backend/`, `frontend/`, `deploy/`, …)
  – niemand liest dabei erfahrungsgemäß die README, um den Installer unter `deploy/` zu finden.
  `Setup.cmd` ruft per `call` nur `deploy/Installieren-Windows.cmd` auf, das eigentliche Skript
  bleibt dort (funktioniert unverändert, da `installieren-windows.ps1` seinen `$RepoRoot` über
  `$PSScriptRoot` relativ zu seinem eigenen Pfad auflöst – ein reiner Weiterleiter ändert daran
  nichts). Installiert Node
  LTS (winget) + Apache CouchDB als Windows-Dienst (offizieller MSI-Installer, unbeaufsichtigt,
  Prüfsummen-Check) falls nicht vorhanden, legt eine eingeschränkte CouchDB-App-Datenbank +
  -Benutzer an (analog `deploy-instanz.sh`), baut die App und schreibt `backend/.env` +
  Start-/Update-Skript/Desktop-Verknüpfung. Selbst-elevierend (UAC), idempotent. Fragt bei einer
  **Neu**anlage von `backend/.env` interaktiv Port + optionalen SMTP-Versand ab (Default-Wert
  vorgeschlagen, Enter übernimmt ihn) – bei einer bereits vorhandenen `.env` (erneuter Lauf =
  Update) wird nicht erneut gefragt. Für spätere Updates ohne den kompletten Installer (inkl.
  Node-/CouchDB-Prüfung) erneut zu durchlaufen: die mitversionierte `Aktualisieren-Torball.cmd`
  im Projekt-Wurzelverzeichnis (`npm run torball -- aktualisieren`, siehe „Konsolen-Tool" oben und
  „Windows-Installer"-Abschnitt unten) – anders als `Start-Torball.cmd` (weiterhin generiert, in
  `.gitignore`, da ihr Port-Fallbackwert installationsspezifisch ist) kein generiertes Artefakt.
  Dabei aktiviert (`SERVE_FRONTEND=true`) das Backend einen
  **Einzelprozess-Modus**: `backend/src/index.ts` registriert dann `@fastify/static` für
  `frontend/dist` (SPA-Fallback auf `index.html` im `notFoundHandler`, analog zu nginx'
  `try_files`) und registriert alle API-Routen zusätzlich unter einem echten `/api`-Präfix
  (`server.register(registerApiRoutes, { prefix: "/api" })`), das `frontend/src/api.ts` fest
  verdrahtet hat – das übernehmen sonst der Vite-Dev-Proxy bzw. die nginx-Site. **Bewusst ein
  echtes Präfix, kein `rewriteUrl`-Abstreifen** (frühere Umsetzung, per Bugfix ersetzt): ein
  `rewriteUrl`-Hook entfernt das `/api`-Präfix nur bei Anfragen, die es tatsächlich tragen (dem
  Frontend-Fetch-Wrapper) – eine volle Browser-Navigation/Reload auf einen SPA-Pfad ohne
  `/api`-Präfix, der zufällig mit einer registrierten Backend-GET-Route übereinstimmt (z. B.
  `/turniere/:id`), würde dann direkt die API-Route treffen und rohes JSON statt der SPA-Shell
  liefern. Mit echtem `/api`-Präfix kann das strukturell nicht mehr passieren. **Bewusst hinter
  einem Flag** (Default `false`), damit der bestehende Debian/nginx-Produktivbetrieb unverändert
  bleibt. Ein verteilbares MSI/EXE (Option B, für einen späteren Download-Knopf auf der Webseite)
  ist noch offen. Details: `docs/Protokolle/2026-08-12-windows-installer-option-a.md`,
  Bugfix-Hintergrund: „Nebenbefunde" in `docs/Protokolle/2026-08-13-turnier-sync-grundlage.md`.

**Projektordner-Verlegung + Installations-Anleitung (2026-08-21, Nutzer-Fund):** Das Quellcode-ZIP
wird erfahrungsgemäß im Downloads-Ordner entpackt und dort installiert – die komplette
Installation (Programmdateien, `backend/.env`, Ziel der Desktop-Verknüpfung) hängt dann an einem
Ordner, den ein späteres „Downloads aufräumen" mitlöscht. `installieren-windows.ps1` bietet
deshalb als Schritt 0 an (nur ZIP-Installationen ohne `.git`, Standard „ja"), den Projektordner
nach **`C:\Torball-Turniere\App`** zu kopieren und von dort weiter zu installieren – gebündelt
beim übrigen `$TorballOrdner`-Inhalt (CouchDB, Passwortdateien). Nebeneffekt: das ZIP-**Update**
ist damit derselbe Ablauf (neues ZIP irgendwo entpacken, `Setup.cmd`, Verlegung bejahen – der
neue Stand landet über dem alten, `backend/.env` bleibt erhalten, weil sie im ZIP nicht vorkommt;
`AKTUALISIEREN.md` entsprechend angepasst). Bei Ablehnung nur eine Warnung, wenn der Pfad nach
Downloads/Temp/Desktop aussieht. Dazu **zwei laienfreundliche HTML-Anleitungen im
Wurzelverzeichnis** (landen mit im ZIP neben `Setup.cmd`, gleiche selbstständige Gestaltung ohne
externe Abhängigkeiten): `Installations-Anleitung.html` (kompletter Installationsablauf inkl.
aller Installer-Fragen – bei neuen/geänderten Fragen im Installer diese Datei mitziehen) und
`Lokales-Netzwerk-Anleitung.html` (Netzwerk am Turniertag aufbauen: WLAN-Router ohne Internet /
Hallen-WLAN mit Client-Isolation-Warnung / Handy-Hotspot, Helfer-Geräte per Erfassungslink/QR
bzw. Turnier-Codes, Fehlersuche; Nutzer-Wunsch 2026-08-21). Beide verlinken sich gegenseitig; die
In-App-Hilfe (Thema „Lokale Installation") verweist auf beide Dateien im Projektordner.

**Netzwerkzugriff der lokalen Windows-Installation (2026-08-21, Nutzer-Fund):** Der Installer
schrieb immer `HOST=127.0.0.1` – damit war die lokale Installation aus dem LAN **gar nicht**
erreichbar und der Betriebsmodus „Lokales Netzwerk" (Turnier-Codes, Helfer-Erfassung) lief an
einer unsichtbaren Hürde ins Leere. Jetzt: `installieren-windows.ps1` fragt bei der
`.env`-Neuanlage per `Frage-Netzwerkzugriff` (Standard „ja"; bewusst KEIN
`Bestaetige-Systemaenderung`, da eine Ablehnung die Installation nicht abbrechen darf), setzt
entsprechend `HOST=0.0.0.0` oder `127.0.0.1` und legt bei Ja eine Windows-Firewall-Regel für den
App-Port an (`Set-TorballFirewallRegel`, `-Profile Any` – Hallen-WLANs gelten in Windows oft als
„öffentlich"). Bestandsinstallationen mit `HOST=127.0.0.1` bekommen die Frage beim erneuten
`Setup.cmd`-Lauf angeboten (Standard dort „nein"); der Deinstaller räumt die Regel mit ab.
`GET /sync/status` liefert **nur** bei `istLokaleInstallation` zusätzlich `lanErreichbar` (HOST ≠
127.0.0.1) und `netzwerkAdressen` (IPv4 ohne Loopback) – bewusst nicht auf Server-Instanzen
(öffentliche Route, keine internen IPs preisgeben). `TurnierFreigabe.tsx` zeigt bei den
Turnier-Codes darauf aufbauend: Warnung, wenn Netzwerkzugriff deaktiviert ist, bzw. die
tatsächlichen Netzwerk-Adressen, wenn die Sitzung über „localhost" läuft – Links/QR-Codes
übernehmen die Adresse aus der Browserzeile, ein localhost-QR wäre für andere Geräte wertlos.
Spätestens mit der digitalen Protokollierung wird dieser Bereich laut Nutzer ohnehin nochmal
angefasst – das hier ist die bewusst schlanke Lösung für jetzt.

**Windows-Installer: jede Änderung an DIESEM Rechner (nicht am Projektordner selbst) erst erklären
und um Zustimmung fragen, alltagssprachlich statt fachlich (2026-08-19, Nutzer-Vorgabe, zweistufig
entwickelt):** Zielgruppe sind explizit auch technisch wenig versierte Personen. Erster Anlauf war
„gar keine automatische Änderung, nur eine Anleitung zum Selbermachen in einer Admin-Kommandozeile"
– das erwies sich als **zu viel verlangt** für die Zielgruppe (Nutzer-Feedback nach eigenem Test:
„das wird so nicht funktionieren"). Die jetzige Lösung: `Bestaetige-Systemaenderung` (Helper-Funktion
in `installieren-windows.ps1`, ganz oben definiert) zeigt vor jeder System-Änderung einen kurzen
Titel + eine Erklärung („worum geht es") + eine Auswirkung („was bedeutet das für diesen Rechner",
auch wenn die Antwort „praktisch nichts" ist) in Alltagssprache, fragt per J/N (Default J) um
Zustimmung, und **führt die Änderung bei Zustimmung selbst aus** – bei Ablehnung bricht die gesamte
Installation ab, ohne dass diese eine Änderung stillschweigend übersprungen wird. Gilt einheitlich
für **alle drei** System-Änderungen des Skripts, nicht nur den einen Sonderfall: Node.js-Installation
(Schritt 1), CouchDB-Installation (Schritt 2) und – als Sonderfall, der erst zur Laufzeit erkannt
wird – das (Wieder-)Aktivieren der 8.3-Kurznamen-Erzeugung, falls der CouchDB-MSI-Installer (aus
WiX gebaut, auf modernen Windows-Systemen mit deaktivierten Kurznamen) mit Exit-Code 1603 / „Error
1324 ... contains an invalid character" scheitert (Fehlerbild per Exit-Code + „1324" im MSI-Log
erkannt, `Get-Content -Encoding Unicode` nötig, da die Logs UTF-16 sind). Reine Projektordner-Änderungen
(npm install/build, `backend/.env`, Start-/Update-Skripte, Desktop-Verknüpfung) durchlaufen diesen
Zustimmungs-Mechanismus bewusst **nicht** – die sind Kernzweck der Installation selbst, nicht
optionale Eingriffe ins Betriebssystem.

**8.3-Kurznamen-Theorie war nur die halbe Wahrheit – eigentlicher Fix: Installationsordner
verlegen, keine Windows-Einstellung anfassen (2026-08-19, mehrstufig aufgeklärt):** Erster Anlauf
ging davon aus, `NtfsDisable8dot3NameCreation` per Registry setzen und sofort erneut installieren
reiche aus. Ein zweiter Testlauf widerlegte das („kein Neustart nötig" stimmte nicht – dachte
zunächst, ein Neustart würde reichen). Ein **dritter** Testlauf (Nutzer hatte den Rechner
zwischenzeitlich zweimal neu gestartet) widerlegte auch das: derselbe Error 1324 trat weiterhin auf,
obwohl der Registry-Wert nachweislich (`Get-ItemProperty`) auf aktiviert stand und der Neustart
erfolgt war. Direkte Untersuchung auf dem Testrechner (`dir /x C:\` zeigt keinen `PROGRA~1`-Eintrag)
ergab den eigentlichen Grund: **„Program Files" selbst hat auf diesem Rechner nie einen 8.3-Kurznamen
bekommen** (vermutlich seit der Windows-Ersteinrichtung mit deaktivierten Kurznamen) – das
Registry-Umschalten wirkt nur auf *neu* erzeugte Ordner, nicht rückwirkend auf einen bereits
bestehenden Ordner wie „Program Files". `CostFinalize` (die native MSI-Aktion, die Error 1324 wirft)
braucht aber genau dafür einen Kurznamen, weil der CouchDB-Installer standardmäßig dorthin
installiert. Per direkter MSI-Tabellenabfrage (`WindowsInstaller.Installer`-COM-Objekt, `Property`-
und `Directory`-Tabellen: `APPLICATIONFOLDER` als öffentliche, per Kommandozeile überschreibbare
WiX-Eigenschaft, deren Default via `PROGRAMFILESFORSURE` an „Program Files" hängt) und einem
nicht-elevierten Testlauf (`msiexec /i ... APPLICATIONFOLDER=C:\CouchDB\`, brach zwar mangels
Adminrechten mit Exit-Code 1625 ab, aber **ohne** Error 1324 im Log) verifiziert: mit einem
Zielordner außerhalb „Program Files" tritt der Fehler gar nicht erst auf. **Der eigentliche Fix ist
daher, CouchDB in einen eigenen Ordner statt nach „Program Files" zu installieren** (`APPLICATIONFOLDER=`
in `$msiArgs`, mit entsprechendem Hinweis in der `Bestaetige-Systemaenderung`-Erklärung)
– keine Windows-Systemeinstellung nötig, kein Neustart, kein Sonderfall für die Zielgruppe. Der
8.3-Kurznamen-Zustimmungspfad bleibt als reiner Fallback im Code (falls Error 1324 aus einem anderen
Grund an anderer Stelle nochmal auftaucht), sollte aber durch den geänderten Zielordner in der Praxis
nicht mehr greifen. Lehre: eine Auswirkungs-Behauptung wie „kein Neustart nötig" nicht ungeprüft
übernehmen, auch wenn sie plausibel klingt – und bei einem wiederkehrenden Fehlerbild eher die
Ursachen-Annahme selbst hinterfragen (z. B. direkt in der MSI-Datei nachsehen), statt nur den
nächsten naheliegenden Workaround zu versuchen.

**Alles, was der Windows-Installer außerhalb des Projektordners ablegt, gebündelt unter
`C:\Torball-Turniere`** (2026-08-19, Nutzer-Vorgabe – erleichtert späteres manuelles Aufräumen):
die CouchDB-Installation selbst (`APPLICATIONFOLDER=C:\Torball-Turniere\CouchDB\`, siehe oben) sowie
die bisher unter `C:\ProgramData\Torball` liegenden Dateien (Admin-Passwort, App-DB-Passwort,
Installations-Log) liegen jetzt gemeinsam in `$TorballOrdner`. Bewusst direkt unter `C:\` statt im
versteckten/geschützten `C:\ProgramData` – für die Zielgruppe leichter wiederzufinden. Ändert nichts
an der Sicherheit: die einzelne sicherheitsrelevante Datei (Admin-Passwort) bekommt weiterhin per
`icacls` eine eigene, Administratoren-only-ACL, unabhängig vom übergeordneten Ordner.

**Verwaiste CouchDB-Installationsregistrierung: Windows Installer merkt sich einen fehlgeschlagenen
Versuch dauerhaft (2026-08-19, live aufgefallen):** Ein Testlauf, bei dem `msiexec` aus einem
anderen Grund fehlschlug (siehe 8.3-Kurznamen-Historie oben), hatte das Produkt trotzdem bereits bei
Windows registriert – inklusive eines vom CouchDB-Installer selbst falsch gewählten Zielordners
(auf dem Testrechner ein leeres Laufwerk `F:`, aus dessen eigener Laufwerksauswahl-Logik, bevor
`APPLICATIONFOLDER` gesetzt wurde). Jeder weitere Installationsversuch lief seitdem automatisch in
den MSI-„Reparatur"-Modus statt einer Neuinstallation und übernahm dabei den alten, kaputten
Zielordner aus der Registrierung – der `APPLICATIONFOLDER`-Wert im Skript wurde dabei
stillschweigend ignoriert (per `Get-Package -Name "Apache CouchDB"` und MSI-Log verifiziert: „Product
registered: entering maintenance mode"). `installieren-windows.ps1` prüft jetzt vor jeder
CouchDB-Installation per `Get-Package`, ob ein solcher Karteileichen-Eintrag existiert (Produkt
registriert, aber der hinterlegte Zielordner existiert nicht oder ist leer), und bietet über
`Bestaetige-Systemaenderung` an, ihn per `msiexec /x <ProductCode> /quiet` zu entfernen, bevor die
eigentliche (Neu-)Installation startet.

**Tatsächliche Wurzel des Ganzen: eine leere Wechseldatenträger-Laufwerksbuchstabe verwirrt die
installereigene Laufwerksauswahl (2026-08-19, live aufgeklärt):** Auch nach dem Karteileichen-Fix
schlug `CostFinalize` auf dem Testrechner (11 Laufwerksbuchstaben, u. a. mehrere Netzlaufwerke)
weiterhin fehl – per `Win32_LogicalDisk` verifiziert: `F:` war ein **leerer Kartenleser-Steckplatz**
(`DriveType 2 = Removable`, kein Datenträger eingelegt, 0 Byte). Der CouchDB-Installer hat eine
eigene (fehlerhafte) Logik zur Bestimmung von „PROGRAMFILESFORSURE" (eigene WiX-Direktorie, nicht
die MSI-Standardeigenschaft `ProgramFilesFolder`), die diesen leeren Steckplatz als Ziel wählte –
unabhängig vom per `APPLICATIONFOLDER` vorgegebenen Wert, sowohl bei Installation **als auch bei
Deinstallation** (beide durchlaufen `CostFinalize`). Nachdem der Nutzer diesem Laufwerk in der
Datenträgerverwaltung den Buchstaben entzogen hatte, löste dieselbe Logik korrekt auf ein echtes
Laufwerk auf (`S:`, 20 TB frei) – seitdem tritt Error 1324 nicht mehr auf. **Kein Fix in diesem
Skript möglich** (die Laufwerksauswahl passiert intern im MSI-Paket, nicht überschreibbar) – das
war ausschließlich über die Windows-eigene Datenträgerverwaltung lösbar. Falls das Problem bei
anderen Nutzern wieder auftaucht: gezielt nach leeren/medialosen Wechseldatenträger-Buchstaben
suchen (`Get-CimInstance Win32_LogicalDisk`, `DriveType 2` ohne `VolumeName`/Größe).

**Nachwirkung: verwaister Windows-Dienst zeigt noch auf den alten (falschen) Pfad, obwohl die
Dateien schon am richtigen Ort liegen (2026-08-19):** Nach dem Beheben von Karteileiche +
Laufwerksbuchstabe installierten sich die CouchDB-Dateien korrekt nach `$CouchdbInstallDir`, der
bereits registrierte Windows-Dienst „Apache CouchDB" (betrieben über NSSM, Non-Sucking Service
Manager) behielt aber seinen alten `ImagePath` (`sc`/`Win32_Service.PathName`, zeigt auf
`nssm.exe`) **und** die separaten NSSM-eigenen Parameter (`HKLM:\SYSTEM\CurrentControlSet\Services\
Apache CouchDB\Parameters`, `Application`/`AppDirectory`) bei – der MSI-Reparaturlauf registriert
den bereits vorhandenen Dienst offenbar nicht automatisch neu. Folge: Dienststart schlug mit
„Das System kann die angegebene Datei nicht finden" (Ereignis-ID 7000, Service Control Manager)
fehl, `Test-Couchdb` lief in den 60-Sekunden-Timeout. `installieren-windows.ps1` prüft jetzt nach
jeder Installation, ob `Win32_Service.PathName` zum aktuellen `$CouchdbInstallDir` passt, und
korrigiert bei Abweichung (wieder über `Bestaetige-Systemaenderung`) sowohl den SCM-`binPath` als
auch die beiden NSSM-Parameter, bevor der Dienst gestartet wird.

**Unbeaufsichtigter MSI-Installer richtet die CouchDB-Systemdatenbanken nicht ein (2026-08-19, live
erlebt):** Nach erfolgreicher Installation + korrektem App-Benutzer-Passwort scheiterte der
Backend-Start trotzdem mit „Name or password is incorrect" beim allerersten Zugriff auf die
`torball`-Datenbank. Ursache per Diagnose-Skript gefunden: `GET /_users/org.couchdb.user:...`
lieferte nicht 401, sondern **404 „Database does not exist"** – die interne Systemdatenbank
`_users` fehlte komplett. Normalerweise legt der interaktive Fauxton-„Cluster-Setup"-Assistent
(„Single Node Setup") beim ersten Login diese drei Systemdatenbanken (`_users`, `_replicator`,
`_global_changes`) an; der unbeaufsichtigte MSI-Weg dieses Skripts (`ADMINUSER`/`ADMINPASSWORD` als
Installer-Parameter statt des Assistenten) setzt zwar den Admin-Zugang, durchläuft diesen
Einrichtungsschritt aber nie – bestätigt durch `GET /_cluster_setup` → `{"state":"cluster_disabled"}`.
Ohne `_users` kann sich kein regulärer (Nicht-Admin-)Benutzer wie `torball_backend` authentifizieren,
das eigentliche Symptom (401 „Name or password is incorrect") verschleiert damit den wahren Fehler.
Fix: `installieren-windows.ps1` legt jetzt vor dem App-Datenbank-Schritt alle drei Systemdatenbanken
per einfachem `PUT /_users` bzw. `/_replicator` bzw. `/_global_changes` an (idempotent, ein 412 bei
bereits vorhandener Datenbank wird ignoriert) – betrifft **jede** Neuinstallation auf einem frischen
CouchDB, nicht nur den einen Testrechner.

**Node ignoriert `--env-file`-Werte, wenn dieselbe Variable im Prozessumfeld schon existiert
(2026-08-19, live erlebt):** Trotz `PORT=3001` in `backend/.env` startete der Server weiterhin auf
Port 3000 – Node übernimmt laut eigener Dokumentation aus `--env-file` **keine** Werte für
Variablen, die im aufrufenden Prozessumfeld bereits gesetzt sind (auf diesem Testrechner offenbar
eine dauerhaft hinterlegte `PORT`-Umgebungsvariable, Ursache nicht abschließend geklärt). `Start-
Torball.cmd` liest den Port jetzt selbst aus `.env` (`findstr`, siehe Kommentar im generierten
Skript) und setzt ihn per `set "PORT=..."` **explizit im Prozessumfeld**, bevor `node` gestartet
wird – node muss den `.env`-Wert dann gar nicht mehr gegen einen bestehenden überschreiben, weil er
schon korrekt vorliegt. Robuster als die Ursache (die konkrete Herkunft der Fremd-Variable) zu
jagen, und deckt jeden ähnlichen Fall auf einem anderen Rechner mit ab.

**Browser oeffnet erst, wenn die Dienste wirklich antworten (2026-08-22, Nutzer-Fund):**
`Start-Torball.cmd` wartete frueher pauschal `timeout /t 3` und rief dann den Browser auf. Dauerte
der Start laenger (kalter Rechner, frisch hochgefahrenes Windows), landete man auf der
Fehlerseite des Browsers – **und die aktualisiert sich nicht von selbst**, sobald der Server da
ist; der Eindruck bleibt „funktioniert nicht". Jetzt prueft `deploy/warte-auf-dienste.mjs` in
**zwei Phasen** echte Erreichbarkeit (`datenbank`, dann `anwendung`) und der Browser oeffnet erst
danach. Die Reihenfolge ist zwingend: `db.ts` baut die Verbindung beim Start auf und `index.ts`
ruft `ensureIndexes()` **vor** `server.listen()` – ist CouchDB noch nicht erreichbar, beendet sich
der Server-Prozess sofort wieder (bewusstes hartes Scheitern, kein Retry). Umgekehrt gilt
dadurch: **antwortet der Server auf `/`, ist auch die Datenbank bereit** – ein Grund, warum eine
einzige Bereitschaftsabfrage genuegt. Bei Zeitueberschreitung zeigt das Fenster einen
alltagssprachlichen Hinweis (CouchDB-Dienst starten bzw. Server-Fenster in der Taskleiste
ansehen) und bleibt per `pause` offen, statt den Browser ins Leere laufen zu lassen. Die Sonde
zielt bewusst auf `127.0.0.1` statt `localhost` (Windows probiert sonst ggf. zuerst IPv6, waehrend
der Server nur auf IPv4 lauscht). **Wichtig:** `Start-Torball.cmd` wird nur vom Installer
erzeugt – eine bestehende Installation bekommt die Aenderung erst durch einen erneuten
`Setup.cmd`-Lauf, nicht durch `Aktualisieren-Torball.cmd`.

**Server-Fenster startet minimiert mit warnendem Titel (2026-08-19, Nutzer-Vorgabe):** `Start-
Torball.cmd` öffnet das Server-Konsolenfenster über `start "Torball-Turniere-Server - NICHT
SCHLIESSEN!" /min cmd /k ...` statt eines normal sichtbaren Fensters – landet damit nur noch in der
Taskleiste (kein Risiko mehr, es beim Arbeiten aus Versehen wegzuklicken/zu schließen und damit den
Server zu beenden), bleibt aber über die Taskleiste weiterhin erreichbar, falls im Fehlerfall doch
mal die Konsolenausgabe gebraucht wird (bewusst nicht komplett versteckt/als Dienst - gerade in der
Beta-Phase war genau diese Ausgabe wiederholt der einzige Weg, einen Fehler zu diagnostizieren).

**Desktop-Verknüpfung nutzt ein eigenes hochauflösendes Icon (2026-08-19, zweistufig):** Erster
Anlauf zeigte auf `frontend/dist/favicon.ico` (Browser-Tab-Icon) – wirkte auf dem Desktop (dort
i. d. R. 32–48 px groß dargestellt) sichtbar unscharf, da `favicon.ico` nur eine einzige 16×16-
Auflösung enthält und hochskaliert werden musste (Nutzer-Feedback). Fix: `frontend/public/images/
torball-app-icon.ico` – ein selbst erzeugtes **mehrstufiges** Icon (16/32/48/64/128/256 px je als
PNG-Payload im ICO-Container, per `System.Drawing` aus `torball-logo-1024.png` gerendert, siehe
Kommentar an der Datei bzw. `git log` für das Erzeugungsskript – keine Laufzeit-Abhängigkeit,
einmalig erzeugt und mitversioniert) statt des Favicons. Landet wie die anderen `images/`-Assets
unverändert über den Vite-Build nach `frontend/dist/images/`. `installieren-windows.ps1` setzt
`$Shortcut.IconLocation` entsprechend um, fällt auf das Windows-Standard-`.exe`-Symbol zurück,
falls die Datei fehlen sollte.

**`Aktualisieren-Torball.cmd` ist seit 2026-08-19 eine normale, mitversionierte Datei im
Projekt-Wurzelverzeichnis, nicht mehr generiert.** Ihr Inhalt war schon immer rein statisch (kein
installationsspezifischer Wert, nur `cd backend && npm run torball -- aktualisieren`) – `deploy/
installieren-windows.ps1` schrieb sie bisher trotzdem bei jedem Lauf neu aus einem identischen
Heredoc, ganz analog zu `Start-Torball.cmd` (das dagegen weiterhin generiert wird, da dessen Port-
Fallbackwert installationsspezifisch ist). Als normale Datei taucht sie jetzt schon vor der
allerersten Installation auf (auch im per `git archive` erzeugten Quellcode-ZIP), und ein `git
pull`/eine neue ZIP-Version bringt künftige Änderungen daran automatisch mit. `AKTUALISIEREN.md`
(ebenfalls Wurzelverzeichnis) fasst den Update-Weg für Laien zusammen, analog zu `Setup.cmd`s
Rolle für die Erstinstallation.

**Bugfix 2026-08-20: `torball aktualisieren` behauptete faelschlich "Fertig aktualisiert", obwohl
bei einer ZIP-Installation gar kein neuer Quellcode geholt wurde.** Live erlebt: nach mehreren
Feature-Commits (Turnier-Sync-Sperre, neues Regel-Feld, Banner) lief `Aktualisieren-Torball.cmd`
auf einer ZIP-basierten (nicht Git-) lokalen Installation "erfolgreich" durch, die neuen Funktionen
fehlten aber komplett - der Befehl baute nur den unveraenderten Alt-Stand neu, da `git pull` bei
fehlendem `.git`-Ordner ausschliesslich uebersprungen wird (mit einer leicht zu uebersehenden
einzeiligen Konsolenmeldung, `aktualisieren()` in `backend/src/cli/torball.ts`). Fix: die
Erfolgsmeldung ist jetzt an `istGitRepo` gekoppelt - im ZIP-Fall erscheint stattdessen ein
deutlich hervorgehobener, mehrzeiliger Block ("ACHTUNG: Der Quellcode wurde NICHT aktualisiert!")
mit den konkreten naechsten Schritten (neues ZIP herunterladen, `backend/.env` uebernehmen,
`Setup.cmd` erneut ausfuehren). Betrifft `torball-aktualisieren` auf dem Server (dort immer ein
Git-Checkout, also irrelevant) nicht, nur den lokalen Windows-Installationsweg.

**`Setup.cmd` erneut ausfuehren aktualisiert jetzt auch (2026-08-20, Nutzer-Nachfrage):** Bisher
machte `installieren-windows.ps1` selbst nirgends einen `git pull` - ein erneuter Lauf baute bei
einer Git-Installation nur den ohnehin schon im Ordner liegenden (ggf. veralteten) Stand neu, ohne
neuen Code zu holen (bei einer ZIP-Installation aendert das nichts, siehe Bugfix oben - dort gibt
es ohnehin nichts nachzuladen). Naheliegende, aber vorher nicht erfuellte Erwartung: „nochmal
installieren" sollte auch aktualisieren. Fix: vor dem Bauen (Schritt 4/6) jetzt derselbe `git
pull`-Versuch wie in `torball aktualisieren` (nur falls `.git` vorhanden) - ohne
`Bestaetige-Systemaenderung`-Rueckfrage, da eine reine Projektordner-Aenderung (kein
Systemeingriff, siehe Abgrenzung oben).

**Deinstaller fürs lokale Windows-Setup (`Deinstallieren-Torball.cmd` → `deploy/
deinstallieren-windows.ps1`, 2026-08-19):** Gegenstück zu `deploy/instanz-entfernen.sh` auf der
Linux-Server-Seite, war zuvor bewusst zurückgestellt. Nutzt dasselbe Erklären-und-Zustimmen-Muster
wie der Installer (`Bestaetige-Systemaenderung`/`Frage-OptionalerSchritt`, Alltagssprache statt
Fachbegriffen) – **mit einem wichtigen Unterschied:** eine Ablehnung bricht hier NICHT die gesamte
Deinstallation ab (anders als beim Installer, wo ein fehlender Baustein die Installation unmöglich
macht), sondern überspringt nur diesen einen, für sich sinnvollen Schritt – jemand kann so z. B. nur
die Programmdateien entfernen und CouchDB/Node.js bewusst auf dem Rechner belassen, falls unklar
ist, ob sie noch von anderer Software gebraucht werden (Standardantwort deshalb bei jeder Frage
„nein", nicht „ja" wie beim Installer). Vier unabhängige Schritte: (1) Desktop-Verknüpfung +
generierte `Start-Torball.cmd` – ohne Rückfrage, reine Aufräumarbeit; (2) `backend/.env` +
`node_modules`/`dist`-Ordner – mit Rückfrage, da Zugangsdaten enthalten; (3) CouchDB (Dienst +
Programm per `msiexec /x` über `Get-Package`, analog der Ghost-Erkennung im Installer, plus
komplettes Löschen von `C:\Torball-Turniere`) – mit **deutlicher** Warnung, dass das ALLE
gespeicherten Turnierdaten unwiderruflich mitlöscht; (4) Node.js (`winget uninstall`) – mit
Warnung, dass andere Software auf demselben Rechner ebenfalls Node.js brauchen könnte. Der
Projektordner selbst wird nie automatisch gelöscht (das Skript liegt selbst darin) – bleibt der
Person zum manuellen Aufräumen überlassen (z. B. Papierkorb).

## Dokumentation

- Größere fachliche oder technische Entscheidungen als Protokoll unter
  `docs/Protokolle/` festhalten (Datum + Thema im Dateinamen), inklusive der
  tatsächlich ausgeführten Befehle – nicht nur das Endergebnis.
- `docs/torball_gesamtspezifikation.md` ist die fachliche Referenz; bei
  Unklarheiten dort nachschlagen oder direkt fragen statt zu raten.
- Die Dateien direkt unter `docs/` (nicht `Archiv/`, nicht `Protokolle/`)
  sind laut `docs/README.md` die führende Fassung und werden mit `node
  scripts/bookstack-push.mjs` nach BookStack gespiegelt – Änderungen gehören
  hier ins Repo, nicht direkt in BookStack. **Die `scripts/bookstack-*`-Dateien
  liegen bewusst nur lokal auf der Entwicklungsinstanz** (git-ignoriert, siehe
  `.gitignore`) – ein frischer Checkout hat sie nicht; der BookStack-Sync ist
  damit kein Schritt, der auf jeder Instanz möglich/nötig ist.

## Browser-Tests (Vorschau-Tools)

Beim Verifizieren von Frontend-Änderungen über die Browser-Vorschau-Tools
sind hier mehrfach dieselben Stolperfallen aufgetreten:

- **Backend-Port ist per `PORT`-Env konfigurierbar, Default 3000** (`backend/src/index.ts`;
  `HOST` analog, Default `0.0.0.0`). In der Entwicklung ohne `PORT` bleibt es bei 3000, der
  Vite-Proxy zielt dorthin (`frontend/vite.config.ts`) – deshalb `autoPort: false` beim Backend in
  `.claude/launch.json`. In Produktion bekommt jede Instanz ihren eigenen `PORT` (mehrere Instanzen
  auf einem Host, siehe `deploy/` + `docs/Protokolle/2026-08-12-produktiv-installation.md`). Läuft parallel schon ein Dev-Server auf 3000
  (z. B. eine andere Claude-Sitzung), lässt sich keine zweite isolierte Instanz
  starten; erst den belegenden Prozess stoppen. Das Backend braucht keine
  Browser-Erreichbarkeit (nur der Vite-Dev-Server spricht es über den Proxy an) –
  im Notfall kann man es daher regulär als Prozess auf 3000 starten und nur das
  Frontend über `preview_start` laufen lassen.
- `computer`-Klicks (`left_click`/`type`) landen in dieser Umgebung nicht
  zuverlässig auf dem Zielelement (Symptom: `screenshot` schlägt mit "the
  Browser pane is not displayed" fehl) - nach einem Klick immer mit
  `document.activeElement` (via `javascript_tool`) prüfen, ob wirklich das
  erwartete Element fokussiert wurde, statt dem Klick blind zu vertrauen.
- Für rein programmatisches Fokussieren müssen `.focus()` und `.blur()`
  (via `javascript_tool`) in **getrennten** Tool-Aufrufen erfolgen, nicht im
  selben Skript hintereinander - sonst hat React keine Zeit, den durch
  `.focus()`/ein vorheriges `input`-Event ausgelösten State-Update zu
  committen, bevor der (dann veraltete) `onBlur`-Handler feuert.
- **Der Vite-Watcher verpasst per Skript (z. B. Python `io.open(...).write`) geschriebene
  Frontend-Dateien gelegentlich** – der Dev-Server liefert dann trotz Browser-Reload den alten
  Transformations-Cache (am 2026-08-21 zweimal live erlebt: eine Änderung war im Working Tree und
  im Build, aber der Nutzer sah im Dev-Server weiter den alten Stand). Vor dem Verifizieren/Melden
  einer skriptgeschriebenen Frontend-Änderung deshalb den tatsächlich servierten Quelltext
  gegenprüfen (`fetch("/src/…/Datei.tsx")` im Browser und auf ein neues Codefragment testen);
  fehlt es, die Datei einmal `touch`-en – das stößt den Watcher zuverlässig an.
- `read_console_messages` liefert die komplette Historie seit Sitzungsbeginn
  zurück, nicht nur aktuelle/neue Meldungen - ein alt aussehender Fehler
  kann von einer laengst behobenen HMR-Zwischenpanne stammen, nicht vom
  aktuellen Code-Stand.
- Für Wertevergleiche/Layout-Messungen `javascript_tool`
  (`getBoundingClientRect()`, `getComputedStyle()`) und `fetch()` gegen die
  eigene API zuverlässiger als Screenshots, die in dieser Umgebung öfter
  fehlschlagen.

## Berechtigungsmodi (`.claude/settings.json`)

`.claude/settings.json` steuert, welche Aktionen ohne Rückfrage laufen dürfen
(`permissions.defaultMode` + `allow`/`deny`-Listen). Die Datei selbst ist
strenges JSON und erlaubt keine `//`-Kommentare – deshalb hier die Übersicht
der Modi, die Claude Code kennt:

| Modus | Verhalten |
|---|---|
| `default` | Fragt bei praktisch jeder Aktion außer reinen Lesebefehlen nach |
| `acceptEdits` | Datei-Änderungen laufen automatisch durch; alles andere (Bash etc.) wird weiterhin abgefragt, außer explizit in `allow` gelistet |
| `plan` | Nur Erkunden erlaubt, jede Änderung blockiert, bis sie freigegeben wird |
| `auto` | Nichts Routinemäßiges wird abgefragt, ein Sicherheits-Check läuft im Hintergrund mit (braucht passenden Plan/Modell) |
| `dontAsk` | Nichts außer explizit vorab Freigegebenem läuft; alles andere wird automatisch abgelehnt (z. B. für CI) |
| `bypassPermissions` | Fragt gar nicht mehr nach (außer expliziten `deny`-Regeln) – nur in isolierten Containern/VMs sinnvoll, nicht hier |

Aktuell eingestellt: `bypassPermissions` (für unbeaufsichtigtes Arbeiten),
mit einer `allow`-Liste für die üblichen Entwicklungsbefehle (`npm run *`,
`npm install *`, `git status/diff/log/add/commit/push`) und einer
`deny`-Liste für riskante Befehle (Force-Push, `git reset --hard`,
`git clean`, `rm -rf`), die unabhängig vom Modus greift.

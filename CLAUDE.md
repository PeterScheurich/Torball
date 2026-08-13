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
Turnier-Sync unten). Zwei optionale gehashte Felder direkt am `Turnier`-Dokument
(`turnierleitungCodeHash`/`spielleitungCodeHash`, analog `passwortHash` – kein
eigener docType, da nie mehr als zwei Codes pro Turnier). Setzen/Ändern der
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

**Zwei parallele Wege zum Spielergebnis, nur einer ist umgesetzt:** Ein
Turnier ist entweder `protokollierungsart: "manuell"` (Endergebnisse per
Formular oder per Token-Link ohne Login, `backend/src/routes/ergebnis.ts` +
`ergebnisToken.ts`, Tabellenberechnung in `backend/src/ergebnisse/tabelle.ts`)
oder `"digital"` (vollständiges Live-Ereignisprotokoll je Wurf/Foul/Tor). Nur
der `manuell`-Pfad existiert bisher – der `digital`-Pfad ist in der
Spezifikation (Abschnitt 22) beschrieben, aber noch nicht gebaut.

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
Turnier-Löschen mitlöschen; beim Mannschaft-Löschen nur die optionale
`mannschaftId`-Referenz lösen (der Schiedsrichter bleibt bestehen). Der
`turnier.ts`-Delete löscht damit `mannschaftImTurnier` + `spieler` +
`schiedsrichterImTurnier` + `spiel` kaskadierend (Integrationstest deckt das
ab, überspringt aber ohne `COUCHDB_*`).

**Schiedsrichter-Zuordnung ist ein bewusster Schritt, kein Automatismus:** ein
Button in der Spielplan-Sicht „Schiedsrichter-Einteilung" ruft
`POST /turniere/:id/schiedsrichter-zuordnung` und erzeugt einen *Vorschlag* je
Spiel (`backend/src/spielplan/schiedsrichterZuordnung.ts`), danach je Spiel per
Dropdown änderbar (`schiedsrichterId` an `Spiel`, via `PUT /spiele/:id`, per
`null` lösbar). Gewichtung (Nutzer-Vorgabe): **P1** (höchste Priorität) – ein
Schiedsrichter pfeift nie das Spiel der eigenen Mannschaft (wird nicht
vorgeschlagen); **P2** (nachrangig) – möglichst nicht pfeifen, während eine
eigene Mannschaft gleichzeitig auf einem Parallelfeld spielt. Beide Konflikte
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
Dateiablage – die ist zurückgestellt, siehe [[project-offene-dateianhaenge]]). Fehlt es, zeigt die
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
Version gibt. Gedacht als Erweiterungspunkt für künftige globale Schalter; aktuell nur die
**Selbstregistrierung**: `selbstregistrierungErlaubt` (Default `false`) +
`selbstregistrierungStandardRolle` (`benutzer`/`manager` – **„admin" ist im Schema bewusst
nicht erlaubt**, sowohl Backend-Enum als auch Frontend-Select, damit eine offene
Selbstregistrierung nie automatisch Admin-Rechte vergeben kann). Ist sie aktiviert, kann sich
jede:r unter `/registrieren` ohne Einladung selbst einen Account anlegen (`POST
/auth/registrieren`, öffentlich, prüft Duplikat-E-Mail wie der Einladungs-Flow); die
Login-Seite zeigt dann zusätzlich einen „Jetzt registrieren"-Link (Abfrage
`GET /auth/registrierung-verfuegbar`, öffentlich, analog zu `bootstrap-verfuegbar`). Gedacht
u. a. für eine Demo-Instanz, an der mehrere Tester parallel eigene Accounts brauchen, ohne dass
jemand sie einzeln einladen muss.

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

**Entwicklungs-Kanban-Board (admin-only, kein Turnier-Bezug):** eigenständiges
Werkzeug zur Organisation der Weiterentwicklung, `docType: "kanbanKarte"` in
derselben CouchDB (`shared/src/types/kanban.ts`, `backend/src/routes/kanban.ts`,
`frontend/src/pages/KanbanBoardPage.tsx`, Route `/entwicklungs-board`, Menü nur
für Admins). Abgleich Dev↔Prod ohne zentralen Server per **JSON-Export/-Import**:
Export überall, schreibender **Import nur wenn `KANBAN_SYNC=true`** (Env-Flag, nur
Dev-Instanz) – sonst 403 + Button ausgeblendet. Import ist **zweistufig**
(`/kanban/import/vorschau` + `/kanban/import/anwenden`): Merge je stabiler
`kanbanId`, **kein automatisches Last-Write-Wins** – inhaltliche Konflikte werden
im UI je Karte zur Entscheidung vorgelegt (lokal/eingehend), der neuere Stand ist
nur markiert. Reine Logik + Tests in
`backend/src/kanban/importMerge.ts(.test.ts)`. Details und späterer Umstieg auf
CouchDB-Replikation: `docs/kanban-board.md`. Löschungen syncen bewusst nicht
(kein Tombstone).

**Mail-Postfach (admin-only, nur Entwicklungsinstanz, `backend/src/mail/`):** liest per IMAP ein
zentrales Feedback-Postfach der Software (Fehlermeldungen/Lob/Anregungen/Kritik/Spam), fasst neue
Mails per KI (Anthropic, Modell `claude-sonnet-5`) zusammen und legt erkannte Anforderungen
automatisch, aber klar als `kiErstellt: true`/„KI · ungeprüft" markiert (`KanbanKarte`-Felder
`herkunft`/`kiErstellt`/`quellMailId`), im Entwicklungs-Kanban-Board an – zusätzlich ein manueller
„Als Kanban-Karte übernehmen"-Knopf pro Mail, auch ohne KI-Treffer. **Freischaltung nur über das
Env-Flag `MAIL_POSTFACH_AKTIV`** (analog `KANBAN_SYNC`) – bewusst NICHT über die Oberfläche
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
Abschluss-Felder wieder ab.

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
- **CSS-Klassen, die sowohl auf `<a>`/`<Link>` als auch auf `<button>`
  angewendet werden, brauchen `box-sizing: border-box` explizit**
  (`.button-link`, `.kopfzeile-menue-eintrag`) – `<button>` ist im
  Browser-UA-Stylesheet standardmäßig `border-box`, `<a>` dagegen
  `content-box`; bei identischem Padding wird ein als Button gestyltes
  `<a>` sonst sichtbar höher/breiter als ein echter `<button>` mit
  demselben Text. Ist in dieser Codebase bereits zweimal unabhängig
  aufgetreten – bei einer neuen gemeinsamen Klasse gleich mit einplanen.
- **Pflichtfelder werden markiert.** In `.feld`-Formularen automatisch per CSS
  (`.feld:has(input:required, …) > label::after`), in der Turnier-Übersicht
  (Label/Wert-Tabelle) per `.uebersicht-tabelle`-Regel. In reinen Datentabellen
  ohne eigene Feld-Labels (Vereine/Teams/Schiedsrichter/Kader/Mannschaften) wird
  stattdessen der **Spaltenkopf** markiert (`<span className="pflicht-stern">`).
  Neue Pflichtfelder: `required` setzen (`.feld`) bzw. den Spaltenkopf markieren.
- Farbschema folgt standardmäßig der Systemeinstellung
  (`prefers-color-scheme`), mit manuellem Umschalter (`[data-theme]`) als
  Override. Zusätzlich Tabellendichte/Zeilenabstand (`[data-dichte]`,
  „Standard"/„Schmal") und Inhaltsbreite (`[data-breite]`, „Standard"/„Breit":
  `#root` max-width 960px ↔ 1400px) nach demselben Muster.
- **Zwei-Ebenen-Modell für alle drei Einstellungen** (`frontend/src/theme.ts`,
  `frontend/src/dichte.ts`, `frontend/src/breite.ts`): geräte-/browserlokal
  (`localStorage`, Seite `/einstellungen`, auch ohne Login erreichbar) hat immer
  Vorrang vor dem kontogebundenen Standardwert (`Benutzer.standardTheme`/
  `standardDichte`/`standardBreite`, wird beim Login nur übernommen, wenn auf dem
  Gerät noch keine eigene Wahl existiert - siehe `seedeVoreinstellungen()` in
  `frontend/src/auth.tsx`). **Ein neues solches Zwei-Ebenen-Setting braucht
  überall dieselben Stellen:** `<name>.ts` (localStorage + `[data-*]`),
  `<Name>Umschalter`, Init in `main.tsx`, Abschnitt in `EinstellungenPage`,
  `Benutzer.standard<Name>` (shared) + Profil-Select + `voreinstellungAendern`,
  `PUT /benutzer/mich` (Body-Typ/Schema-Enum/Handler) und `seedeVoreinstellungen`.
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
- Sensible Felder (Passwort-Hash, 2FA-Secret, Einladungs-/Reset-Token-Hashes)
  dürfen nie über die API zurückgegeben werden - immer über
  `oeffentlichesProfil()` (`backend/src/auth/benutzerProfil.ts`) filtern.
- Sensible Selbst-Service-Änderungen am eigenen Account (E-Mail, Passwort,
  2FA deaktivieren) verlangen das aktuelle Passwort zur Bestätigung -
  gilt für jede künftige Erweiterung in diese Richtung, nicht nur die
  bestehenden Felder.
- Globale Rolle und Sperr-Status sind nie über die Selbst-Service-Route
  (`PUT /benutzer/mich`) änderbar, nur über die admin/manager-gated
  `PUT /benutzer/:id` - sonst könnte sich ein Benutzer selbst zum Admin
  machen.

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
- **Produktions-Installation ist skript-basiert** (`deploy/`): `provision.sh`
  richtet den Debian-Host ein (Node LTS via NodeSource, CouchDB single-node nur
  `127.0.0.1`, nginx, systemd-Template `torball@.service`, Service-User `torball`);
  `deploy-instanz.sh <name> <frontend_port> <backend_port>` rollt je Instanz aus
  (Git-Checkout + Build unter `/opt/torball/<name>`, eigene CouchDB-DB + DB-User,
  `backend/.env`, nginx-Site, systemd-Service) und dient zugleich als Update
  (pull + rebuild + restart). **`REPO_URL` nur beim allerersten Deploy einer neuen Instanz
  nötig** – danach steckt die Git-Adresse im `origin`-Remote des bestehenden Checkouts und wird
  automatisch wiederverwendet (Nutzer-Vorgabe: Update soll ohne wiederholte Repo-Angabe
  funktionieren). Prod läuft **API-only** über `npm start`
  (`node --env-file=.env dist/index.js`), nginx serviert das Frontend statisch +
  proxied `/api`. Mehrere Instanzen (prod/demo) auf einem Host über eigenen `PORT`
  + eigene DB. Backend-Routen liegen an der Wurzel (nicht unter `/api`) – der
  Vite-Dev-Proxy **und** die nginx-Site strippen das `/api`-Präfix. Details:
  `docs/Protokolle/2026-08-12-produktiv-installation.md`,
  `docs/installation-konfiguration.md`. **`.sh`-Dateien müssen LF-Zeilenenden
  haben** (erzwungen über `.gitattributes`; CRLF scheitert auf Linux).
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
- **Umgebungs-Banner (`UmgebungsBanner.tsx`) markiert Nicht-Prod-Umgebungen unübersehbar** – gegen
  versehentliches Pflegen von „echten" Daten auf einer Demo-/Entwicklungsinstanz (oder umgekehrt).
  Rein build-zeit-gesteuert, **kein Laufzeit-API-Aufruf**: `import.meta.env.DEV` kommt direkt von
  Vite (`npm run dev:frontend`); `VITE_INSTANZ_NAME` schreibt `deploy-instanz.sh` vor jedem Build
  in ein `frontend/.env` (Wert = der Instanzname, den das Skript ohnehin schon als Parameter
  bekommt, z. B. `demo`) – auf `prod` sowie beim Windows-Installer (kein `VITE_INSTANZ_NAME`
  gesetzt) erscheint bewusst kein Banner. `frontend/.env` ist über die bestehende `.env`-Regel in
  `.gitignore` automatisch mit abgedeckt, kein zusätzlicher Eintrag nötig.
- **Interne LAN-Adressen gehören NICHT ins Repo** (Nutzer-Vorgabe): Dev-CouchDB,
  Gitea-Repo, BookStack usw. stehen im Repo nur als Platzhalter (`couchdb-host`,
  `gitea-host`, `bookstack-host`); die konkreten Adressen liegen im Claude-Memory.
- **Lokale Windows-Installation ist ebenfalls skript-basiert** (`deploy/Installieren-Windows.cmd`
  → `deploy/installieren-windows.ps1`, Option A der geplanten Installationswege): installiert Node
  LTS (winget) + Apache CouchDB als Windows-Dienst (offizieller MSI-Installer, unbeaufsichtigt,
  Prüfsummen-Check) falls nicht vorhanden, legt eine eingeschränkte CouchDB-App-Datenbank +
  -Benutzer an (analog `deploy-instanz.sh`), baut die App und schreibt `backend/.env` +
  Start-/Update-Skript/Desktop-Verknüpfung. Selbst-elevierend (UAC), idempotent. Fragt bei einer
  **Neu**anlage von `backend/.env` interaktiv Port + optionalen SMTP-Versand ab (Default-Wert
  vorgeschlagen, Enter übernimmt ihn) – bei einer bereits vorhandenen `.env` (erneuter Lauf =
  Update) wird nicht erneut gefragt. Erzeugt zusätzlich `Aktualisieren-Torball.cmd`
  (`npm run torball -- aktualisieren`, siehe „Konsolen-Tool" oben) für spätere Updates, ohne den
  kompletten Installer (inkl. Node-/CouchDB-Prüfung) erneut zu durchlaufen; `Start-Torball.cmd` +
  `Aktualisieren-Torball.cmd` sind generierte, individuelle Artefakte im Projekt-Wurzelverzeichnis
  und deshalb in `.gitignore` gelistet. Dabei aktiviert (`SERVE_FRONTEND=true`) das Backend einen
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

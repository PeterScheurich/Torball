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
Root-Build (`npm run build --workspaces`) läuft in der in der Wurzel-
`package.json` deklarierten Workspace-Reihenfolge (`frontend`, `backend`,
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
`turnier-delete.integration.test.ts` überspringt sich selbst, wenn die
`COUCHDB_*`-Umgebungsvariablen nicht gesetzt sind (kein Mock/Fake-DB-Setup in
diesem Projekt). Es gibt keine Frontend-Tests.

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
ergänzt.

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
Turnier eine Zugriffsstufe (`lesen`/`schreiben`) für den angemeldeten
Benutzer: Admin hat immer Vollzugriff; Manager hat immer Vollzugriff auf
selbst erstellte Turniere (`turnier.erstelltVon`); alle anderen Fälle richten
sich nach explizit vergebenen `TurnierBerechtigung`-Dokumenten. Jede Route,
die Turnier-/Mannschaft-/Spiel-/Spielplan-/Ergebnis-Daten anfasst, muss das
prüfen; `verein`/`team` (Stammdaten) verlangen dagegen nur eine Anmeldung,
keine turnierbezogene Prüfung (die Spezifikation kennt hier keine Rollen).

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
- Farbschema folgt standardmäßig der Systemeinstellung
  (`prefers-color-scheme`), mit manuellem Umschalter (`[data-theme]`) als
  Override. Zusätzlich Tabellendichte/Zeilenabstand (`[data-dichte]`,
  „Standard"/„Schmal") nach demselben Muster.
- **Zwei-Ebenen-Modell für beide Einstellungen** (`frontend/src/theme.ts`,
  `frontend/src/dichte.ts`): geräte-/browserlokal (`localStorage`, Seite
  `/einstellungen`, auch ohne Login erreichbar) hat immer Vorrang vor dem
  kontogebundenen Standardwert (`Benutzer.standardTheme`/`standardDichte`,
  wird beim Login nur übernommen, wenn auf dem Gerät noch keine eigene Wahl
  existiert - siehe `seedeVoreinstellungen()` in `frontend/src/auth.tsx`).
- **Initialisierung gehört nach `main.tsx`, nicht in eine Komponente:**
  `themeInitialisieren()`/`dichteInitialisieren()` werden dort vor dem
  ersten Render aufgerufen (rein lesend, kein `localStorage`-Schreiben).
  Würde man das stattdessen nur beim Mounten von `ThemeUmschalter`/
  `DichteUmschalter` setzen, fehlt das `data-*`-Attribut nach einem Reload
  auf jeder Seite, auf der diese Komponenten nicht eingebunden sind (schon
  einmal genau so live erlebt).

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

- Werte in `backend/.env` mit Sonderzeichen (z. B. `#`) immer in
  Anführungszeichen setzen - unquotiert wird alles ab einem `#` als
  Kommentar abgeschnitten (schwer zu findender Bug, einmal live erlebt:
  ein abgeschnittenes SMTP-Passwort führte zu "Authentication credentials
  invalid").
- Änderungen an `backend/.env` wirken erst nach einem Neustart des
  `npm run dev:backend`-Prozesses (`--env-file` wird nur beim Start
  gelesen) - anders als Quelltext-Änderungen, die automatisch neu geladen
  werden.
- Die CouchDB-Entwicklungsinstanz läuft unter `192.168.188.96` (siehe
  `docs/testumgebung-starten.md`) - der Rechner, auf dem `npm run
  dev:backend` läuft, muss dieses Netzwerk erreichen können, sonst schlagen
  alle DB-Zugriffe fehl.

## Dokumentation

- Größere fachliche oder technische Entscheidungen als Protokoll unter
  `docs/Protokolle/` festhalten (Datum + Thema im Dateinamen), inklusive der
  tatsächlich ausgeführten Befehle – nicht nur das Endergebnis.
- `docs/torball_gesamtspezifikation.md` ist die fachliche Referenz; bei
  Unklarheiten dort nachschlagen oder direkt fragen statt zu raten.
- Die Dateien direkt unter `docs/` (nicht `Archiv/`, nicht `Protokolle/`)
  sind laut `docs/README.md` die führende Fassung und werden mit `node
  scripts/bookstack-push.mjs` nach BookStack gespiegelt – Änderungen gehören
  hier ins Repo, nicht direkt in BookStack.

## Browser-Tests (Vorschau-Tools)

Beim Verifizieren von Frontend-Änderungen über die Browser-Vorschau-Tools
sind hier mehrfach dieselben Stolperfallen aufgetreten:

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

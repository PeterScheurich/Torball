# 2026-08-10: UI-Verfeinerung, Anzeige-Einstellungen, Turnier-Übersicht erweitert

## Ausgangslage

Nach der Stammdaten-Oberfläche (siehe `2026-08-10-stammdaten-frontend.md`)
folgte eine Reihe kleinerer, iterativer UI-Anpassungen anhand von direktem
Feedback beim Durchklicken der Anwendung: Button-Größen, Menüstruktur,
Anzeige-Einstellungen sowie fehlende Erfassungsfelder auf der
Turnier-Übersicht. Dieses Protokoll fasst den fachlich/technisch relevanten
Teil zusammen (reine Kosmetik wie einzelne Randabstände nicht im Detail).

## Umgesetzt

**Kopfzeile vereinfacht (`App.tsx`, neu: `KopfzeilenMenue.tsx`)**
- "Benutzerverwaltung" und "Vereine & Teams" zu einem Menüpunkt "Stammdaten"
  zusammengefasst (Vereine zuerst).
- "Mein Profil"/"Abmelden" zu einem Benutzermenü (Personen-Icon + Name)
  zusammengefasst; "Abmelden" ist jetzt optisch ein Menüeintrag, kein
  eigenständiger Button mehr. Benutzermenü sitzt ganz rechts.
- Neue, wiederverwendbare Dropdown-Komponente `KopfzeilenMenue.tsx`
  (schließt bei Klick außerhalb, Escape, oder Klick auf einen Eintrag).
- Farbschema-Umschalter aus der Kopfzeile entfernt (nur noch auf der
  Einstellungen-Seite, s.u.).

**Anzeige-Einstellungen: Farbschema + neue Zeilenabstand-Einstellung**

Zunächst rein geräte-/browserlokal umgesetzt (`theme.ts`, neu: `dichte.ts`,
neu: `DichteUmschalter.tsx`, neu: `EinstellungenPage.tsx` unter
`/einstellungen`, bewusst außerhalb von `GeschuetzteRoute` - der geplante
Offline/LAN-Betrieb, Abschnitt 21.3, kennt keine angemeldeten Benutzer).
Zeilenabstand ("Standard"/"Schmal") wirkt auf Zeilenhöhe von Tabellen UND
normale Eingabefelder (`[data-dichte='schmal']`-Selektoren in `index.css`).

Nutzer wies danach zurecht darauf hin, dass angemeldete Benutzer die
Präferenz auch kontogebunden speichern können sollten müssen (folgt einem
neuen Gerät). Daraufhin ergänzt:
- `Benutzer.standardTheme`/`standardDichte` (`shared/src/types/benutzer.ts`),
  `PUT /benutzer/mich` akzeptiert beide Felder ohne Passwort-Bestätigung
  (keine sensiblen Daten).
- Neue Zeilen "Standard-Farbschema"/"Standard-Zeilenabstand" im Profil
  (`ProfilPage.tsx`), speichern sofort und wenden die Wahl auch lokal an.
- `seedeVoreinstellungen()` in `auth.tsx`: übernimmt beim Login/Laden den
  Konto-Standard als Startwert auf einem Gerät, aber **nur**, wenn dort noch
  keine eigene lokale Wahl existiert - eine bereits getroffene lokale Wahl
  hat immer Vorrang.

Dabei zwei echte Bugs gefunden und behoben:
1. `data-theme`/`data-dichte` wurden nur beim Mounten der jeweiligen
   Umschalter-Komponente gesetzt (nur auf der Einstellungen-Seite
   vorhanden) - nach einem Reload (F5) auf jeder anderen Seite fehlte das
   Attribut komplett. Fix: `themeInitialisieren()`/`dichteInitialisieren()`
   (rein lesend, kein `localStorage`-Schreiben) jetzt in `main.tsx` vor dem
   ersten Render.
2. Zwei gleichzeitig sichtbare Umschalter-Instanzen (Kopfzeile +
   Einstellungen-Seite) blieben nicht synchron. Fix: Custom Events
   (`THEME_GEAENDERT_EVENT`/`DICHTE_GEAENDERT_EVENT`), auf die alle
   Instanzen lauschen.

**Turnier-Übersicht: restliche "Allgemein"-Felder (Abschnitt 5.1)**

`TurnierVerwaltenPage.tsx` erfasste bisher nur Datum/Startzeit/Status/
Spielfelder (alle nur lesend) sowie Spielmodus/Protokollierung. Ergänzt:
Name (jetzt editierbar), Spielort (Name/Adresse/Geo-Referenz),
Turnierleitung (Name/Kontakt), Ansprechpartner (Name/Kontakt),
Zusatzinformationen. Speichern automatisch beim Verlassen des Feldes.
Backend brauchte keine Änderung (`PUT /turniere/:id` validiert nicht
strikt gegen ein Schema).

Dabei ebenfalls ein Bug gefunden: leere Textfelder wurden nie wirklich als
"geleert" gespeichert, da `""` vor dem Senden zu `undefined` normalisiert
wurde und `JSON.stringify` `undefined`-Felder aus dem Request-Body
entfernt - das Backend ließ den alten Wert dann unverändert. Fix: explizit
`null` senden statt `undefined` (`api.ts`, `updateTurnier`). Betrifft
vermutlich auch Vereine/Teams (dort dasselbe `|| undefined`-Muster) - dort
bewusst nicht mit angefasst, da außerhalb der aktuellen Aufgabe.

Zusätzlich: Kartendienst-Links (Google Maps/OpenStreetMap) hinter dem
Geo-Feld - Details und Begründung siehe die neue Ergänzung in Abschnitt
5.1 der Gesamtspezifikation. Reiter-Zustand (Übersicht/Mannschaften/...)
steht jetzt als `?tab=...` in der URL (`useSearchParams`, `replace: true`
beim Wechseln, um die Browser-Historie nicht mit einem Eintrag je
Reiterwechsel zu füllen) statt nur im lokalen State - übersteht damit
einen Reload.

**Weitere kleinere Verbesserungen**
- Team-"übernehmen"-Button (Vereinsname als Teamname) nur noch im
  Anlage-Formular, nicht mehr bei bereits angelegten Teams; im
  Anlage-Formular hinter die Verein-Auswahl verschoben, mit Text statt
  Symbol ("als Teamname übernehmen").
- Benutzerverwaltung: Liste bestehender Benutzer jetzt vor dem
  Anlage-Formular (passend zum Muster der anderen Verwaltungsseiten).
- Spielplan/Vorschlag: Hinweisspalte zeigt jetzt eine Kurzform
  ("Back-to-Back"), voller Text als `title`-Tooltip.
- Ergebnis-Eingabefelder von `4em` auf `3em` verschmälert (maximal
  zweistellige Werte möglich).
- Ein Team kann pro Turnier nicht mehr doppelt als Mannschaft ausgewählt
  werden (Frontend filtert bereits verwendete Teams aus der Auswahl,
  Backend lehnt es zusätzlich mit 409 ab).
- `input[readonly]`-Stil (gedämpfter Hintergrund, aber gleiche
  Rahmen/Padding-Maße wie editierbare Felder) für nicht editierbare Werte
  in Label/Wert-Tabellen (Profil, Turnier-Übersicht) - vorher wirkte die
  Spalte "verschoben", weil reiner Text neben echten Eingabefeldern anders
  aussieht.
- `appearance: none` (+ `box-sizing: border-box`, `min-height: 0`) auf die
  globale `button`-Regel ergänzt - fehlte bisher komplett.

## Verifikation

Vor jedem der drei Commits:
```bash
npm run build --workspace=shared
npm run build
npm run lint --workspace=frontend
npm run test --workspace=backend
```
Alle drei jeweils grün (18 Tests bestanden, 1 Integrationstest ohne
`COUCHDB_*` übersprungen, wie erwartet).

Zusätzlich durchgängig live gegen den echten lokalen Dev-Server
(`npm run dev:frontend`/`dev:backend`) und die echte CouchDB-Instanz
verifiziert, u. a.:
- Login-Roundtrip, Speichern der neuen Turnier-Felder direkt per
  `fetch()`-Abfrage der Datenbank gegengeprüft.
- Konto-Standardwert-Vererbung simuliert (lokalen Override gelöscht,
  Seite neu geladen, Konto-Standard korrekt übernommen).
- Reload-Persistenz von Zeilenabstand und aktivem Reiter per
  `location.reload()`.
- OpenStreetMap-Link direkt auf `openstreetmap.org` geöffnet und die
  korrekte Koordinaten-Übernahme in der Ziel-URL bestätigt.
- Nach jedem Test verwendete Testdaten im "Test"-Turnier wieder auf den
  Ausgangszustand zurückgesetzt.

Commits: `4c8ca8c` (Kopfzeile), `36eb247` (Anzeige-Einstellungen),
`1f58eb6` (Turnier-Übersicht + Rest).

## Offen

- **Datei-Anhänge fürs Turnier** (Abschnitt 5.1/20.13): Datentyp
  vorhanden, keine Route/UI. Zurückgestellt, bis der übrige Rahmen steht
  (Nutzer-Entscheidung).
- **Chrome-spezifischer Anzeige-Fehler im Benutzermenü**: sichtbarer
  Leerraum zwischen "Mein Profil" und "Abmelden", nur in einem konkreten
  Chrome des Nutzers reproduzierbar (nicht in Edge nach Neustart, nicht in
  der eigenen Testsitzung trotz identischer Messung). Zwei CSS-Fixes ohne
  Wirkung versucht (`box-sizing: border-box`, `appearance: none`).
  Zurückgestellt, bis konkrete DevTools-Werte vom Nutzer vorliegen.
- Digitale Live-Protokollierung (Abschnitt 22) weiterhin nicht umgesetzt -
  laut Nutzer bewusst für später zurückgestellt, bis der restliche Rahmen
  steht.

# 2026-08-12 – Turnierliste-Metadaten, öffentliche Startseite, Breiten-Einstellung

Drei vom Nutzer angestoßene Ergänzungen (nacheinander umgesetzt + committet).

## 1. Metadaten in der Turnierliste (angelegt / bearbeitet / abgeschlossen)

Die `TurnierListePage` zeigt je Turnier eine kleine Meta-Zeile:
- **offen:** „Angelegt am … von … · zuletzt bearbeitet von …"
- **abgeschlossen:** „Abgeschlossen am … von …"

Abgestimmte Regeln:
- **„Zuletzt bearbeitet" umfasst alle Turnier-Änderungen AUSSER der Ergebnis-Erfassung** und wird
  bewusst **ohne Zeitpunkt** angezeigt (nur wer). Angelegt/abgeschlossen zeigen wann + wer.
- Namen sind am `Turnier` **denormalisiert** (`erstelltVonName`, `zuletztBearbeitetVonName`,
  `abgeschlossenVonName`), weil `GET /benutzer` admin-only ist, die Liste aber jeder sieht.

Umsetzung: best-effort-Helfer `markiereTurnierBearbeitet()` (`backend/src/turnier/bearbeitet.ts`)
wird von **allen** turnierbezogenen Schreib-Routen aufgerufen (mannschaft/spieler/schiedsrichter,
spiel-Anpassung/Reihenfolge/Startzeit/Schiedsrichter-Zuordnung, turnier-PUT, spielplan-POST) –
**nicht** von den Ergebnis-Pfaden (`ergebnis.ts`, `ergebnisToken.ts`, spiel `…/abschliessen`).
`abschliessen` setzt `abgeschlossenVon/Name/Am`; `wieder-oeffnen` setzt `zuletztBearbeitet` und räumt
die Abschluss-Felder wieder ab. Neue Turnier-Schreib-Routen (außer Ergebnisse) müssen den Touch
mitziehen (siehe CLAUDE.md). Verifiziert: die Ergebnis-Erfassung ändert `geaendertAm` nicht.

## 2. Öffentliche Startseite (Root für Gäste)

Die Route `/` ist jetzt **öffentlich**: `StartRoute` (App.tsx) rendert für angemeldete Benutzer die
Verwaltungs-`TurnierListePage`, für Gäste die neue `OeffentlicheStartseitePage`. Diese listet
(Endpunkt `GET /oeffentlich/turniere`, kein Login) alle Turniere mit **`oeffentlichTurnierinfos=true`**
– nur **Name/Datum/Spielort**, getrennt nach aktuell/abgeschlossen, plus **Link zur Anmeldung**. Damit
landet ein Besucher der Server-Adresse auf dieser Übersicht statt auf `/login`. Kriterium mit dem
Nutzer abgestimmt (freigegebene Turnierinfos → Datum/Ort ohnehin öffentlich).

## 3. Einstellung „Breite" (Standard/Breit)

Dritte Anzeige-Einstellung analog zu Theme/Zeilenabstand (Zwei-Ebenen-Modell: gerätelokal per
`localStorage`/`[data-breite]` mit Vorrang vor dem kontogebundenen `Benutzer.standardBreite`).
„Breit" hebt `#root` max-width von **960 px auf 1400 px** an (Widescreen). Neue Stellen:
`frontend/src/breite.ts`, `BreiteUmschalter`, Init in `main.tsx`, Abschnitt in `EinstellungenPage`,
Profil-Select + `voreinstellungAendern` + `seedeVoreinstellungen`, `PUT /benutzer/mich`
(Body-Typ/Schema-Enum/Handler), `[data-breite]`-Regel in `index.css`. Muster in CLAUDE.md dokumentiert.

## Verifikation

Alle drei end-to-end gegen die laufende Instanz geprüft (Meta-Zeilen offen/abgeschlossen, Ergebnis
ändert Meta nicht; Gäste-Root zeigt Startseite mit freigegebenen Turnieren + Login-Link, angemeldete
Root zeigt die Verwaltungsliste; Breit ↔ Standard schaltet `#root` 960↔1400 px und persistiert im
Profil). `npm run build` (inkl. `shared`) / `lint` / `test` grün.

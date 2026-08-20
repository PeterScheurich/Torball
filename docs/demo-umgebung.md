# Besonderheiten der Demo-Umgebung

Diese Seite sammelt, was die Demo-Instanz von einer normalen Installation unterscheidet – für
alle, die dort testen oder die Instanz betreuen. Für die Besonderheiten der Entwicklungsinstanz
siehe `docs/entwicklungs-umgebung.md`.

## Zweck & Zugriff

- Erreichbar unter `https://turniere-demo.blindentorball.de` – öffentlich, gedacht für externe
  Tester, ohne dass jemand Zugriff auf interne Produktiv-/Entwicklungsinfrastruktur braucht.
- Läuft als eigene Instanz neben `prod` (`https://turniere.blindentorball.de`) auf demselben
  Server, über `deploy/deploy-instanz.sh demo …` ausgerollt (siehe
  `docs/installation-konfiguration.md`).
- Zeigt ein **Umgebungs-Banner** (`UmgebungsBanner.tsx`, `VITE_INSTANZ_NAME=demo` – von
  `deploy-instanz.sh` beim Build gesetzt), damit niemand versehentlich „echte" Daten hier statt
  auf Prod pflegt.
- **Selbstregistrierung** kann aktiviert werden (Admin → Systemeinstellungen,
  `selbstregistrierungErlaubt`): Tester legen sich dann unter `/registrieren` ohne Einladung
  selbst einen Account an. Auf Prod bewusst i. d. R. deaktiviert.

## Nächtlicher Snapshot/Reset

Die Demo-Instanz wird nachts auf einen festen Ausgangszustand zurückgesetzt – kein App-seitiges
Löschen, sondern ein Datenbank-Abgleich mit einer zweiten CouchDB-Datenbank `<COUCHDB_DB>_golden`
(`backend/src/demo/snapshot.ts`, per systemd-Timer über `deploy/demo-snapshot-einrichten.sh`).

**Was NICHT zurückgesetzt wird** (`istGeschuetzt()` in `snapshot.ts`):

- Die Instanz-Einstellungs-Dokumente: `session`, `systemeinstellungen`, `systemkonfiguration`,
  `kanbanKarte`.
- Ausschließlich `benutzer`-Dokumente mit `globaleRolle: "admin"`.

**Konsequenz für Tester:** eigene (auch selbst-registrierte) Accounts, angelegte Turniere und
alle sonstigen Änderungen gehen **jede Nacht verloren** – nur der/die Admin-Account(s) und die
o. g. Instanz-Einstellungen überstehen den Reset. Das gilt bewusst auch für das interne
„Demo-Datenpflege"-Konto, aus dessen Besitz die Beispieldaten stammen (kann sich selbst nie
einloggen, kein `passwortHash`).

Die Beispieldaten (Vereine, Teams, mehrere Beispiel-Turniere inkl. einer zweigleisigen
Bundesliga-Saison mit echter Spieltag-Spiegelung) erzeugt `backend/src/demo/beispieldaten.ts`
einmalig über das Konsolen-Tool:

```bash
npm run torball --workspace=backend -- demo:beispieldaten
npm run torball --workspace=backend -- demo:snapshot:erstellen
```

Alle `demo:*`-Befehle sind zusätzlich hinter `DEMO_SNAPSHOT_ERLAUBT=true` (`backend/.env`)
gesperrt – bewusst nie auf Prod aktiv, da sie ganze Datenbestände ersetzen/überschreiben.

> **Status (2026-08-14):** Der systemd-Timer läuft auf der echten Demo-Instanz – der nächtliche
> Reset ist dort **aktiv**. Die Beispieldaten wurden zuletzt am 20.08.2026 aktualisiert
> (`demo:beispieldaten` + `demo:snapshot:erstellen` erneut ausgeführt).

## Was bewusst NICHT auf der Demo-Instanz aktiv ist

Diese Env-Flags sind ausschließlich für die Entwicklungsinstanz gedacht (siehe
`docs/entwicklungs-umgebung.md`) und werden auf Demo nicht gesetzt:

- `KANBAN_BOARD_AKTIV` (Entwicklungs-Kanban-Board)
- `MAIL_POSTFACH_AKTIV` (Mail-Postfach-Feature)

## Pauschaler Zugriff für alle Benutzer

`Turnier.zugriffFuerAlleBenutzer` (`"lesen"|"schreiben"`, optional je Turnier) gibt ein einzelnes
Turnier für **jede** angemeldete Person frei, statt Berechtigungen einzeln zu vergeben – gedacht
vor allem für Demo-Turniere, an denen mehrere Tester parallel arbeiten sollen, aber generisch
nutzbar (auch auf Prod einsetzbar).

## Weiterführend

Architektur-Details zu Snapshot/Reset und Systemeinstellungen stehen in `CLAUDE.md` (Abschnitt
„Architektur"). Das Entwicklungs-Kanban-Board (`docs/kanban-board.md`) existiert seit dem
15.08.2026 nur noch auf der Entwicklungsinstanz – ein Abgleich der Kartenstände mit Demo/Prod
findet nicht mehr statt.

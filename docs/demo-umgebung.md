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

Die Beispieldaten (Vereine und Teams auch aus dem Ausland, sieben Beispiel-Turniere: alle Turniermodi in
verschiedenen Zuständen, zwei davon international) erzeugt `backend/src/demo/beispieldaten.ts` über das
Konsolen-Tool. Die Turniere werden dabei über die echten Routen angelegt und bespielt, nicht von Hand zusammengesetzt.

**Neuen Datenstand aufbauen** (auf der Demo-Instanz, im Ordner `backend`):

```bash
npm run torball -- demo:beispieldaten --ersetzen
npm run torball -- demo:snapshot:erstellen
```

`--ersetzen` entfernt vorher alle bisherigen Demo-Inhalte (Turniere, Stammdaten, Nicht-Admin-Konten; Einstellungen
und Admin-Konten bleiben). **Der zweite Befehl ist Pflicht:** Der nächtliche Reset spielt den Stand der
`_golden`-Datenbank ein – ohne `demo:snapshot:erstellen` kehrt nach der nächsten Nacht der alte Stand zurück.
Die Datumsangaben der Turniere werden beim Aufbau relativ zu „heute“ gewählt und dann fest gespeichert; der Stand
sollte deshalb gelegentlich neu aufgebaut werden.

Alle `demo:*`-Befehle sind zusätzlich hinter `DEMO_SNAPSHOT_ERLAUBT=true` (`backend/.env`)
gesperrt – bewusst nie auf Prod aktiv, da sie ganze Datenbestände ersetzen/überschreiben.

> **Status (2026-08-14):** Der systemd-Timer läuft auf der echten Demo-Instanz – der nächtliche
> Reset ist dort **aktiv**. Die Beispieldaten wurden zuletzt am 20.08.2026 aktualisiert
> (`demo:beispieldaten` + `demo:snapshot:erstellen` erneut ausgeführt); der Stand mit den sieben Modus-Turnieren
> ist im Code seit 01.11.2026 vorbereitet, aber noch nicht auf der Demo-Instanz aufgebaut.

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

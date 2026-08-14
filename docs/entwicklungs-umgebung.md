# Besonderheiten der Entwicklungs-Umgebung

Diese Seite sammelt, was die Entwicklungsinstanz von Demo/Prod unterscheidet. Für die reine
Installation/Konfiguration siehe `docs/installation-konfiguration.md`, zum schnellen Starten
`docs/testumgebung-starten.md`. Für die Besonderheiten der Demo-Instanz siehe
`docs/demo-umgebung.md`.

## Was überhaupt „die Entwicklungsinstanz" ist

Es gibt (Stand jetzt) **keine** eigene, dauerhaft auf einem Server laufende Dev-Instanz –
anders als `prod`/`demo`, die über `deploy/deploy-instanz.sh` auf dem Server ausgerollt sind.
„Die Entwicklungsinstanz" ist schlicht **der Arbeitsrechner**, auf dem `npm run dev:backend` und
`npm run dev:frontend` laufen. Eine zusätzliche, eigenständige Server-Dev-Instanz wäre ein
separates, noch nicht angefragtes Thema.

## Gemeinsame CouchDB im LAN

Die Entwicklungsinstanz verbindet sich mit einer gemeinsamen CouchDB im LAN (Adresse in der
lokalen `backend/.env`, Platzhalter im Repo: `couchdb-host`) – der Rechner, auf dem
`npm run dev:backend` läuft, muss dieses Netzwerk erreichen können, sonst schlagen alle
DB-Zugriffe fehl. Mehrere gleichzeitig laufende Entwicklungs-Sitzungen (z. B. mehrere
Claude-Code-Sitzungen auf demselben Rechner) arbeiten auf derselben Datenbank.

## Env-Flags, die nur hier gesetzt werden

Diese Flags in `backend/.env` sind bewusst nur für die Entwicklungsinstanz gedacht und werden auf
Prod/Demo nicht gesetzt:

| Flag | Schaltet frei |
|---|---|
| `KANBAN_BOARD_AKTIV=true` | Das gesamte Entwicklungs-Kanban-Board (`/entwicklungs-board`, Admin-Menü). Feedback/Fehlermeldungen von Prod/Demo laufen über das Mail-Postfach (das erkannte Anforderungen automatisch als Kanban-Karte anlegt), ein eigenes Board auf Prod/Demo braucht es dafür nicht mehr. |
| `MAIL_POSTFACH_AKTIV=true` | Das Mail-Postfach (`/mail-postfach`, Admin-Menü): IMAP-Abruf des Feedback-Postfachs + KI-Zusammenfassung + automatische Kanban-Karten. Zugangsdaten (IMAP, Anthropic-API-Key) werden **nicht** über `.env`, sondern über die Oberfläche gepflegt (Admin → Mail-Postfach → Einstellungen). |

`DEMO_SNAPSHOT_ERLAUBT` gehört dagegen zur Demo-Instanz, nicht hierher (siehe
`docs/demo-umgebung.md`).

## Ports

- Backend: **3000** (Default, per `PORT`-Env änderbar). Der Vite-Dev-Proxy zielt fest auf
  `localhost:3000` – deshalb bleibt es in der Entwicklung normalerweise dabei.
- Frontend: **5173** (Vite-Default). Ist der Port belegt, weicht Vite automatisch auf einen freien
  Port aus.
- Läuft bereits ein Backend-Prozess auf 3000 (z. B. aus einer anderen Sitzung), lässt sich kein
  zweiter isolierter Prozess auf demselben Port starten – das ist normal, da alle
  Entwicklungs-Sitzungen ohnehin dieselbe CouchDB teilen.

## Kein automatischer Reset

Anders als die Demo-Instanz (nächtlicher Snapshot-Reset, siehe `docs/demo-umgebung.md`) wird die
Entwicklungsdatenbank **nie automatisch zurückgesetzt**. Eigene Testdaten (Turniere, Mannschaften,
Spiele) dürfen jederzeit frei gelöscht oder verändert werden, bleiben aber sonst dauerhaft
bestehen, bis sie manuell aufgeräumt werden.

## Admin-Konsolen-Tool

Für administrative Aufgaben ohne Web-Login (z. B. einen gesperrten Admin-Account entsperren,
`.env`-Werte gezielt ändern) steht das Konsolen-Tool zur Verfügung:

```bash
npm run torball --workspace=backend -- --hilfe
```

Details siehe `CLAUDE.md` (Abschnitt „Befehle").

## Änderungen an `.env` wirken erst nach Neustart

`backend` liest `.env` nur beim Start (`--env-file`). Nach einer Änderung an `backend/.env`
(z. B. an einem der obigen Flags) muss der `npm run dev:backend`-Prozess neu gestartet werden –
reiner Quelltext-Reload (tsx watch) reicht dafür nicht.

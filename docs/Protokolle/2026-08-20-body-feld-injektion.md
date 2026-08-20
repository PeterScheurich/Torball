# Body-Feld-Injektion: Rechteausweitung / Konto-Übernahme (Backend-Review, Karten A1–A3)

**Datum:** 20.08.2026

Beim Backend-Code-Review gefunden und direkt behoben (Nutzer-Entscheidung: vorziehen, da auf Prod
erreichbare Rechteausweitung). Die restlichen Review-Befunde liegen als Kanban-Karten (B–E) auf dem
Dev-Board.

## Befund

**Fastify reicht unbekannte Request-Body-Felder standardmäßig durch** (AJV `removeAdditional: false`,
und die Body-Schemata setzen kein `additionalProperties: false`). Empirisch verifiziert: ein Body mit
`{name, _id:"benutzer:evil", docType:"benutzer"}` landet vollständig in `req.body`.

Routen, die den Body per Spread übernehmen, schrieben diese Zusatzfelder mit:

- **A2 (POST `/mannschaften`, `/vereine`, `/teams`):** `{ _id, docType, …, ...req.body }` mit
  `req.body` zuletzt → Client konnte `_id` **und** `docType` überschreiben. Da `insertDoc` ohne
  `_rev` nur **neue** Dokumente anlegt (kein Overwrite), ließ sich ein Dokument mit beliebiger
  `_id`/`docType` erzeugen – z. B. `{docType:"benutzer", globaleRolle:"admin", passwortHash:"<selbst
  erzeugter bcrypt>"}` → ein login-fähiges Admin-Konto. **Rechteausweitung**, erreichbar für jeden mit
  `schreiben_voll` auf ein Turnier (Manager auf eigenem Turnier; auf der Demo per
  `zugriffFuerAlleBenutzer` sogar Rolle „benutzer").
- **A3 (PUT `/benutzer/:id`):** `{ ...bestehend, ...req.body, ...sperrPatch }` → sensible Felder wie
  `passwortHash`, `zweiFaSecret`, die Token-Hashes oder `email` waren injizierbar (nicht im Schema,
  daher ungeprüft gemergt) → **Konto-Übernahme** eines Nicht-Admin-Kontos durch einen Manager
  (`darfZielRolleVergeben` erlaubt Manager→Nicht-Admin, inkl. anderer Manager).
- Zusätzlich (geringer): die PUT-Merges auf Domänen-Objekten (verein/team/mannschaft/schiedsrichter/
  spiel/spieler) hätten Zusatzfelder ins bestehende Dokument gemischt (u. a. `docType` änderbar).

## Fix (A1)

Neuer Helfer `backend/src/eingabe.ts` (`ohneFelder(body, felder)` + `IDENTITAETS_FELDER`). An jeder
Spread-Stelle werden die server-kontrollierten Felder aus dem Body entfernt, bevor er übernommen
wird – gleiches Muster wie `ohneServerFelder` in `routes/turnier.ts` (2026-08-20):

- POST mannschaft/verein/team: `_id`/`_rev`/`docType` + die denormalisierte Id (+ `reihenfolge`)
  gestrippt → Server-Werte gewinnen, keine Fremd-Anlage mehr.
- PUT mannschaft/verein/team/schiedsrichter/spiel/spieler: dieselben + `turnierId`/`mannschaftId`
  gestrippt (kein Umhängen/Typwechsel des bestehenden Dokuments).
- PUT `/benutzer/:id`: bewusst **Whitelist** statt Denylist – nur die im Schema deklarierten Felder
  (`name`, `globaleRolle`, `gesperrt`) werden übernommen; `passwortHash`/2FA/Tokens sind damit gar
  nicht erst erreichbar.

**Warum kein globales AJV `removeAdditional`/`additionalProperties: false`:** Die Turnier-Routen
nutzen bewusst Passthrough für viele nicht einzeln aufgeführte Felder (Regeln, `oeffentlich*`-Flags);
ein globales Whitelist-Stripping würde die brechen, und `additionalProperties: false` würde legitime
Frontend-Round-trips (die das ganze Objekt inkl. `_id`/`_rev`/`docType` zurücksenden) mit 400
abweisen. Das Strippen einer klaren Denylist server-kontrollierter Felder schließt die Ausnutzung,
ohne legitime Felder zu entfernen und ohne Frontend-Anpassung.

## Verifikation

- Neuer Integrationstest `injektion.integration.test.ts`: injiziertes `_id`/`docType` bei POST
  mannschaft/verein wird ignoriert (kein Fremd-Dokument unter der injizierten `_id`), injizierter
  `passwortHash`/`zweiFaSecret`/`email` bei PUT `/benutzer/:id` wird nicht übernommen – jeweils mit
  Regressionsprüfung, dass die normale Anlage/Änderung weiter funktioniert.
- `npm run test:integration` vollständig grün (85 Tests, 0 übersprungen), Build/Lint grün.

## Rollout

Reiner Backend-Code – wirkt nach Rebuild + Neustart je Instanz (Prod **und** Demo). Kein
Datenmodell-Wechsel, keine Migration. Kanban-Karten A1–A3 auf „erledigt" gesetzt.

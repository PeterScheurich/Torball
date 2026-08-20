# Turnier-Sync: Import gegen fremde Dokumente absichern (Sicherheitslücke)

**Datum:** 20.08.2026

## Befund (Sicherheitsprüfung)

Bei einer gezielten Sicherheitsdurchsicht der Server-Version fiel im Turnier-Sync-Import eine
**Rechteausweitung / beliebige Datenbank-Überschreibung** auf.

`importiereTurnierExport` (`backend/src/sync/import.ts`) schrieb jedes Dokument eines Exportpakets
unter seiner **mitgelieferten `_id`** in die eigene CouchDB – bei `ersetzen: true` holt es die
`_rev` des Zieldokuments sogar selbst (`bestehend = await findById(doc._id)`). Es gab **keine
Prüfung**, dass die Kind-Dokumente (`mannschaften`, `spieler`, `spiele`, `schiedsrichter` sowie die
create-only-Stammdaten `vereine`/`teams`/`wettbewerb`) tatsächlich zum ausgecheckten Turnier
gehören. Zusätzlich hatte `POST /instanzen/checkin` **gar kein Body-Schema** – die Arrays waren
vollständig frei wählbar.

Zwei entscheidende Details machten das ausnutzbar:

1. Die eigentliche Schreib-Adresse ist die `_id` (`<docType>:<uuid>`), nicht das `docType`-Feld.
   Ein Paket-Eintrag mit `_id: "benutzer:opfer"` überschreibt also das Benutzerdokument.
2. Queries (`findAllByType`) laufen dagegen über das `docType`-**Feld**. Ein Eintrag mit
   `_id: "spiel:x"` (Präfix unverdächtig), aber `docType: "benutzer", globaleRolle: "admin"` würde
   bei der Anmeldung als Benutzer gefunden. Deshalb müssen **beide** geprüft werden.

**Angriffskette (auf Prod erreichbar, ohne Env-Flag):** Jeder angemeldete Nutzer kann einen
Kopplungscode erzeugen (`POST /benutzer/mich/instanz-kopplungscode`, nur `requireAuth`), ihn zu
einem Instanz-Token einlösen, für ein Turnier mit `schreiben_voll` (jeder Manager auf eigenen
Turnieren; auf der Demo per `zugriffFuerAlleBenutzer` sogar ein „benutzer") einen Checkout
anfordern und dann im Check-in ein `vollstaendigeUebertragung`-Paket schicken, dessen `spiele`-Array
z. B. `{_id:"benutzer:<eigene-id>", docType:"benutzer", globaleRolle:"admin"}` enthält →
**Selbst-Hochstufung zum Admin**; oder `systemeinstellungen:global` überschreiben. Damit war die
Rollen-Grenze Manager→Admin durchbrochen.

Der `/turniere/sync-import`-Pfad prüfte für *bestehende* Turniere immerhin `globaleRolle==="admin"`
der koppelnden Instanz; der Check-in-Pfad (`vollstaendigeUebertragung`) tat das nicht – und die
fehlende Dokument-Validierung galt für beide.

## Fix

Neue reine Prüf-Funktion `pruefeTurnierExportPaket` (`backend/src/sync/validierung.ts`, ohne
DB-Zugriff, daher im normalen `npm test` abgedeckt). Sie validiert vor jedem Schreiben:

- **`_id`-Präfix UND `docType`-Feld** je Dokument gegen den erwarteten Typ (beide nötig, s. o.).
- **Turnier-Zugehörigkeit**: `mannschaftImTurnier`/`spiel`/`schiedsrichterImTurnier` müssen
  `turnierId === paket.turnier._id` tragen; `spieler` müssen an einer Mannschaft **dieses** Pakets
  hängen (`mannschaftId` ∈ Paket-Mannschaften). Stammdaten (turnierübergreifend) bekommen die
  Typ-Prüfung, damit über sie kein Fremd-Dokument (z. B. `benutzer:`) **angelegt** werden kann.
- Optional `erwarteteTurnierId`: erzwingt, dass das Paket zum tatsächlich ausgecheckten Turnier
  gehört (Check-in), nicht nur intern konsistent ist.

Verdrahtung (fail closed):

- `importiereTurnierExport` ruft die Prüfung als **verpflichtende, nicht umgehbare** erste Zeile
  auf und wirft bei Verstoß – letzte Verteidigungslinie auch für künftige Aufrufer.
- `POST /instanzen/checkin`: flaches Body-Schema ergänzt; jeder Übertragungs-Eintrag wird vorab mit
  `erwarteteTurnierId = eintrag.turnierId` geprüft, ein manipulierter Eintrag wird **verworfen und
  geloggt** (nicht die ganze Anfrage abgebrochen).
- `POST /turniere/sync-import`: Paket wird vorab geprüft, bei Verstoß **400** mit klarer Meldung.

## Verifikation

- 10 neue Unit-Tests (`validierung.test.ts`) decken den Gutfall und je einen Angriffsfall ab
  (fremdes `_id`-Präfix, getarntes `docType`, fremde `turnierId`, Fremd-Dokument via Vereins-Array,
  falscher Wettbewerbs-Typ, fremde `mannschaftId`, Nicht-Array, kaputtes Turnier-Dokument,
  `erwarteteTurnierId`-Mismatch).
- `npm run test:integration` (echte CouchDB) läuft vollständig grün, **0 übersprungen** – die
  bestehenden Turnier-Sync-Integrationstests (realer Export/Import/Check-in-Pfad) bestätigen, dass
  der Guard das legitime Feature nicht bricht (`sammleTurnierExport` erzeugt stets ein Paket, das
  die Prüfung besteht).

## Rollout

Die Änderung ist reiner Backend-Code – wirkt erst nach Rebuild + Neustart der jeweiligen Instanz
(Prod **und** Demo), nicht allein durch den Commit. Kein Datenmodell-/Schema-Wechsel, keine
Migration nötig.

## Nicht Teil dieses Commits (aus derselben Sicherheitsdurchsicht, separat vorgesehen)

- Kein Rate-Limiting / Brute-Force-Schutz auf Netzwerkebene (Login-Lockout als DoS-Vektor).
- Fehlende Security-Header (kein Helmet/nginx `add_header`, HSTS).
- Audit-Felder (`erstelltVon`/`zuletztBearbeitetVon`) über den Turnier-PUT client-setzbar.

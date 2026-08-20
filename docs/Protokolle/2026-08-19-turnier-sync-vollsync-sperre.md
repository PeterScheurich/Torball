# Turnier-Sync: /api-Bugfix, Voll-Synchronisation im Check-in, Server-Schreibsperre

**Datum:** 19.08.2026

Drei zusammenhängende Änderungen am Turnier-Sync
(Grundmodell: `docs/Protokolle/2026-08-13-turnier-sync-grundlage.md`), ausgelöst durch den
**ersten echten Kopplungsversuch** einer lokalen Windows-Installation gegen die echte
Prod-Domain.

## 1. Bugfix: fehlendes `/api`-Präfix bei allen drei Instanz-zu-Instanz-Aufrufen

`sync/checkin.ts`, `routes/sync.ts` (Kopplung einlösen) und `routes/turnierSync.ts` (Upload)
riefen `${serverUrl}/instanzen/...` bzw. `${serverUrl}/turniere/sync-import` direkt auf. Der
Zentrale-Plattform-Server läuft aber normalerweise hinter nginx (`SERVE_FRONTEND=false`), dessen
Backend-Routen von außen nur unter dem `/api`-Präfix erreichbar sind (`location /api/` in
`deploy-instanz.sh`). Ohne Präfix landete die Anfrage bei nginx' SPA-Auslieferung – **200 OK mit
HTML statt JSON**, `.json()` scheiterte still (`.catch(() => ({}))`), die Kopplung brach mit der
nichtssagenden Meldung „Kopplung fehlgeschlagen." ab.

Per `curl` verifiziert (ohne `/api`: 405 + `text/html`; mit `/api`: korrekte JSON-Fehlermeldung).
**Das komplette Turnier-Sync-Feature war damit seit seiner Einführung (13.08.) gegen eine echte
nginx-gefrontete Zentrale Plattform nie funktionsfähig** – nur eine direkte
Backend-zu-Backend-Verbindung ohne nginx hätte funktioniert; im bisherigen Testbetrieb offenbar
nie geprüft. Lehre: den echten Deploy-Pfad (inkl. Reverse-Proxy) früh mittesten, nicht nur die
Direktverbindung.

## 2. Check-in überträgt den vollständigen Turnierstand (Nutzer-Entscheidung)

Beim Live-Test fiel auf, dass Regel-/Mannschafts-/Schiedsrichter-Änderungen sowie die
`oeffentlich*`-Freigabe-Häkchen **nie** zum Server zurückgemeldet wurden – der Check-in (alle
45 s) pushte nur ausgewählte Spiel-Felder (`ergebnisA/B`, `status`, …). Der „Zum Server
hochladen"-Knopf sah wie ein Ausweg aus, funktioniert bei einem ausgecheckten Turnier
serverseitig aber gar nicht (409 „wird gerade aktiv verwaltet").

Abgewogene Alternativen: (a) Check-in um eine vollständige Übertragung erweitern, oder (b) nur
den 409-Guard für die eigene Instanz lockern (rein manuell). **Entscheidung für (a)** – bewusst
kein echter bidirektionaler Konfliktabgleich, sondern derselbe Export/Import-Mechanismus wie beim
initialen Download/Upload (`sammleTurnierExport`/`importiereTurnierExport`, `ersetzen: true`),
jetzt bei **jedem** Check-in. Der Server-Stand bleibt so automatisch aktuell, solange eine
Verbindung besteht; „Freigabe aufheben" bleibt der manuelle Notausstieg bei
Rechnerverlust/-defekt. `CheckinBody.ergebnisPush` ist komplett entfallen, ersetzt durch
`vollstaendigeUebertragung`.

## 3. Server-seitige Schreibsperre für ausgecheckte Turniere (direkte Folge von 2.)

Mit der Voll-Synchronisation würde jede direkte Server-Änderung beim nächsten Check-in ohnehin
überschrieben – die Sperre verhindert vor allem Verwirrung bei mehreren Personen mit Zugriff auf
dasselbe Turnier. `turnierAusgecheckt()` (`backend/src/auth/turnierZugriff.ts`) prüft auf einen
`TurnierCheckout` mit Status `angefordert` **oder** `aktiv` (beide zählen als gesperrt).

Anders als `turnierGesperrt()` (abgeschlossenes Turnier) **ohne** Ausnahme für die
Öffentlich-Freigabe – auch die `oeffentlich*`-Felder werden von der Voll-Synchronisation
überschrieben. Eingebaut an denselben Stellen wie `turnierGesperrt()` (turnier/mannschaft/
spieler/schiedsrichter/spiel/spielplan) sowie zusätzlich in der öffentlichen
Token-Ergebniserfassung (`ergebnisToken.ts`) – ein alter, noch aktiver Erfassungslink hätte sonst
an der Sperre vorbei weiterschreiben können.

**Frontend-Kennzeichnung bewusst schlank** (Nutzer-Vorgabe): statt jedes Feld zu deaktivieren,
wird nur der Turniername in der `<h1>` rot mit Zusatz „(gesperrt)" dargestellt (auch in
`SpielleitungCodePage`); Details erklärt das Hilfe-Thema „Lokale Installation & Turnier-Sync".
Zusätzlich (Nutzer-Vorschlag) kennzeichnet die Turnierliste ausgecheckte Turniere per
Stop-Schild-Emoji (🛑) statt des Logos – `GET /turniere` reichert dafür jedes Turnier um ein
reines Anzeige-Feld `ausgecheckt` an (eine einzige Abfrage über alle aktiven Checkouts, kein
Zugriff pro Zeile).

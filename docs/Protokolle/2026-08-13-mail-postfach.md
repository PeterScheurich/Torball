# 2026-08-13 – Mail-Postfach (dev-only Feedback-Postfach → KI-Zusammenfassung → Kanban)

Peter möchte ein zentrales Feedback-Postfach für die Torball-Turniere-Software (Fehlermeldungen,
Lob, Anregungen, Kritik, Spam) direkt aus der Anwendung heraus durchsuchen/abarbeiten können. Neue
Anforderungen sollen automatisch per KI erkannt und als Kanban-Karten übernommen werden; eine
Zusammenfassung der neuen Mails soll täglich (Uhrzeit über die Oberfläche einstellbar) oder manuell
per Knopf entstehen und sowohl in der App angezeigt als auch per Mail verschickt werden. Die
Funktion existiert bewusst **nur auf der Entwicklungsinstanz**.

Diese Idee wurde am 2026-08-12 (Memory `project-backlog-mail-tagesreport`) schon einmal grob
eruiert, dort mit UI-konfigurierbarem IMAP-Postfach + verschlüsseltem Passwort in CouchDB +
eigenem `istEntwickler`-Flag skizziert. Die tatsächliche Umsetzung übernimmt den ersten Punkt
(alle Konfigurationsdaten über die Oberfläche, explizite Nutzer-Vorgabe), vereinfacht aber zwei
Punkte bewusst:

- **Kein separates `istEntwickler`-Flag.** Die Zugriffssteuerung ist doppelt gruppiert: ein
  Env-Flag `MAIL_POSTFACH_AKTIV` (existiert nur auf Dev, analog `KANBAN_SYNC`/
  `DEMO_SNAPSHOT_ERLAUBT`) **und** Admin-Rolle – auf Prod/Demo fehlt die Funktion ohnehin komplett.
  Bewusst weiterhin ein **Env**-Flag (nicht Teil der UI-Einstellungen): es steuert, ob die Funktion
  auf dieser Instanz überhaupt existiert (Routen registriert, Menüpunkt sichtbar) - eine
  Oberflächen-Einstellung könnte ein Admin versehentlich auch auf einer Prod-/Demo-Instanz
  einschalten, ein `.env`-Flag verlangt dafür Server-Zugriff + Neustart.
- **Kein Verschlüsseln des IMAP-Passworts/API-Keys in CouchDB.** In dieser Codebase liegt auch das
  TOTP-Secret unverschlüsselt in CouchDB (Schutz nur über DB-Zugriffskontrolle + "nie über die API
  zurückgeben") - für IMAP-Passwort/Anthropic-API-Key wird exakt dasselbe etablierte Muster
  verwendet (write-only, nie in GET-Antworten), statt eine neue, in der Codebase sonst nirgends
  vorhandene Verschlüsselungs-Infrastruktur nur für dieses eine Feature einzuführen.

**Alle übrigen Konfigurationsdaten (IMAP-Host/Port/Benutzer/Passwort, Anthropic-API-Key,
Bericht-Empfänger, Berichtszeit) werden über die Oberfläche gepflegt** (Singleton-Dokument
`mailPostfachEinstellungen` in CouchDB, analog `Systemeinstellungen`) - `backend/.env` enthält für
dieses Feature nur noch das Aktiv-Flag. Dazu zwei Test-Knöpfe in den Einstellungen
("Verbindung testen" / "API-Key testen", Nutzer-Vorgabe), die die aktuell im Formular stehenden
Werte gegen den echten IMAP-Server bzw. die Anthropic-API prüfen, ohne zu speichern.

## Entscheidungen (vom Nutzer abgefragt)

- Anforderungserkennung **automatisch per KI**: Kanban-Karten werden automatisch angelegt, aber
  klar als `kiErstellt: true`/„KI · ungeprüft" markiert (neue optionale Felder an `KanbanKarte`:
  `herkunft`, `kiErstellt`, `quellMailId`). Zusätzlich gibt es einen manuellen
  „Als Kanban-Karte übernehmen"-Knopf pro Mail, auch wenn die KI keine Anforderung erkannt hat.
- KI-Einsatz über die Anthropic API (API-Key aus den Oberflächen-Einstellungen, Modell
  `claude-sonnet-5`). **Prompt-Injection:** Mail-Inhalt ist fremder, ungeprüfter Nutzerinhalt und wird im System-Prompt
  explizit als reine Klassifikations-DATEN markiert, nie als Anweisung. Blast-Radius bleibt klein –
  höchstens eine falsche/unnütze, klar markierte Karte, keine sonstige Aktion.
- Bericht-Ausgabe **beides**: in der App sichtbar (`MailPostfachPage`) und per Mail verschickt
  (nutzt den bestehenden `sendeMail()`-Transport aus `backend/src/mail/transport.ts`).
- Dev-Only-Sperre über das Backend-Env-Flag `MAIL_POSTFACH_AKTIV`.

## Datenmodell (`shared/src/types/mail.ts`)

Drei neue `docType`s: `mailNachricht` (eine abgerufene Mail inkl. KI-Kategorie/-Zusammenfassung),
`mailBericht` (Ergebnis eines Berichtslaufs, inkl. `kiInputTokens`/`kiOutputTokens` aus
`response.usage` des Anthropic-Aufrufs - für eine grobe Kostenabschätzung direkt im Bericht, ohne
den Anthropic-Console-Umweg), `mailPostfachEinstellungen` (Singleton, feste ID
`mailPostfachEinstellungen:global`: `berichtszeit`, `berichtEmpfaenger`, `imapHost`/`imapPort`/
`imapUser`/`imapPasswort`, `anthropicApiKey`, plus interne Zähler `letzteImapUid`/
`letzterAutomatischerLaufDatum`). Eigener Typ `MailPostfachEinstellungenOeffentlich` ohne
`imapPasswort`/`anthropicApiKey` (stattdessen `imapPasswortGesetzt`/`anthropicApiKeyGesetzt` als
Booleans) für die API-Antwort - gleiches Muster wie `BenutzerProfil`/`oeffentlichesProfil()`.

## Backend (`backend/src/mail/`)

- `postfach.ts` – Env-Flag (`mailPostfachAktiv()`) + Singleton-Zugriff (Muster von
  `systemeinstellungen.ts`) + `oeffentlicheMailPostfachEinstellungen()` (filtert die Geheimwerte
  heraus, analog `oeffentlichesProfil()`).
- `imapClient.ts` – IMAP-Abruf via `imapflow` + `mailparser` (neue Abhängigkeiten, `imapflow`
  bringt eigene Typen mit, für `mailparser` zusätzlich `@types/mailparser`). `holeNeueMails()` und
  das neue `testeImapVerbindung()` (für den Test-Knopf: nur verbinden + trennen, kein Abruf)
  nehmen die Zugangsdaten als Parameter, lesen nichts aus `process.env`.
- `klassifikation.ts` – ein `@anthropic-ai/sdk`-Aufruf pro Berichtslauf (Batch aller neuen Mails),
  strikt strukturierte JSON-Antwort, API-Key als Parameter. `parseAntwort()` ist exportiert und
  eigenständig getestet (`klassifikation.test.ts`). Neues `testeAnthropicApiKey()` für den
  Test-Knopf: ein günstiger `models.list({ limit: 1 })`-Aufruf statt einer echten Klassifikation.
- `bericht.ts` – Orchestrierung: liest die Einstellungen einmal, prüft IMAP-Zugang bzw. API-Key
  vor dem jeweiligen Schritt (klare Fehlermeldung statt kryptischem Verbindungsfehler) → IMAP-Abruf
  → `MailNachricht`-Docs speichern → **IMAP-UID sofort fortschreiben** (bevor die KI-Klassifikation
  läuft) → alle noch unverarbeiteten Mails (Feld `beruecksichtigtInBerichtId` fehlt) klassifizieren
  → Kanban-Karten für erkannte Anforderungen → `MailBericht`-Doc → Mailversand an
  `einstellungen.berichtEmpfaenger` (best effort). Die UID wird bewusst früh fortgeschrieben, damit
  ein Fehler in der KI-Klassifikation (z. B. fehlender API-Key) beim nächsten Lauf nicht zu
  IMAP-Duplikaten führt – die Mails bleiben stattdessen einfach unverarbeitet und werden erneut
  klassifiziert.
- `scheduler.ts` – `setInterval` alle 60s (analog `sync/checkin.ts`), aber Uhrzeit-Vergleich
  (`aktuelleZeit >= berichtszeit` statt `===`, damit eine knapp verpasste Minute den Tag nicht
  ausfallen lässt) statt festem Intervall. Es gibt noch keine Cron-Abstraktion im Projekt.

Routen (`routes/mailPostfach.ts`): alles außer `GET /mail-postfach/verfuegbar` (öffentlich, analog
`GET /auth/registrierung-verfuegbar`) ist admin-only **und** hinter `MAIL_POSTFACH_AKTIV` gesperrt –
identisches Muster wie der Kanban-Import in `routes/kanban.ts`. `PUT /mail-postfach/einstellungen`
folgt der CLAUDE.md-Konvention "optionale Felder leeren": ein **fehlendes** Feld
(`imapPasswort`/`anthropicApiKey`) lässt den gespeicherten Wert unverändert (das Formular zeigt die
Geheimwerte nie an), ein **explizites `null`** löscht ihn gezielt (Knöpfe "Passwort entfernen"/
"API-Key entfernen"). Die beiden neuen Test-Routen (`POST .../imap-testen`,
`POST .../anthropic-testen`) antworten bewusst mit **200 + `{ ok, fehler? }`** statt einem
HTTP-Fehlercode – ein fehlgeschlagener Test ist ein normales Ergebnis, kein Server-Fehler; fehlende
Felder im Body fallen auf den bereits gespeicherten Wert zurück (Test auch ohne erneute
Passwort-/Key-Eingabe möglich). Zusätzlicher CLI-Befehl `mail:bericht:erstellen` als
Konsolen-Fallback (`backend/src/cli/torball.ts`).

**Wichtige Nebenkorrektur:** `POST /mail-postfach/bericht` antwortete bei einem fehlgeschlagenen
Berichtslauf zunächst mit **502**, was im Frontend (`frontend/src/api.ts`) reserviert ist für "das
Backend selbst ist nicht erreichbar" und dort eine irreführende generische Meldung ("Läuft der
Server?") statt der eigentlichen Fehlermeldung auslöst – beim Browser-Test dieser Sitzung entdeckt
und auf **400** korrigiert.

## Frontend

`frontend/src/pages/MailPostfachPage.tsx`: Liste/Suche/Filter, manuelle Kanban-Übernahme, sowie ein
vollständiges Einstellungen-Formular (Berichtszeit, Bericht-Empfänger, IMAP-Host/Port/Benutzer/
Passwort, Anthropic-API-Key) mit "Verbindung testen"/"API-Key testen"-Knöpfen (Ergebnis inline,
✓/✗) und "Passwort entfernen"/"API-Key entfernen" für die beiden Geheimwerte. Admin-Menü in
`App.tsx` zeigt den Menüpunkt nur, wenn `GET /mail-postfach/verfuegbar` true liefert (Abfrage läuft
unabhängig vom Login-Status, damit kein Admin-Login nötig ist, um die Sichtbarkeit zu prüfen).
Kanban-Board zeigt ein „KI · ungeprüft"-Badge auf automatisch erstellten Karten.

## Noch offen für Peter

`backend/.env` braucht für dieses Feature nur noch `MAIL_POSTFACH_AKTIV=true` auf der
Dev-Instanz - IMAP-Zugang, Anthropic-API-Key und Bericht-Empfänger werden anschließend direkt in
der App unter Admin → Mail-Postfach → Einstellungen eingetragen (inkl. Test-Knöpfe, um beides vor
dem ersten echten Berichtslauf zu prüfen).

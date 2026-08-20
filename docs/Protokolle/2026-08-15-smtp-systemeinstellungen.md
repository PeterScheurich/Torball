# E-Mail-Versand (SMTP) von `.env` in die Systemeinstellungen verlegt

**Datum:** 15.08.2026

## Ausgangslage

Der SMTP-Versand (Einladungen, Passwort-Reset) wurde bisher über fünf `SMTP_*`-Variablen in
`backend/.env` konfiguriert. Das bedeutete: Einrichtung nur mit Dateisystem-Zugriff auf den
Server, kein Test ohne Neustart, und eine zweite, getrennte SMTP-Konfiguration für den
Mail-Postfach-Bericht-Versand. Nutzer-Vorgabe: analog zum bereits `.env`-freien Mail-Postfach
(IMAP-Zugang/Anthropic-Key) soll auch SMTP über die Oberfläche gepflegt werden.

## Entscheidung

SMTP wird Teil der **Systemeinstellungen** (Singleton-Dokument, Admin-only): `smtpHost`,
`smtpPort`, `smtpUser`, `smtpPasswort`, `smtpAbsender` plus ein eigener Schalter
**`mailversandAktiv`** – bewusst unabhängig von vollständig gesetzten Zugangsdaten, damit sich
SMTP eintragen und per „Verbindung testen"-Knopf (`POST /systemeinstellungen/smtp-testen`,
`nodemailer`s `transporter.verify()`) prüfen lässt, **bevor** live Mails verschickt werden.

`smtpPasswort` wird nie über GET zurückgegeben (nur `smtpPasswortGesetzt` – gleiches Write-only-
Muster wie beim Mail-Postfach und TOTP-Secret).

## Umsetzung

- `backend/src/mail/transport.ts` komplett auf Parameter statt `process.env` umgestellt
  (`sendeMail(verbindung, optionen)`, analog `imapClient.ts`); `smtpVerbindungAus()`
  (`backend/src/systemeinstellungen.ts`) liefert die Verbindung oder `undefined`, wenn nicht
  aktiviert/unvollständig.
- Die drei Aufrufstellen in `routes/benutzer.ts` (Einladung, admin-ausgelöster Reset,
  „Passwort vergessen") fallen ohne Verbindung unverändert auf Link-in-Antwort bzw. Server-Log
  zurück – die App bleibt ohne SMTP-Konto voll nutzbar.
- Auch der **Mail-Postfach-Bericht-Versand** (`mail/bericht.ts`) nutzt jetzt dieselbe zentrale
  SMTP-Konfiguration – ein Admin pflegt nur noch eine Zugangsdaten-Stelle für sämtlichen
  ausgehenden App-Mailversand.
- Aufgeräumt: `torball konfiguration:setzen` kennt `SMTP_*` nicht mehr (Allowlist bereinigt);
  der Windows-Installer fragt SMTP beim Ersteinrichten nicht mehr ab.

## Im selben Zeitraum (eigene Commits, gleicher Themenkreis)

- **Benachrichtigung bei neuem Account** (16.08. fertiggestellt):
  `Systemeinstellungen.benachrichtigungEmpfaenger` – eine feste, optionale Zieladresse bekommt
  eine kurze Mail bei Selbstregistrierung oder Einladungs-Annahme (nicht bei der
  Bootstrap-Ersteinrichtung). Best effort: ein Fehlschlag wird nur geloggt, blockiert nie die
  Registrierung (`benachrichtigeNeuenAccount()` in `backend/src/systemeinstellungen.ts`).
- **`FRONTEND_URL`-Fallback in `deploy-instanz.sh`** korrigiert: fiel beim Erstanlegen wörtlich
  auf `http://_:8080` zurück (nginx-Catch-all `_` als Hostname), jetzt auf die primäre Host-IP –
  live aufgefallen durch einen kaputten Link in einer Passwort-Reset-Mail auf Prod.
- **„Einladung erneut senden"** (✉-Button in der Benutzerverwaltung, nur bei offener Einladung):
  frischer Token, alter wird ungültig – für den Fall, dass die Original-Mail nie ankam (z. B.
  weil SMTP zum Einladungszeitpunkt noch nicht eingerichtet war).

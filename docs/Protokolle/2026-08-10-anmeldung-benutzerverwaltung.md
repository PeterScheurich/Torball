# Protokoll: Anmeldung und Benutzerverwaltung

**Datum:** 10.08.2026
**Ziel dieser Sitzung:** Abschnitt 10/21/25 der Gesamtspezifikation umsetzen -
Login, Sessions, Zwei-Faktor-Authentifizierung, Benutzerverwaltung und die
Anbindung des Berechtigungskonzepts an die bestehenden Turnier-/Mannschafts-/
Spiel-/Spielplan-Routen. Diese Sitzung lief unbeaufsichtigt (Nutzer nicht am
Bildschirm); Entscheidungen, bei denen keine Rückfrage möglich war, sind unten
explizit als solche markiert.

---

## 1. Vorgehen und Scoping-Entscheidungen

**Warum in einer Sitzung statt inkrementell:** Ohne Login gab es bislang gar
keinen Zugriffsschutz - jede Zwischenstufe ("Login existiert, aber schützt
noch nichts") wäre selbst schon eine Sicherheitslücke gewesen. Deshalb wurden
Auth-Grundlage und die Anbindung an bestehende Routen in derselben Sitzung
fertiggestellt, bevor der Server wieder produktiv nutzbar sein sollte.

**Bewusst zurückgestellt** (nicht in dieser Sitzung umgesetzt):

- **E-Mail-Versand:** Es ist noch kein SMTP-Anbieter angebunden. Einladungs-
  und Passwort-Reset-Links werden deshalb (a) bei Einladungen direkt in der
  API-Antwort an die einladende Person zurückgegeben und (b) bei
  Passwort-Reset ins Server-Log geschrieben, statt per E-Mail verschickt zu
  werden. **Entscheidung, die eigentlich eine Rückfrage verdient hätte:**
  welcher E-Mail-Versand (eigener SMTP, SendGrid, Postmark, …) angebunden
  werden soll - das ist eine Konto-/Kosten-Entscheidung, die nicht ohne
  Absprache getroffen werden sollte.
- **Systemkonfiguration-Anbindung:** Die Passwort-Mindestlänge (Abschnitt
  21.4) ist aktuell im Code hartkodiert (`backend/src/auth/passwort.ts`)
  statt aus der `Systemkonfiguration` zu lesen - dieses Dokument hat noch
  keine CRUD-Routen.
- **Rate-Limiting/Lockout nach Fehlversuchen:** Nicht umgesetzt. Kein
  expliziter Spezifikations-Punkt, aber eine sinnvolle Ergänzung für den
  Login-Endpunkt.
- **Öffentliche, unauthentifizierte Turnier-Ansicht:** Abschnitt 21.2 sieht
  vor, dass aktive Turniere mit passenden Öffentlichkeits-Flags ohne Anmeldung
  sichtbar sind. Es gibt aber noch **keine** separate öffentliche Ansicht in
  diesem Projekt - die bisherige Oberfläche ist durchgängig die
  Turnierleitungs-Sicht. Deshalb verlangt aktuell die **gesamte** bestehende
  Oberfläche eine Anmeldung; die granulare öffentliche Sicht ist ein
  eigenständiges, noch zu bauendes Feature (siehe „Offene Punkte" unten).
- **Feinsteuerung für Verein/Team (Stammdaten):** Die Spezifikation
  unterscheidet hier keine Rollen. Es gilt deshalb vereinfacht: angemeldet
  reicht (jede Rolle), es gibt keine turnierbezogene Einschränkung.

---

## 2. Datenmodell-Ergänzungen

- **Neuer docType `session`** ([`shared/src/types/session.ts`](../../shared/src/types/session.ts)):
  server-seitige Login-Session. `_id` ist bewusst der SHA-256-Hash des
  Cookie-Tokens (nicht eine zufällige UUID) - das erlaubt einen direkten
  `findById`-Lookup pro Request statt einer Selector-Abfrage über alle
  Sessions. Der Klartext-Token wird nie persistiert.
- **`Benutzer` erweitert** ([`shared/src/types/benutzer.ts`](../../shared/src/types/benutzer.ts)):
  `einladungTokenHash`/`einladungAblauf` (Einladungs-Flow) und
  `resetTokenHash`/`resetAblauf` (Passwort-Reset) - beides nach demselben
  Hash-statt-Klartext-Prinzip wie bei Sessions.

## 3. Backend: Auth-Bausteine (`backend/src/auth/`)

| Datei | Zweck |
|---|---|
| `passwort.ts` | Hashing (bcryptjs, 12 Runden) + Policy-Check (Abschnitt 21.4) |
| `session.ts` | Session anlegen/finden/löschen, gleitendes Inaktivitäts-Fenster |
| `totp.ts` | TOTP-Secret/otpauth-URI/QR-Code (otplib + qrcode) |
| `token.ts` | Einladungs-/Reset-Tokens (Zufallswert + SHA-256-Hash) |
| `plugin.ts` | `req.benutzer`-Hook, Session-Cookie setzen/löschen, `requireAuth`/`requireRolle` |
| `turnierZugriff.ts` | Zugriffsstufe (`lesen`/`schreiben`) je Turnier berechnen |
| `benutzerProfil.ts` | Entfernt sensible Felder (Hashes, Secrets) aus API-Antworten |

**Bibliotheks-Entscheidungen:**
- **bcryptjs statt bcrypt:** reines JavaScript, keine native Kompilierung -
  auf einem Windows-Entwicklungsrechner ohne Build-Toolchain-Garantie der
  robustere Weg. Für die zu erwartende Nutzerzahl dieser Anwendung ist der
  Geschwindigkeitsnachteil gegenüber dem nativen `bcrypt` irrelevant.
- **otplib v13:** deutlich andere API als ältere v12-Beispiele im Netz
  (kein `authenticator`-Singleton mehr, sondern einzelne Funktionen
  `generateSecret`/`generateURI`/`verify`) - vor dem Einbau per Node-Skript
  gegen die echte installierte Version verifiziert, nicht aus dem Gedächtnis
  übernommen.

**Wichtiger Bugfix während der End-to-End-Prüfung:** `otplib.verify()` wirft
bei formal ungültigen Codes (z. B. falscher Länge) eine Exception, statt
`{valid: false}` zurückzugeben. Ohne Behandlung hätte ein falsch eingegebener
2FA-Code zu einem `500 Internal Server Error` statt einem sauberen `401`
geführt. Per Try/Catch in `totpCodeGueltig()` behoben.

**Fastify-Falle bei der Registrierung:** `@fastify/cookie` und der
`req.benutzer`-Hook müssen **direkt auf der Root-Server-Instanz** registriert
werden (`server.addHook(...)` in `index.ts`), nicht innerhalb eines
verschachtelten Plugins - Fastifys Verkapselung würde sonst die Cookie-/
Benutzer-Decorators nur innerhalb dieses einen Plugin-Scopes sichtbar machen,
nicht in den als Geschwister-Plugins registrierten Routen-Dateien.

## 4. Backend: Routen

- **`/auth/*`** ([`routes/auth.ts`](../../backend/src/routes/auth.ts)): `login`
  (inkl. optionalem TOTP-Code, generische Fehlermeldung gegen
  E-Mail-Enumeration), `logout`, `me`, `bootstrap-verfuegbar` (öffentlich,
  für den Ersteinrichtungs-Hinweis auf der Login-Seite), `bootstrap-admin`
  (funktioniert nur, solange **kein** Benutzer existiert - löst das
  Henne-Ei-Problem der allerersten Anmeldung).
- **`/benutzer/*`** ([`routes/benutzer.ts`](../../backend/src/routes/benutzer.ts)):
  Liste/Anlage/Aktualisierung (admin/manager-gated, Manager darf keine Admins
  anlegen/bearbeiten), Einladungs-Flow, Passwort-vergessen/-reset,
  2FA einrichten/bestätigen/deaktivieren.
- **`/turniere/:id/berechtigungen`, `/berechtigungen/:id`**
  ([`routes/turnierBerechtigung.ts`](../../backend/src/routes/turnierBerechtigung.ts)):
  Vergeben/Auflisten/Entziehen von `TurnierBerechtigung` - technische
  Grundlage, damit das in Abschnitt 21.2 beschriebene Modell ("Wer
  Schreibrecht hat, kann Schreib- oder Leserecht vergeben; wer nur Leserecht
  hat, nur Leserecht") überhaupt nutzbar ist. **Es gibt noch keine
  Oberfläche dafür** - nur die API (siehe „Offene Punkte").

## 5. Autorisierung der bestehenden Routen

`backend/src/auth/turnierZugriff.ts` implementiert die Zugriffslogik aus
Abschnitt 21.1/21.2:

- **Admin:** immer Vollzugriff.
- **Manager:** immer Vollzugriff auf selbst erstellte Turniere
  (`turnier.erstelltVon === benutzer._id`).
- **Alle anderen Fälle:** richten sich nach vergebenen
  `TurnierBerechtigung`-Dokumenten (`turnierleitung`/`spielleitung` = Schreiben,
  `lesen` = Lesen).

Angewendet auf `turnier.ts`, `mannschaft.ts`, `spiel.ts`, `spielplan.ts`
(lesen für GET, schreiben für POST/PUT/DELETE, jeweils bezogen auf das
zugehörige Turnier) sowie `verein.ts`/`team.ts` (nur "angemeldet", siehe
Scoping oben).

**Altdaten-Kompatibilität:** Turniere, die vor dieser Sitzung angelegt wurden,
haben kein `erstelltVon`-Feld. Sie sind deshalb nur für Admins sichtbar/
bearbeitbar, bis ein Admin einem Manager/Benutzer explizit eine
`TurnierBerechtigung` dafür einträgt - das ist beabsichtigt (kein Nutzer soll
plötzlich Zugriff auf fremde Altdaten bekommen, nur weil er zufällig als
Manager angelegt wurde).

## 6. Frontend

- **`auth.tsx`:** `AuthProvider`/`useAuth()`, lädt beim Start `/auth/me`.
- **`components/GeschuetzteRoute.tsx`:** leitet zu `/login` um, wenn nicht
  angemeldet.
- **Neue öffentliche Seiten:** `LoginPage` (inkl. 2FA-Nachfrage),
  `ErsteinrichtungPage` (Bootstrap-Admin), `EinladungAnnehmenPage`,
  `PasswortVergessenPage`, `PasswortResetPage`.
- **Neue geschützte Seiten:** `ProfilPage` (2FA-Einrichtung mit QR-Code +
  Secret-Text für manuelle Eingabe), `BenutzerverwaltungPage` (Liste,
  Einladen mit sichtbarem Einladungslink, Rolle ändern, Sperren/Entsperren).
- **`App.tsx`:** Kopfzeile zeigt jetzt Name/„Abmelden" sowie einen
  „Benutzerverwaltung"-Link für admin/manager; „Neues Turnier anlegen" ist auf
  der Turnierliste für die Rolle „Benutzer" ausgeblendet (die serverseitige
  Prüfung bleibt davon unabhängig die eigentliche Absicherung).

## 7. End-to-End-Verifikation gegen die echte CouchDB

Da niemand am Bildschirm bestätigen konnte, wurde besonders sorgfältig
gegen die echte Dev-Datenbank getestet (nicht nur `npm run build`/`test`):

- Bootstrap-Admin anlegen, doppelter Bootstrap-Versuch → `409`.
- Login falsch/richtig, `/auth/me` mit/ohne Cookie.
- Benutzer einladen (inkl. Ablehnung zu schwacher Passwörter beim Annehmen),
  Login als frisch aktivierter Benutzer.
- Rollen-Hierarchie: Manager darf keinen Admin anlegen (`403`), „Benutzer"
  darf kein Turnier anlegen (`403`).
- Zugriffs-Isolation: Manager sieht das Turnier eines anderen Managers nicht,
  bis explizit `lesen`-Berechtigung vergeben wird; mit `lesen` ist Schreiben
  weiterhin verboten (`403`).
- 2FA: Einrichtung, Ablehnung falscher/formal ungültiger Codes, Login-Fluss
  mit angeforderter TOTP-Eingabe.
- Passwort-Reset: falscher/abgelaufener Token → `404`; nach erfolgreichem
  Reset ist die alte Session sofort ungültig (`401`) und der Token ist
  Einweg (zweite Nutzung → `404`).
- Frontend-Durchklick (Browser): Ersteinrichtung → automatischer Login →
  Turnierliste; Benutzerverwaltung-Seite; Abmelden → zurück zu `/login`.

Alle Testkonten/-turniere wurden anschließend wieder gelöscht (direkt per
CouchDB-Zugriff, da es bewusst **keinen** Benutzer-Löschen-Endpunkt gibt -
„Sperren" ist der vorgesehene Mechanismus, siehe Abschnitt 25.3). Das
bestehende Turnier „Turnier füenf" (vor dieser Sitzung angelegt) wurde nicht
berührt. Das System steht jetzt wieder auf „kein Benutzer vorhanden" - die
Ersteinrichtung mit dem eigenen, echten Admin-Account ist der erste Schritt
nach dieser Sitzung.

## 8. Spezifikations-Abgleich

Keine Abweichung von der Spezifikation entdeckt, die eine Korrektur des
Dokuments selbst nötig gemacht hätte - die oben gelisteten Zurückstellungen
(E-Mail-Versand, Systemkonfiguration-Anbindung, öffentliche Ansicht) sind
Umsetzungslücken, keine fachlichen Klärungsbedarfe. Deshalb hier keine
Änderung an `docs/torball_gesamtspezifikation.md` in dieser Sitzung.

---

## Offene Punkte für die nächste Sitzung

- **E-Mail-Versand anbinden** (Entscheidung nötig: welcher Anbieter) - erst
  danach sind Einladung/Passwort-Reset wirklich nutzbar, ohne dass Links
  manuell weitergegeben werden müssen.
- **Oberfläche für `TurnierBerechtigung`** (Zugriff auf ein Turnier
  gewähren/entziehen) - die API existiert, die UI fehlt noch.
- **Öffentliche, unauthentifizierte Turnier-Ansicht** (Abschnitt 21.2) als
  eigenständiges Feature.
- **Systemkonfiguration-CRUD**, damit die Passwort-Mindestlänge etc. nicht
  mehr hartkodiert ist.
- Rate-Limiting/Lockout nach wiederholten Fehlanmeldungen.

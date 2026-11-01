# OWASP-Top-10-Durchgang (2026-10-31)

## Anlass

Ein Tester (Turnierleiter) schrieb am 06.10.2026, man solle „zumindest mal die aktuellen OWASP Top 10
durchgehen“ – bei KI-erzeugtem Code seien die Top 10 ein häufiges Problem. Im August gab es drei
Sicherheitsdurchsichten (Backend, Frontend, Deploy) sowie Rate-Limiting, Sicherheits-Header und die
Absicherung des Sync-Imports, aber **keinen** Durchgang, der die zehn Kategorien ausdrücklich
abarbeitet. Dieses Protokoll holt das nach.

## Vorgehen

* Maßstab: **OWASP Top 10:2025** (A01 Broken Access Control, A02 Security Misconfiguration,
  A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design,
  A07 Authentication Failures, A08 Software or Data Integrity Failures, A09 Security Logging and
  Alerting Failures, A10 Mishandling of Exceptional Conditions). Die Liste wurde vorab auf
  `top10.owasp.org/2025` geprüft.
* Drei parallele, rein lesende Prüfer (je ein Schwerpunkt): A01+A06 / A02+A04+A07 /
  A03+A05+A08+A09+A10. Alle 137 Endpunkte, die Deploy-Skripte und das Frontend wurden durchgesehen.
* **Grenze:** Die Prüfer haben nichts gegen einen laufenden Server geprüft; ihre Funde sind aus dem
  Code abgeleitet. Deshalb wurde jeder Fund, der behoben wurde, **zuerst mit einem Test belegt (rot)**
  und danach behoben (grün). Funde, die nicht behoben wurden, sind als „gemeldet, nicht selbst
  nachvollzogen“ gekennzeichnet und stehen als Karten im Entwicklungs-Board.
* Zwei Funde wurden von **zwei Prüfern unabhängig** gemeldet (Typverwechslung, Code-Hashes), der
  Sync-Import ebenfalls.

## Behoben und belegt

| # | Fund | Schwere | Beleg |
|---|---|---|---|
| 1 | **Typverwechslung über Pfad-IDs.** `findById` prüfte den Dokumenttyp nicht. Routen wie `PUT /vereine/:id` nahmen an, die ID gehöre zu einem Verein, spreizten den Body in das gefundene Dokument und schrieben es zurück. Mit der ID eines Benutzerkontos ließ sich so z. B. die eigene Rolle oder ein Passwort-Hash ändern; `GET` verriet jedem angemeldeten Konto beliebige Dokumente (u. a. Systemeinstellungen mit dem SMTP-Passwort), `DELETE` löschte beliebige Dokumente. Die Body-Injektion (`_id`/`docType`) war im August abgesichert worden – der **Pfad**-Parameter nicht. | kritisch | `typverwechslung.integration.test.ts` (vorher `PUT /vereine/<benutzer-id>` → 200) |
| 2 | **Code-Hashes in Antworten.** `GET /turniere` und `GET /turniere/:id` lieferten das komplette Dokument samt der bcrypt-Hashes der drei Turnier-Codes an jeden Leser. Kurze, von Menschen gewählte Codes ließen sich offline knacken → Vollzugriff. | hoch | `turnier-codehashes.integration.test.ts` |
| 3 | **Sync-Import überschrieb fremde Turniere.** Bei `ersetzen:true` (jeder Check-in) wurde unter der mitgelieferten `_id` geschrieben und die `_rev` des dort vorhandenen Dokuments übernommen; geprüft wurde nur das *eingehende* Dokument. | hoch | `import-fremdes-turnier.integration.test.ts` |
| 4 | Tokens (Passwort-Reset, Einladung, Ergebnis-Erfassung) standen im Klartext in Log und Diagnose-Bericht („kann so weitergegeben werden“). | mittel | `logSchutz.test.ts` |
| 5 | Zentraler Fehler-Handler gab bei 5xx die Originalmeldung weiter (z. B. Datenbank-Adresse). | mittel | `fehlerBehandlung.test.ts` |
| 6 | `TRUST_PROXY` ohne Angabe: Auf der lokalen Installation (kein Proxy, `HOST=0.0.0.0`) konnte jedes Gerät im WLAN per gefälschtem `X-Forwarded-For` jedes Rate-Limit umgehen. Jetzt „niemandem vertrauen“, wenn `SERVE_FRONTEND` gesetzt ist. | mittel | `rateLimit.test.ts` |
| 7 | Turnier-Codes: keine Mindestlänge; ein geänderter oder gelöschter Code beendete die damit angemeldeten Sitzungen nicht. | mittel | `owasp-haertung.integration.test.ts` |
| 8 | `PUT /turniere/:id` ließ `status: "abgeschlossen"` zu und umging so Abschluss-Vorbedingung und Token-Widerruf. | mittel | `owasp-haertung.integration.test.ts` |
| 9 | Zwei Routen (Mannschafts-Reihenfolge, Schiedsrichter-Zuordnung) prüften ein abgeschlossenes Turnier nicht. | niedrig | `owasp-haertung.integration.test.ts` |
| 10 | Instanz-Token eines gesperrten Kontos blieb gültig. Freigabe an ein gesperrtes Konto war möglich. | niedrig | `owasp-haertung.integration.test.ts` |
| 11 | Öffentliche Seite: Die Sektion „Spielplan“ lieferte Ergebnisse auch ohne Freigabe der Ergebnisse. | niedrig | `owasp-haertung.integration.test.ts` |
| 12 | `/ableiten` vererbte den Protokollant-Code. | niedrig | Codeänderung (der Kommentar dort behauptete das Gegenteil) |
| 13 | YouTube-Prüfung akzeptierte `evilyoutube.com` (`endsWith`); die ID wurde nicht auf erlaubte Zeichen geprüft. | niedrig | Gegenprobe mit Beispiel-URLs |

Zusätzlich aus dem **Datenschutz-Hinweis** desselben Testers (kein Teil des Durchgangs, aber dieselbe
Kategorie A01): Die Freigabe eines Turniers erfolgt nicht mehr aus einer Liste aller Benutzer, sondern
über die genaue E-Mail-Adresse (`0462d4b`).

## Stand der übrigen Funde (aktualisiert am 01.11.2026)

Seit dem Durchgang zusätzlich **behoben**: das Zählen falscher 2FA-Codes samt Schutz vor Wiederverwendung, die
Bestätigung durch Passwort bzw. Code bei sensiblen Konto-Aktionen und die eingeschränkte Benutzersicht für
Manager.

Die **übrigen Punkte** sind als Karten im Entwicklungs-Board geführt (Titel beginnen mit „Sicherheit:“). Dort stehen
auch die Einzelheiten; sie sind hier bewusst nicht ausgeführt, solange keine Lösung ausgerollt ist. Betroffen sind
die Wiederherstellung von Konten durch Manager, die Ersteinrichtung, die Netzwerkfreigabe der lokalen Installation,
die Kopplung von Instanzen, ein Audit-Log und gebündelte kleinere Härtungen.

## War in Ordnung (Auszug)

bcrypt Cost 12 und Dummy-Hash gegen Timing-Enumeration; alle Zufallswerte aus `crypto`;
Session-/Reset-/Einladungs-/Kopplungs-/Instanz-Tokens nur als SHA-256-Hash gespeichert (256 Bit);
Cookie HttpOnly/SameSite=Lax; kein CORS; Mango-Selektoren nie aus Request-Daten gebaut (die
Fastify-Schemata verhindern Operator-Objekte); keine Befehlsinjektion (feste Befehle, validierte
Instanznamen); kein XSS-Pfad gefunden (`dangerouslySetInnerHTML` nur für das lokal erzeugte
QR-SVG); `package-lock.json` eingecheckt, `npm audit` nur drei bekannte moderate Funde zu
`@fastify/static`; CouchDB nur auf `127.0.0.1`, Dienstbenutzer ohne Login, `.env` mit 0600; die
Rollen-/Stufenprüfung an allen turnierbezogenen Schreib-Routen.

## Auswertung der Server-Protokolle

Prod und Demo wurden **lesend** auf Anzeichen einer Ausnutzung von Fund 1 untersucht (Journal seit
dem 12.08., URL-Muster `/vereine|/teams|/schiedsrichter-stammdaten/<ID fremden Typs>`, auch
URL-kodiert): **keine Treffer.** Einschränkung: Das Journal reicht nur bis zum 12.08. zurück, und
erfasst sind nur Anfragen, die über Fastify liefen.

## Lehren

* **Ein Generic ist keine Laufzeitprüfung.** `findById<Verein>(id)` sah typsicher aus, prüfte aber
  nichts. Der Typ ist jetzt ein Pflichtparameter (`findById(id, "verein")`); wer bewusst ohne Typ
  liest, schreibt `findByIdUngeprueft` – das fällt im Review auf.
* Eine Absicherung gegen ein Muster (Body-Injektion im August) schützt nicht vor dem **Zwillingsmuster**
  (Pfad-Injektion). Beim nächsten Fund dieser Art: alle Eingabewege durchgehen, nicht nur den
  gemeldeten.
* Die Integrationstests sind nur mit CouchDB lauffähig und deshalb nicht Teil des normalen
  `npm test`; zwei von ihnen waren seit der Passwort-Umstellung (30.08.) rot, ohne dass es auffiel.
  Vor jedem Release `npm run test:integration` – und bei Sicherheitsänderungen vor dem Commit.
* Öffentliches Spiegel-Repository: Commit-Texte zu einer noch **nicht ausgerollten** Lücke neutral
  halten und Einzelheiten erst nach dem Deploy dokumentieren (so geschehen: dieses Protokoll
  entstand nach dem Commit der Korrektur).

## Ausgeführte Schritte (Auszug)

```bash
npm run build --workspace=shared && npm run build
npm run lint
npm run test --workspace=backend
COUCHDB_URL=http://<dev-couchdb>:5984 npm run test:integration --workspace=backend   # Ergebnis: 126 von 126
# Typverwechslung: Pflichtparameter + Umstellung von 142 Aufrufstellen per Skript, danach tsc
```

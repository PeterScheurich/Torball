# Rate-Limiting + zeitbasierte Login-Sperre (Sicherheitsdurchsicht #2)

**Datum:** 20.08.2026

Zweiter Punkt aus der Sicherheitsdurchsicht der Server-Version (der erste war der Sync-Import,
`2026-08-20-turnier-sync-import-absicherung.md`). Zwei zusammenhängende Härtungen gegen Brute-Force
und einen Denial-of-Service.

## Befund

1. **Kein Rate-Limiting auf Netzwerkebene:** Login, Registrierung, „Passwort vergessen",
   Instanz-Kopplung und Turnier-Code-Anmeldung waren völlig ungebremst – die Zentrale Plattform ist
   öffentlich erreichbar.
2. **Die Konto-Sperre war selbst ein DoS-Vektor:** Nach 10 Fehlversuchen wurde ein Konto **dauerhaft**
   `gesperrt` (nur Admin/Passwort-Reset hob das auf). Wer eine E-Mail-Adresse kannte, konnte das
   zugehörige Konto damit gezielt und dauerhaft aussperren.

## Entscheidungen (mit dem Nutzer abgestimmt)

- **Login-Sperre zeitbasiert statt hart** (statt dauerhaft `gesperrt`).
- **`TRUST_PROXY` per Env konfigurierbar**, mit sinnvollem Default für den aktuellen Betrieb.

## Umsetzung

### Zeitbasierte Login-Sperre

- Neues Feld `Benutzer.loginKontoGesperrtBis` (`shared/src/types/benutzer.ts`). Ab
  `FEHLVERSUCHE_SCHWELLE = 5` Fehlversuchen wird eine **eskalierende Abkühlzeit** gesetzt
  (`abkuehlzeitMs`, 2 Min. → gedeckelt bei 30 Min.), keine dauerhafte Sperre mehr. Während der
  Abkühlzeit wird das Passwort gar nicht erst geprüft – Antwort bewusst dieselbe generische Meldung
  wie bei falschem Passwort (keine Enumeration, kein Timing-Leak; identisch zum „Konto existiert
  nicht"-Fall). Ein erfolgreicher Login, ein Passwort-Reset und ein Admin-Entsperren löschen die
  Abkühlzeit + setzen den Zähler zurück.
- `Benutzer.gesperrt`/`gesperrtGrund` (bewusste **Admin**-Sperre, Spec 25.3) bleiben unverändert.
  Der alte Wert `gesperrtGrund: "fehlversuche"` entsteht nicht mehr neu, wird für Altbestände (schon
  hart gesperrte Konten) aber weiter von einem Reset aufgehoben.

### Rate-Limiting (`@fastify/rate-limit`, neue Dependency)

Zentrale Konfiguration in `backend/src/rateLimit.ts`:
- **Global** großzügig (`1000/min` je IP) – reine Flut-Absicherung, stört den Normalbetrieb nicht
  (Spielort-Geräte teilen sich hinter NAT oft eine IP, und das Frontend pollt alle 10–30 s).
- **Streng** (`20/10 min` je IP) auf sicherheitssensible, nie in Massen legitime Endpunkte:
  `/auth/registrieren`, `/auth/bootstrap-admin`, `/benutzer/passwort-vergessen`,
  `/instanzen/kopplung-einloesen` (via `config.rateLimit` an der Route).
- **Mittel** (`60/10 min`) auf `/turniere/:id/code-anmeldung` – Brute-Force-Ziel (menschlich
  gesetzte Codes), aber am Spielort legitim von vielen Geräten kurz nacheinander benutzt.
- **Login selbst bekommt bewusst kein IP-Limit:** die zeitbasierte Sperre pro Konto drosselt
  Passwort-Raten IP-unabhängig – wichtig hinter NAT, wo ein IP-Limit legitime Anmeldungen eines
  ganzen Spielorts blockieren würde.

### Echte Client-IP hinter dem Proxy (`trustProxy`)

`ermittleTrustProxy()` liest `TRUST_PROXY`. **Default** (unset): Loopback + private Netzbereiche
vertrauen. Analyse: da alle vertrauten Proxys auf privaten/Loopback-Adressen sitzen, endet die
`X-Forwarded-For`-Auswertung bei der ersten **öffentlichen** (= echten) Client-IP; eine vom Client
injizierte Angabe steht links davon und wird ignoriert → korrekt für externen NPM-Betrieb **und**
LAN, ohne von außen fälschbar zu sein.

## Fallstrick (live gefunden und behoben)

`@fastify/rate-limit` **wirft** den Rückgabewert des `errorResponseBuilder`; der globale
`setErrorHandler` in `index.ts` macht daraus `reply.send(error)`. Nur bei einem echten **Error**-
Objekt übernimmt Fastify dessen `statusCode` (429) – ein Plain-Object wurde als normale **200**-
Antwort mit einem 429-aussehenden Body gesendet (der Client hätte die Drosselung also gar nicht als
Fehler erkannt). Beim Live-Rauchtest per `curl` aufgefallen und korrigiert: der `errorResponseBuilder`
gibt jetzt bewusst ein `Error` mit `statusCode` zurück, nicht ein Objekt-Literal.

## Verifikation

- 5 neue Unit-Tests (`rateLimit.test.ts`, ohne CouchDB): `TRUST_PROXY`-Parsing, Limit-Staffelung,
  globales 429 nach `max`, route-spezifisches strengeres Limit.
- Der bestehende Sperr-Test (`auth-sperre.test.ts`) auf das zeitbasierte Verhalten umgeschrieben;
  `test:integration` läuft vollständig grün (74 Tests, 0 übersprungen).
- **Live-Rauchtest** (gebootetes Backend auf Port 3999, per `curl`): `/benutzer/passwort-vergessen`
  liefert nach 20 Anfragen echtes HTTP 429 mit deutscher Meldung; genau so der 429/200-Fix oben
  verifiziert.

## Rollout

Reiner Backend-Code + neue Dependency – wirkt erst nach Rebuild + Neustart je Instanz (Prod **und**
Demo). `TRUST_PROXY` muss im Normalfall **nicht** gesetzt werden (Default passt). Kein
Datenmodell-Wechsel; das neue `Benutzer`-Feld ist optional, keine Migration nötig.

## Offen aus derselben Durchsicht

#3 (fehlende Security-Header / HSTS) sowie die kleineren Hinweise (Audit-Felder client-setzbar,
Login-Timing) – separat vorgesehen.

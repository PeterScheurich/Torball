# Kleinere Härtungen: Login-Timing + Audit-Felder (Sicherheitsdurchsicht, Restpunkte)

**Datum:** 20.08.2026

Abschluss der Sicherheitsdurchsicht: die beiden als „niedrig/Hinweis" eingestuften Punkte.

## 1. Login-Timing (User-Enumeration über die Antwortzeit)

`POST /auth/login` kehrte bei einem NICHT existierenden Konto (bzw. einem ohne `passwortHash`)
sofort zurück, ohne `bcrypt.compare` – bei einem existierenden Konto lief dagegen der (teure)
bcrypt-Vergleich. Über die messbar unterschiedliche Antwortzeit ließ sich so ableiten, ob eine
E-Mail-Adresse überhaupt registriert ist, obwohl die Fehlermeldung bewusst generisch ist.

**Fix:** `verbrenneLoginZeit()` (`backend/src/auth/passwort.ts`) führt einen `bcrypt.compare` gegen
einen festen, geheimwertfreien Dummy-Hash (Cost 12) aus. Aufgerufen an den beiden Login-Pfaden, die
sonst ohne bcrypt zurückkehren würden: „Konto existiert nicht" und „Konto in Abkühlzeit" (die
zeitbasierte Sperre aus Punkt #2). Der Dummy-Hash ist statisch hinterlegt, damit schon der allererste
Login gegen ein unbekanntes Konto die volle Zeit braucht (kein Lazy-Init-Leak beim ersten Aufruf).

## 2. Audit-Felder über den Turnier-PUT/POST fälschbar

`POST /turniere` spreizte `...req.body` über die serverseitig gesetzten Zuschreibungsfelder
(`erstelltVon`/`erstelltVonName`/…) – ein Client konnte sie damit fälschen. `PUT /turniere/:id`
schützte `zuletztBearbeitetVon`/`geaendertAm` zwar (die setzt der Server NACH dem Body), ließ aber
`erstelltVon`, die `abgeschlossen*`-Felder und die Identitätsfelder (`_id`/`docType`/`turnierId`)
zu und erlaubte über ein direktes `status`-Feld theoretisch, die `/abschliessen`-Vorbedingung (alle
Ergebnisse erfasst) zu umgehen.

**Fix:** `ohneServerFelder()` (`backend/src/routes/turnier.ts`) entfernt eine feste Liste
`NUR_SERVER_FELDER` (Identität + Audit-/Zuschreibungs-/Abschluss-Daten) aus dem eingehenden Body,
bevor er in POST **und** PUT übernommen wird. `status` bleibt bewusst erlaubt (normaler
entwurf↔aktiv-Wechsel); die Übergänge nach abgeschlossen/archiviert laufen über die eigenen
Endpunkte. Kein Bruch für den echten Client: der schickt diese Felder höchstens unverändert
zurück (aus dem GET round-tripped) – der Server behält dann ohnehin den Bestand.

Hinweis: Dieselbe „`...req.body` zuletzt"-Struktur existiert in weiteren Routen (mannschaft/verein/…);
dort sind die betroffenen Felder aber turnierunkritisch bzw. bereits durch Body-Schemata begrenzt.
Bei einer neuen Turnier-Schreibroute die Zuschreibungsfelder analog serverseitig setzen.

## Verifikation

- Login-Timing: Verhalten (weiterhin generischer 401) durch die bestehenden Sperr-/Login-Tests
  abgedeckt; die Zeitangleichung selbst ist bewusst nicht als (flakiger) Zeitmess-Test geprüft.
- Audit-Felder: neuer Integrationstest `turnier-audit.integration.test.ts` (gefälschte
  `erstelltVon`/`zuletztBearbeitetVon`/`abgeschlossenVon` werden ignoriert, erlaubte Felder
  übernommen). `test:integration` vollständig grün (82 Tests, 0 übersprungen).

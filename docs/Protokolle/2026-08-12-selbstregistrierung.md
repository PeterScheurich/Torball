# 2026-08-12 – Selbstregistrierung + Systemeinstellungen

## Ausgangslage

Für die geplante Demo-Instanz sollten Tester sich möglichst ohne Zutun eines Admins selbst einen
Account anlegen können. Ursprünglich als reine Betriebs-/Ops-Lösung angedacht (fertige Demo-Accounts
+ nächtlicher CouchDB-Reset per Skript, ohne App-Code anzufassen), dann aber bewusst umentschieden:
der Nutzer wollte Selbstregistrierung stattdessen als echtes Feature in der Anwendung, konfigurierbar
über eine neue Admin-Seite – nicht zuletzt, weil dort künftig weitere globale Einstellungen (z. B.
Theme-Standardwerte) einen Platz haben sollen.

## Entscheidungen

- **Neuer, unversionierter Dokumenttyp `Systemeinstellungen`** statt Erweiterung der bestehenden
  `Systemkonfiguration` (Turnierregeln-Standardwerte): letztere ist absichtlich versioniert (jede
  Änderung legt eine neue Version an, damit bereits angelegte Turniere ihre Kopie behalten) – für
  systemweite Schalter wie „Selbstregistrierung erlaubt" gibt es diesen Anwendungsfall nicht, eine
  einfache Singleton-Konfiguration (feste `_id`, direktes Update statt neuer Version) ist hier
  passender und einfacher.
- **Sicherheits-Leitplanke:** die Rolle, die sich selbst registrierende Benutzer automatisch
  erhalten, ist im Schema (Backend-Enum **und** Frontend-Select) auf `benutzer`/`manager`
  beschränkt – „admin" ist nirgends wählbar. Eine offene Selbstregistrierung darf nie automatisch
  Admin-Rechte verteilen.
- **Neue Admin-Seite `/systemeinstellungen`** (Menü „Stammdaten" → „Systemeinstellungen", analog zu
  „Standardregeln"), aktuell nur der Selbstregistrierungs-Bereich, aber bewusst als Erweiterungspunkt
  angelegt.
- **Öffentliche Route `/registrieren`**: zeigt das Formular nur, wenn Selbstregistrierung aktiv ist
  (`GET /auth/registrierung-verfuegbar`, öffentlich, analog zu `bootstrap-verfuegbar`/
  `ersteinrichtung`), sonst einen Hinweistext. Bei aktivierter Selbstregistrierung erscheint auf der
  Login-Seite zusätzlich ein „Jetzt registrieren"-Link.

## Umsetzung

- `shared/src/types/systemeinstellungen.ts`: neuer Typ `Systemeinstellungen` (+ `TorballDokument`-Union
  ergänzt) und `SelbstregistrierungsRolle = Exclude<GlobaleRolle, "admin">`.
- `backend/src/systemeinstellungen.ts`: Singleton-Helfer (`SYSTEMEINSTELLUNGEN_ID`,
  `STANDARD_SYSTEMEINSTELLUNGEN` mit `selbstregistrierungErlaubt: false` als sicherem Default,
  `aktuelleSystemeinstellungen()`).
- `backend/src/routes/systemeinstellungen.ts`: `GET`/`PUT /systemeinstellungen`, beide **nur Admin**
  (anders als die für alle angemeldeten Personen lesbaren Standardregeln – hier gibt es keinen Grund
  für breiteren Lesezugriff).
- `backend/src/routes/auth.ts`: `GET /auth/registrierung-verfuegbar` (öffentlich) und
  `POST /auth/registrieren` (öffentlich, aber nur wirksam wenn erlaubt) – letztere spiegelt weitgehend
  `bootstrap-admin`, prüft aber zusätzlich die Systemeinstellungen statt „noch kein Benutzer vorhanden"
  und vergibt die konfigurierte Rolle statt fest `admin`.
- Frontend: `RegistrierenPage.tsx` (öffentlich, Formular wie `ErsteinrichtungPage`, inkl. optionalem
  Vorname-Feld), `SystemeinstellungenPage.tsx` (Admin-Formular), `LoginPage.tsx` (bedingter Link),
  `App.tsx` (Routen + Menüpunkt).

## Verifiziert (lokal, gegen die Dev-Instanz, im Browser)

- Standardzustand: kein Registrieren-Link, `/registrieren` zeigt „nicht aktiviert".
- `/systemeinstellungen`: Rollen-Auswahl enthält nur „Benutzer"/„Manager", **kein** „Admin".
- Nach Aktivierung: Login-Seite zeigt den Link; Registrierung mit Test-Account
  (`selfservice-test@torball-demo.invalid`) liefert `201`, loggt automatisch ein, landet auf der
  Turnierliste, `GET /auth/me` bestätigt Rolle `benutzer`.
- Zweite Registrierung mit derselben E-Mail liefert `409` (Duplikat-Prüfung wie beim Einladungs-Flow).
- Nach Deaktivieren zeigt `/registrieren` wieder den Hinweistext.
- Test-Account danach über die Benutzerverwaltung gesperrt, Selbstregistrierung in den
  Systemeinstellungen wieder deaktiviert (Dev-Instanz im Ausgangszustand hinterlassen).

## Offen

Die eigentliche Demo-Instanz (inkl. des ursprünglich angedachten nächtlichen CouchDB-Resets für
Testdaten) ist noch nicht aufgesetzt – das war der Anlass für dieses Feature, aber ein eigener,
noch ausstehender Schritt.

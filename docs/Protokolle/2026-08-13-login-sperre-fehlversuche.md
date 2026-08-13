# 2026-08-13 – Brute-Force-Schutz: Login-Sperre nach 10 Fehlversuchen

Auf der öffentlich erreichbaren Zentralen Plattform soll ein Account nach zu vielen falschen
Passwort-Eingaben gesperrt werden, statt beliebig oft geraten werden zu können (lokale
Installationen sind hiervon nicht ausgenommen, aber praktisch irrelevant - kein öffentlicher
Angriffspunkt).

## Finalisierte fachliche Spec (mit dem Nutzer abgestimmt)

- **10 falsche Passwörter in Folge** sperren den Account automatisch. Nur ein Admin (oder ein
  erfolgreicher Passwort-Reset, s. u.) hebt das wieder auf.
- **Zwei Sperrgründe**, damit ein automatischer Reset niemals eine bewusste Admin-Entscheidung
  aushebelt: `gesperrtGrund: "manuell"` (Admin-Sperre, z. B. jemand hat die Organisation
  verlassen) vs. `"fehlversuche"` (automatisch). Ein Passwort-Reset hebt **nur** eine
  Fehlversuche-Sperre auf, nie eine manuelle.
- **Vergessenes Passwort trotz Sperre:** der bestehende Self-Service-Link („Passwort vergessen")
  hebt eine Fehlversuche-Sperre beim erfolgreichen Setzen des neuen Passworts automatisch mit auf
  - wer noch Zugriff aufs eigene Postfach hat, kommt ohne Admin wieder rein.
- **Lokale Installation ohne Internet, niemand sonst da:** zwei Ebenen als Rückfallebenen:
  1. Ein anderer Admin ist erreichbar → löst über die Benutzerverwaltung einen Reset für die
     betroffene Person aus; ohne funktionierenden Mailversand wird der Link direkt angezeigt
     (analog zum bestehenden Einladungs-Link-Fallback), statt wirkungslos zu verpuffen.
  2. Niemand sonst da → das bereits vorhandene Konsolen-Tool
     (`npm run torball -- benutzer:entsperren --email="..."`) entsperrt direkt auf der Maschine,
     ganz ohne Web-Login/Internet - genau der Anwendungsfall, für den es ursprünglich gebaut wurde.

## Umgesetzt

- **Datenmodell** (`shared/src/types/benutzer.ts`): `Benutzer.fehlgeschlageneLoginVersuche?:
  number`, `Benutzer.gesperrtGrund?: "manuell" | "fehlversuche"`.
- **Login** (`backend/src/routes/auth.ts`, `MAX_LOGIN_VERSUCHE = 10`): falsches Passwort zählt
  hoch, ab der Schwelle wird `gesperrt: true` + `gesperrtGrund: "fehlversuche"` gesetzt - bewusst
  weiterhin dieselbe generische Fehlermeldung (kein Hinweis auf verbleibende Versuche, sonst
  liesse sich das Zählwerk erraten). Erfolgreicher Login setzt den Zähler zurück.
- **`PUT /benutzer/:id`** (`backend/src/routes/benutzer.ts`): `gesperrtGrund` wird ausschliesslich
  serverseitig gesetzt, nie vom Client übernommen - `gesperrt:true` → `"manuell"`; `gesperrt:false`
  → Grund UND Zähler zurückgesetzt (sonst wäre der Account nach wenigen weiteren Fehlversuchen
  sofort wieder gesperrt).
- **`POST /benutzer/passwort-reset/:token`**: hebt bei erfolgreichem Reset nur eine
  `gesperrtGrund: "fehlversuche"`-Sperre auf; eine `"manuell"`-Sperre bleibt unberührt (Passwort
  selbst wird trotzdem geändert).
- **Neu: `POST /benutzer/:id/passwort-reset-ausloesen`** (Admin/Manager, gleiche
  `darfZielRolleVergeben`-Prüfung wie die übrigen Benutzer-Routen): löst denselben Reset-Token-
  Mechanismus wie der Self-Service-Weg aus. Ist Mailversand konfiguriert UND erreichbar, geht der
  Link per Mail raus; sonst (nicht konfiguriert oder Versand schlägt fehl, z. B. kein Internet)
  kommt der Token direkt in der Antwort zurück - die Person setzt ihr Passwort weiterhin selbst,
  der/die Auslösende sieht/setzt es nie direkt.
- **CLI** (`backend/src/cli/torball.ts`): `benutzer:entsperren` setzt jetzt zusätzlich
  `gesperrtGrund`/`fehlgeschlageneLoginVersuche` zurück (vorher nur `gesperrt`);
  `benutzer:liste` zeigt den Sperrgrund mit an.
- **Frontend** (`BenutzerverwaltungPage.tsx`): Status-Spalte unterscheidet „Gesperrt (zu viele
  Fehlversuche)" von „Gesperrt"; neuer Knopf „Passwort-Reset auslösen" je Zeile mit
  Link-Anzeige-Fallback (Vorbild: bestehende Einladungslink-Anzeige).
- **Nebenbefund behoben:** `instanzKopplungscodeHash`/`-Ablauf` (aus der Turnier-Sync-Ausbaustufe
  vom selben Tag) fehlten in der Ausschlussliste von `oeffentlichesProfil()` - wurden also über
  `GET /benutzer` mit ausgeliefert. Ergänzt, konsistent mit den übrigen Token-Hashes.

## Verifikation

Neue Backend-Tests (`backend/src/routes/auth-sperre.test.ts`, gegen echte CouchDB): Sperre nach 10
Fehlversuchen (inkl. 403 auch mit richtigem Passwort danach), Zähler-Reset bei Erfolg, Reset hebt
Fehlversuche-Sperre auf/lässt manuelle Sperre unangetastet, Admin-Reset-Route +
`PUT`-`gesperrtGrund`-Konsistenz. `npm run build`/`lint`/`test` grün.

End-to-end im Browser: Testkonto per Skript angelegt, zehn falsche Logins → 403 auch mit korrektem
Passwort; „Passwort-Reset auslösen" in der Benutzerverwaltung ausgelöst - Mailversand ist auf der
Dev-Instanz konfiguriert, aber gerade nicht erreichbar (502), der Fallback griff korrekt und zeigte
den Link direkt an; Reset über diesen Link abgeschlossen → Account danach sofort wieder benutzbar,
`fehlgeschlageneLoginVersuche` auf 0. Testkonto anschliessend wieder entfernt.

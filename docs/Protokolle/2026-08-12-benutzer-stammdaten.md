# 2026-08-12 – Benutzer-Stammdaten + Übernahme ins Turnier

Ziel: Ein Turnier wird meist von der späteren **Turnierleitung** geplant – und das sind i. d. R.
auch **Schiedsrichter**. Einmal am Benutzer gepflegte Kontakt-/Stammdaten sollen sich deshalb ins
Turnier (Schiedsrichter-/Turnierleitungs-Erfassung) übernehmen lassen. Zusätzlich der Sonderfall
„Turnierleitung, die nicht pfeift".

## Mit dem Nutzer abgestimmt

- **Neue Benutzer-Felder:** Vorname, Lizenz (ja/nein), Verein/Verband, Adresse (E-Mail + Telefon
  gab es schon). Alle optional.
- **Übernahme: beide Wege** – automatisch beim Anlegen UND ein manueller Knopf.
- **Kennzeichen „nur Turnierleitung, nicht als Schiedsrichter aktiv": jetzt** mitgebaut.

## Umgesetzt

**Datenmodell** (`shared/src/types`):
- `Benutzer`: `vorname?`, `lizenzVorhanden?`, `vereinVerband?`, `adresse?` (der bestehende `name`
  bleibt Nachname/Anzeigename; für die Übernahme nach `Schiedsrichter.name` + `.vorname`).
- `SchiedsrichterImTurnier`: `nurTurnierleitung?` – nur relevant bei `istTurnierleitung=true`.

**Backend:**
- `PUT /benutzer/mich` nimmt die neuen Stammdaten entgegen (nicht sicherheitsrelevant → **ohne**
  Passwort-Bestätigung, wie Theme/Dichte). `oeffentlichesProfil()` reicht sie über `...rest`
  automatisch heraus (keine Änderung am Filter nötig). Telefon war bisher im Typ, aber nicht über
  die Selbst-Service-Route änderbar – jetzt schon.
- `schiedsrichter.ts`: `nurTurnierleitung` in Create/Update + Schema. Normalisierung: ohne
  `istTurnierleitung` wird `nurTurnierleitung` konsequent auf `false` zurückgesetzt (in beiden
  Handlern), da das Flag sonst bedeutungslos wäre.
- `schiedsrichterZuordnung.ts`: Personen mit `nurTurnierleitung` fallen aus dem Kandidatenpool –
  sie werden nie als pfeifender Schiedsrichter vorgeschlagen (Test ergänzt).
- **Auto-Übernahme** in `POST /turniere`: die anlegende Person wird aus ihrem Profil direkt als
  Turnierleitung-Schiedsrichter angelegt (Vorschlag, danach frei editier-/löschbar). Bewusst **nur**
  im normalen Anlege-Pfad – bei `/ableiten` werden Schiedsrichter aus dem Vorgänger kopiert.

**Frontend:**
- „Mein Profil" (`ProfilPage`): neuer Abschnitt **„Kontakt- und Stammdaten"** (Name jetzt editierbar,
  Vorname, Telefon, Lizenz-Checkbox, Verein/Verband, Adresse) mit einem Speichern-Knopf.
- `SchiedsrichterVerwaltung` (auch im Wizard-Schritt genutzt): Knopf **„Meine Profildaten
  übernehmen"** füllt das Anlege-Formular aus dem eingeloggten Benutzer vor (Turnierleitung wird
  bewusst **nicht** automatisch gesetzt – per Radio wählbar, vermeidet doppelte Turnierleitung).
  In der Turnierleitung-Spalte erscheint bei aktiver Turnierleitung zusätzlich die Checkbox
  **„pfeift nicht"** (`nurTurnierleitung`).
- `api.ts`: Payload-Typen erweitert (`eigenesProfilAktualisieren`, `NeuerSchiedsrichter`,
  `SchiedsrichterAktualisierung`). Da `BenutzerProfil`/`OeffentlichesBenutzerProfil` via `Omit`
  aus `Benutzer` abgeleitet sind, fließen die neuen Felder automatisch mit.

## Verifikation (laufende Instanz + Unit-Test)

- Profil speichern → Felder persistieren und kommen über das Profil zurück.
- Neues Turnier anlegen → genau ein Schiedsrichter (die anlegende Person) mit `istTurnierleitung=true`,
  Profildaten übernommen, `nurTurnierleitung=false`.
- `nurTurnierleitung=true` persistiert bei Turnierleitung; wird `istTurnierleitung=false` gesetzt,
  fällt `nurTurnierleitung` serverseitig auf `false` zurück.
- Zuordnungs-Unit-Test: reine Turnierleitung wird nie vorgeschlagen (auch als einziger Kandidat
  bleibt das Spiel unbesetzt).
- Frontend: Profil-Felder vorbefüllt, Übernahme-Knopf vorhanden, „pfeift nicht" nur bei der
  Turnierleitung sichtbar.
- `npm run build` (inkl. `shared` zuerst) / `lint` / `test` grün.

## Noch offen / später

- Admin-Bearbeitung fremder Stammdaten über `PUT /benutzer/:id` bewusst nicht ergänzt (Übernahme
  nutzt das **eigene** Profil). Bei Bedarf später.
- Dedup, wenn dieselbe Person (Betreuer/Schiedsrichter) mehrfach auftaucht: weiterhin offen
  (siehe Memory „Trainer/Schiedsrichter-Duplikate").

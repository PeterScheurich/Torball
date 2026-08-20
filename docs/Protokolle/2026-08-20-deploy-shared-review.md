# Review Deploy-Prozess + shared/src (2026-08-20)

Abschluss der systematischen Code-Durchsicht (nach Backend- und Frontend-Review): die
Deploy-Skripte (`deploy/`, ~1.250 Zeilen Bash/PowerShell) und das geteilte Typmodell
(`shared/src`, ~1.200 Zeilen). Alle Funde wurden nach Nutzer-Freigabe („so gut wie möglich
aufgestellt sein") vollständig umgesetzt. Verifikation: Code-Durchsicht + `bash -n` bzw.
PowerShell-Parser — die Linux-Skripte lassen sich nur auf dem Server selbst echt testen
(siehe „Offene Folge-Aufgaben" unten).

## Umgesetzte Funde (Deploy)

- **D1 — CouchDB-Fehler wurden verschluckt:** `curl` liefert bei HTTP-Fehlern (401/500)
  trotzdem Exit 0; `-s` + `|| true` ließ z. B. ein fehlgeschlagenes `_security`-PUT oder eine
  nicht angelegte `_users`-Systemdatenbank still durchrutschen — der Service stürzte dann erst
  später mit kryptischer Meldung ab (gleiche Fehlerklasse wie live beim Windows-Installer
  erlebt). Jetzt prüft eine `couch_pruefe()`-Helferfunktion in `deploy-instanz.sh` und
  `demo-snapshot-einrichten.sh` den HTTP-Status explizit (erwartete Codes wie 412 „existiert
  schon" ausgenommen); `provision.sh` wartet per Retry-Schleife auf CouchDB-Erreichbarkeit statt
  `sleep 2` und prüft das Anlegen der Systemdatenbanken. Zusätzlich übernimmt `deploy-instanz.sh`
  das im Windows-Installer erprobte GET-`_rev`-dann-PUT-Muster für den Instanz-Benutzer (ein
  vorhandener Benutzer mit abweichendem Passwort wird aktualisiert statt still belassen).
- **D2 — Passwörter von der Kommandozeile genommen:** `-u "admin:…"` und Passwörter in
  `-d`-JSON waren während des Aufrufs für jeden lokalen Prozess in `ps` sichtbar (Eskalationsweg:
  kompromittierter Service-Benutzer greift beim Deploy das CouchDB-**Admin**-Passwort ab → Zugriff
  auf alle Instanz-Datenbanken). Jetzt: kurzlebige, root-only `curl`-Konfigurationsdatei
  (`mktemp` in `/etc/torball`, `trap … EXIT` räumt auf) + Passwort-Bodies per stdin (`-d @-`).
  Betrifft `deploy-instanz.sh`, `provision.sh`, `instanz-entfernen.sh`,
  `demo-snapshot-einrichten.sh`.
- **D3 — Instanzname validiert** (`^[a-z0-9-]+$`) in den drei instanzbezogenen Skripten —
  der Name landet in Pfaden, DB-/Service-Namen und in `instanz-entfernen.sh` in einem `rm -rf`.
- **D4 — Windows: Geheimnis-Dateien geschützt:** `db-lokal.pass` (App-DB-Passwort) und das
  MSI-Verbose-Log (`couchdb-install.log`, kann `ADMINPASSWORD` im Klartext enthalten) bekommen
  jetzt dieselbe icacls-Restriktion (nur Administratoren) wie `couchdb-admin.txt` — vorher lagen
  sie mit Standard-Rechten in `C:\Torball-Turniere`.
- **D5 — Windows-Deinstaller:** beendet vor dem Löschen von `node_modules`/`dist` gezielt die
  node-Prozesse dieses Projektordners (laufender Server hielt sonst Dateien gesperrt →
  Abbruch mitten im Schritt).
- **D6 — systemd-Härtung:** `torball@.service` bekommt `NoNewPrivileges`, `PrivateTmp`,
  `ProtectSystem=full`, `ProtectHome` — das Backend schreibt im Betrieb nichts auf die Platte
  (alles in CouchDB, Logs ins Journal), die Einschränkungen kosten daher nichts.
- **Kleinigkeiten:** Port-Vergleichs-Grep bricht bei `.env` ohne `PORT=`-Zeile nicht mehr das
  Skript ab; `STUNDE` im Demo-Skript auf 0–23 validiert; `New-ZufallsPasswort` nutzt jetzt einen
  Krypto-Zufallsgenerator mit Zurücklegen und Rejection-Sampling (vorher `Get-Random -Count` =
  kein CSPRNG und nur unterschiedliche Zeichen).

## Umgesetzte Funde (shared/src)

Das Typmodell war insgesamt in sehr gutem Zustand (Union vollständig, Zukunfts-Typen klar
markiert). Drei Punkte:

- **S1:** Kommentar zu `Benutzer.standardTheme/-Dichte/-Breite` beschrieb noch die alte
  „lokal gewinnt"-Regel und verwies auf das umbenannte `seedeVoreinstellungen` — an die
  „Konto-Standard hat immer Recht"-Entscheidung (Frontend-Review, gleicher Tag) angepasst.
- **S2:** `Turnier.modus?: string` entfernt — nirgends gelesen oder geschrieben, undokumentiert
  (nicht zu verwechseln mit `spielplanModus`). Bestands-Dokumente mit dem Feld bleiben gültig
  (CouchDB ist schemalos, unbekannte Felder stören nicht).
- **S3:** `Turnier.spielplanFreigegeben` entfernt (wurde nur geschrieben, nie gelesen — die
  öffentliche Sichtbarkeit steuert `oeffentlichSpielplan`); alle Schreibstellen in
  `turnier.ts`, `beispieldaten.ts` und fünf Testdateien mit bereinigt.
  `spielernamenOeffentlich` bleibt (hängt in der Abschluss-Whitelist), jetzt mit
  „noch ohne Funktion, greift erst mit Kader auf der öffentlichen Seite"-Kommentar.

## Bewusst NICHT umgesetzt

- Aufwendigere Härtungen wie `ProtectSystem=strict`/`ReadOnlyPaths` (Risiko, künftige Features
  zu brechen, für den Nutzen zu hoch) und ein Umbau der MSI-Parameterübergabe
  (`ADMINPASSWORD` auf der msiexec-Kommandozeile ist mit diesem Installer unvermeidbar,
  transient und nur lokal sichtbar).

## Offene Folge-Aufgaben (auf dem Server, Demo vor Prod)

1. Im Checkout `git pull`, dann **einmalig `deploy/provision.sh` erneut ausführen** — schreibt
   das gehärtete systemd-Template (idempotent, überspringt Installiertes). Danach erst
   `systemctl restart torball@demo` und prüfen, dann `torball@prod`.
2. Der nächste `torball-aktualisieren`-Lauf je Instanz testet D1–D3 in der Praxis — auf saubere
   Durchläufe achten; ein Fehler bricht jetzt laut und früh ab statt still weiterzulaufen.

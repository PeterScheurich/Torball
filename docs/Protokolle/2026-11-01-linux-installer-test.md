# Linux-Installer: Test auf zwei Systemen (2026-11-01)

Der Linux-Installer (`Setup-Linux.sh`, `deploy/installieren-linux.sh`, `aktualisieren-linux.sh`, `deinstallieren-linux.sh`) war
seit 31.10. geschrieben, aber noch auf keinem echten System gelaufen. Heute Abend ohne Tastatur durchgespielt
(`TORBALL_UNBEAUFSICHTIGT=1 TORBALL_PORT=3000 TORBALL_NETZWERK=ja`), per SSH mit einem eigenen Test-Schlüssel auf zwei frischen
Wegwerf-Rechnern.

## Systeme

| System | Art | Besonderheit |
|---|---|---|
| Debian 13 („trixie“), 2 GB RAM | LXC-Container (Proxmox) | `sudo`, `openssh-server` mussten nachinstalliert werden; keine Firewall |
| Ubuntu 26.04.1 LTS, 2 GB RAM | VM | kein `unzip`; später `ufw` aktiviert |

Quelle war das **echte Quellcode-ZIP** von der Prod-Instanz (`/download/torball-quellcode.zip`), so wie ein Anwender es bekäme.

## Was geprüft wurde und ging

- **Installation von Grund auf** (je rund 3 Minuten): Node.js 22 und CouchDB aus den Paketquellen (die CouchDB-Quelle gibt es für
  trixie und für Ubuntu 26.04), Systemdatenbanken, eingeschränkter Datenbank-Benutzer, Bau, Dienst. Beide Dienste `active`,
  Anwendung antwortet mit HTTP 200, `/api/sync/status` meldet `istLokaleInstallation` und die LAN-Adresse.
- **Rechte:** App läuft als eigener Benutzer `torball`; `/etc/torball-turniere` nur für `root`; `backend/.env` mit 0600; CouchDB nur
  auf `127.0.0.1`, die App auf `0.0.0.0:3000`.
- **Zugriff aus dem LAN** (von einem anderen Rechner aus): HTTP 200.
- **Neustart:** Beide Dienste starten von selbst wieder.
- **Aktualisieren** (ZIP erneut entpackt, `Setup-Linux.sh` noch einmal): Exit 0, `backend/.env` unverändert (gleiche Prüfsumme),
  keine Rückfrage.
- **Deinstallieren:** Mit Standardantworten bleiben CouchDB, Node.js, Benutzer und Programmordner stehen (Daten bleiben erhalten);
  mit „alles entfernen“ ist danach nichts mehr da (kein Dienst, kein Benutzer, keine Ordner, keine offenen Ports).
- **Neuinstallation** nach dem Entfernen (Debian: über die Reste mit vorhandener CouchDB, Ubuntu: nach „alles entfernen“): beide gut.
- **Firewall:** Bei aktivem `ufw` legt der Installer `3000/tcp ALLOW 10.10.20.0/24` an, also **nur für das eigene Subnetz**.
  Aus dem Subnetz erreichbar, von einem Rechner in einem anderen Netz (192.168.188.x) erwartungsgemäß nicht.
- **Diagnose:** `torball-turniere-konsole diagnose` schreibt den Bericht.

## Gefunden und behoben

1. **Deinstaller ließ NodeSource-Quelle ohne Schlüssel zurück.** Er löschte `nodesource.list`, NodeSource legt die Quelle heute aber
   als `nodesource.sources` (plus Pin-Dateien `preferences.d/nodejs`, `nsolid`) an. Nach „Node.js entfernen“ meldete jedes spätere
   `apt update` einen Signaturfehler. Jetzt werden alle Dateien entfernt; geprüft: `apt update` danach ohne Warnung.
2. **`build-essential` und `python3` wurden ohne Not installiert** (rund 250 MB Compiler). Im Lockfile braucht kein Paket einen
   Compiler (`bcryptjs` ist reines JavaScript, `esbuild` bringt fertige Programmdateien). Aus dem Installer entfernt; geprüft: die
   Installation läuft auf Debian nach ausdrücklichem Entfernen der Compiler (`gcc`, `g++`, `make` fehlen) sauber durch.
3. **Voraussetzung `unzip` fehlte in der Anleitung** (auf einem Server ohne Oberfläche ist es nicht vorhanden). Ergänzt.

## Zweiter Durchgang: Ubuntu 26.04 mit Desktop (GNOME)

Die Ubuntu-VM wurde per `apt install ubuntu-desktop-minimal` zum Desktop-System gemacht (grafische Sitzung von `claudetest` per
automatischer Anmeldung, Wayland, Firefox als Snap). Der Installer lief dort noch einmal als Aktualisierung.

Gefunden und behoben:

4. **Schreibtisch-Verknüpfung ohne „Start erlauben“.** GNOME zeigt eine `.desktop`-Datei auf dem Schreibtisch erst dann als Programm,
   wenn sie als vertrauenswürdig markiert ist (`metadata::trusted`), sonst muss man per Rechtsklick „Start erlauben“ wählen. Der
   Installer setzt die Markierung jetzt, soweit die Person angemeldet ist (Sitzungs-Bus); sonst bleibt es beim Rechtsklick. Geprüft:
   `gio info` zeigt `metadata::trusted: true`.
5. **Gruppe der Verknüpfung blieb `root`.** Ubuntu 26.04 nutzt ein anderes `chown` (uutils): `benutzer:` setzt die Gruppe nicht mehr auf die
   Login-Gruppe. Die Gruppe wird jetzt ausdrücklich genannt.
6. **Menü-Eintrag mit zwei Hauptkategorien** (`Office;Utility;`): konnte doppelt im Menü erscheinen. Jetzt `Office;`.

Geprüft und in Ordnung: Menü-Eintrag gültig (`desktop-file-validate`), Symbol für normale Benutzer lesbar, Standardbrowser in der
Sitzung ist Firefox, Verknüpfung liegt auf dem Schreibtisch.

**Von hier aus nicht prüfbar, von Peter am Bildschirm bestätigt:** Das Starten über den Menü-Eintrag. `xdg-open` und `gio open` melden aus einer SSH-Sitzung Erfolg, starten
den Snap-Firefox aber nicht (GNOME weist den Start von außerhalb der Sitzung ab, Journal: „Failed to get app ID for snap 'firefox'“); ein
direkter Start von `firefox` klappt. Ob ein echter Klick den Browser mit der App öffnet, wurde deshalb am Bildschirm geprüft: Der Klick auf das Symbol startete die Anwendung, der erste Benutzer ließ sich anlegen. Ein Foto
des Bildschirms von hier aus ist nicht möglich (GNOME verbietet es). Der erste Start von Firefox dauert auf dieser VM rund 30 Sekunden.

## Vorprüfung für nicht unterstützte Systeme (nachgetragen)

Die Paketquelle von CouchDB hat für Debian 13, Debian 12 und Ubuntu `amd64` und `arm64`, aber **kein `armhf`** (32-Bit-ARM, etwa das
ältere Raspberry Pi OS). Dort wäre der Installer erst beim CouchDB-Schritt mit einer Paketmeldung gescheitert. Neu: `pruefe_architektur`
in der Vorprüfung nennt 32-Bit-Systeme und unbekannte Architekturen verständlich beim Namen; die Meldung für Nicht-Debian-Systeme sagt, dass
es dafür keinen Installer gibt. Die Funktion wurde einzeln mit `amd64`, `arm64`, `armhf`, `armel`, `i386`, `riscv64` und `ppc64el`
geprüft; der Durchlauf im vollständigen Installer auf einem echten System steht noch aus (bei einem der nächsten Tests mit prüfen).

## Dritter Durchgang: Linux Mint 22.3 (Cinnamon, deutschsprachig)

Proxmox-VM, 4 GB RAM, 32 GB Platte, Anmeldemanager `lightdm`, X11-Sitzung, automatische Anmeldung für `claudetest`, `ufw` eingeschaltet.
System meldet `ID=linuxmint`, `ID_LIKE="ubuntu debian"`, `UBUNTU_CODENAME=noble`; der Installer erkennt `noble`, die CouchDB-Quelle
zeigt auf `noble`, die neue Architekturprüfung lässt `amd64` durch.

Gefunden und behoben:

7. **Firewall-Erkennung hing an der englischen Ausgabe.** Der Installer erkannte ein aktives `ufw` am Text `Status: active`; auf einem
   deutschen System heißt es `Status: Aktiv`. Folge: „keine Firewall aktiv“, **keine Freigabe für Port 3000** – andere Geräte im Netz
   kämen nicht an die App. Auf Ubuntu (englisch) war es nicht aufgefallen. Jetzt `LC_ALL=C ufw status`. Geprüft auf dem deutschen Mint:
   Regel `3000/tcp ALLOW 10.10.20.0/24` wird angelegt und beim Deinstallieren wieder entfernt.

Von Peter am Bildschirm bestätigt: Klick auf die Schreibtisch-Verknüpfung in der Sitzung von `claudetest` startet die Anwendung, ein
neuer Benutzer ließ sich anlegen.

Geprüft und in Ordnung: Schreibtisch-Ordner heißt hier `Schreibtisch` (der Installer kennt beide Namen), Verknüpfung gehört dem
Benutzer mit eigener Gruppe, Menü-Eintrag ohne Hinweise gültig (`Categories=Office;`), vollständiges Deinstallieren räumt Dienst, Benutzer,
Dateien, Firewall-Regel, Menü-Eintrag und Verknüpfung weg, `apt update` danach ohne Warnung.

## Kleinigkeiten, nicht geändert

- Der Diagnose-Bericht landet im Programmordner (`/opt/torball-turniere/app/backend/…`), wo ihn ein Laie nicht sucht. Der Pfad wird
  ausgegeben; ein Kopieren ins Home-Verzeichnis wäre freundlicher.
- Mit den Standardantworten bleibt der Programmordner stehen, obwohl der Dienst entfernt ist.

## Nicht geprüft

- Weitere Bedienung der Anwendung im Browser über die Ersteinrichtung des ersten Benutzers hinaus (Turnier anlegen, Erfassungslink) – die
  Anwendung ist dieselbe wie unter Windows.
- Linux Mint (Cinnamon: Codename der Paketquelle, Verknüpfung ohne Markierung), andere Desktop-Umgebungen, andere Firewalls (`firewalld`), ARM-Rechner.
- Aktualisieren per Git-Checkout (`torball-turniere-aktualisieren`); getestet wurde nur der ZIP-Weg.
- Tastaturbedienung des Installers mit Rückfragen (alles lief im unbeaufsichtigten Modus mit den Standardantworten).

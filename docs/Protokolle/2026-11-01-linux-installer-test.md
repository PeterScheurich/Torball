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

## Kleinigkeiten, nicht geändert

- Der Diagnose-Bericht landet im Programmordner (`/opt/torball-turniere/app/backend/…`), wo ihn ein Laie nicht sucht. Der Pfad wird
  ausgegeben; ein Kopieren ins Home-Verzeichnis wäre freundlicher.
- Mit den Standardantworten bleibt der Programmordner stehen, obwohl der Dienst entfernt ist.

## Nicht geprüft

- Bedienung der Anwendung im Browser (Ersteinrichtung des ersten Kontos, Turnier anlegen, Erfassungslink) – die Anwendung ist
  dieselbe wie unter Windows, aber der Ablauf auf Linux wurde nur über HTTP-Aufrufe geprüft, nicht im Browser.
- **Desktop-Systeme** (Anwendungsmenü-Eintrag, Browser öffnen), Linux Mint, andere Firewalls (`firewalld`), ARM-Rechner.
- Aktualisieren per Git-Checkout (`torball-turniere-aktualisieren`); getestet wurde nur der ZIP-Weg.
- Tastaturbedienung des Installers mit Rückfragen (alles lief im unbeaufsichtigten Modus mit den Standardantworten).

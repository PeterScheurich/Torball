# Torball-Turniere auf Linux installieren

Für einen **eigenen Rechner**, der die Turniere verwaltet – allein oder zusammen mit Helfern im selben
Netzwerk. (Für einen Server im Internet gibt es einen anderen Weg, siehe `docs/installation-konfiguration.md`.)

> **Stand:** Der Linux-Installer wurde am 01.11.2026 auf einem Debian 13 und einem Ubuntu 26.04 (beide ohne Oberfläche)
> durchgespielt: Installation, Neustart, Aktualisieren, Deinstallieren, Firewall mit `ufw`. Auf Ubuntu 26.04 mit Desktop
> (GNOME) lief außerdem der Start über die Verknüpfung auf dem Schreibtisch bis zur Einrichtung des ersten Benutzers.
> Ebenso auf Linux Mint 22.3 (Cinnamon, deutsch). **Noch nicht erprobt** sind andere Desktop-Umgebungen (z. B. XFCE, KDE), andere Firewalls
> (`firewalld`) und ARM-Rechner.
> Bitte zuerst auf einem Testrechner ausprobieren und Auffälligkeiten melden.

## Voraussetzungen

- Debian, Ubuntu oder ein davon abgeleitetes System (z. B. Linux Mint), jeweils eine aktuelle Version.
- Ein **64-Bit-System** (Intel/AMD oder ARM). Die Datenbank CouchDB gibt es nicht für 32 Bit; auf einem Raspberry Pi also die
  64-Bit-Fassung von Raspberry Pi OS nehmen. Andere Linux-Familien (Fedora, openSUSE, Arch …) werden nicht unterstützt – der Installer
  sagt das gleich zu Beginn.
- Internetzugang während der Installation (Pakete werden geladen).
- Ein Benutzer mit `sudo`-Recht. Auf einem Debian ohne `sudo`: mit `su -` zum Administrator werden.
- Etwa 2 GB freier Platz und 2 GB Arbeitsspeicher.
- Zum Entpacken des ZIP das Programm `unzip` (auf einem Server ohne Oberfläche: `sudo apt-get install unzip`).

## Installieren

1. Das Quellcode-ZIP herunterladen und entpacken (z. B. in den Ordner „Downloads“ – der Installer kopiert
   alles an einen festen Ort).
2. Ein Terminal im entpackten Ordner öffnen und starten:

```bash
bash Setup-Linux.sh
```

Der Installer erklärt **vor jeder Änderung an deinem Rechner**, worum es geht und was sie bedeutet, und fragt
um Zustimmung. Wer eine Frage ablehnt, bricht die Installation ab – es wird nichts halb gemacht. Er fragt außerdem
nach der Portnummer (Vorschlag: 3000) und danach, ob auch **andere Geräte im Netzwerk** zugreifen dürfen.

Zum Schluss, sobald die App läuft, bietet er an, gleich das **erste Benutzerkonto** anzulegen (Nachname, Vorname,
E-Mail-Adresse und ein Passwort mit mindestens 12 Zeichen, am besten ein Satz aus ein paar Wörtern – Sonderzeichen sind
nicht nötig; die Eingabe des Passworts bleibt unsichtbar und wird zweimal verlangt). Dieses Konto wird **Administrator**
und wird später u. a. gebraucht, um die Installation mit dem Online-Server zu koppeln. Wer hier gleich anlegt, schließt
das Zeitfenster, in dem sonst jede Person im Netz, die die Seite aufruft, die Einrichtung im Browser vor dir abschließen
könnte. Wer die Frage mit „n“ beantwortet, richtet das Konto stattdessen beim ersten Öffnen im Browser ein (s. u.).

Danach läuft die App als Dienst `torball-turniere` und startet mit dem Rechner. Auf einem Rechner mit Oberfläche gibt es außerdem einen
Eintrag im Anwendungsmenü und eine Verknüpfung auf dem Schreibtisch; erscheint sie dort nur als Textdatei, hilft Rechtsklick → „Start erlauben“. Aufruf im Browser:
`http://localhost:3000`. Wurde im Installer noch kein Konto angelegt, führt die Anmeldeseite beim ersten Öffnen durch
die Einrichtung des ersten Administrator-Kontos (der Notweg im Browser). In beiden Fällen ist es ein **eigenes Konto auf
diesem Rechner**, unabhängig von einem Konto auf dem Online-Server – für die Synchronisation braucht man zusätzlich ein
Konto auf dem Server.

Für Tests ohne Tastatur (`TORBALL_UNBEAUFSICHTIGT=1`) lassen sich die Angaben über `TORBALL_ADMIN_NAME`,
`TORBALL_ADMIN_VORNAME` (optional), `TORBALL_ADMIN_EMAIL` und `TORBALL_ADMIN_PASSWORT` mitgeben; fehlen sie, wird die
Frage übersprungen.

## Was wo liegt

| Was | Wo |
|---|---|
| Programm und Einstellungen (`backend/.env`) | `/opt/torball-turniere/app` |
| Logdatei | `/opt/torball-turniere/logs` (und `journalctl -u torball-turniere`) |
| Zugangsdaten der Datenbank | `/etc/torball-turniere` (nur für Administratoren lesbar) |
| Turnierdaten | CouchDB (`/opt/couchdb/data`) |

## Netzwerkzugriff für Helfer-Geräte

Bei „Netzwerkzugriff erlauben“ lauscht die App auf allen Netzwerkkarten. Ist auf dem Rechner eine Firewall
aktiv (`ufw` oder `firewalld`), richtet der Installer die Freigabe **nur für das eigene Netz** ein, nicht für
das Internet. Die Verbindung ist **unverschlüsselt** (http) – bitte nur in einem Netz verwenden, dem du
vertraust (eigener WLAN-Router), nicht in einem offenen Hallen-WLAN. Wie du das Netzwerk am Turniertag aufbaust:
`Lokales-Netzwerk-Anleitung.html`.

Hat der Rechner eine Firewall, die der Installer nicht kennt, musst du den Port selbst freigeben.

## Aktualisieren

Mit Git-Checkout:

```bash
sudo torball-turniere-aktualisieren
```

Bei einer Installation aus dem ZIP kann der Befehl keinen neuen Quellcode holen. Dann das neue ZIP entpacken und
dort erneut `bash Setup-Linux.sh` ausführen – die Einstellungen und alle Turnierdaten bleiben erhalten.

## Hilfe bei Problemen

```bash
sudo systemctl status torball-turniere
journalctl -u torball-turniere -n 50
sudo torball-turniere-konsole diagnose      # schreibt einen Bericht, den man weitergeben kann
sudo torball-turniere-konsole --hilfe       # weitere Befehle, z. B. ein gesperrtes Konto entsperren
```

## Deinstallieren

```bash
sudo torball-turniere-deinstallieren
```

Jeder Schritt wird einzeln erklärt und bestätigt. **Das Entfernen von CouchDB löscht alle Turnierdaten** –
vorher unter „Systemeinstellungen → Sicherung“ eine Sicherungsdatei erstellen.

## Mac

Eine Installation für macOS gibt es bisher nicht.

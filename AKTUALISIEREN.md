# Torball-Turniere aktualisieren

Diese Anleitung gilt für die **lokale Installation auf einem Windows-Rechner** (per `Setup.cmd`
eingerichtet, z. B. bei einer Turnierleitung vor Ort). Für den Serverbetrieb (Debian/nginx) siehe
stattdessen `deploy/aktualisieren.sh` bzw. den Befehl `torball-aktualisieren`.

## Der einfache Weg: Doppelklick

Im Projektordner liegt die Datei **`Aktualisieren-Torball.cmd`** – einfach doppelklicken.

Das Skript:

1. Lädt den neuesten Quellcode herunter (nur falls die Installation aus einem Git-Repository
   stammt – bei einer per ZIP heruntergeladenen Installation entfällt dieser Schritt, siehe unten).
2. Installiert/aktualisiert benötigte Programmbestandteile (`npm install`).
3. Baut die Anwendung neu.

Am Ende bleibt ein Fenster offen, das mit einer Meldung abschließt – erst dann das Fenster
schließen. Läuft der Server gerade (eigenes Fenster „Torball-Turniere (Server – dieses Fenster
offen lassen)“), dieses vorher schließen, danach über die Desktop-Verknüpfung neu starten.

**Wichtig:** Turnierdaten selbst sind davon nicht betroffen – sie liegen in der Datenbank
(CouchDB), nicht im Projektordner. Ein Update überschreibt keine Turniere, Mannschaften oder
Ergebnisse.

## Woher kommt der neue Quellcode?

- **Installation aus einem Git-Repository** (`git clone`): `Aktualisieren-Torball.cmd` zieht den
  neuesten Stand automatisch per `git pull` – genauso ein erneuter Lauf von `Setup.cmd` (prüft
  dabei zusätzlich nochmal Node.js/CouchDB, dauert also etwas länger).
- **Installation aus einem heruntergeladenen ZIP** (kein Git-Repository vorhanden):
  `Aktualisieren-Torball.cmd` baut nur den vorhandenen Stand neu – **es wird dabei kein neuer
  Quellcode heruntergeladen.** Das Skript weist am Ende deutlich darauf hin, falls das auf diese
  Installation zutrifft. Für eine neue Version muss vorher das aktuelle Quellcode-ZIP erneut
  heruntergeladen und der Projektordnerinhalt (außer der eigenen `backend/.env`) damit ersetzt
  werden. Am einfachsten: neu entpacken in einen anderen Ordner, dann `backend/.env` aus der alten
  Installation in den neuen Ordner kopieren und dort `Setup.cmd` erneut ausführen (überschreibt
  eine vorhandene `.env` nicht).

## Konfiguration ändern (z. B. Port), ohne neu zu installieren

```
npm run torball --workspace=backend -- konfiguration:anzeigen
npm run torball --workspace=backend -- konfiguration:setzen --schluessel="PORT" --wert="3001"
```

(im Projektordner ausführen; nach einer Änderung den Server neu starten, siehe `Start-Torball.cmd`)

## Deinstallieren

Siehe `Deinstallieren-Torball.cmd` im Projektordner.

# Torball-Turniere aktualisieren

Diese Anleitung gilt für die **lokale Installation auf einem Windows-Rechner** (per `Setup.cmd` aus dem
Installationspaket eingerichtet, z. B. bei einer Turnierleitung vor Ort). Für den Serverbetrieb (Debian/nginx)
siehe stattdessen `deploy/aktualisieren.sh` bzw. den Befehl `torball-aktualisieren`.

## Der einfache Weg: ein Klick

Im Startmenü unter **„Torball-Turniere“** auf **„Torball-Turniere aktualisieren“** klicken (oder im
Programmordner `C:\Torball-Turniere\App` die Datei `Aktualisieren-Torball.cmd` doppelklicken) und die
Windows-Nachfrage nach Administratorrechten bestätigen. Mehr ist nicht zu tun.

Das Programm:

1. sieht bei den veröffentlichten Versionen („Releases“) des Projekts nach, ob es eine neuere gibt,
2. zeigt, was neu ist, und fragt vor dem Aktualisieren nach,
3. lädt das Paket selbst herunter und prüft es (Prüfsumme),
4. hält die Anwendung an, sichert den bisherigen Stand (`C:\Torball-Turniere\App.alt`), tauscht die Programmdateien aus
   und startet die Anwendung wieder,
5. prüft, ob die neue Version antwortet – **wenn nicht, stellt es den bisherigen Stand automatisch wieder her.**

Die Anwendung weist Administratoren außerdem am oberen Rand darauf hin, sobald es eine neue Version gibt.

**Wichtig:**

- Nicht mitten in einem Turnier aktualisieren: Während des Austauschs ist die Anwendung etwa eine Minute lang nicht
  erreichbar.
- Es ist eine **Internetverbindung** nötig.
- Turnierdaten selbst sind nicht betroffen – sie liegen in der Datenbank (CouchDB), nicht im Programmordner. Ein Update
  überschreibt keine Turniere, Mannschaften oder Ergebnisse, und die Konfiguration (`backend\.env`) bleibt erhalten.
- Vorab-Versionen („Beta“) bekommt nur, wer selbst schon eine Beta-Version installiert hat. Wer eine stabile Version nutzt,
  sieht nur stabile Veröffentlichungen.

## Wenn die Installation älter ist (aus dem Quellcode-ZIP)

Installationen, die noch mit dem früheren Quellcode-ZIP eingerichtet wurden (Server im Fenster „NICHT SCHLIESSEN“),
können sich nicht selbst aktualisieren. Einmalig auf das neue Format umstellen: das aktuelle Paket
`Torball-Turniere-Windows-….zip` herunterladen, entpacken und dort `Setup.cmd` starten. Das Installationsprogramm erkennt
die bestehende Installation, stellt sie auf den Hintergrunddienst um und behält Konfiguration und alle Turnierdaten. Ab dann
gilt der einfache Weg oben.

Entwickler-Installationen (Git-Checkout) werden dabei nie überschrieben – dort gilt weiter `git pull` bzw.
`Aktualisieren-Torball.cmd` (führt `git pull`, `npm install` und den Neubau aus).

## Konfiguration ändern (z. B. Port), ohne neu zu installieren

In einer Eingabeaufforderung **als Administrator** im Programmordner:

```
Konsole-Torball.cmd konfiguration:anzeigen
Konsole-Torball.cmd konfiguration:setzen --schluessel="PORT" --wert="3001"
```

Danach den Dienst „Torball-Turniere“ neu starten (Windows-Dienstverwaltung) oder den Rechner neu starten.

## Deinstallieren

Siehe `Deinstallieren-Torball.cmd` im Programmordner.

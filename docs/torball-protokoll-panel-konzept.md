# Torball-Protokoll-Panel – Konzept (Stand: 11.08.2026)

Physisches Eingabepanel für die Live-Protokollierung während Torball-Turnieren, als Ergänzung zur Next.js-Turnierverwaltungs-App. Ziel: komplette Bedienung per Tastendruck, kein Touch-Display am Panel selbst.

## Grundarchitektur

- **Anbindung an die App**: Panel meldet sich als **USB-HID-Tastatur** am Laptop/Tablet an, sendet normale Tastencodes. Die App reagiert per `keydown`-Listener – keine Netzwerkanbindung nötig, funktioniert offline und mit jedem Gerät.
- **Hardware-Basis**: ESP32-S3 (native USB-HID-Unterstützung, keine Treiber nötig auf Host-Seite), passt zum bestehenden ESPHome-Know-how.
- **Fertigung**: Gehäuse 3D-gedruckt/gefräst, PCB optional bei JLCPCB/PCBWay/Aisler fertigen lassen (ab ca. 2 $ für Kleinserie). Alternativ: Fremdvergabe an Etsy/Fiverr-Maker (Sim-Racing-"Button-Box"-Szene als Vorbild), Kosten dort nicht konkret recherchierbar – individuelles Angebot nötig.

## Tastenlayout (22 Tasten)

**Grundidee**: Kein gespiegeltes Layout mit doppelten Aktionstasten pro Team, sondern **ein gemeinsamer Satz Aktionstasten** plus zwei Team-Wahltasten als Kontext-Umschalter (Toggle, kein Halten wie bei Strg).

| Bereich | Tasten |
|---|---|
| Team-Wahl (links gestapelt) | **Team A** (oben), **Team B** (unten) |
| Aktionen (gemeinsam für beide Teams) | Tor, Fehlwurf, Strafwurf, Auszeit, Wechsel, Foul |
| Ziffernblock (Spielernummern, einstellig) | 0–9 im Taschenrechner-Layout |
| System / Bestätigen | Uhr Start/Stop, Halbzeit, Undo, OK (Bestätigen) |

## Bedienlogik

### Team-Kontext (Toggle)
- `Team A` drücken → Kontext „Team A" wird aktiv (unabhängig von Tippen oder Halten der Taste)
- Kontext bleibt gültig für beliebig viele nachfolgende Aktionen
- Wechsel des Kontexts nur durch Drücken von `Team B` (bzw. umgekehrt)
- **Reset des Kontexts** (kein Team mehr aktiv) durch die „allgemeinen" Tasten:
  - Auslösend: `Uhr Start/Stop`, `Halbzeit`
  - Nicht auslösend: `Undo`, `OK` (damit mehrere Aktionen desselben Teams hintereinander möglich sind, ohne Team-Taste erneut zu drücken)
- Nach Reset muss aktiv `Team A` oder `Team B` neu gewählt werden, bevor eine Aktion gebucht werden kann

### Eingabesequenzen
- **Tor**: `Team(A/B)` → `Tor` → `Ziffer` (Werfer) → `OK`
- **Wechsel**: `Team(A/B)` → `Wechsel` → `Ziffer` (raus) → `Ziffer` (rein) → `OK`
- Andere Aktionen (Fehlwurf, Strafwurf, Auszeit, Foul) analog – ob dafür jeweils eine Spielernummer nötig ist, ist noch offen und hängt vom finalen Protokoll-Datenmodell ab

### Monitor-Feedback (App-Seite)
- Da das Panel kein eigenes Display hat, muss die App den aktiven Team-Kontext sichtbar anzeigen (z. B. farbiger Banner/Balken am Bildschirmrand, in Team-Farbe)
- Vorschlag State-Feld: `aktiverTeamKontext: 'A' | 'B' | null`
- Idee für später: Panel-Tastenfarben und Monitor-Anzeige farblich abgleichen (Team A = Blau, Team B = Koralle), damit die Zuordnung sofort intuitiv ist

## Offene Punkte

1. **Reset bei unvollständiger Zifferneingabe**: Was passiert, wenn z. B. beim Wechsel erst eine Ziffer eingegeben wurde und dann `Uhr Start/Stop` oder `Halbzeit` gedrückt wird – Eingabe verwerfen oder Reset-Taste in diesem Zustand ignorieren? (Noch nicht entschieden, folgt bei der Protokoll-Spezifikation.)
2. **Timeout bei offener Eingabe**: Automatischer Reset nach z. B. 5–10 Sekunden Inaktivität sinnvoll, damit das Protokoll nicht in einem Zwischenzustand „hängen bleibt".
3. **Welche Aktionen brauchen eine Spielernummer?** Aktuell nur für Tor und Wechsel klar definiert.
4. **Löst `Halbzeit` automatisch einen Seitenwechsel im Protokoll aus**, oder ist das ein separater Schritt?
5. **Panel-eigenes Feedback**: Aktuell nicht geplant, aber als spätere Erweiterung im Kopf behalten – kleines OLED-Display (z. B. SSD1306, I2C) direkt am ESP32-Panel, das den Team-Kontext lokal per eigener State-Machine anzeigt (unabhängig von der App, da das Panel ein reines HID-Gerät bleibt). Vorteil: einfach umzusetzen, kein Rückkanal zur App nötig. Nachteil: Anzeige und tatsächlicher App-Zustand könnten theoretisch auseinanderlaufen, wenn der Kontext auch direkt in der App geändert werden kann.

## Nächste Schritte

- Finale Tastenbelegung und Zustandslogik erst festzurren, sobald das digitale Protokoll-Datenmodell (nächstes Release) spezifiziert ist
- Auf Basis der finalen Spezifikation: genaue Keycode-Belegung für die ESP32-Firmware ableiten (welche physische Taste sendet welchen HID-Code)
- Danach: Stückliste (ESP32-S3-Board, Taster, Gehäuse) und Bau-Reihenfolge (Steckbrett-Prototyp → Gehäuse → volle Belegung)

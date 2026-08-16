# Checkliste: Produktion eines Tutorial-Videos (Torball-Turniere)

Pro Video durchgehen. Reihenfolge entspricht dem Produktions-Workflow.

## Vorbereitung

- [ ] Skripttext in der Ableseansicht (HTML) geöffnet, Schriftgröße geprüft
- [ ] Testdaten in der App vorbereitet (Fake-Turnier, keine echten Namen)
- [ ] Browser-Zoom/Fensterauflösung auf 1920×1080 gestellt
- [ ] Windows-Mauszeiger vergrößert/eingefärbt (Einstellungen > Erleichterte Bedienung > Zeiger)
- [ ] Skript einmal laut vorgelesen (Zeitgefühl, Stolperstellen)

## Hardware

- [ ] RodeCaster Pro II angeschlossen und als Audiogerät ausgewählt
- [ ] Shure SM7B verkabelt, Gain grob eingepegelt (Pegeltest, kein Clipping)
- [ ] Kopfhörer zum Monitoring dran
- [ ] *Nur bei Intro/Outro mit Gesicht:* Elgato Facecam 2 + Licht von vorne (Softbox/Fenster, kein Gegenlicht)

## Software (Reihenfolge der Nutzung)

- [ ] **OBS** – Screen-Aufnahme, eigene Szene pro Funktionsblock
- [ ] **Samplitude Suite 2025** – nur falls Audio-Nachbearbeitung hier statt in Resolve passieren soll
- [ ] **Subtitle Edit** – Skripttext an Audiowellenform synchronisieren → deutsche SRT
- [ ] **DaVinci Resolve 21 (Studio)** – Schnitt, Fairlight-Audiomix, Untertitel-Import, Export
- [ ] Übersetzungstool (DeepL / Claude) – SRT in weitere Sprachen übersetzen, falls gewünscht

## Aufnahme

- [ ] Screen-Aufnahme(n) für alle Schritte des Videos im Kasten
- [ ] Ggf. Facecam-Clip für Intro/Outro im Kasten
- [ ] Sprachaufnahme des kompletten Skripttexts im Kasten

## Nachbearbeitung

- [ ] Audio bearbeitet (Rauschunterdrückung, De-Esser, Kompressor)
- [ ] Lautheit auf −14 LUFS integrated normalisiert
- [ ] Screen, Audio, ggf. Facecam in Resolve auf der Timeline zusammengeführt
- [ ] Cursor-Zoom/Spotlight an wichtigen Klick-Stellen ergänzt (optional)
- [ ] Deutsche SRT importiert und geprüft (Timing, Zeilenlänge)
- [ ] Weitere Sprachfassungen der SRT importiert (falls geplant)

## Export & Sicherung

- [ ] Rohmaterial (Screen + Audio) aufs NAS gesichert
- [ ] Video über Deliver-Seite gerendert (1080p, H.264/H.265)
- [ ] Fertiges Video + Projektdatei aufs NAS gesichert

## Veröffentlichung

- [ ] Video bei YouTube hochgeladen
- [ ] SRT-Dateien (alle Sprachen) als Untertitelspuren hochgeladen
- [ ] Kapitelmarken in der Videobeschreibung gesetzt
- [ ] Video in die passende Playlist einsortiert
- [ ] Volltext-Transkript auf der Hilfeseite verlinkt
- [ ] Video-Link in `frontend/src/hilfe/inhalte.ts` ergänzt

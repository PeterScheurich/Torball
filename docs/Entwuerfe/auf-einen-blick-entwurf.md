# Torball-Turniere auf einen Blick – Textentwurf

> **Entwurf zum Lesen und Umformulieren (Stand 02.11.2026).** Noch nicht im Code, nicht veröffentlicht. Stellen in [eckigen Klammern]
> sind offene Entscheidungen oder Angaben, die nur du kennst. Gedacht als öffentliche Seite („Neu hier?“ auf der Startseite) und als
> einseitiges PDF aus denselben Texten.

---

## Was ist Torball-Turniere?

Eine Web-Anwendung, mit der du Torball-Turniere **planst** und am Spieltag **protokollierst**. Torball ist ein Ballsport für blinde und
sehbehinderte Menschen; die Anwendung ist dafür entwickelt und lässt sich ohne Maus und mit Screenreader bedienen. Sie ist kostenlos und
quelloffen.

Ein Beispiel: Am Spieltag steht in der Halle ein Laptop. Zwei Helfer an den Feldern tragen die Ergebnisse mit dem Handy ein, ohne eigenes
Konto. Wer zuschaut, sieht Spielplan und Tabelle live auf dem eigenen Telefon.

## Das geht

- Ein Turnier mit einem **Assistenten** anlegen: Grunddaten, Regeln, Mannschaften, Schiedsrichter, Spielplan.
- **Spielmodi:** Jeder gegen jeden (auch mit Hin- und Rückspiel), zwei Gruppen mit Endrunde (4, 6 oder 8 Mannschaften), Spiel um Platz 3 und
  Platzierungsspiele. Eigene Vorlagen als Kopien.
- **Spielplan-Vorschlag** mit Warnungen bei Regelverstößen (zum Beispiel zwei Spiele direkt hintereinander) und **Schiedsrichter-Einteilung**.
  Die Anwendung warnt, entscheidet aber nicht für dich.
- **Ergebnisse erfassen** in der Anwendung oder über einen **Erfassungslink mit QR-Code** ohne Anmeldung, zum Beispiel für Helfer.
- **Tabellen** automatisch, auch als Gesamtstand über mehrere Spieltage (zum Beispiel Hin- und Rückrunde).
- **Öffentliche Turnierseite** mit QR-Code, bei der du selbst bestimmst, was Gäste sehen.
- **Ausdrucke als PDF** (Turnierinfos, Spielplan, Ergebnisse, Schiedsrichter), barrierefrei.
- **National oder international** (zum Beispiel Nichtantreten 5:0 nach IBSA-Regel).
- **Mehrere Personen mit Rollen:** Administration, Turnierleitung, Spielleitung.

## Das geht (noch) nicht

- Die **digitale Live-Protokollierung** (jeder Wurf, jedes Foul) ist eine **Beta**. Sie ist noch nicht in einem echten Turnier erprobt.
- Ein **eigenständiger Modus für einen einzelnen Rechner ohne Server** ist geplant, aber noch nicht gebaut. Heute gibt es dafür die lokale
  Installation (siehe unten).
- Nur **Deutsch**. Weitere Sprachen sind vorgemerkt.
- **Dateien am Turnier** (Ausschreibung, Hallenplan) und **parallele Turniere mit geteilten Feldern** gibt es noch nicht.

## So kannst du es betreiben

| | **Im Internet** | **Lokale Installation** | **Eigenständig (Standalone)** |
|---|---|---|---|
| Wann passt das? | Die Halle hat zuverlässiges Internet. | Die Halle hat kein oder unzuverlässiges Internet. | [geplant] |
| Was brauche ich? | Einen Browser und ein Konto. [Zugang: Demo zum Ausprobieren, Konto auf Anfrage?] | Einen Rechner mit Windows 10/11 oder Debian/Ubuntu (64 Bit). Für Helfer-Geräte ein WLAN-Router. | – |
| Worauf muss ich achten? | Fällt das Internet aus, geht in der Halle nichts. | Die Daten liegen auf diesem einen Rechner: vor dem Turnier eine Sicherung machen. | – |

Die beiden ersten Arten lassen sich kombinieren: Du planst im Internet, lädst das Turnier auf die lokale Installation, arbeitest vor Ort und
die Ergebnisse laufen zurück, sobald wieder eine Verbindung besteht.

**Ausprobieren:** [Adresse der Demo – sie wird jede Nacht zurückgesetzt, du kannst dort frei testen.]

## Voraussetzungen

- **Zum Benutzen:** ein aktueller Browser (Computer, Tablet oder Handy).
- **Lokale Installation unter Windows:** Windows 10 oder 11, Administratorrechte, etwa 1 GB freier Speicher. Es muss nichts vorher installiert
  werden. Beim Installieren und Aktualisieren ist Internet nötig, dazwischen nicht.
- **Lokale Installation unter Linux:** Debian oder Ubuntu (auch Linux Mint) mit Langzeit-Support, 64 Bit, 2 GB Arbeitsspeicher, etwa 2 GB Platz.
- **Am Spielort:** ein WLAN-Router (ohne Internet reicht), damit sich Helfer-Geräte verbinden können. In einem Netz mit Passwortschutz, dessen
  Passwort nur deine Helfer kennen.

## Was kommt auf dich zu?

- Ein **Konto** und eine kurze Einarbeitung. Die Hilfe in der Anwendung erklärt jeden Schritt.
- Für das erste Turnier **ein bis zwei Stunden**, danach geht es mit „Turnier ableiten“ und Vorlagen schneller. [Zeitangabe bitte prüfen]
- Vor jedem Turnier auf der lokalen Installation eine **Datensicherung** (ein Klick, eine Datei).
- **Rollen klären:** Wer plant, wer protokolliert, wer trägt Ergebnisse ein?

## Kosten, Lizenz, Datenschutz

- **Kostenlos** und **quelloffen** (Lizenz: GNU AGPL 3.0). Den Quellcode findest du auf GitHub: https://github.com/PeterScheurich/Torball
- Entwickelt von Peter Scheurich in enger Zusammenarbeit mit einer KI.
- Die Anwendung speichert Konten (Name, E-Mail-Adresse) und die Turnierdaten. Bei einer lokalen Installation bleiben alle Daten auf deinem Rechner.
  [Hinweis zum Datenschutz auf der zentralen Instanz: Standort, Verantwortlicher – bitte ergänzen]

## Fragen, Fehler, Ideen

[Kontakt: software@blindentorball.de – Adresse wird nicht im Klartext in die Seite geschrieben (Spam-Schutz), siehe Vorschlag in der Besprechung.]
Technische Fehler und Wünsche gern auch auf GitHub als „Issue“.

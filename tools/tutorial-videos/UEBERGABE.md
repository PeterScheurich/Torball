# Übergabe: Tutorial-Videos für Torball-Turniere (Stand 03.11.2026)

Dieses Dokument fasst zusammen, was in der Sitzung vom 02./03.11.2026 zu den Tutorial-Videos besprochen und herausgefunden wurde. Es ist für eine neue
Sitzung gedacht, die dort weiterarbeitet. Zugangsdaten stehen hier bewusst nicht; sie liegen im Claude-Memory (siehe unten).

## 1. Ziel und Rahmen

- Die neun Tutorial-Videos zu Torball-Turniere sollen komplett neu und einheitlich aufgesetzt werden. Nachträgliche Änderungen (Text, App-Oberfläche) sollen leicht sein: „Tutorial als Code".
- Pilot ist Video 2, „Turnier anlegen". Der Text für diesen Pilot ist der alte Wortlaut vom 19.08.2026 (`texte/02-turnier-anlegen-vom-19-08.txt`). Für alle neuen Videos gilt: Peter prüft und gibt den Text frei, bevor irgendetwas gesprochen oder aufgenommen wird.
- Gewünschter Aufbau jedes Videos: Zusammenfassung, was einen erwartet, dann das Intro, dann die einzelnen Kapitel, dann die Vorschau auf das nächste Video und das Outro. Länge etwa drei bis fünf Minuten. Ist der Inhalt groß, wird in Detailvideos geteilt (zum Beispiel 05a, 05b).
- Später: Untertitel in weiteren Sprachen (Deutsch ist Standard, dazu Englisch, Französisch, Italienisch), eventuell zusätzliche Tonspuren.
- Peter lässt sich Antworten vorlesen: keine Tabellen, kurze Absätze, Entwürfe direkt im Chat.

## 2. Aufnahmestandard (vereinbart)

- Dunkles Design, 125 % Zoom, 1920×1080, 24 Bilder pro Sekunde (passt zur Resolve-Zeitleiste), fest erfundener Datenstand (Beispiel: „Hallenturnier Sonnenberg", 06.03.2027, 09:00).
- Hinweis-Banner der Entwicklungsumgebung wird ausgeblendet.
- Mauszeiger ist ein gelber Kreis, das jeweilige Feld bekommt einen gelben Rahmen. Der Zeiger gleitet weich, auch die Seite scrollt weich (ein ruckartiger Sprung wurde bemängelt).
- Langsames Tempo ist Absicht: Menschen mit Sehrest folgen oft dem Mauszeiger.

## 3. Sprache (ElevenLabs)

- Stimme „Peter" (geklont), Modell eleven_multilingual_v2, Einstellungen: Stabilität 0,5, Ähnlichkeit 0,86, Stil 0, Tempo 0,95, Speaker Boost an. Ausgabe mp3_44100_128 (unkomprimiertes PCM gibt es im Starter-Tarif nicht).
- Der Schlüssel liegt nur in einer Datei außerhalb des Projekts (Ort im Claude-Memory). Er darf nie ausgegeben, in ein Repository oder in den Chat gelegt werden.
- Starter-Tarif, ein Jahresabo; ein Downgrade geht nur zum Jahresende. Kosten etwa 0,4 Credits je Zeichen. Einmal pro Lauf nie mehr als 5.000 neue Zeichen ohne Rückfrage. Der Zähler in der Abo-Schnittstelle ist unzuverlässig; Verbrauch lieber aus dem Verlauf ablesen.
- Gesprochen wird SATZWEISE, jeder Satz einzeln mit Zwischenspeicher (Text, Folgesatz-Kontext und Einstellungen sind der Schlüssel). Ein unveränderter Satz kostet nichts. Achtung: Ändert man den Schlüsselaufbau, werden alle Sätze neu erzeugt (ist einmal passiert, rund 730 Credits).
- Die Pausen setzt das Skript selbst, einstellbar in `pausen.json` (kostenlos): gewählt sind Satzende 1,3 s, Überschrift 1,6 s, Abschnitt 2,2 s.
- Gesprochen werden die Überschriften „Schritt 1" und „Schritt 2"; Meta-Überschriften (Video, Intro, Ausgangspunkt, Outro) nicht.
- Für den letzten Satz eines Videos steht ein nicht gesprochener Schlusssatz als Kontext (sonst steigt die Stimme am Ende statt zu fallen). Die Betonung am Satzende ist allgemein noch nicht zuverlässig (E-02 fällt nicht ab).
- Textregeln aus der Abnahme: Doppelpunkt und Strichpunkt sollen künftig wie ein Punkt als Satzende gelten. Sehr lange Sätze werden geteilt (Beispiel C-06, Teil nach dem Strichpunkt in D-03). Das ist noch nicht umgesetzt.

## 4. Aufnahme (Playwright)

- Das Werkzeug liegt in `tools/tutorial-videos/` (eigenes `package.json`, kein Workspace). Ein Skript je Video; es bricht ab, wenn ein Knopf fehlt, was bedeutet: das Video ist veraltet.
- Die Handlungen im Skript hängen an den Wortzeiten des Plans (`wortZeit(id, wort)`), damit der Zeiger zum gesprochenen Wort passt. Verspätungen über 0,4 s werden gemeldet.
- Wichtige Erkenntnis: Playwright zeichnet nur CSS-Pixel auf. Fenster 1536×864 mit Gerätefaktor 1,25 landete oben links im 1920×1080-Bild, der Rest blieb grau. Richtig ist Fenster 1920×1080, Faktor 1 und der Zoom per CSS `body{zoom:1.25}`; der Zeiger hängt am `html`-Element.
- Testkonto: Das Skript liest die Zugangsdaten aus einer Datei außerhalb des Projekts über die Umgebungsvariable `TORBALL_TESTKONTO_DATEI` (die Memory-Datei `reference_test_login.md`). Nur gegen die lokale Dev-Instanz oder die Demo, nie gegen Produktion. Dev-Frontend (Port 5173) und Dev-Backend (3000) müssen laufen (über `preview_start`, nie über Bash).
- Das Beispielturnier wird nach der Aufnahme wieder gelöscht.

## 5. Resolve (DaVinci Resolve Studio 21.1.2)

- Arbeitsprojekt ist ausschließlich die Kopie **„Torball-Turniere-Tutorials-mit-Claude"**. Die Skripte brechen ab, wenn ein anderes Projekt offen ist. Das Original-Projekt wird nie angefasst. Externes Scripting steht auf „Lokal", Python 3.14 funktioniert (`resolve_verbindung.py`).
- Vorhandene Zeitleisten im Projekt: Intro (5,04 s), Outro (5 s), 01 Einführung, TL 02 Turnier anlegen (alter Schnitt, dient als Vorlage), v6 (Zeitleiste mit Peters Anmerkungen, bleibt als Referenz) und v9 (aktueller Stand).
- Erkenntnisse, die Zeit gekostet haben:
  - Resolve dekodiert manche ElevenLabs-mp3 nicht bis zum Ende (0,2 bis 0,6 s fehlen). Per Testrender belegt. Deshalb Satzdateien als WAV (`mp3-zu-wav.mjs`, der Browser dekodiert vollständig).
  - Wird eine Datei unter gleichem Pfad neu erzeugt, behält Resolve die alten Daten (Media Offline, falsche Dauer, alte Untertitel). Deshalb legt jeder Zeitleisten-Bau eigene Kopien und einen eigenen Media-Pool-Ordner an. Frühere Zeitleisten bleiben unberührt.
  - Eine Untertitelspur hängt Resolve ans Ende der schon belegten Zeitleiste und ignoriert die Startposition. Deshalb wird die SRT zuerst auf die leere Zeitleiste gelegt.
  - Verschachtelte Zeitleisten (Intro, Outro, Titel) brauchen ausdrückliche Start- und Endbilder, sonst wird zum Beispiel das Outro nur ein Bild lang.
  - Kapitelüberschriften (Text+) lassen sich nicht an eine bestimmte Spur einfügen (Einfügen auf V1 zerschneidet das Video). Lösung: je Titel eine kleine Zeitleiste mit Text+ und der exportierten Stilvorlage `vorlagen/titel-kapitel.comp` (Open Sans, gelb), die dann auf V2 gelegt wird.
  - Beim Testen der Tonlänge habe ich Renderaufträge angelegt; sie sind entfernt, aber das Ausgabeformat des Projekts steht jetzt auf „unbekannt". Peter muss es bei Gelegenheit in den Lieferoptionen wieder einstellen.
- Aufbau einer Zeitleiste: Bild auf V1, Intro, Titel und Outro auf V2, Intro-Ton auf A2, Sätze auf A1, Untertitel auf der Untertitelspur, Marker je Satz (Creme) und je Überschrift (Mint). Das Intro überlappt am Ende (durchsichtiger Teil, 1,12 s) mit dem Bild; ab dem Intro verschiebt sich alles Spätere. Der Aufbau steht je Video in `aufbau.json` im Ordner des Videos.

## 6. Ablauf einer Runde (Befehle)

Im Ordner `tools/tutorial-videos`:

1. Sprache: `node erzeuge-video-02-test.mjs` (erzeugt fehlende Sätze, baut Plan und Untertitel; `--trocken` zeigt nur die Sätze, `--nur-plan` baut ohne Kosten neu).
2. Ton für Resolve: `node mp3-zu-wav.mjs`.
3. Aufnahme: `node aufnahme-video-02.mjs` (mit gesetzter `TORBALL_TESTKONTO_DATEI`).
4. Zeitleiste: `python resolve_zeitleiste_video.py "<Ordner des Videos>" "<Name der neuen Zeitleiste>"`. Name immer neu vergeben (v10 und so weiter).
5. Prüfen: `node pruefe-bildrand.mjs "<Aufnahme.webm>"` (graue Ränder), `node pruefe-satzende.mjs` (Satzenden in den Dateien).
6. Anmerkungen lesen: `python resolve_anmerkungen_lesen.py "<Zeitleistenname>"`.

Ordner des Pilotvideos: `D:\Projekte\Videos\Tutorials\Torball\Neu\02 Turnier anlegen\` mit Saetze, plan.json, pausen.json, aufbau.json, Aufnahme, Kontrollbilder, Zeitleisten. Die Medien gehören nie ins Repo, die Skripte schon.

## 7. Abnahme: Anmerkungen in Resolve (siehe `ANMERKUNGEN.md`)

- Reihenfolge: erst Ton, dann Bild, dann Schnitt. Ändert sich ein Satz, ändert sich seine Länge, und dann müssen Aufnahme und Zeitleiste neu gebaut werden.
- Farben der Marker: Rot ist Ton, Blau ist Bild, Gelb ist Wortlaut, Grün ist Schnitt und Einblendungen, Lila ist Frage oder Idee. Creme und Mint setzt Claude selbst (Satz- und Überschriftmarker).
- Marker für alles, was an einer bestimmten Zeit liegt. Kommentarfeld des Clips für alles zu einem ganzen Satz (jeder Satz ist ein eigener Clip). Das Bild ist ein einziger Clip, dort nur Marker. Beides wurde mit echten Eintragen getestet und funktioniert.
- Die Notiz nennt, was falsch ist und, wenn bekannt, wie es sein soll. Mehrere Fehler an einer Stelle: ein Marker je Fehler.

## 8. Stand des Pilotvideos und offene Punkte

Stand: Peter fand v9 „deutlich besser, ein guter erster Wurf". Der Ton in v9 ist nachgeprüft vollständig. Intro, Kapitelüberschriften (Grunddaten, Regeln), Outro und weiches Scrollen sind eingebaut.

Offen:
- Lange Sätze teilen (C-06 in drei Sätze, D-03 am Strichpunkt) und die Regel „Doppelpunkt und Strichpunkt sind Satzende" einbauen. Peter hat das für den ersten Test bewusst zurückgestellt.
- Betonung am Satzende, besonders E-02 (die Stimme senkt sich nicht).
- Outro: ob es am Anfang durchsichtig ist und ob es Ton hat, ist ungeprüft.
- Aussprachewörterbuch (Torball, IBSA, QR-Code, PDF) anlegen und an einem Satz testen.
- Weitere Anmerkungen von Peter zu v9 abwarten.
- Serienplan für die übrigen Videos: Liste mit Ziel, Länge, Abhängigkeiten und möglichen Detailvideos, dann je Video Gliederung, Text zur Freigabe, Sprache, Aufnahme, Zeitleiste.
- Der Aufnahmecode und die Zeitleistenskripte sind bisher auf Video 2 zugeschnitten; für weitere Videos verallgemeinern (Ordner, Titel, Aufbau).
- Später: Untertitel in weiteren Sprachen, eventuell Tonspuren.

## 9. Ausgangslage vor dieser Sitzung (für den Zusammenhang)

Vorher gab es zwei fertige Videos (Einleitung und Video 2) mit Stand August 2026; inhaltlich veraltet: der Knopf heißt jetzt „Weiter zu Regeln", es gibt die neuen Felder Turnierart und Turniermodus, und in den alten Untertiteln steht der Tippfehler „Torbal". Die Skripte aller neun Videos liegen in `docs/Tutorial-Videos/`, die alten Medien in `D:\Projekte\Videos\Tutorials\Torball`. Der alte Bestand bleibt unangetastet, neue Dateien kommen in den Ordner `Neu`.

## 10. Was in die neue Sitzung gehört

Das Claude-Memory enthält die Dateien `project_tutorial_videos.md` (Werkzeuge, Stimme, Rahmen), `feedback_sprachausgabe.md` (Peter lässt sich vorlesen) und `reference_test_login.md` (Testkonto, nur für die Dev-Instanz). Diese Übergabe und `ANMERKUNGEN.md` und `README.md` liegen in `tools/tutorial-videos/`.

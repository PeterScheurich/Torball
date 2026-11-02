# Anmerkungen beim Abnehmen eines Videos

So hält Peter beim Ansehen in DaVinci Resolve fest, was geändert werden soll. Claude liest die Anmerkungen später aus der Zeitleiste
(`python resolve_anmerkungen_lesen.py "<Zeitleistenname>"`) und arbeitet sie in einer Runde ab.

## Die Reihenfolge

Erst den Ton abnehmen, dann das Bild, dann den Schnitt. Ändert sich ein Satz, ändert sich seine Länge, und dann muss Claude die Aufnahme
und die Zeitleiste neu bauen. Anmerkungen zum Bild lohnen sich deshalb erst, wenn der Ton feststeht.

## Die Farben (Marker auf der Zeitleiste)

- **Rot = Ton.** Etwas ist falsch gesprochen, abgeschnitten, falsch betont, zu schnell oder zu langsam, oder eine Pause ist zu kurz oder zu lang.
- **Blau = Bild.** Etwas passiert im Bild falsch: Mauszeiger zu schnell, Feld nicht hervorgehoben, falsche Stelle angeklickt, Bild springt.
- **Gelb = Wortlaut.** Der gesprochene Text soll sich ändern, weil er unklar, falsch oder veraltet ist, oder ein Satz soll geteilt werden. Das kostet neue Sprache und Aufnahme.
- **Grün = Schnitt und Einblendungen.** Etwas gehört in den Schnitt oder soll eingeblendet werden: Intro, Outro, Kapitelüberschrift, Überblendung, Reihenfolge, Länge einer Szene. Das kostet nichts und ändert weder Ton noch Aufnahme.
- **Lila = Frage oder Idee.** Etwas ist unklar, oder du hast einen Gedanken, der noch keine Anweisung ist. Claude antwortet darauf, statt es zu ändern.

Creme und Mintgrün setzt Claude selbst: Creme steht an jedem Satzanfang mit der Satznummer, Mintgrün an jeder Überschrift. Diese beiden Farben bitte nicht verwenden.

## Wo kommt die Anmerkung hin

- **Marker** (Taste M, die Notiz mit Doppelklick auf den Marker): für alles, was an einer bestimmten Zeit liegt. Das gilt für das Bild und auch für den Ton, wenn nicht ein ganzer Satz gemeint ist.
- **Kommentarfeld des Clips** (Rechtsklick auf den Satz im Media Pool, Metadaten, Feld „Comments"): für alles, was einen ganzen Satz betrifft. Jeder Satz ist ein eigener Clip, der Kommentar steht also beim richtigen Satz.
- Das Bild ist nur ein einziger Clip. Dort gibt es deshalb keine Kommentare, nur Marker.

## Wie schreibe ich die Notiz

- Ein Satz genügt: **was** ist falsch, und wenn du es weißt, **wie** es sein soll. Zum Beispiel: „Das Wort Meisterschaft ist abgeschnitten." Oder: „Zeiger gleitet zu schnell zum Button, bitte langsamer."
- Bei einem Marker steht die Zeit schon dabei, bei einem Satz-Kommentar die Satznummer (A-02 und so weiter).
- Mehrere Fehler an derselben Stelle: ein Marker je Fehler, mit der jeweiligen Farbe. So kann Claude die Schichten getrennt abarbeiten.

## Was Claude daraus macht

- Rot: den Satz neu sprechen lassen (kostet Credits, rund 0,4 je Zeichen) oder die Pausen in `pausen.json` ändern (kostet nichts).
- Blau: das Aufnahmeskript anpassen und neu aufnehmen (kostet nichts).
- Gelb: erst den neuen Wortlaut zur Freigabe vorlegen, dann sprechen und aufnehmen.
- Grün: den Aufbau ändern (Datei `aufbau.json` im Ordner des Videos: Intro, Kapitelüberschriften, Outro) und die Zeitleiste neu bauen.
- Lila: antworten.
- Danach baut Claude die Zeitleiste neu und nennt dir die neue Version.

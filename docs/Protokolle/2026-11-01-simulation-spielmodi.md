# Simulationslauf aller Spielmodi (2026-11-01)

Auftrag: alle Turniermodi durchspielen wie bei einer manuellen Erfassung, öffentlich freigeben, gelegentliche
Anpassungen simulieren, Fehler protokollieren und beheben.

## Vorgehen

Skript gegen die laufende Dev-API (`localhost:3000`, Anmeldung mit dem Test-Konto). Je Szenario: Turnier anlegen,
Hallen setzen, Modus wählen, Mannschaften anlegen (Mischung aus Stammdaten-Teams und neuen Mannschaften), bei zwei
Gruppen verteilen, Spielplan erzeugen, öffentlich freigeben, Spiele in Spielnummern-Reihenfolge erfassen, Endrunde
erzeugen und spielen. Nach jeweils fünf Spielen wurde geprüft:

- eigene Tabellenberechnung gegen `/turniere/:id/tabelle` (Spiele, Siege, Tore, Punkte inkl. Forfait-Abzug, Sortierung)
- oeffentliche Seite OHNE Anmeldung gegen die interne Sicht (Spielzahl, Ergebnisse, Spielnummern, Tabelle)
- Spielnummern eindeutig und lückenlos, folgen Zeit-Slot und Hallenreihenfolge
- keine Mannschaft und keine Halle doppelt belegt (Abstand mindestens eine Spieldauer)
- Paarungen: jede genau einmal bzw. zweimal, nie über Gruppen hinweg; Endrunden-Paarungen gegen die Regeln der Vorlage

Angepasst wurde während der Turniere: Startzeit verschoben, Halle getauscht, Mannschaft umbenannt, Spiel als
Nichtantreten gewertet, Ergebnis nach dem Abschluss korrigiert, Endrundenspiel in andere Halle gelegt,
Gleichstände und Unentschieden von der Turnierleitung entschieden.

## Die Turniere (bleiben zur Prüfung stehen, Namen beginnen mit „SIM“)

| Nr. | Modus | Mannschaften / Hallen | Stand |
|---|---|---|---|
| 01 | Jeder gegen Jeden einfach | 5 / 1 | abgeschlossen |
| 02 | Jeder gegen Jeden doppelt | 4 / 2 | alles gespielt, offen |
| 03 | JgJ mit Endrunde (4) | 6 / 1 | abgeschlossen |
| 04 | JgJ doppelt mit Endrunde (6) | 8 / 2 | alles gespielt, offen |
| 05 | JgJ mit Endrunde (2), nur Finale | 5 / 1 | abgeschlossen |
| 06 | Zwei Gruppen mit Endrunde (4) | 8 / 2 | abgeschlossen |
| 07 | Zwei Gruppen doppelt, Endrunde (4), Gruppen 3+4 | 7 / 1 | mitten in der Endrunde |
| 08 | Kreuzvergleich, Viertelfinale (8) | 10 / 2 | alles gespielt, offen |
| 09 | Zwei Gruppen, nur Platzierungsspiele, Gruppen 5+4 | 9 / 2 | alles gespielt, offen |
| 10 | International, Gruppen mit Endrunde (6) | 12 / 2 | Vorrunde fertig, Endrunde noch nicht erzeugt |
| 11 | JgJ doppelt mit Endrunde (8) | 10 / 2 | Vorrunde zur Hälfte (49 von 90) |
| 12 | Ohne Modus (Altbestand) | 3 / 1 | alles gespielt, offen |
| 13 | Nur zwei Mannschaften, doppelt | 2 / 1 | alles gespielt, offen |
| 14 | Zwei Gruppen mit 2+2 Mannschaften | 4 / 1 | alles gespielt, offen |
| 15 | Gleichstand: alle Spiele 1:1, zwei Gruppen | 6 / 1 | alles gespielt, offen |
| 16 | Gleichstand: alle Spiele 1:1, JgJ mit Endrunde | 5 / 1 | alles gespielt, offen |

Alle sind für die öffentliche Anzeige freigegeben (Turnierinfos, Anfahrt, Spielplan, Ergebnisse, Regeln).

## Gefunden und behoben

1. **Neue Turniere ohne Pause zwischen den Spielen (Fehler, schon im ersten Lauf).** Die gespeicherte
   Systemkonfiguration der Dev-Datenbank stammt von vor der Einführung von `pauseZwischenSpielenMinuten`.
   `aktuelleTurnierregeln()` kopierte das fehlende Feld als `undefined` in jedes neue Turnier; die Slots lagen
   12 statt 25 Minuten auseinander, zwei aufeinanderfolgende Spiele einer Mannschaft überlappten. Auf Prod/Demo
   dürfte dasselbe gelten, sofern die Konfiguration dort vor dem 20.08. gespeichert und seither nicht erneut
   gespeichert wurde. **Behoben:** fehlende Felder kommen aus `STANDARD_TURNIERREGELN` (`fuelleFehlendeAuf`).
   Bereits angelegte Turniere behalten ihre Werte.
2. **Ergebnisse mit Nachkommastellen** (`1.5`) und unbegrenzt große Werte wurden gespeichert. Jetzt ganze Zahlen,
   0 bis 999 (interne Erfassung und Erfassungslink).
3. **Spiel in eine nicht vorhandene Halle legen** war möglich (`feldId` ungeprüft). Jetzt 400.
4. **Mannschaft löschen trotz Ergebnissen** ließ Spiele ohne Gegner zurück. Jetzt 409, solange sie ein Ergebnis
   oder ein begonnenes Spiel hat.
5. **Unsinnige Regelwerte** (Spielzeit −5, 0 Halbzeiten, Punkte als Text, Nichtantreten als Freitext) wurden beim
   Turnier und bei den Standardregeln gespeichert. Neue Prüfung `regelnPruefung.ts`.
6. Mannschaftsname ohne Längengrenze (5000 Zeichen gingen durch) – jetzt höchstens 200.

Tests: `regelnPruefung.test.ts`, `eingabepruefung.integration.test.ts`. Gesamtstand: 122 Unit-Tests bestanden, 46
übersprungen (ohne CouchDB); im vollen Integrationslauf 168 von 168 bestanden.

## Beobachtet, bewusst unverändert

- **Halle entfernen, obwohl Spiele sie benutzen**: bleibt erlaubt. Der Weg „Halle entfernen, dann Spielplan neu
  erzeugen“ wäre sonst blockiert; die Oberfläche weist auf den veralteten Spielplan hin.
- **Mannschaft nach dem Spielplan hinzufügen / noch ungespielte Mannschaft löschen**: erlaubt, der Plan gilt dann als
  veraltet (Hinweis in der Oberfläche).
- **Doppelter Mannschaftsname** im selben Turnier ist erlaubt.
- Die öffentliche Spielplan-Sicht zeigt auch ohne Ergebnis-Freigabe den Status („Abgeschlossen“). Das verrät kein
  Ergebnis; wer das nicht möchte, müsste den Status dort ausblenden.
- Unentschieden im Finale und im Spiel um Platz 3 entscheidet die Turnierleitung per Hand (kein Penaltyschießen
  im Programm); das ist der vorgesehene Ablauf, kam in der Simulation häufig vor, weil Remis simuliert wurden.

## Nicht geprüft

Digitale Protokollierung (nur manuelle Erfassung), Schiedsrichter-Einteilung, Turnier-Sync, Mehrbenutzer-Zugriff.
Die Oberfläche wurde stichprobenweise im Browser angesehen (öffentliche Seite, Spielplan-Reiter mit Endrunde),
keine Konsolenfehler.

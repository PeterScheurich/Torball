# Spezifikation fachlich
**Version:** 0.1  
**Datum:** Juli 2026  
**Status:** Entwurf zur Prüfung

---

## Inhaltsverzeichnis

1. Einleitung
2. Was ist Torball?
3. Ziel der Software
4. Turnierarten und Modi
5. Turniervorbereitung
6. Spielregeln und deren Umsetzung
7. Spielprotokoll
8. Spielplan-Generierung
9. Ergebnisse und Tabellen
10. Benutzer und Berechtigungen
11. Datenschutz
12. Offene Fragen für den Fachexperten

---

## 1. Einleitung

Dieses Dokument beschreibt die fachlichen Anforderungen an eine Software zur Planung, Durchführung und Auswertung von Torball-Turnieren. Es richtet sich an Fachexperten, die die inhaltliche Korrektheit der beschriebenen Regeln und Abläufe prüfen sollen.

Technische Details werden in einem separaten Dokument beschrieben.

---

## 2. Was ist Torball?

Torball ist eine Mannschaftssportart für blinde und sehbehinderte Menschen. Jede Mannschaft besteht aus drei Spielern auf dem Feld, mit bis zu drei Ersatzspielern auf der Bank.

**Das Spielfeld:**
- 16 x 7 Meter groß
- An jedem Ende befindet sich ein Tor über die gesamte Breite (7 m), 1,30 m hoch
- Drei Leinen spannen sich quer über das Feld in der Mitte, 40 cm über dem Boden
- Orientierungsmatten (1 x 2 m) vor jedem Tor helfen den Spielern bei der Orientierung

**Grundprinzip:**
- Der Ball muss unter den Leinen hindurch geworfen werden
- Ziel ist es, den Ball in das gegnerische Tor zu werfen
- Alle Spieler tragen Augenbinden (Eye-Pads und lichtundurchlässige Brille)

---

## 3. Ziel der Software

Die Software soll folgende Aufgaben unterstützen:

**Turnierplanung:**
- Turniere planen und vorbereiten
- Spielpläne automatisch generieren
- Mannschaften und Spieler erfassen

**Turnierdurchführung:**
- Spielprotokolle live erfassen
- Spielzeiten messen und anzeigen
- Regelprüfungen unterstützen (Hinweise an die Spielleitung)

**Auswertung:**
- Ergebnisse und Tabellen berechnen
- Torschützenlisten führen
- Historische Turnierdaten abrufen

**Live-Ergebnisse:**
- Aktuelle Spielstände im Internet veröffentlichen
- Auf Smartphones abrufbar

**Wichtiger Grundsatz:**
Die Software unterstützt und informiert – sie entscheidet nie selbst. Jede Entscheidung (Foul, Penalty, Timeout) obliegt dem Schiedsrichter. Die Software zeigt Hinweise, aber jedes protokollierte Ereignis wird manuell durch die Spielleitung erfasst.

---

## 4. Turnierarten und Modi

Die Software unterstützt verschiedene Turnierarten. Folgende Modi sind vorgesehen:

| Modus | Beschreibung |
|---|---|
| Einfaches Turnier | 1 Spieltag, eine Runde, Jeder gegen Jeden |
| Einfaches Turnier mit Endspielen | Wie oben, zusätzlich Finale und ggf. Spiel um Platz 3 |
| Doppeltes Turnier | 1 Spieltag, zwei Runden, Jeder gegen Jeden |
| Doppeltes Turnier mit Endspielen | Wie oben, zusätzlich Finale |
| Bundesliga (DE) | 2 Spieltage, je eine Runde, Jeder gegen Jeden |
| Bundesliga (DE) alternativ | 2 Spieltage, je zwei Runden, Jeder gegen Jeden |
| Vor- und Hauptrunde | 1 Spieltag, Vorgruppen, dann Haupt- und Trostrunde |

**Wettbewerb über mehrere Spieltage:**
Bei der Bundesliga gibt es zwei Spieltage (Hin- und Rückrunde), deren Ergebnisse zusammen die Gesamttabelle ergeben. Jeder Spieltag ist aber auch einzeln auswertbar.

---

## 5. Turniervorbereitung

### 5.1 Turnierdaten

Für jedes Turnier werden folgende Informationen erfasst:

**Allgemein:**
- Name des Turniers
- Datum und Startzeit
- Spielort (Name, Adresse, optional Google Maps)
- Anzahl und Name der Spielfelder (z.B. Halle A, Halle B)
- Turnierleitung (Name, Kontakt)
- Ansprechpartner (Name, Kontakt)
- Zusätzliche Informationen (Anreise, Hotel, etc.)

**Spielregeln (konfigurierbar):**
- Turniermodus
- Spielzeit je Halbzeit (Standard: 5 Minuten)
- Anzahl Halbzeiten (Standard: 2)
- Pause zwischen Halbzeiten (Standard: 2 Minuten)
- Seitenwechsel ja/nein
- Timeouts je Halbzeit und Mannschaft (Standard: 1)
- Maximale Auswechslungen je Halbzeit (Standard: 3)
- Tordifferenz-Abbruch bei 10 Toren (Standard: aktiv)
- Verlängerung bei Unentschieden (Standard: aktiv, nur bei Finalspielen)
- Silbernes Tor in der Verlängerung (Standard: aktiv)
- Maximale Anzahl sehender Spieler (Standard: 1, Bundesliga-Regel)
- Einstellige Trikotnummern (Standard: ja)

**Punktevergabe:**
- Punkte für Sieg (Standard: 2)
- Punkte für Unentschieden (Standard: 1)
- Punkte für Niederlage (Standard: 0)

### 5.2 Mannschaften

Je Mannschaft werden folgende Informationen erfasst:
- Vereinsname
- Mannschaftsname
- Bundesland (relevant für Spielplan-Generierung bei der Bundesliga)
- Ansprechpartner/Trainer (Name, Telefon, E-Mail)

**Wichtig:** Ein Verein kann mehrere Mannschaften haben. Im Normalfall ist es aber eine 1:1-Beziehung.

### 5.3 Spieler

Je Spieler werden folgende Informationen erfasst:
- Name, Vorname
- Trikotnummer (normalerweise einstellig)
- Klassifizierung: B1 / B2 / B3 / sehend / AB (Ärztliches Attest)

**Hinweise:**
- Spieler werden turnierbezogen erfasst – dieselbe Person kann bei verschiedenen Turnieren für verschiedene Mannschaften spielen
- Spielerdaten können aus einem vorherigen Turnier übernommen und angepasst werden
- Änderungen sind bis zum Turnierstart möglich (Nachmeldungen, Ausfälle)
- Nach Turnierstart sind nur noch Namensänderungen möglich
- Die Klassifizierung AB bedeutet, dass ein ärztliches Attest vorliegt. Ohne Attest gilt ein Spieler als „sehend", auch wenn er blind ist. Die Entscheidung obliegt der Turnierleitung.

### 5.4 Schiedsrichter

Je Schiedsrichter werden folgende Informationen erfasst:
- Name, Vorname
- Kontakt (optional)
- Lizenz vorhanden (ja/nein) – relevant für die Bundesliga
- Zugehörigkeit zu einer Mannschaft (wichtig für Spielplan-Generierung)
- Ist Turnierleitung (ja/nein) – genau eine Person je Turnier

**Wichtige Regel:** Ein Schiedsrichter darf nicht das Spiel seiner eigenen Mannschaft leiten. Die Software warnt bei einem solchen Konflikt, blockiert aber nicht. Die Turnierleitung kann Ausnahmen genehmigen.

---

## 6. Spielregeln und deren Umsetzung

### 6.1 Spielzeit

- Die Spielzeit ist reine Spielzeit – der Timer wird bei jeder Unterbrechung angehalten
- Nach Ablauf der definierten Zeit gibt es ein Signal – das Spiel läuft aber weiter bis zum Abpfiff des Schiedsrichters (Überhang)
- Die zweite Halbzeit startet immer bei 0:00 – unabhängig vom Überhang der ersten Halbzeit
- Gleiches gilt für die Verlängerung

### 6.2 8-Sekunden-Regel

- Sobald eine Mannschaft den Ball unter Kontrolle hat, muss er innerhalb von 8 Sekunden geworfen werden
- Die Software zeigt einen Timer an und warnt die Spielleitung bei Ablauf
- Die Entscheidung über ein Foul trifft der Schiedsrichter

### 6.3 3-Wurf-Regel

- Ein Spieler darf maximal 3 Würfe hintereinander ausführen
- Der Zähler gilt auch über Halbzeitpausen und Strafwurfsituationen hinweg
- Der Zähler wird zurückgesetzt, wenn ein anderer Spieler der Mannschaft wirft
- Die Software warnt bei dem 3. Wurf und signalisiert beim 4. Wurf ein Foul
- Die Entscheidung trifft der Schiedsrichter

### 6.4 Fouls und Penalties

**Foul:**
- Wird vom Schiedsrichter signalisiert
- Der verursachende Spieler muss das Feld für einen Spielzug verlassen
- Foulzähler der Mannschaft wird um 1 erhöht
- Bei jedem 3. Foul gibt es einen Penalty, der Zähler wird auf 0 zurückgesetzt

**Penalty:**
- Pro Mannschaft bleibt nur 1 Spieler auf dem Feld
- Kein Spielerwechsel und kein Timeout während eines Penalties möglich
- Penalty-Zähler der Mannschaft wird um 1 erhöht (nur zur Dokumentation)

**Team-Foul:**
- Führt direkt zu einem Penalty (z.B. Hineinrufen von der Bank)
- Beeinflusst den normalen Foulzähler nicht

### 6.5 Timeout

- Jede Mannschaft hat pro Halbzeit 1 Timeout (konfigurierbar)
- Dauer: 30 Sekunden
- Darf nur von der Mannschaft genommen werden, die den Ball hat
- Die andere Mannschaft darf die Auszeit gleichzeitig nutzen
- Kein Timeout mehr verfügbar → Team-Penalty

### 6.6 Auswechslungen

- Maximal 3 Auswechslungen pro Halbzeit (konfigurierbar)
- Auswechslungen in der Halbzeitpause sind unbegrenzt und zählen nicht zum Kontingent
- Wechsel darf nur bei eigenem Ballbesitz, nach Strafwurf oder nach Tor beantragt werden
- Nicht möglich während eines Penalties

### 6.7 Verlängerung (nur bei Finalspielen)

- Bei Unentschieden nach regulärer Spielzeit: 2 x 2 Minuten Verlängerung
- Silbernes Tor: Fällt in der 1. Halbzeit der Verlängerung ein Tor, endet das Spiel
- Bei weiterem Unentschieden: Freiwürfe (vergleichbar mit Elfmeterschießen im Fußball)

### 6.8 Freiwürfe

- Jede Mannschaft nominiert 3 Spieler
- Abwechselnd je 1 Wurf pro Mannschaft
- Bei weiterem Unentschieden: je 1 weiterer Wurf bis zur Entscheidung
- Erzielte Tore werden dem werfenden Spieler gutgeschrieben

### 6.9 Tordifferenz-Abbruch

- Beträgt die Tordifferenz 10 Tore, kann der Schiedsrichter das Spiel beenden
- Die Software zeigt einen Hinweis – die Entscheidung trifft der Schiedsrichter

---

## 7. Spielprotokoll

### 7.1 Grundprinzip

Jedes Ereignis während eines Spiels wird als einzelner Eintrag protokolliert. Korrekturen werden als neue Einträge erfasst – bestehende Einträge werden nie gelöscht. Das gewährleistet eine lückenlose Nachvollziehbarkeit.

### 7.2 Protokollierte Ereignisse

| Ereignis | Beschreibung |
|---|---|
| Spielzeit Start | Spielzeit wird gestartet |
| Spielzeit Stop | Spielzeit wird angehalten |
| Wurf | Spieler wirft den Ball (mit Spielernummer) |
| Tor | Tor wurde erzielt (mit Torschütze) |
| Eigentor | Ball geht ins eigene Tor |
| Foul | Schiedsrichter pfeift Foul |
| Penalty | Schiedsrichter signalisiert Penalty |
| Timeout | Mannschaft nimmt Timeout |
| Tech. Timeout | Schiedsrichter ordnet Timeout an |
| Wechsel | Spieler wird aus- und eingewechselt |
| Halbzeit/Pause | Erste Halbzeit beendet |
| Verlängerung | Verlängerung beginnt |
| Freiwurf | Freiwurf wird ausgeführt |
| Spielende | Spiel offiziell beendet |
| Abschluss | Protokoll abgeschlossen, keine Änderungen mehr möglich |

### 7.3 Anzeige während des Spiels

Die Spielleitung sieht auf ihrem Bildschirm:
- Aktueller Spielstand
- Laufende Spielzeit
- Aktuelle Spieler auf dem Feld (max. 3 je Mannschaft)
- Wurfzähler je Spieler
- Foulzähler je Mannschaft (0-2, bei 3 → Penalty)
- Verfügbare Timeouts je Mannschaft
- 8-Sekunden-Timer
- Hinweise bei Regelauffälligkeiten

### 7.4 Abschluss eines Spiels

1. Schiedsrichter pfeift ab → Spielleitung erfasst „Spielende"
2. Nachträgliche Korrekturen noch möglich (durch Spielleitung)
3. Protokollant „unterschreibt" digital (Name + Bestätigung)
4. „Abschluss" wird erfasst → keine Änderungen mehr durch Spielleitung
5. Turnierleitung bestätigt das Protokoll
6. Ergebnisse fließen in die Tabelle ein

---

## 8. Spielplan-Generierung

### 8.1 Automatischer Vorschlag

Die Software generiert automatisch einen Spielplan. Dieser kann von der Turnierleitung manuell angepasst werden (Reihenfolge, Zeiten, Schiedsrichter-Zuweisung).

### 8.2 Regeln für die Spielplan-Generierung

**Harte Regeln (werden immer eingehalten):**
- Eine Mannschaft kann nicht gleichzeitig auf zwei Feldern spielen
- Eine Mannschaft darf keine zwei Spiele hintereinander haben (gilt feldübergreifend)
- Ein Schiedsrichter darf nicht das Spiel seiner eigenen Mannschaft leiten

**Bevorzugte Reihenfolge (Bundesliga):**
1. Mannschaften desselben Vereins spielen zuerst gegeneinander
2. Dann Mannschaften desselben Bundeslandes
3. Dann alle anderen

### 8.3 Mehrere Spielfelder

- Spiele auf verschiedenen Feldern sollen möglichst parallel stattfinden
- Bei Verzögerungen auf einem Feld wird die Pause auf diesem Feld angepasst
- Konfigurierbare Toleranz für den Versatz zwischen den Feldern

### 8.4 Turnierpausen

- Optionale Mittagspausen können geplant werden
- Alle nachfolgenden Spielzeiten verschieben sich automatisch
- Pausen können auch genutzt werden, um Felder wieder zu synchronisieren

### 8.5 Zeitplanung

- Alle Spielzeiten basieren auf der Startzeit des Turniers
- Es gibt eine geplante Zeit (aus der Planung) und eine voraussichtliche Zeit (aktuell)
- Mannschaften sehen immer die voraussichtliche Startzeit ihres nächsten Spiels

---

## 9. Ergebnisse und Tabellen

### 9.1 Tabellenberechnung

Die Tabelle wird nach folgenden Kriterien sortiert (bei Gleichstand in dieser Reihenfolge):
1. Punkte
2. Tordifferenz (erzielte minus erhaltene Tore)
3. Anzahl erzielter Tore
4. Direkter Vergleich
5. Freiwürfe

### 9.2 Sonderfälle

**Nichterscheinen einer Mannschaft:**
- Niederlage mit 0:5 für die nicht erschienene Mannschaft
- Zusätzlich 2 Punkte Abzug

**Vorzeitiger Abbruch:**
- 5:0 für die verbleibende Mannschaft

**Ausscheiden einer Mannschaft:**
- Alle bisherigen Ergebnisse dieser Mannschaft werden annulliert

### 9.3 Torschützenkönig

- Wird über alle Spiele eines Turniers berechnet
- Eigentore zählen nicht
- Freiwurf-Tore zählen nicht

### 9.4 Statistiken

Nach Abschluss eines Spiels werden automatisch berechnet:
- Aktueller Tabellenstand
- Torschützenliste
- Anzahl Fouls und Penalties je Mannschaft

---

## 10. Benutzer und Berechtigungen

### 10.1 Betriebsmodi

Die Software kann in drei Modi betrieben werden:

**Standalone (ein Rechner):**
- Kein Internet, kein Netzwerk
- Keine Benutzeranmeldung nötig
- Für kleine Freizeitturniere

**Lokales Netzwerk:**
- Mehrere Geräte vor Ort (z.B. Turnierleitung + Spielleitung)
- Kein Internet nötig
- Zugang über Turnier-Codes (ein Code für Turnierleitung, einer für Spielleitung)

**Zentrale Plattform (Internet):**
- Vollständige Benutzerverwaltung
- Synchronisation zwischen lokalen Geräten und zentralem Server
- Live-Ergebnisse im Internet

### 10.2 Rollen

| Rolle | Beschreibung |
|---|---|
| Admin | Vollzugriff auf alles |
| Manager | Kann Benutzer anlegen und Turniere verwalten |
| Turnierleitung | Verwaltet ein bestimmtes Turnier |
| Spielleitung | Protokolliert Spiele eines Turniers |

Rollen werden pro Turnier vergeben – dieselbe Person kann bei verschiedenen Turnieren verschiedene Rollen haben.

### 10.3 Turnier-Status

| Status | Beschreibung | Öffentlich sichtbar |
|---|---|---|
| Entwurf | In Planung | Nein |
| Aktiv | Läuft oder abgeschlossen | Ja |
| Archiviert | Nur Ergebnisse verfügbar | Ja (nur Ergebnisse) |

---

## 11. Datenschutz

- Spielernamen können bei der Veröffentlichung anonymisiert werden (z.B. „Spieler 5" statt echter Name)
- Standard: Anonymisierung aktiv (sicherer Ausgangspunkt)
- Für die Bundesliga: Klarnamen können aktiviert werden
- Intern wird immer mit echten Namen gearbeitet

---

## 12. Offene Fragen für den Fachexperten

Folgende Punkte wurden noch nicht abschließend geklärt und bedürfen einer fachlichen Einschätzung:

1. **3-Wurf-Regel über Halbzeiten hinweg:** Hat ein Spieler in der ersten Halbzeit 2 Würfe hintereinander gemacht – darf er zu Beginn der zweiten Halbzeit nur noch einen weiteren Wurf machen? Oder wird der Zähler zur Halbzeit zurückgesetzt?

2. **Eigentor:** Wenn ein Spieler den Ball ins eigene Tor befördert – zählt das als Tor für die gegnerische Mannschaft? Wem wird das Tor in der Statistik zugerechnet?

3. **Foulzähler bei Halbzeitwechsel:** Wird der Foulzähler zur Halbzeit zurückgesetzt, oder gilt er für das gesamte Spiel?

4. **Schiedsrichter als Turnierleitung:** Wie wird es protokolliert, wenn die Turnierleitung selbst als Schiedsrichter fungiert?

5. **Protest im Protokoll:** Muss ein Protest explizit im Spielprotokoll vermerkt werden? Wenn ja, welche Informationen sind erforderlich?

6. **Nachmeldung von Spielern am Spieltag:** Bis wann genau können Spieler nach- oder abgemeldet werden? Ist das auch nach dem ersten Spiel einer Mannschaft noch möglich?

7. **Klassifizierung AB:** Kann die Klassifizierung eines Spielers während eines laufenden Turniers noch geändert werden (z.B. wenn ein Augenarzt vor Ort die Bescheinigung ausstellt)?

8. **Tordifferenz-Abbruch:** Gilt die 10-Tore-Regel bei allen Turnierarten, oder nur bei bestimmten?

9. **Silbernes Tor:** Gilt das silberne Tor nur in der Verlängerung von Finalspielen, oder auch in der regulären Verlängerung von Platzierungsspielen?

10. **Freiwurf-Tore in der Statistik:** Werden Tore aus Freiwürfen in der Torschützenliste geführt?

---

*Dieses Dokument wurde auf Basis der IBSA Torball Regeln (Stand Januar 2014), der Nationalen Ligaordnung des DBS (Stand August 2019) und Gesprächen mit dem Projektinhaber erstellt.*

*Version 0.1 – Entwurf zur fachlichen Prüfung*

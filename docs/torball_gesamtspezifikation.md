# Torball-Turniersoftware
## Gesamtspezifikation (Fachlich + Technisch)

**Version:** 1.5
**Datum:** 10.08.2026
**Status:** Konsolidierter Entwurf – fachlich vollständig geklärt

### Dokumentenhistorie (Quellen dieser Konsolidierung)

| Quelle | Version/Datum | Inhalt |
|---|---|---|
| Softwareprojekt Torball – Spezifikation | 0.1–0.4, Juni 2026 | Ursprünglicher Entwurf, erste Gemini-Rückmeldungen |
| Fachliche Spezifikation | 0.1, Juli 2026 | Strukturierte fachliche Spezifikation, 10 offene Fragen |
| Spezifikationsergänzungen | 20.07.2026 | Klärung der 10 offenen Punkte + 9 neue Anforderungen (Teil B) |
| Technische Spezifikation | 0.1, Juli 2026 | Technologie-Stack, Infrastruktur, Datenmodell v0.1 |
| Klärungsrunde Datenmodell | 09.08.2026 | 5 vertiefte Modellierungsentscheidungen (Konfiguration, Events, Verein/Team, Token) |
| Klärungsrunde offene Fragen | 10.08.2026 | Beantwortung der verbliebenen 8 offenen fachlichen Fragen (Abschnitt 27); Protest als neues Ereignis (7.6, 22.2/22.3) |
| Erkenntnisse aus der Umsetzung (Spielplan) | 10.08.2026 | Abschnitt 8 präzisiert: Turniermodus-Vereinfachung auf Turnier-Ebene, Grenzen der Back-to-Back-Vermeidung bei mehreren Feldern, Ablehnung überschneidender manueller Zeitänderungen. Details siehe `docs/Protokolle/2026-08-10-spielplan-algorithmus.md`. |
| Erkenntnisse aus der Umsetzung (Anmeldung) | 10.08.2026 | Abschnitt 25.4 präzisiert: Umsetzungsstand der Selbst-Service-E-Mail-Änderung (aktuell ohne Bestätigungslink/Benachrichtigung) dokumentiert. Details siehe `docs/Protokolle/2026-08-10-anmeldung-benutzerverwaltung.md`. |
| Erkenntnisse aus der Umsetzung (UI-Verfeinerung) | 10.08.2026 | Abschnitt 24.3 präzisiert: Zwei-Ebenen-Modell für Anzeige-Voreinstellungen (kontogebunden + geräteslokal), neue Zeilenabstand-Einstellung. Abschnitt 5.1 ergänzt: Geo-Referenz wird über Verlinkung zu Google Maps/OpenStreetMap erfasst, nicht über eine eingebettete Karte. Details siehe `docs/Protokolle/2026-08-10-ui-verfeinerung-stammdaten.md`. |
| Erkenntnisse aus der Umsetzung (öffentliche Turnierseite) | 10.08.2026 | Abschnitt 13 umgesetzt und präzisiert: Turnier-ID selbst als Adresse (kein separater Token wie bei Abschnitt 14, da reiner Lesezugriff unkritisch ist); teilnehmende Mannschaften/Spielfelder werden unabhängig von den vier Sichtbarkeits-Schaltern immer mitgeliefert, da Spielplan/Ergebnisse ohne sie nicht lesbar wären. Details siehe `docs/Protokolle/2026-08-10-oeffentliche-turnierseite.md`. |

Dieses Dokument ersetzt die einzelnen Vorgängerdokumente inhaltlich (führt sie zusammen). Sie bleiben als Historie im Projekt erhalten.

---

## Inhaltsverzeichnis

**Teil I – Fachliche Spezifikation**
1. Einleitung
2. Was ist Torball?
3. Ziel der Software
4. Turnierarten und Modi
5. Turniervorbereitung
6. Spielregeln und deren Umsetzung
7. Spielprotokoll (fachlich)
8. Spielplan-Generierung
9. Ergebnisse und Tabellen
10. Benutzer und Berechtigungen (fachlich)
11. Datenschutz
12. Mehrsprachigkeit
13. Öffentliche Turnierseite
14. Ergebniserfassung ohne digitale Protokollierung
15. Stammdaten (Vereine und Teams)

**Teil II – Technische Spezifikation**
16. Systemübersicht
17. Technologie-Stack
18. Infrastruktur
19. Betriebsmodi (technisch)
20. Datenmodell
21. Berechtigungskonzept (technisch)
22. Spielprotokoll und Event-Sourcing
23. Synchronisation
24. Barrierefreiheit und UI
25. Sicherheit
26. Migration und Deployment

**Teil III – Offen**
27. Offene Fragen für den Fachexperten
28. Offene technische Punkte
29. Bewusst zurückgestellte Punkte

---

# Teil I – Fachliche Spezifikation

## 1. Einleitung

Dieses Dokument beschreibt die fachlichen und technischen Anforderungen an eine Software zur Planung, Durchführung und Auswertung von Torball-Turnieren. Der Hauptfokus liegt auf den Spieltagen der Deutschen Torball Bundesliga, es sollen aber auch „einfache" Freizeitturniere abbildbar sein.

**Wichtiger Grundsatz:** Die Software unterstützt und informiert – sie entscheidet nie selbst. Jede Entscheidung (Foul, Penalty, Timeout, Ausnahmegenehmigung) obliegt dem Schiedsrichter bzw. der Turnierleitung. Die Software zeigt Hinweise, jedes protokollierte Ereignis wird manuell erfasst.

## 2. Was ist Torball?

Torball ist eine Mannschaftssportart für blinde und sehbehinderte Menschen. Jede Mannschaft besteht aus drei Spielern auf dem Feld, mit bis zu drei Ersatzspielern auf der Bank.

**Das Spielfeld:**
- 16 x 7 Meter groß
- An jedem Ende ein Tor über die gesamte Breite (7 m), 1,30 m hoch
- Drei Leinen quer über das Feld in der Mitte, 40 cm über dem Boden (Mittellinie plus zwei weitere im Abstand von je 2 m); dürfen nicht berührt oder überspielt werden
- Orientierungsmatten (1 x 2 m, mittlere leicht vorgezogen) vor jedem Tor

**Grundprinzip:**
- Der Ball muss unter den Leinen hindurch geworfen werden
- Ziel ist es, den Ball in das gegnerische Tor zu werfen
- Alle Feldspieler tragen Augenbinden

**Nicht zu verwechseln mit:** Goalball – ähnlich, aber in wesentlichen Punkten verschieden.

## 3. Ziel der Software

**Turnierplanung:** Turniere planen und vorbereiten, Spielpläne automatisch generieren, Mannschaften und Spieler erfassen, Spielorte und Stammdaten wiederverwenden.

**Turnierdurchführung:** Spielprotokolle live erfassen (oder alternativ nur Endergebnisse bei Papier-Protokollierung), Spielzeiten messen und anzeigen, Regelprüfungen unterstützen.

**Auswertung:** Ergebnisse und Tabellen berechnen, Torschützenlisten führen, historische Turnierdaten abrufen.

**Live-Ergebnisse:** Aktuelle Spielstände und Tabellen im Internet veröffentlichen, auf Smartphones abrufbar, öffentliche Turnierseite.

**Datenhaltung:** Sowohl komplett lokal (offline, Standalone oder LAN) als auch zentral in der Cloud, mit bedarfsweiser Synchronisation. Lokal ist primär das aktuelle Turnier relevant (inkl. eines referenzierten vorherigen Spieltags).

**Barrierefreiheit:** Da Torball vor allem von sehbehinderten und blinden Menschen gespielt und organisiert wird, ist die Software durchgängig für Screenreader (primär JAWS, außerdem NVDA, VoiceOver, TalkBack) nutzbar zu gestalten (siehe Abschnitt 24).

**OpenSource:** Der Code wird selbst gehostet entwickelt (Gitea auf Proxmox) und soll perspektivisch offen verfügbar sein.

## 4. Turnierarten und Modi

| Modus | Beschreibung |
|---|---|
| Einfaches Turnier | 1 Spieltag, eine Runde, Jeder gegen Jeden |
| Einfaches Turnier mit Endspielen | Wie oben, zusätzlich Finale und ggf. Spiel um Platz 3 |
| Doppeltes Turnier | 1 Spieltag, zwei Runden, Jeder gegen Jeden |
| Doppeltes Turnier mit Endspielen | Wie oben, zusätzlich Finale |
| Bundesliga (DE) | 2 Spieltage, je eine Runde, Jeder gegen Jeden |
| Bundesliga (DE) alternativ | 2 Spieltage, je zwei Runden, Jeder gegen Jeden |
| Vor- und Hauptrunde | 1 Spieltag, Vorgruppen (ggf. unterschiedlich groß), dann Haupt- und Trostrunde |

Modi sollen möglichst frei über eine Admin-Funktion pflegbar sein, nicht fest im Code verankert. Weitere, komplexere Varianten (z. B. zusätzliche Finalspiele, Platzierungsspiele gleich platzierter Gruppenteams) sind denkbar, aber nicht als Vorlage für die erste Version erforderlich.

**Wettbewerb über mehrere Spieltage:** Bei der Bundesliga ergeben Hin- und Rückrunde zusammen eine Gesamttabelle (`Wettbewerb`, siehe Abschnitt 20). Jeder Spieltag ist zusätzlich einzeln auswertbar. Die stabile Zuordnung einer Mannschaft über beide Spieltage hinweg erfolgt über die Team-Stammdaten (Abschnitt 15).

## 5. Turniervorbereitung

### 5.1 Turnierdaten

**Allgemein:**
- Name, Datum, Startzeit (Ende optional, ergibt sich aus dem Spielplan)
- Spielort (Name, Adresse, optional Geo-Referenz) – wiederverwendbar über mehrere Turniere
- Anzahl und Name der Spielfelder (z. B. Halle A, Halle B)
- Turnierleitung und Ansprechpartner (Name, Kontakt)
- Zusatzinformationen (Anreise, Hotel etc.) – siehe auch Dokumenten-Anhänge, Abschnitt 5.1 unten

**Erkenntnisse aus der Umsetzung (Geo-Referenz):** Keine eingebettete Karte, sondern zwei Links neben dem Geo-Feld zu Google Maps/OpenStreetMap (vorausgefüllt mit Spielort-Name/-Adresse als Suche). Enthält das Geo-Feld bereits ein „Breite, Länge"-Koordinatenpaar, springen beide Dienste direkt an diese Position. Bewusste Einschränkung: Eine auf der fremden Kartenseite markierte Position kann nicht automatisch zurück ins Formular übernommen werden (kein Datenkanal zwischen fremder Seite und eigener App ohne eingebettete Karte) – Koordinaten müssen dort abgelesen und hier von Hand eingetragen werden.

**Protokollierungsart** (neu, siehe Abschnitt 14):
- `digital`: vollständige Ereignisprotokollierung
- `manuell`: Papierprotokoll, nur Endergebnisse werden per Token erfasst
- Ein Turnier ist immer eindeutig eines von beiden, keine Mischform über Spielfelder hinweg

**Spielregeln (konfigurierbar, Vorgabewerte aus der Systemkonfiguration, siehe Abschnitt 20.1):**
- Turniermodus, Spielzeit je Halbzeit (Standard 5 Min.), Anzahl Halbzeiten (Standard 2), Pause (Standard 2 Min.), Seitenwechsel ja/nein
  - **Klarstellung aus der Umsetzung:** Auf Ebene eines einzelnen Turnier-Dokuments (= ein Spieltag) reduziert sich der Turniermodus für die Spielplan-Erzeugung auf zwei Grundfälle: „Jeder gegen Jeden" (einfach) oder „Jeder zweimal gegen Jeden" (doppelt, v. a. für kleine Ligen mit 4–5 Mannschaften). Der Modus wird bei der Turnier-Anlage festgelegt und ist auf der Turnier-Übersicht jederzeit einsehbar und änderbar. Mehrtägige Wettbewerbsformen (z. B. Hin-/Rückrunde) ergeben sich aus der Verknüpfung mehrerer Turnier-Dokumente über den `Wettbewerb` (Abschnitt 20.3), nicht aus einem komplexeren Modus-Wert je Turnier.
- Timeouts je Halbzeit/Mannschaft (Standard 1), Timeout-Dauer (30 Sek.)
- Maximale Auswechslungen je Halbzeit (Standard 3), unbegrenzt in der Halbzeitpause
- Tordifferenz-Abbruch (Standard aktiv, 10 Tore) – Schiedsrichter entscheidet, Software zeigt nur Hinweis
- Verlängerung bei Unentschieden (Standard aktiv, nur bei Finalspielen), silbernes Tor (Standard aktiv)
- Maximale Anzahl sehender Spieler (Standard 1, Bundesliga-Regel)
- Einstellige Trikotnummern (Standard ja)
- Punktevergabe: Sieg (Standard 2), Unentschieden (Standard 1), Niederlage (Standard 0)
- Tabellenreihenfolge bei Gleichstand (Reihenfolge konfigurierbar, Standard siehe Abschnitt 9)

**Dokumenten-Anhänge:** Ein Turnier kann beliebige Dateien (PDF u. a.) als Anhang führen – Anfahrtsbeschreibung, Hotelvorschläge, Ausschreibung. Je Anhang: Titel, optionale Beschreibung, Datei. Abrufbar über die öffentliche Turnierseite (Abschnitt 13). Ersetzt den Bedarf an mehrsprachigen Freitextfeldern.

**Prüfregeln:** Für Turniere mit festem Regelwerk (z. B. Bundesliga) können Prüfregeln hinterlegt und während des Turniers berücksichtigt werden (max. Mannschaften/Spieler, max. sehende Spieler, Spielzeit u. a.).

### 5.2 Mannschaften

Je Mannschaft: Vereinsname, Mannschaftsname, Bundesland (relevant für die Spielplan-Generierung bei der Bundesliga), Ansprechpartner/Trainer. Optional Referenz auf Stammdaten-Team (Abschnitt 15) – die Daten werden dabei kopiert, nicht live verknüpft.

**Bundesland-Regel:** Mannschaften aus demselben Bundesland müssen so früh wie möglich gegeneinander spielen. Priorität: 1. Vermeidung von Direkt-Folgespielen (Back-to-Back) hat Vorrang, 2. Bundesland-Derbys so früh wie mathematisch danach möglich. Da die Turnierleitung den Spielplan nachträglich ändern kann, ist das als Vorschlag zu verstehen.

### 5.3 Spieler

Je Spieler: Name, Vorname, Trikotnummer (normalerweise einstellig), Klassifizierung (B1/B2/B3/sehend/AB). Spieler werden turnierbezogen erfasst; dieselbe Person kann bei verschiedenen Turnieren für verschiedene Mannschaften spielen. Daten können aus einem vorherigen Turnier übernommen und angepasst werden.

**Änderbarkeit:** Nachmeldungen und Kaderänderungen sind bis zum jeweils **ersten Spiel der betreffenden Mannschaft** möglich – danach nicht mehr, auch wenn das Turnier insgesamt noch läuft. Danach sind nur noch Namensänderungen möglich. Die Klassifizierung „AB" bedeutet ärztliches Attest vorhanden; ohne Attest gilt ein Spieler als „sehend", auch wenn er blind ist. Eine Änderung der Klassifizierung ist nach aktuellem Stand ebenfalls nur bis zum ersten Spiel der Mannschaft möglich (Zeitpunkt noch nicht abschließend bestätigt) und darf ausschließlich durch die Turnierleitung vorgenommen werden – nicht durch Mannschaft oder Trainer selbst.

### 5.4 Schiedsrichter

Je Schiedsrichter: Name, Vorname, Kontakt (optional), Lizenz vorhanden (ja/nein, relevant für Bundesliga), Zugehörigkeit zu einer Mannschaft, Ist-Turnierleitung-Flag (genau eine Person je Turnier).

**Interessenkonflikt:** Ein Schiedsrichter darf grundsätzlich nicht das Spiel seiner eigenen Mannschaft leiten. Die Software **warnt**, blockiert aber nicht – die Turnierleitung kann Ausnahmen genehmigen; die Entscheidung wird dokumentiert (Audit-Log, Abschnitt 20.13).

**Zuordnung als bewusster Schritt (umgesetzt):** Die Schiedsrichter-Zuordnung geschieht **nicht automatisch** bei der Spielplan-Erzeugung, sondern über einen eigenen Button („Schiedsrichter automatisch zuordnen") und ist danach je Spiel frei anpassbar. Der Vorschlag gewichtet zwei Regeln: **(1, höchste Priorität)** ein Schiedsrichter pfeift nicht das Spiel seiner eigenen Mannschaft – ein solcher Fall wird gar nicht vorgeschlagen; **(2, nachrangig)** er soll möglichst nicht pfeifen, während eine seiner Mannschaften gleichzeitig (in einem parallelen Spiel desselben Slots) spielt. Beide Konflikte werden im Spielplan zusätzlich als Hinweis angezeigt, wenn sie – etwa durch manuelle Anpassung – bestehen. (Der Sonderfall „ein Schiedsrichter für einen ganzen Verein mit mehreren Mannschaften" ist noch offen, siehe Abschnitt 20.9-Hinweis.)

**Turnierleitung als Schiedsrichter:** Es ist der Regelfall (nicht die Ausnahme), dass eine der Schiedsrichter-Personen zugleich die Turnierleitung innehat – ein Pflichtfeld oder ein besonderer Protokoll-Hinweis ist dafür nicht erforderlich.

## 6. Spielregeln und deren Umsetzung

### 6.1 Spielzeit

Reine Spielzeit – Timer stoppt bei jeder vom Schiedsrichter signalisierten Unterbrechung. Ein im Aus befindlicher Ball zählt nicht als Unterbrechung, solange nicht abgepfiffen wird. Nach Ablauf der definierten Zeit gibt es ein Signal, das Spiel läuft aber bis zum Abpfiff weiter (Überhang); die Software zeigt den Ablauf (ggf. weiterzählend ins Minus) an und informiert, greift aber nicht ein. Jeder Abschnitt (Halbzeit, Verlängerung) startet bei 0:00, unabhängig vom Überhang des vorherigen Abschnitts.

### 6.2 8-Sekunden-Regel (Zwei-Timer-Modell)

Es gibt zwei getrennte Fristen:

- **Timer A** (generisch, keiner Mannschaft zugeordnet): Startet automatisch nach jedem Wurf. Die Mannschaft, in deren Hälfte der Ball landet, hat acht Sekunden, um ihn unter Kontrolle zu bringen oder ins Aus zu spielen. Hintergrund: Nach einem Wurf kann der Ball auch zur werfenden Mannschaft zurückrollen; das System kennt die Ballposition nicht – erst der Tastendruck „Kontrolle" (Ereignis K) klärt, welche Mannschaft übernommen hat.
- **Timer B** (mannschaftsbezogen): Startet mit dem Ereignis „Kontrolle". Ab diesem Moment hat die Mannschaft acht Sekunden Zeit für den Wurf.

Ist der Ball sofort unter Kontrolle, entfällt Timer A; der Tastendruck „Kontrolle" startet dann nur Timer B. Welche Mannschaft bei Fristablauf ein Foul erhält, ergibt sich aus dem Tastendruck des Protokollanten, nicht aus dem Timer-Zustand selbst. Die Entscheidung über ein Foul trifft immer der Schiedsrichter.

### 6.3 3-Wurf-Regel

Ein Spieler darf maximal drei Würfe hintereinander ausführen. Der Zähler gilt **pausenübergreifend** (Default: ja, als Turnier-Konfigurationsoption vorgesehen) und wird ausschließlich zurückgesetzt, wenn ein anderer Spieler derselben Mannschaft wirft. Beispiel: Wirft Spieler A in Halbzeit 1 zweimal in Folge, darf er zu Beginn von Halbzeit 2 nur noch einmal werfen. Die Software warnt beim dritten Wurf und signalisiert beim vierten einen möglichen Foul-Hinweis; die Entscheidung trifft der Schiedsrichter. Eine automatische Protokollierung als Foul erfolgt nicht – das muss manuell erfasst werden.

### 6.4 Fouls und Penalties

**Foul:** Wird vom Schiedsrichter signalisiert. Der verursachende Spieler verlässt das Feld **nur für den unmittelbar folgenden Freiwurf der gegnerischen Mannschaft** und kehrt danach sofort zurück – kein Wechsel im Sinne der Regeln, kein Verbrauch des Wechselkontingents (eigener Zustand „kurzzeitig ausgesetzt", ergibt sich aus der Event-Auswertung, siehe Abschnitt 22.3). Foulzähler der Mannschaft +1. Bei jedem dritten Foul: Penalty, Zähler wird zurückgesetzt (erst wenn das Penalty protokolliert ist). Der Foulzähler gilt für das **gesamte Spiel** und wird zur Halbzeit **nicht** zurückgesetzt (analog zur pausenübergreifenden 3-Wurf-Regel, Abschnitt 6.3).

**Penalty:** Pro Mannschaft bleibt nur ein Spieler auf dem Feld. Kein Wechsel, kein Timeout während eines Penalties. Penalty-Zähler +1 (rein dokumentarisch).

**Team-Foul:** Führt direkt zu einem Penalty (z. B. Hineinrufen von der Bank), beeinflusst den normalen Foulzähler nicht.

### 6.5 Timeout

Pro Mannschaft und Halbzeit ein Timeout (konfigurierbar), Dauer 30 Sekunden. Nur die ballbesitzende Mannschaft darf es nehmen; die Gegenseite darf die Auszeit gleichzeitig nutzen. Kein Timeout mehr verfügbar → Team-Penalty.

### 6.6 Auswechslungen

Maximal drei Auswechslungen pro Halbzeit (konfigurierbar); in der Halbzeitpause unbegrenzt und ohne Anrechnung. Wechsel nur bei eigenem Ballbesitz, nach Strafwurf oder nach Tor; nicht während eines Penalties möglich.

### 6.7 Verlängerung (nur bei Finalspielen)

Bei Unentschieden nach regulärer Spielzeit: 2 x 2 Minuten Verlängerung. Silbernes Tor: Fällt in der ersten Verlängerungshälfte ein Tor, endet das Spiel. Bei weiterem Unentschieden: Freiwürfe. Das silberne Tor ist als **Turnier-Konfigurationsoption** ausgelegt (`silbernes_tor`, Abschnitt 20.5) und gilt einheitlich für jede Verlängerung dieses Turniers – die Software unterscheidet dabei nicht zwischen Finale und anderen Spielen mit Verlängerung.

### 6.8 Freiwürfe

Jede Mannschaft nominiert drei Spieler, abwechselnd je ein Wurf. Bei weiterem Unentschieden: je ein weiterer Wurf bis zur Entscheidung. Tore werden dem werfenden Spieler gutgeschrieben und zählen **normal** in der Torschützenliste des Turniers, wie auch Tore aus Penaltys – ohne besondere Kennzeichnung (siehe Abschnitt 9.3).

### 6.9 Tordifferenz-Abbruch

Bei zehn Toren Differenz (konfigurierbar) kann der Schiedsrichter das Spiel beenden; die Software zeigt einen Hinweis, entscheidet aber nicht. Die Regel gilt **einheitlich bei allen Turnierarten**, nicht nur bei bestimmten Modi.

### 6.10 Eigentor

Wird der Ball ins eigene Tor befördert, wird das Tor **der gegnerischen Mannschaft gutgeschrieben**. Es wird keinem Spieler als Torschütze zugeordnet.

## 7. Spielprotokoll (fachlich)

### 7.1 Grundprinzip

Jedes Ereignis wird als einzelner, unveränderlicher Eintrag protokolliert. Korrekturen werden als neue Einträge mit Referenz auf das ursprüngliche Ereignis erfasst – bestehende Einträge werden nie gelöscht. Das gewährleistet lückenlose Nachvollziehbarkeit (wichtig auch, um systematische Erfassungsfehler zu erkennen, nicht um Schuldzuweisungen zu ermöglichen).

### 7.2 Protokollierte Ereignisse (fachliche Sicht)

| Ereignis | Beschreibung |
|---|---|
| Spielzeit Start/Stop | Spieluhr starten/anhalten |
| Wurf | Spieler wirft den Ball (mit Spielernummer) |
| Kontrolle | Mannschaft hat den Ball unter Kontrolle (steuert Zwei-Timer-Modell, Abschnitt 6.2) |
| Tor / Eigentor | Tor erzielt, ggf. Eigentor (Gutschrift an Gegner) |
| Foul | Schiedsrichter pfeift Foul |
| Penalty / Team-Penalty | Schiedsrichter signalisiert Penalty |
| Timeout / Tech. Timeout | Mannschaft bzw. Schiedsrichter nimmt/ordnet Auszeit an |
| Wechsel | Spieler wird aus- und eingewechselt |
| Halbzeit/Pause, Verlängerung, Freiwurf | Spielabschnitts-Ereignisse |
| Protokollantenwechsel | Ablösung eines Protokollanten während des Spiels (Ausnahmefall, z. B. medizinisch) |
| Protest | Vermerk eines Protests auf dem Spielbericht, auch nachträglich erfassbar |
| Spielende | Offizielles Ende |
| Abschluss | Protokoll fixiert, keine Änderungen mehr durch die Spielleitung |

### 7.3 Anzeige während des Spiels

Die Spielleitung sieht: aktuellen Spielstand, laufende Spielzeit, Spieler auf dem Feld (max. 3 je Mannschaft) inkl. Wurfzähler, Foulzähler je Mannschaft (0–2, bei 3 → Penalty), verfügbare Timeouts, 8-Sekunden-Timer (beide Fristen), Hinweise bei Regelauffälligkeiten. Seitenansicht (welches Team links/rechts) ist umschaltbar, ohne Daten zu ändern.

### 7.4 Abschluss eines Spiels

1. Schiedsrichter pfeift ab → „Spielende" wird erfasst
2. Nachträgliche Korrekturen noch möglich (durch Spielleitung)
3. Protokollant „unterschreibt" digital (Name; siehe Abschnitt 20.7)
4. „Abschluss" wird erfasst → keine Änderungen mehr durch die Spielleitung
5. Turnierleitung bestätigt das Protokoll
6. Ergebnisse fließen in die Tabelle ein

### 7.5 Protokollantenwechsel

Für den Ausnahmefall, dass ein Protokollant während eines laufenden Spiels abgelöst werden muss: Eigenes Ereignis mit Zeitstempel und Namen des neuen Protokollanten, ohne Genehmigung durch die Turnierleitung. Der Spielbericht weist am Ende aus, welche Personen wann protokolliert haben (z. B. „Protokollführung: Person A (bis 14:32), Person B (ab 14:32)").

### 7.6 Protest

Ein Protest gegen eine Schiedsrichterentscheidung oder das Spielergebnis muss laut Spielberichtsbogen vermerkt werden. Er wird als eigenes Ereignis im Protokoll erfasst und kann bei Bedarf auch **nachträglich** eingetragen werden (z. B. wenn er erst nach Spielende formal eingereicht wird, aber noch vor dem endgültigen Abschluss des Protokolls). Erfasst werden: die protestierende Mannschaft, eine Begründung sowie – sobald verfügbar – die Entscheidung der Turnierleitung. Eine spätere Entscheidung wird als Korrektur-Ereignis mit Referenz auf den ursprünglichen Protest-Eintrag ergänzt, analog zum allgemeinen Korrekturprinzip aus Abschnitt 7.1.

## 8. Spielplan-Generierung

Aus Turnierdefinition und Spielregeln wird ein Spielplan-**Vorschlag** erstellt (Modul „Turnierplanung"). Die endgültige Version wird im Modul „Turnier" gepflegt; die Turnierleitung darf Reihenfolge, Spielfeld und Startzeiten nachträglich anpassen. Manuelle Anpassungen dürfen keine der harten Regeln unterlaufen: Würde eine geänderte Startzeit zu einer zeitlichen Überschneidung mit einem anderen Spiel auf demselben Feld führen, wird die Änderung abgelehnt statt kommentarlos übernommen. Die letzten Änderungen am gespeicherten Spielplan lassen sich rückgängig machen.

**Harte Regeln (werden immer eingehalten):**
- Eine Mannschaft spielt nicht gleichzeitig auf zwei Feldern
- Eine Mannschaft hat keine zwei Spiele hintereinander (feldübergreifend) – diese Prüfung gilt sowohl für den Vorschlag als auch für den bereits gespeicherten, manuell veränderbaren Spielplan
- Ein Schiedsrichter leitet nicht das Spiel seiner eigenen Mannschaft (Warnung, kein Blocker – siehe 5.4)

**Praktische Grenze bei mehreren Feldern:** „Keine zwei Spiele hintereinander" und „Felder spielen möglichst parallel" stehen in Konflikt, sobald genug Felder für volle Parallelität vorhanden sind (Felder ≥ Mannschaften/2) – dann spielt zwangsläufig jede Mannschaft jede Runde, eine Pause ist nur durch bewusst ungenutzte Feldkapazität möglich. Bei der üblichen Konfiguration (1 Feld, ausnahmsweise 2) tritt dieser Konflikt in der Praxis kaum auf: Ab 5 Mannschaften mit einem Feld ist eine vollständig kollisionsfreie Runde immer möglich, bei genau 3 oder 4 Mannschaften mit einem Feld ist dagegen mindestens ein Back-to-Back-Fall unvermeidbar. Bei sehr kleinen Ligen (4–5 Mannschaften) mit 2 Feldern sind unvermeidbare Back-to-Back-Fälle zu erwarten und werden als Warnung, nicht als Fehler, angezeigt.

**Bevorzugte Reihenfolge (Bundesliga):** 1. Mannschaften desselben Vereins zuerst, 2. dann desselben Bundeslandes (frühestmöglich, ohne Back-to-Back-Verstoß), 3. dann alle anderen.

**Nichterscheinen einer Mannschaft** (zwei Verfahren, pro Turnier konfigurierbar):
- **Feste Wertung:** Alle Spiele der abwesenden Mannschaft erhalten ein konfigurierbares Standardergebnis (Vorgabewert aus Systemkonfiguration, Default 3:0), üblich bei Bundesliga-Spieltagen.
- **Spielplan neu generieren:** Die Mannschaft wird entfernt, der Spielplan neu erzeugt – sinnvoll bei Freizeitturnieren.

**Mehrere Spielfelder:** Spiele auf verschiedenen Feldern sollen möglichst parallel stattfinden; bei Verzögerungen wird die Pause auf dem betroffenen Feld angepasst (konfigurierbare Toleranz). Jedes Spielfeld hat eigene Protokollanten; ein Wechsel im Turnierverlauf ist möglich (siehe 7.5 für den Wechsel während eines laufenden Spiels).

**Turnierpausen:** Optionale Mittagspausen möglich; nachfolgende Spielzeiten verschieben sich automatisch. Pausen können auch zur Synchronisation der Felder genutzt werden.

**Zeitplanung:** Alle Zeiten basieren auf der Turnier-Startzeit. Es gibt eine geplante und eine voraussichtliche (aktuelle) Zeit; Mannschaften sehen immer die voraussichtliche Startzeit ihres nächsten Spiels.

**Vorabveröffentlichung:** Der Spielplan wird durch die Turnierleitung explizit freigegeben (setzt zentrale Instanz voraus; im rein lokalen Betrieb nicht verfügbar); vorher nicht öffentlich sichtbar. Nach Freigabe weiterhin änderbar. Die veröffentlichte Ansicht trägt Versionsnummer und Änderungsdatum, damit ein ausgedruckter Plan als veraltet erkennbar ist.

**Qualifikation für Folgespiele:** Die Ermittlung qualifizierter Mannschaften für Finale, Platzierungsspiele und Hauptrunden erfolgt automatisch aus der Tabelle. Die Turnierleitung darf manuell übersteuern; bei manueller Änderung erscheint eine deutliche Warnung mit Bestätigungsschritt.

## 9. Ergebnisse und Tabellen

### 9.1 Tabellenberechnung

Sortierung bei Gleichstand in dieser Reihenfolge (konfigurierbar): 1. Punkte, 2. Tordifferenz, 3. erzielte Tore, 4. direkter Vergleich, 5. Freiwürfe.

### 9.2 Sonderfälle

- **Nichterscheinen:** Niederlage mit konfigurierbarem Forfait-Ergebnis (Default 3:0) für die nicht erschienene Mannschaft, zusätzlich 2 Punkte Abzug.
- **Vorzeitiger Abbruch:** 5:0 für die verbleibende Mannschaft.
- **Ausscheiden einer Mannschaft:** Alle bisherigen Ergebnisse dieser Mannschaft werden annulliert.

### 9.3 Torschützenkönig

Wird über alle Spiele eines Turniers berechnet. Eigentore zählen nicht. Tore aus Freiwürfen und Penaltys zählen normal mit, ohne besondere Kennzeichnung (siehe 6.8).

### 9.4 Statistiken

Nach Spielabschluss automatisch berechnet: aktueller Tabellenstand, Torschützenliste, Anzahl Fouls/Penaltys je Mannschaft. Zwischenstände laufender Spiele **werden** live veröffentlicht, mit deutlichem Hinweis „Spiel läuft", damit sie nicht als Endergebnis missverstanden werden.

## 10. Benutzer und Berechtigungen (fachlich)

### 10.1 Betriebsmodi

- **Standalone:** ein Rechner, kein Netzwerk, keine Anmeldung – für kleine Freizeitturniere.
- **Lokales Netzwerk:** mehrere Geräte vor Ort, kein Internet nötig, Zugang über Turnier-Codes (je einer für Turnierleitung und Spielleitung).
- **Zentrale Plattform (Internet):** vollständige Benutzerverwaltung, Synchronisation, Live-Ergebnisse.

### 10.2 Rollen

| Rolle | Beschreibung |
|---|---|
| Admin | Vollzugriff auf alles, inkl. Systemkonfiguration |
| Manager | Kann Benutzer anlegen und Turniere verwalten |
| Turnierleitung | Verwaltet ein bestimmtes Turnier |
| Spielleitung | Protokolliert Spiele eines Turniers |

Rollen werden pro Turnier vergeben – dieselbe Person kann bei verschiedenen Turnieren verschiedene Rollen haben. Kein Self-Service für die Registrierung in der ersten Version; Benutzer und Rollen werden durch Admin/Manager angelegt.

### 10.3 Turnier-Status

| Status | Beschreibung | Öffentlich sichtbar |
|---|---|---|
| Entwurf | In Planung | Nein |
| Aktiv | Läuft oder abgeschlossen | Ja |
| Archiviert | Nur Ergebnisse verfügbar | Ja (nur Ergebnisse) |

## 11. Datenschutz

Spielernamen können bei Veröffentlichung anonymisiert werden (z. B. „Spieler 5" statt Klarname); Standard: Anonymisierung aktiv. Für die Bundesliga können Klarnamen aktiviert werden (Einwilligung vorausgesetzt). Intern wird immer mit echten Namen gearbeitet. **Schiedsrichter werden auf der öffentlichen Turnierseite grundsätzlich nicht genannt** – unabhängig von der Anonymisierungseinstellung, die ausschließlich für Spielernamen (Torschützenlisten, Protokolle) gilt.

## 12. Mehrsprachigkeit

Die Benutzeroberfläche wird von Beginn an mehrsprachig ausgelegt: Deutsch (Standard), Englisch, Französisch, Italienisch – Torball wird auch in Frankreich, Italien, der Schweiz und Belgien gespielt. Technisch bedeutet das eine i18n-Architektur im Frontend von Anfang an, nicht nachgerüstet (siehe Abschnitt 20 „Auswirkungen auf Architektur"). Vom Benutzer eingegebene Daten (Mannschaftsnamen, Freitexte) bleiben einsprachig; mehrsprachige Zusatzinformationen werden stattdessen als Dokumenten-Anhang bereitgestellt (Abschnitt 5.1).

## 13. Öffentliche Turnierseite

Je Turnier gibt es einen frei verteilbaren, öffentlich zugänglichen Link. Zielgruppe: teilnehmende Mannschaften und Gäste.

**Inhalte:** Turnierdaten (Name, Datum, Ort mit Anschrift/Karte), teilnehmende Mannschaften, Spielplan (Zeit, Paarung, Feld – **ohne Schiedsrichter**), Dokumenten-Anhänge, Versionsnummer/Änderungsdatum des Spielplans, Live-Stände mit „Spiel läuft"-Hinweis, aktuelle Tabelle, nach Turnierende die Abschlusstabelle.

**Gliederung:** Verteilung auf mehrere Unterseiten (Turnierinfos / Anfahrt und Dokumente / Spielplan / Ergebnisse), jeweils einzeln durch die Turnierleitung freischaltbar – bessere Lesbarkeit mit Screenreader, klare Überschriftenstruktur.

**Spätere Erweiterung:** Registrierung per E-Mail je Turnier für Benachrichtigungen bei Spielplanänderungen und Abschlusstabelle (ausdrücklich nicht bei Zwischenständen), mit Double-Opt-in und Abmeldemöglichkeit.

**Erkenntnisse aus der Umsetzung:** Der "frei verteilbare Link" ist `/turniere/:id/oeffentlich` - die Turnier-ID selbst dient als Adresse, ohne separaten Geheimwert wie beim Ergebnis-Token (Abschnitt 14): Lesezugriff ist unkritisch, die eigentliche Freigabe steuern die vier Sichtbarkeits-Felder je Sektion. Teilnehmende Mannschaften und Spielfelder werden unabhängig von den vier Schaltern immer ausgeliefert, da Spielplan/Ergebnisse ohne aufgelöste Namen nicht lesbar wären; Namen selbst gelten nicht als sensibel. Dokumenten-Anhänge (Abschnitt 5.1/20.13) sind noch nicht umgesetzt, der Anfahrt-Bereich zeigt daher bisher nur die Ortsangabe ohne Dateiliste.

## 14. Ergebniserfassung ohne digitale Protokollierung

Nicht jedes Turnier wird digital protokolliert (`protokollierungsart = manuell`, siehe 5.1). In diesem Fall entfallen Protokollantenzuweisung, Ereigniserfassung und alle darauf aufbauenden Statistiken (Torschützen, Fouls, Penaltys) – es werden ausschließlich Endergebnisse benötigt.

**Ergebniserfassung per Token:** Die Turnierleitung erzeugt je Turnier einen Link (kein Login, keine Registrierung – Zielgruppe: Gelegenheitsnutzer). Berechtigung ausschließlich: Endergebnisse der Spiele **dieses** Turniers eintragen/ändern, kein Zugriff auf andere Daten. Beim ersten Aufruf wird ein Name abgefragt (am Gerät gespeichert); jede Eingabe/Änderung wird mit Name und Zeitstempel protokolliert (wer/wann/alter/neuer Wert). Ergebnisse sind frei änderbar, solange das Spiel nicht abgeschlossen ist; die Turnierleitung kann einzeln oder gesammelt (Runde/Turnier) abschließen. Nach Abschluss ändert nur noch die Turnierleitung, die Tabelle wird neu berechnet. Ein Zurücksetzen auf „per Token änderbar" ist nicht vorgesehen. Eine Bestätigung durch die Turnierleitung vor Einfließen in die Tabelle ist zunächst nicht erforderlich (organisatorisches Thema).

Das Token-Verfahren existiert **ausschließlich** bei `protokollierungsart = manuell`; bei `digital` bleibt das Event-Protokoll die einzige Ergebnisquelle, um widersprüchliche Ergebnisstände zu vermeiden.

## 15. Stammdaten (Vereine und Teams)

Wiederverwendbare Stammdaten werden zentral in der Cloud gepflegt (analog zu Spielorten, die ebenfalls wiederverwendbar sein sollen).

**Verein:** Name, Logo (optional – nicht jeder Verein/jede Spielgemeinschaft hat eines), Ansprechpartner/Kontakt, Bundesland.

**Team:** Gehört zu einem Verein (ein Verein kann mehrere Teams stellen, z. B. „I" und „II"), erbt das Logo des Vereins, führt **keine Spielerdaten**. Zweck: stabile Identität einer Mannschaft über mehrere Spieltage eines Wettbewerbs hinweg, damit die Gesamttabelle zuverlässig aggregieren kann – unabhängig von der Namensschreibweise im jeweiligen Turnier.

**Turnier-Mannschaft** (wie bisher turnierbezogen): optionale Referenz auf ein Team. Beim Anlegen aus den Stammdaten werden die Daten **kopiert, nicht verknüpft** – eine spätere Umbenennung eines Vereins ändert kein historisches Turnier. Der Spielerkader wird ausschließlich hier geführt. Die Referenz bleibt in jedem Fall optional; für Freizeitturniere genügt freie Eingabe von „Team Rot"/„Team Blau".

**Verfügbarkeit:** Stammdaten liegen in der Cloud; lokale Instanzen ohne Verbindung erfassen Mannschaften frei, ohne Referenz. Nach einer Synchronisation stehen die Stammdaten auch lokal zur Auswahl.

**Synchronisation lokal erfasster Mannschaften:** Wird ein lokal geplantes Turnier synchronisiert, entstehen enthaltene Mannschaften als eigenständige Einträge – **kein automatischer Abgleich** gegen vorhandene Stammdaten (weder automatisch noch über einen Matching-Dialog), da dies nicht IT-affine Nutzende überfordern und die Synchronisationslogik erheblich verkomplizieren würde. Eine nachträgliche manuelle Zuordnung ist eine spätere Erweiterung (siehe Abschnitt 29).

---

# Teil II – Technische Spezifikation

## 16. Systemübersicht

Webbasierte Anwendung, bestehend aus folgenden Modulen:

| Modul | Beschreibung | Priorität |
|---|---|---|
| Turnierplanung | Planung und Vorbereitung von Turnieren | Hoch |
| Turnier/Protokoll | Live-Protokollierung während eines Spiels | Hoch |
| Live-Ergebnisse | Öffentliche Anzeige von Ergebnissen | Mittel |
| Analysen | Auswertungen und Statistiken | Niedrig |

**Entwicklungsreihenfolge:** 1. Entwicklungsumgebung/Infrastruktur, 2. Datenmodell, 3. Turnierplanung, 4. Turnier/Protokoll, 5. Live-Ergebnisse, 6. Analysen.

## 17. Technologie-Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| Frontend | React (TypeScript) | Barrierefreiheit, große Community, PWA-fähig |
| Backend | Node.js / Fastify | TypeScript-nativ, performant |
| Datenbank (lokal) | PouchDB | Läuft im Browser, offline-fähig |
| Datenbank (zentral) | CouchDB | Automatische bi-direktionale Synchronisation mit PouchDB |
| Webserver | Nginx | Reverse Proxy, HTTPS |
| Versionierung | Gitea (self-hosted) | Bereits auf Proxmox vorhanden |

**Progressive Web App (PWA):** Verhält sich wie eine native App auf dem Smartphone, kein App Store nötig, funktioniert im lokalen Netzwerk ohne Internet, Installation über Browser (Icon auf Homescreen).

**Auswirkung der Mehrsprachigkeit (Abschnitt 12):** i18n-Architektur (Übersetzungsdateien je Sprache) von Beginn an im Frontend, nicht nachgerüstet.

## 18. Infrastruktur

### 18.1 Entwicklungsumgebung (lokal)

```
Entwicklungsrechner (Windows 11)
├── VS Code (Editor)
├── Node.js (via nvm)
├── Git (Versionierung)
└── Browser (Chrome/Firefox für Tests)
```

### 18.2 Proxmox-Struktur

```
Proxmox
├── LXC Container 1: Entwicklung/Test
│   ├── Node.js, CouchDB
│   └── Gitea (bereits vorhanden, Port 3000)
├── LXC Container 2: Staging
│   ├── Node.js, CouchDB, Nginx
└── LXC Container 3: Produktion
    ├── Node.js, CouchDB, Nginx
```

### 18.3 Produktions-Hosting

**Phase 1:** Self-Hosting auf Proxmox – kostenfrei, volle Kontrolle, Ausfälle nicht turnierkritisch (lokaler Betrieb funktioniert unabhängig).
**Phase 2 (zukünftig):** Externer Anbieter (z. B. IONOS) – höhere Verfügbarkeit, 24/7 erreichbar; bestehenden Vertrag des Torball-Fördervereins prüfen.
**Migrationsstrategie:** Keine Abhängigkeit von spezifischer Hardware, Konfiguration über Umgebungsvariablen, CouchDB-Replikation ermöglicht einfachen Umzug.

### 18.4 Lokale Installation (Windows)

Windows-Installer-Paket mit Node.js, CouchDB und der Anwendung; einmalige Installation, danach sofort nutzbar, kein technisches Wissen erforderlich.

## 19. Betriebsmodi (technisch)

**Standalone:**
```
Ein Rechner
├── Browser (Frontend)
├── Node.js / Fastify (Backend)
└── PouchDB (lokale Datenbank im Browser)
```

**Lokales Netzwerk:**
```
Zentraler Rechner (Turnierleitung)      Weitere Geräte
├── Node.js / Fastify                   (Spielleitung, Anzeige, Smartphones)
├── CouchDB                             └── Browser → per IP/WLAN
└── Nginx
```
Kein Internet nötig, Zugang über Turnier-Codes, PWA auf Smartphones für Live-Anzeige.

**Zentrale Plattform:**
```
Internet
├── Zentraler Server (Node.js/Fastify, CouchDB, Nginx/HTTPS)
└── Lokale Geräte: PouchDB ↔ Sync ↔ CouchDB
```
Vollständige Benutzerverwaltung, automatische Synchronisation, öffentlich abrufbare Live-Ergebnisse.

## 20. Datenmodell

### 20.1 Hierarchie

```
Systemkonfiguration (versioniert, unabhängig von Turnieren)

Verein (Stammdaten, zentral)
  └── Team (Stammdaten, zentral)

Wettbewerb (optional, für mehrtägige Turniere)
  └── Spieltag/Turnier
        ├── Dokument-Anhang (0..n)
        ├── Turnierpausen (0..n)
        ├── Ergebnis-Token (0..1, nur bei protokollierungsart=manuell)
        ├── Mannschaft-im-Turnier (optionale Referenz auf Team)
        │     └── Spieler (turnierbezogen)
        ├── Schiedsrichter-im-Turnier
        └── Spielplan
              └── Spiel
                    ├── Ergebnis-Änderung (0..n, nur bei manuell)
                    └── Spielprotokoll (nur bei digital)
                          └── Events (chronologisch)
```

### 20.2 Systemkonfiguration

```
Systemkonfiguration
  - konfig_id
  - version (fortlaufend)
  - ist_aktuell (boolean)              ← genau ein Datensatz = true
  - gueltig_ab (timestamp)
  - punkte_sieg (Default)
  - punkte_unentschieden (Default)
  - forfait_ergebnis (Default, z.B. "3:0")
  - passwort_mindestlaenge (Default)
  - geaendert_von (benutzer_id)
  - geaendert_am (timestamp)
  - aenderungskommentar (optional, Freitext)
```

Jede Admin-Änderung erzeugt einen neuen Datensatz (nie Update). Beim Anlegen eines Turniers werden die aktuellen Werte in die Turnier-Felder **kopiert** (kein laufender Verweis) – bereits geplante/laufende Turniere bleiben von späteren Änderungen unberührt. Eine Historien-Ansicht listet alle Versionen chronologisch.

### 20.3 Wettbewerb

```
Wettbewerb
  - wettbewerb_id
  - name (z.B. "1. Torball-Bundesliga 2024/2025")
  - saison
  - anzahl_spieltage
  - modus
  - erstellt_von (benutzer_id)
  - erstellt_am (timestamp)
```

### 20.4 Verein und Team

```
Verein
  - verein_id
  - name
  - logo (optional)
  - bundesland
  - ansprechpartner_name / _telefon / _email

Team
  - team_id
  - verein_id (Referenz, Pflicht)
  - name (z.B. "I", "II")
  - logo_override (optional, zurückgestellte Erweiterung, aktuell ungenutzt)
```

### 20.5 Turnier

```
Turnier
  - turnier_id
  - wettbewerb_id (optional, Referenz)
  - name, datum, startzeit
  - status (entwurf/aktiv/archiviert)

  Spielort:
  - spielort_name, spielort_adresse, spielort_geo (optional)

  Spielfelder:
  - felder (Array: [{feld_id, name}])

  Protokollierung:
  - protokollierungsart (digital/manuell)

  Spielregeln:
  - modus, spielzeit_minuten (Default 5), anzahl_halbzeiten (Default 2),
    pause_minuten (Default 2), seitenwechsel (Default true),
    timeouts_je_halbzeit (Default 1), timeout_dauer_sekunden (Default 30),
    auswechslungen_je_halbzeit (Default 3),
    tordifferenz_abbruch (Default true), tordifferenz_limit (Default 10),
    verlaengerung_aktiv (Default true), silbernes_tor (Default true),
    max_sehende_spieler (Default 1), einstellige_trikotnummern (Default true)

  Punktevergabe:
  - punkte_sieg (Default 2), punkte_unentschieden (Default 1), punkte_niederlage (Default 0)

  Tabellenreihenfolge bei Gleichstand:
  - kriterien (Array: [punkte, tordifferenz, tore, direkter_vergleich, freiwuerfe])

  Datenschutz:
  - spielernamen_oeffentlich (Default false)

  Spielplan-Veröffentlichung:
  - spielplan_freigegeben (boolean), spielplan_version (fortlaufend),
    spielplan_geaendert_am (timestamp)

  Öffentliche Turnierseite (granular je Unterseite):
  - oeffentlich_turnierinfos, oeffentlich_anfahrt_dokumente,
    oeffentlich_spielplan, oeffentlich_ergebnisse (je boolean)

  Herkunft (informativ):
  - erstellt_mit_konfig_version (optional)

  Kontakt:
  - turnierleitung_name / _kontakt, ansprechpartner_name / _kontakt, zusatzinfo (Text)

  Metadaten:
  - erstellt_von / erstellt_am, geaendert_von / geaendert_am
```

### 20.6 Turnierpause

```
Turnierpause
  - pause_id, turnier_id (Referenz)
  - startzeit (geplant), dauer_minuten
  - gilt_fuer (alle/[feld_id, ...])
  - typ (mittagspause/synchronisation)
```

### 20.7 Mannschaft-im-Turnier

```
Mannschaft-im-Turnier
  - mannschaft_id, turnier_id (Referenz)
  - team_id (optional, Referenz)         ← reine Herkunftsreferenz, kein Live-Join
  - verein_id (optional, Referenz)
  - name, logo, bundesland               ← kopiert bei Übernahme aus Team, sonst frei
  - ansprechpartner_name / _telefon / _email
  - betreuer1_name, betreuer2_name, betreuer3_name (optional) ← bis zu drei
    Trainer/Betreuer; dürfen (Bundesliga) mit auf der Auswechselbank sitzen,
    daher an der Mannschaft geführt, nicht als Spieler
  - betreuer1_ist_schiedsrichter / _2_ / _3_ (boolean) ← markiert, dass die
    jeweilige Person zugleich Schiedsrichter ist (Trainer sind oft beides);
    Anknüpfungspunkt zur Schiedsrichter-Verwaltung
  - importiert_aus_turnier_id (optional)
```

### 20.8 Spieler

```
Spieler
  - spieler_id, mannschaft_id (Referenz, turnierbezogen)
  - name, vorname, trikotnummer
  - klassifizierung (B1/B2/B3/sehend/AB)
  - status (aktiv/gesperrt)
  - importiert_aus_turnier_id (optional)
```

### 20.9 Schiedsrichter-im-Turnier

```
Schiedsrichter-im-Turnier
  - schiedsrichter_id, turnier_id (Referenz)
  - name, vorname, telefon (optional), email (optional)
  - lizenz_vorhanden (boolean)
  - mannschaft_id (optional, Referenz)
  - ist_turnierleitung (boolean)
  - importiert_aus_turnier_id (optional)
```

### 20.10 Spiel

```
Spiel
  - spiel_id, turnier_id (Referenz)
  - runde (z.B. 1, 2, "Finale", "Platz 3")
  - feld_id (Referenz)
  - startzeit_geplant, startzeit_voraussichtlich (dynamisch),
    startzeit_tatsaechlich, endzeit_tatsaechlich
  - mannschaft_a_id, mannschaft_b_id (Referenzen)
  - schiedsrichter_id (Referenz)
  - status (geplant/laeuft/beendet/abgeschlossen)
  - ergebnis_a, ergebnis_b (Tore, berechnet bzw. erfasst)
  - ist_forfait (boolean)
  - ergebnis_abgeschlossen (boolean, unabhängig vom status-Feld –
    relevant bei protokollierungsart=manuell, wo ein Spiel direkt
    von "geplant" zu "Ergebnis erfasst" springen kann)
```

### 20.11 Spielprotokoll (nur bei protokollierungsart = digital)

```
Spielprotokoll
  - protokoll_id, spiel_id (Referenz)
  - status (offen/beendet/abgeschlossen)
  - erstellt_von (benutzer_id)
  - protokollant_name (letzter Unterzeichner – "Unterschrift")
  - protokollant_bestaetigt_am (timestamp)
```

Die vollständige Historie mehrerer Protokollanten während des Spiels wird **nicht redundant gespeichert**, sondern aus den `HANDOVER`-Events plus dem ersten Protokollanten berechnet (konsistent zum Event-Sourcing-Prinzip).

### 20.12 Event

```
Event
  - event_id, protokoll_id (Referenz)
  - zeitstempel (Uhrzeit), spielzeit (Sekunden), halbzeit (1/2/V1/V2/FW)
  - event_typ (siehe Abschnitt 22.2)
  - mannschaft (A/B/null), spieler_id (optional), spieler_raus_id (optional, bei Wechsel)
  - ist_eigentor (boolean), ist_korrektur (boolean), korrigiert_event_id (optional)
  - zusatz (JSON, eventspezifisch, z.B. {"neuer_protokollant": "..."} bei HANDOVER)
  - erstellt_von (benutzer_id)
```

### 20.13 Dokument-Anhang

```
Dokument-Anhang
  - anhang_id, turnier_id (Referenz)
  - titel, beschreibung (optional), datei (Referenz/Pfad)
  - erstellt_von, erstellt_am
```

### 20.14 Ergebnis-Token und Ergebnis-Änderung (nur bei protokollierungsart = manuell)

```
Ergebnis-Token
  - token_id, turnier_id (Referenz)
  - token_wert (zufällig, für die URL)
  - erstellt_von (benutzer_id, Turnierleitung), erstellt_am
  - widerrufen (boolean), widerrufen_am (optional)

Ergebnis-Änderung
  - aenderung_id, spiel_id (Referenz)
  - erfasser_name (Freitext, beim ersten Aufruf am Gerät abgefragt)
  - geraet_kennung (optional, lokal generierte Kennung)
  - alter_wert_a / alter_wert_b (optional bei Erstanlage leer)
  - neuer_wert_a / neuer_wert_b
  - zeitstempel
```

### 20.15 Benutzer

```
Benutzer
  - benutzer_id, email (= Benutzername), passwort_hash
  - name, telefon (optional)
  - globale_rolle (admin/manager/benutzer)
  - sprache (de/en/fr/it, Default de)
  - 2fa_aktiv (boolean), 2fa_secret (verschlüsselt)
  - gesperrt (boolean), letzte_anmeldung (timestamp)
  - erstellt_von, erstellt_am
```

### 20.16 Turnier-Berechtigung

```
Turnier-Berechtigung
  - berechtigung_id, turnier_id (Referenz), benutzer_id (Referenz)
  - rolle (turnierleitung/spielleitung/lesen)
  - vergeben_von, vergeben_am
```

### 20.17 Audit-Log

```
Audit-Log-Eintrag
  - log_id, turnier_id (optional), benutzer_id
  - aktion (z.B. "turnier_geaendert", "spieler_hinzugefuegt", "protokoll_korrigiert",
             "schiedsrichter_konflikt_genehmigt")
  - details (JSON), zeitstempel
```

### 20.18 Spielerstatus „kurzzeitig ausgesetzt" (kein eigenes Feld)

Kein zusätzliches Datenmodell-Element nötig: Ein Spieler gilt als ausgesetzt zwischen einem `F`-Event (als Verursacher) und dem nachfolgenden Freiwurf-Event derselben Begegnung – rein aus der Event-Abfolge berechenbar.

## 21. Berechtigungskonzept (technisch)

### 21.1 Globale Rollen

| Rolle | Benutzer anlegen | Turniere anlegen | Zugriff |
|---|---|---|---|
| Admin | Alle inkl. Admins | Ja | Alles |
| Manager | Benutzer + Manager | Ja (Hauptaufgabe) | Eigene + zugewiesene |
| Benutzer | Nein | Nein | Nur zugewiesene |

### 21.2 Turnierbezogene Berechtigungen

| Berechtigung | Beschreibung | Kann vergeben von |
|---|---|---|
| Schreiben | Vollzugriff auf Turnier | Admin, Manager (eigene Turniere) |
| Lesen | Lesezugriff auf interne Daten | Jeder mit Schreibzugriff |

Berechtigungen gelten pro Turnier. Wer Schreibrecht hat, kann anderen Schreib- oder Leserecht geben; wer nur Leserecht hat, kann nur Leserecht weitergeben. Schreibrechte können von jedem mit Schreibrecht entzogen werden. Manager behalten immer Zugriff auf eigene Turniere. Öffentliche Turnierdaten (Status aktiv) sind ohne Anmeldung sichtbar, gemäß den granularen Öffentlichkeits-Flags aus Abschnitt 20.5.

### 21.3 Turnier-Codes (Offline/LAN-Modus)

Beim Anlegen eines lokalen Turniers ohne Internetverbindung: Turniername, Datum, frei wählbarer Code für Turnierleitung, frei wählbarer Code für Spielleitung. Wer den Code kennt, erhält die entsprechende Rolle. Bei späterer Synchronisation: Benutzer mit Account meldet sich an → Turnier wird dem Account zugeordnet → Codes werden ungültig; ohne Account ordnet der Admin das Turnier manuell zu.

### 21.4 Passwort-Richtlinien und -Reset

Mindestlänge konfigurierbar (Minimum 8 Zeichen), Pflicht: mind. 1 Großbuchstabe, 1 Zahl, 1 Sonderzeichen. Änderungen gelten nur für neue/geänderte Passwörter. Reset-Ablauf: E-Mail-Eingabe → Einmal-Link (24 Stunden gültig) → neues Passwort → alle aktiven Sessions beendet → Benachrichtigung an E-Mail.

### 21.5 Zwei-Faktor-Authentifizierung

Verpflichtend für Admin, optional für alle anderen, Einrichtung bei erster Anmeldung.

## 22. Spielprotokoll und Event-Sourcing

### 22.1 Grundprinzip

Der aktuelle Spielstand wird nicht gespeichert, sondern aus der Event-Liste berechnet. Jedes Ereignis ist ein unveränderlicher Eintrag; Korrekturen erzeugen neue Einträge mit Referenz auf das ursprüngliche Event.

**Aus der Event-Liste berechnet:** aktueller Spielstand, laufende Spielzeit, Foulzähler je Mannschaft, Wurfzähler je Spieler, Timeout-/Auswechslungs-Kontingent, aktuelle Feldbesetzung, Timer-A/Timer-B-Zustand (Abschnitt 6.2), Spielerstatus „kurzzeitig ausgesetzt" (20.18), Protokollanten-Historie (20.11).

### 22.2 Event-Typen

| Typ | Beschreibung | Mannschaft | Spieler |
|---|---|---|---|
| GO | Spielzeit starten | - | - |
| STOP | Spielzeit anhalten | - | - |
| B | Halbzeit/Pause | - | - |
| VB | Verlängerung beginnt | - | - |
| End | Spiel beendet | - | - |
| Fin | Abschluss | - | - |
| W | Wurf | A/B | Ja |
| K | Kontrolle (steuert Zwei-Timer-Modell) | A/B | - |
| G | Tor | A/B | Ja (Torschütze) |
| F | Foul | A/B | Ja (Verursacher) |
| P | Penalty | A/B | - |
| PA | Auto-erkannter Penalty (System-Hinweis) | A/B | - |
| T | Timeout | A/B | - |
| TT | Technischer Timeout | A/B (opt.) | - |
| E | Wechsel | A/B | Ja (raus + rein) |
| FW | Freiwurf | A/B | Ja |
| HANDOVER | Protokollantenwechsel | - | - |
| PROT | Protest | A/B | - |

### 22.3 Prüfungen je Event-Typ

**W – Wurf:** Ist Spieler auf dem Feld? Wurfzähler des Spielers: bei 3 → Hinweis, bei 4+ → Foul-Hinweis. Wurfzähler anderer Spieler der Mannschaft → reset.

**K – Kontrolle:** Stoppt Timer A (sofern er läuft), startet Timer B für die angegebene Mannschaft. Timer-Zustände werden nicht persistiert, sondern aus der Event-Abfolge berechnet.

**G – Tor:** Vorheriges Wurf-Event vorhanden? Tordifferenz erreicht Limit → Hinweis. Bei Eigentor: Tor der gegnerischen Mannschaft, kein Torschütze.

**F – Foul:** Foulzähler nach diesem Foul = 3 → Penalty-Hinweis. Bei drittem Foul: Foulzähler-Reset erst, wenn das Penalty protokolliert ist.

**T – Timeout:** Noch Timeouts verfügbar? Nein → Team-Penalty-Hinweis. Mannschaft in Ballbesitz? Nein → Team-Penalty-Hinweis.

**E – Wechsel:** Spieler raus auf dem Feld? Spieler rein auf der Bank? Auswechslungskontingent verfügbar? Während Penalty nicht möglich. Sehender Spieler: Limit prüfen.

**HANDOVER:** `zusatz` enthält `{"neuer_protokollant": "<Name>"}`; bisheriger Name ergibt sich aus dem vorherigen HANDOVER-Event bzw. dem ersten Protokollanten.

**PROT – Protest:** `zusatz` enthält Begründung, z. B. `{"begruendung": "...", "entscheidung": null}`. Die Entscheidung der Turnierleitung wird – sobald verfügbar – als Korrektur-Event mit `korrigiert_event_id` auf das ursprüngliche PROT-Event nachgetragen. Kann auch nach „Spielende" erfasst werden, solange das Protokoll noch nicht abgeschlossen ist. Keine automatische Prüfung.

**GO/STOP:** Läuft/läuft nicht bereits?

**Alle Events:** Entscheidung liegt immer beim Schiedsrichter; die Software warnt, blockiert nicht (außer bei technisch unmöglichen Aktionen).

### 22.4 Spielzeit-Verhalten

```
Je Spielabschnitt:
  - Timer startet bei 0:00
  - Signal bei definierter Zeit
  - Timer läuft weiter (Überhang)
  - Nächster Abschnitt startet bei 0:00

Gespeichert je Abschnitt:
  - Definierte Dauer, tatsächliche Start-/Endzeit, Überhang (berechnet)
```

## 23. Synchronisation

### 23.1 Technologie

PouchDB (lokal) ↔ CouchDB (zentral) synchronisieren automatisch bidirektional, sobald eine Verbindung besteht.

### 23.2 Synchronisations-Strategie

```
Erste Synchronisation: lokale Daten werden übertragen, kein Konflikt möglich

Folge-Synchronisation:
  1. Zeitstempel beider Versionen vergleichen
  Fall 1 (nur lokal geändert): normale Sync mit Bestätigung
  Fall 2 (nur zentral geändert): Hinweis + Auswahl (lokal→zentral / zentral→lokal / abbrechen)
  Fall 3 (beide geändert): deutliche Warnung, Zeitstempel beider Versionen anzeigen,
    explizite Entscheidung (lokal / zentral / abbrechen)

  Immer: automatisches Backup vor Überschreiben, Backup nach konfigurierbarer Zeit gelöscht
```

### 23.3 Offline-Turnier → Synchronisation

Option A (Account vorhanden): Anmeldung → Turnier wird Account zugeordnet → Codes ungültig. Option B (kein Account): Admin ordnet Turnier manuell zu, Codes ungültig.

### 23.4 Stammdaten-Synchronisation

Wie in Abschnitt 15 beschrieben: lokal erfasste Mannschaften werden bei Sync **ohne Matching** als eigenständige Einträge übernommen; Stammdaten-Referenzen (`team_id`) entstehen nur, wenn beim Anlegen explizit aus den Stammdaten ausgewählt wurde.

## 24. Barrierefreiheit und UI

### 24.1 Standard

Pflicht: WCAG 2.1 Level AA, Ziel: Level AAA wo sinnvoll umsetzbar.

**Konkrete Anforderungen (AA):** Kontrastverhältnis mind. 4,5:1 (normaler Text) bzw. 3:1 (große Texte), alle Funktionen per Tastatur bedienbar, sichtbare Fokus-Indikatoren, semantisches HTML und ARIA-Labels, aria-live-Regionen für dynamische Spielstandsänderungen, klar beschriftete Fehlermeldungen, keine reinen Farb-Informationen.

**Optimiert für:** JAWS (Windows, primäres Ziel), NVDA (Windows), VoiceOver (iOS/macOS), TalkBack (Android).

### 24.2 Responsive Design

Funktioniert auf Desktop, Tablet und Smartphone; Touch-optimiert für mobile Geräte.

### 24.3 Themes

Hell/Dunkel, Default nach Systemeinstellung (`prefers-color-scheme`). Phase 1: nur Admin definiert Themes; Phase 2: je Benutzer. Theme-Einstellung wird je Benutzer gespeichert und überschreibt die Systemeinstellung.

**Erkenntnisse aus der Umsetzung:** Anzeige-Voreinstellungen (Theme, dazu praktisch ergänzt: Zeilenabstand „Standard"/„Schmal" für Tabellen und Eingabefelder) laufen zweistufig: Eine rein geräte-/browserlokale Einstellung (`localStorage`, Seite „Einstellungen" – bewusst ohne Login erreichbar, da der geplante Offline/LAN-Betrieb, Abschnitt 21.3, keine angemeldeten Benutzer kennt) hat immer Vorrang. Ist auf einem Gerät noch keine lokale Wahl getroffen, greift – nur bei angemeldeten Benutzern – ein kontogebundener Standardwert aus dem Profil (`standardTheme`/`standardDichte` am Benutzer-Dokument) als Startwert; ist auch der nicht gesetzt, gilt „Systemeinstellung folgen" bzw. „Standard". Eine bereits getroffene lokale Wahl wird beim Login nie überschrieben.

### 24.4 Tastatur-Konfiguration (Protokollierung)

Konfigurierbar pro Turnier. Standardbelegung:

**Je Team (STRG-Taste für Team B):**

| Taste | Ereignis |
|---|---|
| 0–9 | Wurf (Spielernummer) |
| G | Tor |
| F | Foul |
| T | Timeout |
| P | Penalty |
| E | Wechsel |
| K | Kontrolle |

**Für das Spiel:**

| Taste | Ereignis |
|---|---|
| Space | GO/STOP (umschalten) |
| M | Technischer Timeout |
| B | Halbzeit/Pause |
| End | Spielende |
| F11 | Protokollantenwechsel |
| F12 | Abschluss |

## 25. Sicherheit

### 25.1 Authentifizierung

E-Mail als Benutzername, Passwort-Hash (bcrypt oder Argon2), 2FA via TOTP, Session-Management mit sicheren Tokens, automatischer Logout nach konfigurierbarer Inaktivität.

**Umsetzungsstand:** Session per HttpOnly-Cookie (nur der SHA-256-Hash des Tokens wird als CouchDB-Doc-ID gespeichert). Das `Secure`-Flag ist umgebungsgesteuert (`COOKIE_SECURE`) – lokal über HTTP aus, in Produktion hinter HTTPS zwingend `true`. Ein Admin kann die 2FA eines Benutzers deaktivieren (für den Fall einer verlorenen Authenticator-App); das eigene Konto ist davon ausgenommen (nur Selbst-Service mit Passwort).

### 25.2 Erstanmeldung

Admin/Manager legt Benutzer an → Einmal-Link per E-Mail → Passwort-Setzung beim ersten Login → bei Admin direkt 2FA-Einrichtung.

### 25.3 Sperrung

Gesperrte Benutzer können sich nicht anmelden; eine laufende Spielprotokollierung wird nicht unterbrochen – Sperrung wirkt erst nach dem laufenden Spiel.

### 25.4 E-Mail-Änderung

Neue E-Mail eingeben → Bestätigungs-Link an neue Adresse → erst nach Bestätigung wird geändert → Benachrichtigung an alte Adresse. Admin kann E-Mail ohne Bestätigung ändern.

**Umsetzungsstand:** Die Selbst-Service-Änderung im eigenen Profil ändert die Adresse aktuell direkt, nur durch Eingabe des aktuellen Passworts abgesichert – ohne Bestätigungslink an die neue und ohne Benachrichtigung an die alte Adresse. E-Mail-Versand ist inzwischen angebunden (siehe `docs/Protokolle/2026-08-10-anmeldung-benutzerverwaltung.md`), die Umstellung auf den hier beschriebenen vollen Ablauf steht als eigenständige Aufgabe noch aus.

## 26. Migration und Deployment

### 26.1 Datenmigration bei Umzug

CouchDB-Replikation: neue Instanz aufsetzen → Replikation starten → DNS umstellen, kein manueller Export/Import nötig.

### 26.2 Schema-Migration

Jede Struktur-Änderung erhält eine Versionsnummer, idempotente Migrations-Skripte (`migration_vN_to_vN+1.js`). Beim Anwendungsstart: aktuelle DB-Version prüfen, fehlende Migrationen ausführen, Ergebnis ins Audit-Log schreiben. Vor jeder Migration: automatisches Backup, Rollback möglich.

### 26.3 Backup-Strategie

Automatisches Backup vor jeder Synchronisation im Konfliktfall, regelmäßige Backups der CouchDB (konfigurierbar), Aufbewahrung konfigurierbar (Default 30 Tage).

### 26.4 Archivierung

Status-Übergang Entwurf → Aktiv → Archiviert, nur durch Admin. Bei Archivierung werden relevante Daten (Ergebnisse, Tabellen, Torschützen) in einen Archiv-Pool übertragen; detaillierte Protokolle bleiben im Original. Archivierte Turniere bleiben öffentlich sichtbar (nur Ergebnisse). Ein Automatismus nach konfigurierbarer Zeit ohne Einspruch ist als spätere Erweiterung vorgesehen, die Grundfunktion sollte aber von Anfang an eingeplant werden.

---

# Teil III – Offen

## 27. Geklärte fachliche Fragen (vormals offen)

Alle zehn ursprünglich offenen Fragen aus der fachlichen Spezifikation sind mittlerweile geklärt – zwei bereits durch die Ergänzungen vom 20.07.2026, die restlichen acht in der Klärungsrunde vom 10.08.2026:

| # | Frage | Klärung | Siehe Abschnitt |
|---|---|---|---|
| 1 | 3-Wurf-Regel über Halbzeiten hinweg | Zähler bleibt über die Pause bestehen (pausenübergreifend) | 6.3 |
| 2 | Eigentor | Wird der gegnerischen Mannschaft gutgeschrieben, kein Torschütze | 6.10 |
| 3 | Foulzähler bei Halbzeitwechsel | Gilt für das gesamte Spiel, **kein** Reset zur Halbzeit | 6.4 |
| 4 | Schiedsrichter als Turnierleitung | Ist der Regelfall, kein besonderer Protokoll-Hinweis nötig | 5.4 |
| 5 | Protest im Protokoll | Wird als eigenes Ereignis erfasst, auch nachträglich möglich | 7.6 |
| 6 | Nachmeldung von Spielern | Möglich bis zum jeweils ersten Spiel der Mannschaft | 5.3 |
| 7 | Klassifizierung AB | Änderung bis zum ersten Spiel der Mannschaft, nur durch Turnierleitung (Zeitpunkt noch nicht 100 % sicher) | 5.3 |
| 8 | Tordifferenz-Abbruch | Gilt einheitlich bei allen Turnierarten | 6.9 |
| 9 | Silbernes Tor | Konfigurierbare Turnier-Option, gilt für jede Verlängerung des Turniers | 6.7 |
| 10 | Freiwurf-Tore in der Statistik | Zählen normal in der Torschützenliste, wie Penalty-Tore | 6.8, 9.3 |

Damit sind keine fachlichen Fragen mehr offen. Verbleibende offene Punkte sind ausschließlich technischer Natur (siehe Abschnitt 28).

## 28. Offene technische Punkte

| Punkt | Beschreibung | Priorität |
|---|---|---|
| Offline-Auth | Authentifizierung bei kurzfristig angelegten lokalen Turnieren ohne Account | Vor Implementierung Offline-Modus |
| Spielplan-Algorithmus | Vollständiger Algorithmus für die automatische Generierung (insb. bei mehreren Feldern, Bundesland-Regel); harte Regeln und Präferenzen sind definiert (Abschnitt 8), die konkrete Implementierung (z. B. Constraint-Solver vs. Heuristik) noch nicht | Vor Modul Turnierplanung |
| IONOS-Prüfung | Bestehenden Vertrag des Fördervereins für zukünftiges externes Hosting prüfen | Niedrig |
| Analysen-Modul | Spezifikation noch nicht vollständig | Niedrig |
| Mobile App | Native App für Android/iOS (PWA ist für Phase 1 ausreichend) | Sehr niedrig |

## 29. Bewusst zurückgestellte Punkte

- Abweichende Logos für einzelne Teams desselben Vereins (Abschnitt 15)
- Nachträgliche manuelle Zuordnung lokal erfasster Mannschaften zu Stammdaten (Abschnitt 15/23.4)
- E-Mail-Benachrichtigung bei Turnieraktualisierungen (Abschnitt 13)
- Dokument-Anhänge fürs Turnier (Abschnitt 5.1/20.13): Datentyp vorhanden (`shared/src/types/dokumentAnhang.ts`), aber keine Backend-Route und keine UI. Zurückgestellt, bis der übrige Rahmen (UI/Stammdaten/Einstellungen) steht; vor Umsetzung zu klären: Speicherort der Dateien (lokal vs. CouchDB-Attachment), Limits für Dateigröße/-typ.
- Einschränkung von Ergebniskorrekturen ausschließlich auf die Turnierleitung (Abschnitt 14)
- Selfservice-Registrierung für Benutzer (Abschnitt 10.2)
- Automatische Archivierung nach Zeitablauf ohne Einspruch (Abschnitt 26.4)

**Leitgedanke für die erste Version:** So einfach wie möglich, da die Nutzenden nicht zwingend IT-affin sind.

## 30. Umsetzungsstand (Stand 2026-08-11)

Ergänzend zu den verteilten „Umsetzungsstand"-Notizen hier die wesentlichen zuletzt umgesetzten Funktionen und Festlegungen. Details in `docs/Protokolle/2026-08-11-*`.

- **Turnierregeln pflegbar (Abschnitt 5.1, 20.2/20.5).** Spielzeit, Pausen, Timeouts, Wertung, Forfait-Ergebnis usw. liegen im gemeinsamen Typ `Turnierregeln` (getragen von `Turnier` **und** `Systemkonfiguration`). Bearbeitung je Turnier (Reiter „Regeln" und Assistenten-Schritt) sowie zentral als **versionierte Standardwerte** (`/systemkonfiguration`, Admin-Seite „Standardregeln"). Jede Standard-Änderung erzeugt eine neue Version; neue Turniere **kopieren** die aktuelle (`erstelltMitKonfigVersion`), bestehende bleiben unberührt (20.2). Das Forfait-Ergebnis („n. a.") ist Teil der Regeln (kein fester 3:0-Wert mehr).
- **Anlage-Assistent (Abschnitt 5).** Mehrstufig: Grunddaten → Regeln → Mannschaften → *optional* Schiedsrichter → Spielplan. Der optionale Schiedsrichter-Schritt wird beim Anlegen gewählt (`schiedsrichterPlanung`).
- **Ergebniserfassung (Abschnitt 14).** Sofort-Speichern beim Verlassen des Feldes statt Speichern-Knopf; bei zwischenzeitlicher Fremdänderung Konfliktauflösung mit zwei Optionen (Vorhandenes übernehmen / mit eigenem Wert überschreiben). „n. a." (Forfait) direkt beim jeweiligen Team, nur in der internen Verwaltung (nicht auf der Token-Seite).
- **Basiskonfig-Änderungshinweis (Abschnitt 8).** Beim Erzeugen des Spielplans wird ein Schnappschuss der Basiskonfiguration gespeichert; ändert sich später Modus/Felder/Mannschaften/Zeiten, zeigt der Spielplan konkret an, was abweicht, und beim Ändern erscheint eine Rückfrage.
- **Regel-Prüfroutine.** „Turnier prüfen" (Übersicht) sammelt Regelverstöße/Auffälligkeiten in einer Liste, blockiert aber nichts (Leitgedanke „warnen, nicht entscheiden", vgl. Abschnitt 6).
- **Berechtigungen (Abschnitt 10/21).** Oberfläche zum Freigeben eigener Turniere an andere Benutzer (`TurnierBerechtigung`). Ein Admin kann die 2FA eines Benutzers deaktivieren (verlorene Authenticator-App; Ergänzung zu 25.1).
- **In-App-Hilfe (neu).** `/hilfe` mit gegliederten, aufklappbaren Themen; auf öffentlichen/externen Seiten stattdessen kontextbezogene Hilfe.
- **Barrierefreiheit (Abschnitt 24).** Pflichtfelder werden durchgängig gekennzeichnet (Formulare und Datentabellen).
- **Sicherheit (Abschnitt 25.1).** Das Session-Cookie erhält das `Secure`-Flag umgebungsgesteuert über `COOKIE_SECURE` (in Produktion hinter HTTPS zwingend `true`).
- **Fürs nächste Release vorgesehen.** `passwortMindestlaenge` und weitere reine Systemeinstellungen tatsächlich verdrahten und in die Oberfläche aufnehmen.

---

*Dieses Dokument wurde auf Basis der IBSA Torball Regeln (Stand Januar 2014), der Nationalen Ligaordnung des DBS (Stand August 2019), des DBS-Meldeformulars und der Gespräche mit dem Projektinhaber erstellt.*

*Version 1.0 – Konsolidierter Entwurf, 09.08.2026*

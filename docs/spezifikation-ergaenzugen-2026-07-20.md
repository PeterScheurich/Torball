# Spezifikationsergänzugen 2026-07-20

**Stand:** 20.07.2026
**Status:** Geklärt, zur Einarbeitung in die Spezifikation

---

## Teil A: Klärung der zehn offenen Punkte

### 1. Spielplan bei Nichterscheinen einer Mannschaft

Zwei Verfahren, pro Turnier konfigurierbar:

- **Feste Wertung:** Alle Spiele der abwesenden Mannschaft werden mit einem konfigurierbaren Standardergebnis gewertet (Vorschlag Default: 3:0 für die anwesende Mannschaft). Üblich bei Bundesliga-Spieltagen.
- **Spielplan neu generieren:** Die abwesende Mannschaft wird aus der Turnierkonfiguration entfernt und der Spielplan neu erzeugt. Sinnvoll bei Freizeitturnieren.

Das Standardergebnis ist je Turnier änderbar; der Vorgabewert kommt aus der globalen Systemkonfiguration (siehe Teil B.1).

### 2. Schiedsrichter-Zuweisung bei Engpass

Die Software **warnt**, sie blockiert nicht. Bereits bei der Generierung des Spielplans wird die Turnierleitung auf Konflikte hingewiesen (Schiedsrichter gehört zu einer der spielenden Mannschaften) und muss eine Entscheidung treffen. Die Entscheidung wird dokumentiert.

Entspricht dem Grundprinzip: Die Software unterstützt und informiert – sie entscheidet nie selbst.

### 3. Spielerwechsel nach Foul

Ein Spieler, der ein Foul verursacht hat, verlässt das Feld **nur für den folgenden Freiwurf der gegnerischen Mannschaft** und kehrt danach unmittelbar zurück.

- Kein Wechsel im Sinne der Regeln
- Kein Verbrauch des Wechselkontingents
- Eigener Zustand im Datenmodell: „kurzzeitig ausgesetzt", nicht „ausgewechselt"

### 4. Wurfzähler über die Halbzeitpause

Der Zähler der aufeinanderfolgenden Würfe eines Spielers **bleibt über die Pause hinweg bestehen**. Er wird ausschließlich zurückgesetzt, wenn ein anderer Spieler derselben Mannschaft wirft.

Beispiel: Spieler A wirft in Halbzeit 1 zweimal in Folge; zu Beginn von Halbzeit 2 darf er nur noch einmal werfen.

Als Turnier-Konfigurationsoption vorsehen (Default: pausenübergreifend = ja).

### 5. Eigentor in der Statistik

Ein Eigentor von Team A wird **Team B gutgeschrieben** (Tor für die gegnerische Mannschaft). Es wird keinem Spieler als Torschütze zugeordnet.

### 6. Mehrsprachigkeit

Die Benutzeroberfläche wird von Beginn an mehrsprachig ausgelegt:

- **Deutsch** (Standard)
- Englisch
- Französisch
- Italienisch

Begründung: Torball wird u. a. in Frankreich und Italien gespielt; Belgien und die Schweiz sind mehrsprachig.

Technisch bedeutet das eine i18n-Architektur im Frontend von Anfang an (Übersetzungsdateien je Sprache), nicht nachträglich.

**Abgrenzung:** Es geht ausschließlich um die Oberfläche. Vom Benutzer eingegebene Daten (Mannschaftsnamen, Freitexte) werden weiterhin in **einer** Sprache erfasst. Für mehrsprachige Zusatzinformationen siehe Teil B.2 (Dokumenten-Anhänge).

### 7. Spielzeit-Timer nach Ablauf

Die Spielzeit läuft ab, das Spiel läuft weiter, bis der Schiedsrichter pfeift. Der Schiedsrichter hat immer die Hoheit über Spiel und Geschehen.

Die Software zeigt den Ablauf an (ggf. mit Weiterzählen ins Minus) und informiert, greift aber nicht ein.

### 8. Mehrere Spielfelder und Protokollanten

- Jedes Spielfeld hat **eigene Protokollanten**
- Protokollanten können im Turnierverlauf wechseln
- Ein Wechsel während eines laufenden Spiels ist die absolute Ausnahme, muss aber möglich sein

Siehe Teil B.4 zum Ereignis „Protokollantenwechsel".

### 9. Qualifikation für Folgespiele

Die Ermittlung der qualifizierten Mannschaften für Finalspiele, Platzierungsspiele und Hauptrunden erfolgt **automatisch** aus der Tabelle.

Die Turnierleitung darf manuell übersteuern. Bei einer manuellen Änderung erscheint eine deutliche Warnung mit Bestätigungsschritt, da dies im Regelfall nicht vorkommen sollte.

### 10. Live-Veröffentlichung von Zwischenständen

Zwischenstände laufender Spiele **werden** live veröffentlicht. Bei der Anzeige erscheint ein deutlicher Hinweis, dass das Spiel noch läuft, damit der Stand nicht als Endergebnis missverstanden wird.

---

## Teil B: Neue Anforderungen aus dieser Klärungsrunde

### B.1 Globale Systemkonfiguration mit Sync-Overlay

Ein allgemeines Muster für Vorgabewerte, die sich über die Zeit ändern können (Forfait-Ergebnis, Punkte für Sieg/Unentschieden, Prüfregeln der Bundesliga u. a.).

**Funktionsweise:**

- Die zentrale Instanz führt eine Systemkonfiguration mit Vorgabewerten, die nur der Administrator pflegen kann
- Lokale Instanzen halten eine eigene Kopie dieser Werte
- Bei jeder Synchronisation werden die **Vorgabewerte** aktualisiert
- Bereits geplante oder laufende Turniere behalten die Werte, die zum Zeitpunkt der Planung gültig waren – eine Aktualisierung wirkt nie rückwirkend
- Ohne Synchronisation gelten die bei Auslieferung definierten Werte

Erfordert im Datenmodell eine eigene Konfigurationsentität mit Versionierung und Sync-Metadaten.

### B.2 Dokumenten-Anhänge je Turnier

Ein Turnier kann beliebige Dateien (PDF u. a.) als Anhang führen, z. B. Anfahrtsbeschreibung, Hotelvorschläge, Ausschreibung.

- Je Anhang: Titel, optionale Beschreibung, Datei
- Abruf über die öffentliche Turnierseite (siehe B.6)
- Ersetzt den Bedarf nach mehrsprachigen Freitextfeldern; entspricht der gängigen Praxis, solche Informationen als Dokument zu versenden

### B.3 Ereignis „Kontrolle" und das Zwei-Timer-Modell der 8-Sekunden-Regel

**Fachlicher Hintergrund:** Es gibt zwei getrennte 8-Sekunden-Fristen.

- **Timer A** – Der Ball gelangt in die Hälfte einer Mannschaft. Diese hat acht Sekunden, um den Ball unter Kontrolle zu bringen oder ins Aus zu spielen.
- **Timer B** – Der Ball ist unter Kontrolle. Ab diesem Moment hat die Mannschaft acht Sekunden Zeit für den Wurf.

**Umsetzung:**

| Taste | Ereignis | ID | Bedeutung | Wirkung |
|---|---|---|---|---|
| K | Kontrolle | K | Eine Mannschaft hat den Ball unter Kontrolle | Stoppt Timer A (sofern er läuft), startet Timer B für diese Mannschaft |

**Start von Timer A:** Automatisch nach jedem Wurf-Ereignis. Timer A ist dabei **keiner Mannschaft zugeordnet** – er ist ein generischer „Ball unkontrolliert"-Timer.

Begründung: Nach einem Wurf kann der Ball auch in die Hälfte der werfenden Mannschaft zurückrollen. Eine Mannschaft kann mehrfach hintereinander werfen, ohne dass der Gegner den Ball hatte. Das System kann die Ballposition nicht kennen; erst der Tastendruck „Kontrolle" macht deutlich, welche Mannschaft den Ball übernommen hat.

**Sonderfall:** Ist der Ball sofort unter Kontrolle, entfällt Timer A. Der Tastendruck „Kontrolle" startet dann lediglich Timer B.

**Zuordnung bei Regelverstoß:** Läuft eine der Fristen ab, zeigt die Software das an. Welche Mannschaft ein Foul erhält, ergibt sich aus dem Tastendruck des Protokollanten, nicht aus dem Timer-Zustand.

Das Ereignis „Kontrolle" wird im Protokoll geführt, auch wenn es für die Auswertung nicht relevant ist.

### B.4 Ereignis „Protokollantenwechsel"

Für den Ausnahmefall, dass ein Protokollant während eines laufenden Spiels abgelöst werden muss (z. B. aus medizinischen Gründen).

| Taste | Ereignis | ID | Ablauf |
|---|---|---|---|
| F11 | Protokollantenwechsel | HANDOVER | Taste → Eingabe des neuen Protokollantennamens → Bestätigung |

- Keine Genehmigung durch die Turnierleitung erforderlich
- Das Ereignis wird mit Zeitstempel im Protokoll festgehalten
- Der **Spielbericht** weist aus, dass mehrere Protokollanten beteiligt waren, z. B. „Protokollführung: Person A (bis 14:32), Person B (ab 14:32)"

Nachvollziehbarkeit ist damit gewährleistet.

### B.5 Vorabveröffentlichung des Spielplans

Fertige Spielpläne sollen den Mannschaften bereits vor dem Turnier zur Verfügung stehen. Setzt eine zentrale Instanz voraus; im rein lokalen Betrieb nicht verfügbar.

- Der Spielplan wird durch die Turnierleitung **explizit freigegeben**; vorher ist er nicht öffentlich
- Nach der Freigabe sind weiterhin Änderungen möglich (Reihenfolge, Feld, Startzeiten)
- Die veröffentlichte Ansicht trägt **Versionsnummer und Änderungsdatum**, damit ein ausgedruckter Plan als veraltet erkennbar ist
- Eine aktive Benachrichtigung ist zunächst nicht vorgesehen (siehe B.6, spätere Erweiterung)

### B.6 Öffentliche Turnierseite

Je Turnier gibt es einen öffentlich zugänglichen Link, der frei verteilt werden kann. Zielgruppe sind teilnehmende Mannschaften **und** Gäste.

**Inhalte:**

- Turnierdaten: Name, Datum, Startzeit, Spielort mit Anschrift und ggf. Kartenverweis
- Teilnehmende Mannschaften
- Spielplan: Zeit, Paarung, Spielfeld – **ohne Schiedsrichter**
- Dokumenten-Anhänge (siehe B.2)
- Zusätzliche Informationen aus der Turnierdefinition
- Versionsnummer und Änderungsdatum des Spielplans
- Im Turnierverlauf: Live-Stände mit Hinweis „Spiel läuft", aktuelle Tabelle
- Nach Turnierende: Abschlusstabelle

**Gliederung:** Die Inhalte werden auf **mehrere Unterseiten** verteilt (Turnierinfos / Anfahrt und Dokumente / Spielplan / Ergebnisse), jeweils einzeln durch die Turnierleitung freischaltbar.

Begründung: Bessere Lesbarkeit mit Screenreader. Nicht zu viele Informationen auf einer Seite, klare Überschriftenstruktur.

**Datenschutz:** Schiedsrichter werden auf der öffentlichen Seite grundsätzlich nicht genannt – unabhängig von der Anonymisierungseinstellung des Turniers. Diese bleibt für Spielernamen in Torschützenlisten und Protokollen zuständig.

**Spätere Erweiterung:** Registrierung per E-Mail-Adresse je Turnier, um über Aktualisierungen informiert zu werden – Spielplanänderungen und Abschlusstabelle, ausdrücklich **nicht** Spielstände. Erfordert Double-Opt-in und Abmeldemöglichkeit.

### B.7 Stammdaten für Vereine und Teams

Wiederverwendbare Stammdaten, zentral in der Cloud gepflegt.

**Verein**

- Name
- Logo (optional – nicht jedes Team hat eines, Spielgemeinschaften entstehen teils nur für eine Saison)
- Ansprechpartner und Kontaktdaten
- Bundesland

**Team**

- Gehört zu einem Verein (ein Verein kann mehrere Teams stellen, z. B. „I" und „II")
- Erbt das Logo des Vereins
- **Keine Spielerdaten** auf dieser Ebene

**Turnier-Mannschaft** (wie bisher turnierbezogen)

- Optionale Referenz auf ein Team
- Beim Anlegen aus den Stammdaten werden die Daten **kopiert**, nicht verknüpft – damit verändert eine spätere Umbenennung eines Vereins kein historisches Turnier
- Der Spielerkader wird ausschließlich hier geführt

**Verfügbarkeit:** Stammdaten liegen in der Cloud. Lokale Instanzen ohne Verbindung können nicht darauf zugreifen; dort werden Mannschaften frei erfasst. Nach einer Synchronisation stehen die Stammdaten auch lokal zur Auswahl.

Die Referenz bleibt in jedem Fall **optional** – für Freizeitturniere genügt die freie Eingabe von „Team Rot" und „Team Blau".

Gleiches Muster wie bei den Spielorten, die laut Spezifikation ebenfalls wiederverwendbar sein sollen.

**Spätere Erweiterung:** Abweichende Logos für einzelne Teams desselben Vereins.

### B.8 Synchronisation lokal erfasster Mannschaften

Wird ein Turnier lokal geplant und anschließend mit der Cloud synchronisiert, entstehen die enthaltenen Mannschaften dort als **eigenständige Einträge**. Es findet **kein Abgleich** gegen vorhandene Vereins- oder Team-Stammdaten statt – weder automatisch noch über einen Dialog.

Begründung: Ein Matching-Verfahren („Meinten Sie SG Musterstadt?") überfordert Nutzende, die nicht IT-affin sind, und verkompliziert die Synchronisationslogik erheblich. Lokal erfasste Turniere wandern als geschlossenes Paket in die Cloud.

Eine Referenz auf Team oder Verein entsteht ausschließlich, wenn beim Anlegen aus den Stammdaten ausgewählt wurde.

**Spätere Erweiterung:** Nachträgliche manuelle Zuordnung.

### B.9 Protokollierungsart und Ergebniserfassung per Token

Nicht jedes Turnier wird digital protokolliert. Wird auf Papier protokolliert, müssen die Ergebnisse dennoch erfasst werden können – etwa über ein Mobiltelefon.

**Turnier-Attribut: Protokollierungsart**

| Wert | Bedeutung |
|---|---|
| digital | Vollständige Ereignisprotokollierung durch Protokollanten |
| manuell | Protokoll auf Papier, nur Endergebnisse werden erfasst |

Ein Turnier ist immer entweder das eine oder das andere – erfahrungsgemäß gibt es keine Mischform über verschiedene Spielfelder hinweg.

Bei „manuell" entfallen Protokollantenzuweisung, Ereigniserfassung und alle darauf aufbauenden Statistiken (Torschützen, Fouls, Penaltys).

**Neue Rolle: Ergebniserfassung** (turnierbezogen, tokenbasiert)

- Die Turnierleitung erzeugt je Turnier ein Token, das als Link funktioniert und frei verteilt werden kann
- Kein Login, keine Registrierung – Zielgruppe sind Gelegenheitsnutzer
- Berechtigung ausschließlich: Endergebnisse der Spiele **dieses** Turniers eintragen und ändern
- Kein Zugriff auf Protokolldaten, Turnierkonfiguration oder andere Turniere
- Das Token ist widerrufbar und verfällt mit Turnierende

**Nachvollziehbarkeit**

- Beim ersten Aufruf des Links wird ein **Name abgefragt** und am Gerät gespeichert
- Jede Eingabe und Änderung wird mit diesem Namen und Zeitstempel festgehalten
- Es entsteht eine Änderungshistorie: wer, wann, alter und neuer Wert
- Die Turnierleitung sieht in ihrer Ansicht, welche Ergebnisse wann von wem eingetragen wurden

**Korrekturen und Abschluss**

- Ergebnisse sind über das Token frei änderbar, solange das Spiel nicht abgeschlossen ist
- Die Turnierleitung kann ein Spiel als **abgeschlossen** kennzeichnen; danach ist es über das Token nicht mehr änderbar
- Sinnvoll ist neben dem Einzelabschluss ein Sammelabschluss (Runde oder gesamtes Turnier)
- Nach dem Abschluss kann ausschließlich die Turnierleitung das Ergebnis ändern; die Tabelle wird dann neu berechnet
- Ein Zurücksetzen auf „per Token änderbar" ist nicht vorgesehen

Eine Bestätigung durch die Turnierleitung vor Einfließen in die Tabelle ist zunächst **nicht** erforderlich. Die Kontrolle ist ein organisatorisches Thema.

Ob Korrekturen künftig grundsätzlich der Turnierleitung vorbehalten sein sollten, wird nach ersten Praxiserfahrungen entschieden.

---

## Teil C: Auswirkungen auf Architektur und Datenmodell

Aus den obigen Punkten ergeben sich folgende Anforderungen, die vor der Implementierung berücksichtigt werden müssen:

| Thema | Auswirkung |
|---|---|
| Mehrsprachigkeit (A.6) | i18n-Architektur im Frontend von Beginn an, nicht nachrüsten |
| Systemkonfiguration (B.1) | Eigene Entität mit Versionierung und Sync-Metadaten |
| Dokumenten-Anhänge (B.2) | Dateiablage, Zuordnung zu Turnier, öffentlicher Abruf |
| Kontrolle-Ereignis (B.3) | Neuer Ereignistyp, Timer-Zustandsmaschine mit zwei Fristen |
| Protokollantenwechsel (B.4) | Neuer Ereignistyp, Auswertung im Spielbericht |
| Öffentliche Turnierseite (B.6) | Eigene, unauthentifizierte Ansichten mit gestufter Freigabe |
| Stammdaten (B.7) | Zwei neue Entitäten (Verein, Team), optionale Referenz aus Turnier-Mannschaft, Kopiersemantik |
| Ergebniserfassung (B.9) | Neue Rolle, Token-Verwaltung, Änderungshistorie, Abschluss-Kennzeichnung je Spiel |

---

## Teil D: Zurückgestellte Punkte

Bewusst auf spätere Versionen verschoben:

- Abweichende Logos für einzelne Teams desselben Vereins (B.7)
- Nachträgliche Zuordnung lokal erfasster Mannschaften zu Stammdaten (B.8)
- E-Mail-Benachrichtigung bei Turnieraktualisierungen (B.6)
- Einschränkung von Ergebniskorrekturen auf die Turnierleitung (B.9)

Leitgedanke für die erste Version: so einfach wie möglich, da die Nutzenden nicht zwingend IT-affin sind.

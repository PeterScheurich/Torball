# Projekt-Retrospektive: Torball-Turniere

- **Projekt:** Torball-Turniere (Version 0.9.0-beta)
- **Zeitraum:** ca. 20.07.2026 (Repository angelegt) bis Anfang September 2026 (letzte Änderungen an CLAUDE.md und package-lock.json)
- **Datum des Reviews:** 24.10.2026
- **Nächstes Projekt:** A11y-Prüfwerkzeug (`D:\Projekte\Entwicklung\A11y`)

Ziel dieses Reviews: eine Handvoll durchsetzbarer Vorgaben für das nächste
Projekt. Alles, was am Ende nicht in Abschnitt 7 landet, war interessant,
aber folgenlos.

**Lesehilfe:** Einträge mit „Befund“ hat Claude am 24.10.2026 aus dem
Repository erhoben (Dateien, Größen, Datumsangaben). Einträge mit „Peter“
stammen aus dem Review-Gespräch. Abschnitt 7 wurde von Peter am 24.10.2026
bestätigt.

---

## 1. Was gut lief

- Befund: Das Projekt ist in rund sechs Wochen bis zu einer installierbaren
  Beta mit Produktiv- und Demo-Instanz, Windows-Installer, Update-Skript,
  Datensicherung, Mail-Postfach mit KI-Klassifikation und Tutorial-Videos
  gekommen.
- Befund: Entscheidungen wurden in datierten Sitzungsprotokollen festgehalten
  (`docs/Protokolle/`, 42 Dateien). Das ist im Kern derselbe Mechanismus wie
  das Entscheidungs-Log im A11y-Projekt.
- Befund: Die Dokumentation liegt im Repository als führende Fassung und wird
  nach BookStack übertragen, nicht umgekehrt.
- Befund: Der CHANGELOG ist in nutzerverständlicher Sprache geschrieben und
  begründet Änderungen, z. B. die Passwortregeln mit Blick auf
  Screenreader-Nutzung.
- Befund: Nach dem „stummen Speichern“ entstand
  `scripts/pruefe-barrierefreiheit.mjs`: vier mechanisch prüfbare Regeln,
  Ausnahmen nur mit Begründung, eingehängt in `npm run lint`. Das ist genau
  das richtige Muster und die wichtigste Vorlage für das nächste Projekt.
- Peter: Der Wechsel von Gemini zu Claude hat sich ausgezahlt; die
  Zusammenarbeit wirkte deutlich strukturierter und klarer. (Ob das heute
  noch so ist, kann Peter nicht beurteilen, vermutet es aber.)
- Peter: Die Entwicklungsgeschwindigkeit, also wie viel in welcher Zeit
  umgesetzt wurde, war erstaunlich und beeindruckend.
- Peter: Klare Hinweise von Claude, wenn etwas nicht stimmig war oder seinen
  eigenen Aussagen widersprach. Soll so bleiben.
- Peter: Ehrliche Aussagen, besonders bei Unsicherheit. Lieber „weiß ich
  nicht“ als raten oder etwas vorschlagen, um zu gefallen.
- Peter: Der iterative Prozess. Entscheidende Punkte wurden oft vergessen
  oder anders eingeschätzt; die Erkenntnis kam häufig erst während der
  Entwicklung. Diesen Prozess will Peter im nächsten Projekt wieder so gehen.
- Peter: Das Tempo kam auch daher, dass Peter im Lauf des Projekts kaum noch
  Code-Reviews gemacht hat. Ursprünglich war geplant, dass Claude
  programmiert und Peter den Code prüft (siehe dazu Abschnitt 2,
  Zusammenarbeit, und Abschnitt 5).

## 2. Herausforderungen

### Fachlich / technisch

- Befund: Wiederkehrende Fehler, die CLAUDE.md selbst als „schon zweimal
  unabhängig aufgetreten“ bezeichnet: gedämpfte Textfarbe für Fließtext und
  fehlendes `box-sizing` bei Klassen für Links und Knöpfe. Beide stehen nur
  als Prosa-Regel in CLAUDE.md, keine wird automatisch geprüft.
- Befund: Für das Frontend gibt es keine automatisierten Tests; Tests gibt es
  nur im Backend.
- Peter: Das Datenmodell musste immer wieder angepasst werden, weil in der
  ursprünglichen Vorgabe wichtige Punkte fehlten oder nicht genau definiert
  waren.
- Peter: Vor allem das Zielbild war nicht genau genug beschrieben: Die
  Anwendung soll allein (Stand-alone), im lokalen Netzwerk und über das
  Internet laufen können – jeweils einzeln und in Kombination. Betroffen war
  vor allem die Synchronisation. Die Wahl von CouchDB/PouchDB war früh
  getroffen und war richtig; die Spezifikation dazu war nicht klar genug.
- Peter, Schlussfolgerung: Wo eine Annahme die gesamte Struktur beeinflusst,
  lieber vorher genauer definieren, wohin es gehen soll, statt von Annahmen
  auszugehen.
- Ergänzung Claude: Diese Verantwortung liegt nicht nur bei der
  Spezifikation. Eine Annahme mit Folgen für die Struktur hätte Claude als
  Frage stellen müssen, statt sie stillschweigend zu treffen.
- Peter: Die lokale Installation unter Windows ist umständlich und
  fehleranfällig – ein Problem für technisch nicht versierte Nutzer.
- Peter, heutige Sicht: Benutzerfreundlichkeit auch für solche „Module“ wie
  die Installation früher betrachten. Ob es eine bessere Lösung gegeben
  hätte, ist offen; aber Entscheidungen zu Sprache, Stack und Struktur wären
  an manchen Stellen womöglich anders ausgefallen (z. B. eine Sprache wie Go,
  die eine einzelne ausführbare Datei erzeugt).

### Methodisch

- Befund: Die Sitzungsprotokolle enden am 21.08.2026; die Arbeit lief danach
  noch rund zwei Wochen weiter. Eine bewährte Arbeitsweise ist also selbst
  eingeschlafen.
- Im Review nicht vertieft: Wo war unklar, was als Nächstes zu tun ist?
- Peter: Grundlegend verworfen oder umgebaut wurde bisher nichts.
- Peter, absehbares Risiko: Schon in der ursprünglichen Konzeption stand,
  dass auch ganz andere Turnierarten planbar sein sollen (z. B. mit
  Zwischenrunden). Das wird vermutlich einen Umbau an vielen Stellen
  erfordern, auch bei Ergebniserfassung und Tabelle.
- Befund, ergänzt im Gespräch: Eine bekannte künftige Anforderung wurde also
  im Datenmodell nicht vorgesehen. Das ist dasselbe Muster wie beim Zielbild:
  Was feststeht, aber erst später gebaut wird, fehlt in der Struktur.
- Offen – Torball (keine Ableitung, sondern Aufgabe für dieses Projekt):
  Vor dem Umbau ein allgemeines Turniermodell entwerfen (z. B. Phasen,
  Runden, Gruppen, Fortschreibungsregeln), bevor weitere Funktionen auf dem
  heutigen Modell aufsetzen.

### Zusammenarbeit

- Welche Anweisungen an Claude gut funktioniert haben: siehe Abschnitt 1
  (klare Hinweise auf Widersprüche, ehrliche Aussagen bei Unsicherheit).
- Peter: Lange Antworten mit vielen Punkten und mehreren Entscheidungen
  decken das Gesamtbild ab, aber er verliert dabei immer wieder den Faden.
  Kleinere, einfachere Schritte wären besser nachvollziehbar.
- Peter: Ob eine „falsche“ Umsetzung an einer unklaren Vorgabe lag, kann er
  nicht mehr sagen. Manchmal hatte er etwas im Kopf, hat es aber nicht oder
  nur ungenügend mitgeteilt.
- Peter: Insgesamt hat die Zusammenarbeit gut funktioniert.
- Peter: Das ursprüngliche Vorgehen (Claude programmiert, Peter prüft den
  Code) wurde im Lauf des Projekts deutlich abgeschwächt, weil Peter das
  Gefühl hatte, es selbst nie so gut und so schnell umsetzen zu können.
- Befund, ergänzt im Gespräch: Damit fiel die zweite Prüfinstanz weg, ohne
  dass etwas an ihre Stelle trat. Es gab weder einen Pre-Commit-Hook noch
  eine Pipeline (siehe Abschnitt 3), und Befehle liefen ohne Rückfrage
  (siehe Abschnitt 4). Das schnelle Tempo und die unbemerkte Drift haben
  dieselbe Ursache.
- Code übernommen, den Peter heute nicht erklären könnte: siehe Abschnitt 5
  (Architektur verstanden, Begründung nicht).

## 3. Drift-Analyse

### Prämisse „Barrierefreiheit bei allem mitdenken“

- Befund: Stand von Anfang an in CLAUDE.md. Trotzdem meldeten acht Listen ihr
  automatisches Speichern nicht an Screenreader.
- Befund: Aufgefallen am 22. bis 26.08.2026. CLAUDE.md spricht von „über
  Monate“; bei Projektstart am 20.07. waren es höchstens rund fünf Wochen.
- Befund zum Mechanismus (aus CLAUDE.md selbst): Die Regel wurde dort
  eingehalten, wo ein Verstoß sichtbar ist (Fokus, Kontrast, Rollen), und
  verfehlt, wo er unsichtbar ist. Jede neue Liste hat das Muster der vorigen
  kopiert, inklusive des Fehlers.
- Befund: Gegenmaßnahme ist das Prüfskript. Es prüft statisch per Textmuster,
  nicht die gerenderte Seite.
- Peter: Aufgefallen ist es nicht durch einen Test, sondern durch Peter
  selbst, über eine andere Frage: Manche Stellen speichern per Knopf, andere
  automatisch. Das fand (und findet) er nicht durchgängig. Aus der
  Großrechner- und Client-Server-Welt ist er gewohnt, dass ein
  „Speichern“-Knopf klar macht, wann Daten gespeichert werden. Beim
  automatischen Speichern ist oft kaum nachvollziehbar, wann eine Änderung
  wirksam wird, was auch zu Dateninkonsistenzen führen kann.
- Befund: Im Sinne der Vorlage also „durch Zufall“. Der
  Barrierefreiheitsfehler wurde über eine Konsistenzfrage gefunden, nicht
  über eine Prüfung der Barrierefreiheit.
- Offen – Torball: Die eigentliche Ursache, das uneinheitliche
  Speichermuster, besteht weiterhin. Das ist eine Entscheidung, die noch
  aussteht: einheitlich per Knopf, einheitlich automatisch oder eine klare
  Regel, wann was gilt.

### Prämisse „Code mit verständlichen Kommentaren versehen“

- Peter: Ziel war, bei einem manuellen Eingriff nicht erst die gesamte
  Dokumentation wälzen zu müssen.
- Peter: Auf seine Bitte hin wurden die Kommentare nachträglich angepasst und
  ergänzt; danach ist die Gewohnheit wieder eingeschlafen.
- Befund zum Mechanismus: dasselbe Muster wie bei der Barrierefreiheit. Die
  Vorgabe stand nur als Bitte bzw. Prosa im Raum, nichts hat sie geprüft, und
  ein fehlender Kommentar fällt erst auf, wenn man ihn braucht.
- Grenze: Ein Werkzeug kann prüfen, *dass* ein Kommentar vorhanden ist (z. B.
  an jeder exportierten Funktion), nicht, *ob* er verständlich ist.

### Die CLAUDE.md selbst

- Befund: 2.165 Zeilen, rund 174 KB. Der Abschnitt „Architektur“ allein
  umfasst rund 1.250 Zeilen, „Betrieb / Infrastruktur“ rund 480.
- Befund: Die Barrierefreiheits-Regeln stehen ab Zeile 1.401, also mitten in
  der Datei.
- Befund: Die Datei sagt in ihrer Einleitung selbst, dass kurze, konkrete
  Regeln besser funktionieren als lange Prosa.
- Befund: Widerspruch innerhalb der Datei: Der Release-Prozess (Schritt 4)
  verlangt `npm run lint --workspace=frontend`. Der Abschnitt „Git / Workflow“
  warnt ausdrücklich, dass genau dieser Aufruf die Barrierefreiheits-Prüfung
  auslässt.
- Befund: Die Datei mischt Regeln, Architekturbeschreibung, Betriebsanleitung
  und Entscheidungshistorie. Je länger sie wird, desto weniger Gewicht hat die
  einzelne Regel.

### Prämisse „Vor dem Commit: Build, Lint, Tests grün“

- Befund: Steht nur als Anweisung in CLAUDE.md. Unter `.git/hooks` liegen nur
  die mitgelieferten `.sample`-Dateien, es gibt keinen Pre-Commit-Hook und
  keine CI-Pipeline.
- Befund: Gleichzeitig gilt „nach jedem Commit sofort pushen, ohne
  nachzufragen“. Ein übersprungener Prüfschritt landet also direkt im
  entfernten Repository.

### Welche Prämisse hätte ein Werkzeug prüfen können?

- Die Pflichtprüfungen vor dem Commit (Pre-Commit-Hook).
- Die beiden „zweimal aufgetretenen“ Regeln (Textfarbe, `box-sizing`), als
  zusätzliche Einträge im Prüfskript oder als Stylelint-Regel.
- Allgemeine JSX-Barrierefreiheitsregeln: oxlint ist im Frontend bereits im
  Einsatz und hat ein eigenes jsx-a11y-Plugin, das in `.oxlintrc.json` nicht
  aktiviert ist.

## 4. Prüfung ohne Vertrauen

- Befund: `.claude/settings.json` steht auf `bypassPermissions`. CLAUDE.md
  beschreibt diesen Modus selbst als „nur in isolierten Containern/VMs
  sinnvoll, nicht hier“.
- Befund: Unter `bypassPermissions` ist die `allow`-Liste wirkungslos; es
  greift nur noch die `deny`-Liste (Force-Push, `reset --hard`, `git clean`,
  `rm -rf`). Andere löschende Befehle, z. B. `del` oder `Remove-Item` unter
  Windows, sind davon nicht erfasst.
- Befund: Die vereinbarte Triage (genau hinschauen bei Löschendem,
  Überschreibendem, erhöhten Rechten, Rechteänderungen,
  Datenbankmigrationen und Änderungen an mehreren Dateien) war mit diesem
  Modus technisch nicht umsetzbar, weil nie etwas zur Bestätigung kam.
- Peter: `bypassPermissions` war eine bewusste Entscheidung, damit Claude so
  viel wie möglich ohne Unterbrechung abarbeiten kann. Grundsätzliche
  Entscheidungen wurden trotzdem im Austausch und nach Rückfrage umgesetzt.
  Aus Peters Sicht hat das gut funktioniert.
- Peter: Kaputtgegangen ist nichts, ein Sicherheitsnetz hat nicht gefehlt.
  Vor entscheidenden Änderungen, z. B. am lokalen PC, hat Claude in der Regel
  vorher darauf hingewiesen und erklärt, was die Änderung bedeuten kann. Das
  soll so bleiben.
- Peter: Am Anfang wurde manches anders umgesetzt, als Peter es wollte. Er
  ist nicht sicher, ob er es immer klar genug gesagt hat.
- Ergänzung Claude: Dass die Rückfragen funktioniert haben, lag am
  Verhalten in den Sitzungen, nicht an einer technischen Sperre. Das trägt,
  solange es trägt; derselbe Mechanismus hat bei der Barrierefreiheit und
  den Kommentaren nachgelassen. Und: Was aus Peters Entscheidungen
  „gelernt“ wurde, steckt vor allem in der CLAUDE.md – das erklärt, warum sie
  so gewachsen ist. Korrektur (Claude, nach Prüfung der Claude-Code-Doku):
  Claude Code hat zusätzlich ein „Auto Memory“, in dem Claude selbst Notizen
  aus Korrekturen ablegt (standardmäßig an, lokal auf dem Rechner unter
  `~/.claude/projects/<projekt>/memory/`). Beide Mechanismen sind laut Doku
  Kontext, keine erzwungene Konfiguration; erzwingen lässt sich ein Verbot
  nur über einen Hook.

## 5. Lernstand

- Peter: Die Anwendung ohne Claude selbst zu bauen, wäre vermutlich nicht
  möglich; dafür hat er sich den Code zu wenig angesehen und sich bewusst
  auf Claude verlassen. Das ist für ihn in Ordnung, weil er absehbar nicht
  mehr selbst programmieren wird.
- Peter: Die groben Zusammenhänge und die Architektur versteht er. Er könnte
  aber nicht begründen, *warum* die Anwendung so aufgebaut ist und welche
  Vorteile die Umsetzung hat.
- Peter, Auslöser: Eine Mail schlug vor, die Anwendung besser in Go
  umzusetzen, u. a. wegen der einfacheren lokalen Installation. Peter sah
  sich nicht in der Lage, darauf fundiert zu antworten.
- Peter, Grundhaltung: Das Werkzeug soll dem Zweck dienen. Ob Maurer- oder
  Zimmermannshammer, ist egal; beide erfüllen den Zweck. Der Griff eines
  Schraubenziehers würde auch funktionieren, wäre aber weder effizient noch
  sinnvoll.
- Peter, größte Wissenslücke: das Zusammenspiel von Sprachen, Schichten und
  Werkzeugen – was in welcher Kombination für welchen Zweck sinnvoll ist.
  Allein würde er eher wählen, was er kennt, auch wenn es der Schraubenzieher
  wäre; wo die Grenze liegt, kann er nicht sagen.
- Peter, Lernziel: vor allem, welche Architekturansätze sinnvoll sind.
  Details nimmt er gern mit, will sie sich aber nicht mehr merken; dafür ist
  die Technik zu heterogen.
- Befund, ergänzt im Gespräch: Die Lücke liegt nicht im Code, sondern in der
  Begründung. Torball hat zwar Sitzungsprotokolle, aber keine Aufzeichnung,
  *warum* z. B. Node/TypeScript und CouchDB gewählt und welche Alternativen
  verworfen wurden. Genau diese Aufzeichnung hätte die Antwort auf die
  Go-Mail geliefert.
- Offen – Torball: Die zentralen Architekturentscheidungen nachträglich mit
  Begründung und Alternativen festhalten und dabei den Go-Vorschlag sachlich
  bewerten.

## 6. Zahlen

- Dauer: rund sechs Wochen aktive Entwicklung.
- Version: 0.9.0-beta.
- Sitzungsprotokolle: 42, alle zwischen 10.08. und 21.08.2026.
- CLAUDE.md: 2.165 Zeilen.
- Automatisch geprüfte Barrierefreiheits-Regeln: 4.
- Automatisierte Tests: nur Backend; Frontend ohne Tests.
- Bekannte offene Baustellen (von Peter bestätigt):
  - andere Turnierarten (z. B. mit Zwischenrunden) und das dafür nötige
    allgemeinere Turniermodell
  - das uneinheitliche Speichermuster (mal per Knopf, mal automatisch)
  - fehlende automatisierte Tests im Frontend
  - die umständliche Installation unter Windows
  - die fehlende Begründung der Architekturentscheidungen (inklusive
    Bewertung des Go-Vorschlags)

## 7. Ableitungen für das nächste Projekt

**Status: von Peter am 24.10.2026 bestätigt**, mit den unten vermerkten
Änderungen. Umsetzung: globale Regeln in die globale CLAUDE.md, Projektregeln
in die CLAUDE.md des A11y-Projekts.

### Automatisierte Prüfungen

- [x] Pre-Commit-Hook führt Build, Lint (inklusive Barrierefreiheits-Prüfung)
  und Tests aus. Ein Commit mit roter Prüfung ist nicht möglich. Für das
  A11y-Projekt von Anfang an, für Torball nachrüstbar.
- [x] Linter mit Barrierefreiheitsregeln von Anfang an aktiv (für Torball:
  jsx-a11y-Plugin in oxlint einschalten).
- [x] Geändert (Peter): Statt Kommentarpflicht an jeder exportierten
  Funktion genügt ein Kommentar am Anfang jeder Datei, der sagt, wozu sie da
  ist. Das vermeidet Füllkommentare und Kommentar-„Leichen“. Wird
  automatisch geprüft.
- [x] Jede Regel, die zweimal verletzt wurde, wird zu einer automatischen
  Prüfung oder ausdrücklich als „nicht automatisierbar“ markiert.
- [x] Prüfung der gerenderten Seiten (axe-core mit Playwright) für die
  wichtigsten Seiten.
- [x] Sobald das Repository auf Gitea liegt: dieselben Prüfungen als
  Pipeline.
- [x] Grundsatz: Wo kein menschliches Code-Review stattfindet, übernimmt
  eine automatische Prüfung diese Rolle. Ein Schritt ohne beides ist nicht
  erlaubt.

### Einträge für die Projekt-CLAUDE.md

- [x] Die CLAUDE.md enthält nur Regeln und Verweise. Architektur, Betrieb
  und Historie stehen in `docs/` und werden von dort verlinkt.
- [x] Geändert (Peter): Eine Obergrenze für die Länge gibt es, die Zahl wird
  nach Bedarf festgelegt. Durch den vorigen Punkt soll die Datei ohnehin
  schlank bleiben. Nachtrag (Claude): Die Claude-Code-Dokumentation empfiehlt
  unter 200 Zeilen je CLAUDE.md, weil längere Dateien mehr Kontext belegen
  und schlechter befolgt werden. Peter: Dann gilt 200 Zeilen als Grenze.
- [x] Prämissen sind priorisiert, die wichtigsten stehen zuerst,
  Barrierefreiheit ganz oben. Ergänzt (Peter): Widersprechen sich Prämissen,
  wird der Widerspruch geklärt, nicht stillschweigend aufgelöst.
- [x] „Single Version of the Truth“ (Peter): Jede Anweisung und jede
  Information steht nur an einer Stelle; andere Stellen verweisen darauf.

### Einträge für die globale CLAUDE.md

Peter: Diese Regeln sollen projektübergreifend gelten, damit sie nicht in
jedem Projekt neu geklärt werden müssen.

- [x] Zu Sitzungsbeginn `docs/status.md` und `docs/decisions/` lesen.
- [x] Annahmen, die Datenmodell oder Struktur betreffen, werden nicht
  stillschweigend getroffen, sondern als Frage gestellt.
- [x] Vor Änderungen außerhalb des Projektordners (z. B. am lokalen PC,
  Systemeinstellungen, Installationen) erklärt Claude, was die Änderung
  bewirkt und was schiefgehen kann, und fragt nach.
- [x] Ist ein Wunsch mehrdeutig, gibt Claude vor der Umsetzung in ein, zwei
  Sätzen wieder, wie er ihn verstanden hat.
- [x] Neu (Peter): Kleine Schritte im Gespräch. Kurze Antworten, höchstens
  eine Entscheidung oder Frage pro Antwort. Das Gesamtbild steht in den
  Projektdateien, nicht im Chat.
- [x] Widerspricht ein Vorschlag einer festgehaltenen Entscheidung, wird das
  ausdrücklich benannt; dann wird bewusst entschieden.
- [x] Unsichtbare Barrieren (fehlende Ansagen, Fokusverlust,
  Hintergrundaktionen ohne Rückmeldung) werden bei jeder Oberflächenänderung
  aktiv geprüft, nicht nur sichtbare.

### Standard-Anforderungen für Peters Anwendungen (neu, von Peter)

Gelten in jedem Projekt, sofern das Projekt nichts anderes festlegt. Gehören
in die globale CLAUDE.md.

- [x] Mehrsprachigkeit von Anfang an: Deutsch als Standard, Englisch als
  zweite Sprache. Alle Texte der Oberfläche liegen von Beginn an in
  Sprachdateien, nicht im Code.
- [x] Option für Einfache und/oder Leichte Sprache vorsehen, umgesetzt als
  eigene „Sprache“ (eigene Sprachdatei). Ob sie in einem Projekt sinnvoll
  ist, wird je Projekt entschieden.
- [x] Entwicklung und Beschreibung (Dokumentation, Kommentare,
  Entscheidungen) zunächst auf Deutsch.
- [x] Eine programminterne Hilfe für die Nutzenden ist schon während der
  Entwicklung verfügbar und wächst mit jeder Funktion mit.
- [x] Die Oberfläche ist anpassbar (Farben, Hell/Dunkel, Schriftgröße
  usw.) – im Sinne der Barrierefreiheit.

### Änderungen am Arbeitsablauf

- [x] Peter entscheidet: Ununterbrochenes Arbeiten (`bypassPermissions`)
  bleibt erlaubt. (Claudes ursprünglicher Vorschlag, auf einen Modus mit
  Rückfrage zu wechseln, ist damit verworfen.)
- [x] Ausgleich dafür: Die `deny`-Liste deckt auch Windows-Befehle zum
  Löschen ab (z. B. `del`, `Remove-Item`), und die Pflichtprüfungen laufen
  über den Pre-Commit-Hook statt über Aufmerksamkeit.
- [x] Statt Sitzungsprotokollen, die nach einiger Zeit einschlafen, kurze
  Entscheidungsdateien plus eine `status.md`, die bei jedem Sitzungsende
  aktualisiert wird.
- [x] Geändert (Peter): Barrierefreiheit wird direkt bei der Umsetzung
  geprüft (Tastatur, Ansagen), um möglichst viel möglichst früh
  glattzuziehen. Vor jedem Release zusätzlich ein vollständiger Durchgang mit
  einem Screenreader (NVDA). Lieber einmal zu viel prüfen.
- [x] Vor Architektur und Datenmodell wird das Zielbild der Betriebsformen
  ausdrücklich festgelegt – einschließlich der Kombinationen.
- [x] Bekannte künftige Anforderungen werden im Datenmodell als
  Erweiterungspunkt vorgesehen, auch wenn sie erst später gebaut werden.
- [x] Grundlegende Bedienmuster (z. B. Speichern per Knopf oder automatisch,
  Löschen mit Rückfrage, Rückmeldungen) werden als Entscheidung festgelegt,
  bevor das erste Formular entsteht – und gelten dann überall.
- [x] Installation und Verteilung für die tatsächliche Zielgruppe sind ein
  frühes Kriterium bei der Wahl von Sprache und Stack.
- [x] Der iterative Prozess bleibt: kleine Schritte, Zwischenstände
  anschauen, Erkenntnisse sofort als Entscheidung festhalten.
- [x] Statt vollständiger Code-Reviews gezielte Erklärungen nach jedem
  größeren Schritt, mit Schwerpunkt auf Architektur und Zusammenspiel.
- [x] Jede Architekturentscheidung wird mit Begründung und verworfenen
  Alternativen festgehalten, so dass Peter sie gegenüber Dritten vertreten
  kann (Gegenprobe: die „Warum nicht X?“-Mail).
- [x] Bei Entscheidungen über Sprache, Stack und Werkzeuge stellt Claude
  mindestens zwei ernsthafte Alternativen gegenüber („vertraut oder
  passend?“).

### Definition of Done für das nächste Projekt

- [x] Alle automatischen Prüfungen grün, erzwungen durch den Hook.
- [x] Jede Datei hat einen Kommentar am Anfang, der sagt, wozu sie da ist.
- [x] Bei Oberflächenänderungen: Barrierefreiheit direkt geprüft (siehe
  Arbeitsablauf); vor einem Release zusätzlich der Screenreader-Durchgang.
- [x] Neue Texte der Oberfläche liegen in den Sprachdateien; die
  programminterne Hilfe ist ergänzt.
- [x] `status.md` aktualisiert; neue Entscheidungen als Datei festgehalten.

### Offene Aufgaben für Torball (aus diesem Review, keine Ableitungen)

- [ ] Speichermuster vereinheitlichen.
- [ ] Allgemeines Turniermodell entwerfen, bevor andere Turnierarten gebaut
  werden.
- [ ] Architekturentscheidungen nachträglich mit Begründung festhalten,
  Go-Vorschlag sachlich bewerten.
- [ ] Pre-Commit-Hook nachrüsten, jsx-a11y in oxlint einschalten,
  Widerspruch im Release-Prozess (Lint-Aufruf) beheben.
- [ ] CLAUDE.md nach den Regeln oben entzerren.

---

## Anhang: Fragen, die am Anfang zu stellen sind

- Welche Prämissen sind unsichtbar, also auf dem Bildschirm nicht zu
  erkennen, wenn sie verletzt werden?
- Welche Prämisse wird von welchem Werkzeug geprüft, und welche bleibt bei
  der Aufmerksamkeit?
- Wo ist der Wiedereinstieg nach einer Pause?
- In welchen Betriebsformen soll die Anwendung laufen, und welche davon in
  Kombination?
- Welche Anforderungen stehen schon fest, werden aber erst später gebaut –
  und wo braucht das Datenmodell dafür heute schon einen Erweiterungspunkt?
- Wer installiert die Anwendung, und was kann diese Person technisch?
- Mit welchem Berechtigungsmodus arbeitet Claude Code, und greift die
  vereinbarte Triage damit tatsächlich?

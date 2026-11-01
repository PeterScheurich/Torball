# Changelog

Nennenswerte Änderungen an Torball-Turniere, angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Einträge in einfachen, für
Anwender:innen verständlichen Worten – kein Rohauszug aus der Git-Historie. Ablauf für einen
neuen Versionseintrag: siehe Abschnitt „Release-Prozess" in `CLAUDE.md`.

## [Unveröffentlicht]

- **Linux-Installer erprobt und verbessert.** Er wurde auf einem Debian 13 und einem Ubuntu 26.04 durchgespielt (Installation,
  Neustart, Aktualisieren, Deinstallieren, Firewall). Dabei behoben: Der Deinstaller ließ eine Paketquelle von Node.js zurück, die
  danach bei jedem `apt update` eine Warnung auslöste; der Installer legt keine Compiler-Pakete mehr an (rund 250 MB weniger).
  Auf einem Ubuntu-Desktop wird die Schreibtisch-Verknüpfung jetzt gleich als startbar markiert; der Start per Klick bis zur
  Einrichtung des ersten Benutzers wurde geprüft. Der Installer prüft jetzt gleich zu Beginn, ob das System 64 Bit hat (CouchDB gibt es nicht für 32 Bit, etwa das ältere
  Raspberry Pi OS) und meldet es verständlich. Noch nicht erprobt sind Linux Mint und andere Firewalls.
- **Turniermodi kopieren und anpassen.** Unter Admin → Turniermodi lässt sich jede Vorlage mit „Kopie anlegen“ als
  eigene Vorlage kopieren. Die Kopie hat einen eigenen Namen und eigene Standardwerte (mögliche Endrunden, Standard-
  Endrunde, Spiel um Platz 3, Platzierungsspiele, Hin- und Rückspiel) und steht dann bei jedem Turnier zur Auswahl. Die
  Zahl der Gruppen bleibt die der Quelle. Die mitgelieferten Vorlagen bleiben schreibgeschützt. Ändert oder löscht man
  eine Vorlage, bleiben laufende Turniere unberührt: Jedes Turnier trägt eine Kopie seines Ablaufs.
- **Endrunde automatisch erzeugen.** In der Übersicht gibt es unter dem Turniermodus den Haken „Spiele der Endrunde
  automatisch erzeugen, sobald die Paarung feststeht“. Ist er gesetzt, entstehen die Spiele von allein, sobald das
  letzte nötige Ergebnis abgeschlossen ist – auch die jeweils nächste Stufe (Halbfinale, dann Finale und Spiel um
  Platz 3). Bei einem Unentschieden oder einem Gleichstand in der Tabelle wartet die Automatik, bis die
  Turnierleitung entschieden hat. Halle und Startzeit lassen sich vorher im „Weiteren Ablauf“ einstellen. Ohne den
  Haken bleibt alles wie bisher (Knopf im Reiter „Spielplan“). Der Haken lässt sich auch nach dem Beginn der
  Endrunde noch umschalten.

- **Spaltenüberschrift „Nr.“ statt „Spiel“** in der Ergebniserfassung, der öffentlichen Spielplan-Tabelle und der
  Spielliste des Protokollanten – die Spalte mit der Spielnummer wird dadurch schmaler.
- **Neue Turniere hatten keine Pause zwischen den Spielen.** Wer die Standardregeln vor Einführung dieses Feldes
  gespeichert hatte, bekam bei jedem neuen Turnier „keine Pause“ – die Spiele lagen nur 12 statt 25 Minuten auseinander,
  ohne dass es jemand bemerkt hätte. Fehlende Regelwerte kommen jetzt aus den Standardwerten. Bereits angelegte
  Turniere behalten ihre Werte: dort bitte unter „Regeln“ die Gesamtzeit prüfen.

- **Strengere Eingabeprüfung.** Tore müssen ganze Zahlen sein (kein 1,5, höchstens 999). Ein Spiel lässt sich nur in
  eine Halle legen, die das Turnier kennt. Spielzeit, Halbzeiten, Pausen und Punkte werden auf sinnvolle Werte geprüft
  (vorher ließen sich „−5 Minuten“ oder „viele Punkte“ speichern). Mannschaftsnamen sind auf 200 Zeichen begrenzt.

- **Eine Mannschaft, die schon gespielt hat, lässt sich nicht mehr entfernen.** Sonst blieben Spiele ohne Gegner stehen
  und die Tabelle der anderen stimmte nicht mehr. Wer nicht mehr antritt, wird über „n. a.“ (Nichtantreten) gewertet.

- **Halle eines Vorrundenspiels ändern, Endrunde mit einem Klick in eine Halle legen.** Im Spielplan hat jedes
  Spiel bei mehreren Hallen eine Spalte „Halle“. Spielt in der gewählten Halle zur selben Zeit schon ein anderes
  Spiel, tauschen die beiden die Halle (mit „Rückgängig“). Die Spielnummern folgen der Position, also tauschen dabei
  auch die Nummern. Im „Weiteren Ablauf“ legt „Viertelfinale bis Finale nacheinander in [Halle] spielen“ alle
  Spiele der Endrunde in eine Halle – die Platzierungsspiele bleiben automatisch.

- **Halle und Startzeit der Endrunde selbst wählen.** Im „Weiteren Ablauf“ (Reiter „Spielplan“) lässt sich für
  jedes Spiel die Halle auswählen und die Startzeit eintragen. Legt man mehrere Spiele in dieselbe Halle, laufen sie
  hintereinander – zum Beispiel beide Halbfinale, dann Spiel um Platz 3 und Finale in Halle A. Abhängige Spiele rücken
  mit; „Halle und Zeit automatisch“ stellt die Berechnung wieder her. Bereits erzeugte Spiele ändert man direkt am
  Spiel (die Auswahl dort funktioniert genauso). Das frühere Feld „Verschieben um (Min.)“ ist dafür entfallen.

- **Regeln eines Turniers speichern jetzt von selbst.** Beim Verlassen eines Feldes im Reiter „Regeln“ wird
  gespeichert und angesagt („Regeln gespeichert.“); den Knopf „Regeln speichern“ gibt es dort nicht mehr. Eine
  geänderte, aber nicht gespeicherte Spielzeit blieb sonst unbemerkt. Die Standardregeln (Admin) behalten den
  Speichern-Knopf, weil jede Speicherung dort eine neue Version anlegt.
- **Spielplan neu erzeugen übernimmt jetzt geänderte Zeiten.** Wurde die Spielzeit oder die Gesamtzeit pro Spiel
  geändert und der Spielplan mit denselben Paarungen neu erzeugt, blieb der alte Plan mit den alten Zeiten stehen
  (und die Endrunde rechnete trotzdem mit den neuen). Jetzt zählen die Startzeiten als Änderung.
- **Schmalere Spalte „Gruppe“ im Spielplan** – die Zelle nennt nur noch den Wert („A“) statt „Gruppe A“.

- **Eine Spielnummer über das ganze Turnier.** Bisher zählte jede Halle für sich, sodass dieselbe Nummer zweimal
  vorkam. Jetzt sind die Spiele über das gesamte Turnier fortlaufend nummeriert (erst nach Anpfiffzeit, bei gleicher
  Zeit Halle A vor Halle B) – im Spielplan, bei den Ergebnissen, im Protokoll, auf der Schiedsrichter-Anzeige, auf der
  öffentlichen Seite und in den Ausdrucken. Die Gruppe (bzw. der Name der Endrunden-Runde, z. B. „Halbfinale 1“)
  steht dafür in einer eigenen Spalte neben der Nummer. Im „Weiteren Ablauf“ zählen die noch nicht erzeugten Spiele
  vorläufig hinter der Vorrunde weiter.

- **Spielmodus und Turniermodus sind jetzt eine Auswahl.** Bisher gab es zwei Felder, die sich überschnitten
  („Spielmodus“ einfach/doppelt und „Turniermodus“). Jetzt wählst du den Turniermodus und dazu gleich, ob die
  Vorrunde einfach oder als Hin- und Rückspiel gespielt wird; bei zwei Gruppen gilt das in jeder Gruppe, die
  Endrunde wird immer einfach gespielt. Gespeicherte Turniere bleiben unverändert.

- **Verein schon beim Einladen wählen, Land beim Verein.** Beim Einladen einer Person kann die Administration
  jetzt gleich den Verein auswählen (oder „keiner“ – nicht jede Person gehört zu einem Verein). Ein Manager lädt
  weiterhin für seinen eigenen Verein ein; das Formular zeigt ihm, welcher das ist. Außerdem hat jeder Verein
  jetzt ein Feld „Land“: Bei einem internationalen Turnier wird es als Land der Mannschaft vorgeschlagen (bei
  einem nationalen Turnier weiter das Bundesland), und die Eingabe schlägt Länder vor. Welche das sind, pflegt die Administration unter „Admin → Länder“ (zu
  Beginn: Deutschland, Frankreich, Belgien, Schweiz, Österreich, Italien); ein anderes Land bleibt von Hand
  eintragbar.

- **Neu: Turniermodi mit Gruppen, Endrunde und Platzierungsspielen.** Neben „Jeder gegen Jeden“ gibt es jetzt
  Turniere mit zwei Gruppen und einer Endrunde mit 2, 4, 6 oder 8 Mannschaften (Halbfinale, Finale, Spiel um Platz 3,
  Platzierungsspiele, auch als Kreuzvergleich mit Viertelfinale). Die Gruppen dürfen unterschiedlich groß sein. Im
  Reiter „Spielplan“ steht unter „Weiterer Ablauf“ schon bei der Planung, welches Spiel wann und wo stattfindet – mit
  Platzhaltern wie „Sieger Halbfinale 1“ – und das auch auf der öffentlichen Seite. Die Spiele der Endrunde werden
  erzeugt, sobald die Mannschaften feststehen; bei Gleichstand und Unentschieden entscheidet die Turnierleitung.
  Tabellen gibt es je Gruppe. Die Vorlagen sieht die Administration unter „Admin → Turniermodi“ (eigene Vorlagen
  folgen).

- **Sicherheit: Windows-Freigabe nur noch fürs eigene Netz.** Die Firewall-Regel der lokalen Windows-Installation
  galt bisher für jede Adresse – sie beschränkt sich jetzt wirklich auf das eigene Netzwerk. Wer „Setup.cmd“ erneut
  ausführt, bekommt die engere Regel. Außerdem weisen Installer und Netzwerk-Anleitung deutlicher darauf hin, dass
  die Verbindung im Netz unverschlüsselt ist und nur in einem passwortgeschützten eigenen WLAN genutzt werden sollte.

- **Sicherheit: Die Ersteinrichtung kann nicht mehr zwei Administratoren erzeugen.** Wurde sie auf einer frischen
  Installation von zwei Seiten gleichzeitig abgeschickt, entstanden bisher zwei Admin-Konten. Jetzt gelingt genau eine
  Anlage, die andere wird abgewiesen.

- **Sicherheit: sensible Aktionen am eigenen Konto verlangen eine erneute Bestätigung.** Wer die
  Zwei-Faktor-Anmeldung abschalten will, gibt jetzt Passwort **und** einen aktuellen Code ein (bisher nur das
  Passwort); bei aktiver 2FA lässt sich der Schlüssel nicht mehr einfach ersetzen. Einen Kopplungscode für eine
  lokale Installation gibt es nur noch nach erneuter Passwort-Eingabe. So kann eine offen gelassene Sitzung nicht
  genutzt werden, um den zweiten Faktor auszutauschen oder eine Installation dauerhaft zu koppeln.

- **Neu: lokale Installation auch für Linux (Debian, Ubuntu und davon abgeleitete Systeme).** `bash Setup-Linux.sh`
  im entpackten Quellcode-Ordner richtet alles ein – Node.js, die Datenbank, die App als Hintergrunddienst, auf
  Wunsch die Freigabe für andere Geräte im eigenen Netz (nur dort, nicht im Internet) und einen Eintrag im
  Anwendungsmenü. Wie beim Windows-Installer wird jede Änderung am Rechner vorher erklärt und bestätigt. Dazu gibt es
  Befehle zum Aktualisieren und Deinstallieren (siehe `INSTALLATION-LINUX.md`). **Hinweis:** Diese Variante ist neu
  und noch nicht auf echten Systemen erprobt.

- **Sicherheit: Zwei-Faktor-Code lässt sich nicht mehr erraten oder wiederverwenden.** Bisher zählte die
  Anmeldung nur falsche Passwörter – wer das Passwort kannte, konnte den Bestätigungscode beliebig oft
  ausprobieren. Jetzt zählen falsche Codes genauso wie falsche Passwörter und führen nach fünf Fehlversuchen zur
  gleichen kurzen Wartezeit (sie endet von selbst). Ein Code wird außerdem nur ein einziges Mal angenommen, und
  gleichzeitig gesendete Versuche werden alle mitgezählt.

- **Schiedsrichter-Anzeige am Feld ist einstellbar.** Spielstand und Fouls sind immer zu sehen. Restzeit,
  Auszeiten, Wurfzähler, die 8-Sekunden-Anzeige sowie Strafwurf und Penalty lassen sich je Turnier einzeln
  ausblenden (Reiter „Übersicht“, bei digitaler Protokollierung). Die Änderung gilt auch während des Turniers und
  erscheint nach spätestens 15 Sekunden auf der Anzeige. Ohne Einstellung bleibt alles wie bisher sichtbar.

- **Datenschutz: Manager sehen nicht mehr alle Konten.** Ein Manager sieht in der Benutzerverwaltung nur noch
  sein eigenes Konto, die Personen, die er selbst eingeladen hat, und die Konten seines Vereins – ohne
  Telefonnummer, Adresse und ähnliche Angaben. Administratoren sehen weiterhin alle. Neu ist die Spalte „Verein“:
  Die Vereinszugehörigkeit eines Kontos vergibt ein Administrator, die Person selbst kann sie nicht ändern.
  Wer als Manager jemanden einlädt, bringt ihn damit automatisch in den eigenen Verein. **Bitte nach dem
  Aktualisieren** den Managern einen Verein zuordnen – bis dahin sehen sie nur ihr eigenes Konto und ihre
  eigenen Einladungen. Ein Turnier für jemanden aus einem anderen Verein freigeben geht weiterhin über die
  E-Mail-Adresse.

- **Neu: Turnierart „National“ oder „International“.** Beim Anlegen (und später in der Übersicht) wählbar.
  Bei einem internationalen Turnier, etwa nach IBSA-Regeln, gilt „Nichtantreten“ als 5:0 statt 3:0, und bei den
  Mannschaften steht „Land“ statt „Bundesland“ (ohne die Liste deutscher Bundesländer). Beim Wechsel der Art
  passt sich das Ergebnis bei Nichtantreten nur an, wenn es noch dem bisherigen Standard entspricht – von Hand
  Geändertes bleibt. Weitere Unterschiede lassen sich später ergänzen.

- **Sicherheit: Durchgang nach den OWASP Top 10.** Auf Anregung eines Testers wurde die Anwendung
  Punkt für Punkt gegen die zehn häufigsten Schwachstellenarten geprüft. Behoben wurden unter
  anderem: Dokumente werden beim Aufruf über eine Adresse jetzt auf ihren Typ geprüft; die
  Zugangscodes eines Turniers sind nicht mehr in Antworten enthalten; ein Turnier-Abgleich einer
  gekoppelten lokalen Installation kann kein Turnier einer anderen Veranstaltung mehr überschreiben;
  Zugangslinks tauchen nicht mehr im Server-Protokoll und im Diagnose-Bericht auf; bei Serverfehlern
  werden keine internen Angaben mehr angezeigt. Außerdem: Neue Turnier-Codes brauchen mindestens
  6 Zeichen, und wer einen Code ändert oder entfernt, meldet damit angemeldete Geräte ab. Ein
  abgeschlossenes Turnier lässt sich auch über die Mannschafts-Reihenfolge und die
  Schiedsrichter-Zuordnung nicht mehr verändern. Auf der öffentlichen Seite erscheinen Ergebnisse im
  Spielplan nur noch, wenn die Ergebnisse freigegeben sind. Offene, kleinere Punkte stehen als Karten
  im Entwicklungs-Board.

- **Freigabe: Person über die E-Mail-Adresse finden, keine Liste aller Benutzer mehr.** Wer ein Turnier für jemanden freigibt, sah bisher eine Auswahl mit Namen und E-Mail-Adressen aller Konten – und der dahinterliegende Abruf lieferte jeder Person mit der Rolle „Manager“ sogar das vollständige Profil aller Benutzer (auch Telefon, Adresse, Verein). Das war aus Datenschutzsicht nicht vertretbar, ein Tester hat darauf hingewiesen. Jetzt gibt man die E-Mail-Adresse der Person ein und sieht nur ihren Namen, zur Bestätigung. Eine Liste und eine Teilsuche gibt es bewusst nicht; wer die Adresse nicht kennt, findet niemanden. Dabei erklärt der Dialog auch, dass die Rolle „Protokollant“ nur über die Codes vergeben wird. Die Benutzerverwaltung für Administratoren und Manager ist davon noch nicht betroffen – dort sehen Manager weiterhin alle Konten; das ist als nächster Schritt vorgemerkt.

- **Regeln: „Gesamtzeit pro Spiel“ statt „Pause zwischen Spielen“.** Turnierleitende denken in „ein Spiel dauert im Plan 25 Minuten“, nicht in „10 Minuten Pause“. Das Feld zeigt jetzt die Gesamtzeit und rechnet den Puffer daraus; die Aufschlüsselung (Spielzeit und Halbzeitpause, Puffer) steht direkt darunter. Neuer Standard: 25 Minuten statt bisher 22. Bestehende Turniere und gespeicherte Standardregeln ändern sich nicht.

- **Neue Standardwerte und Vorbelegungen.** „Verlängerung bei Unentschieden“ ist bei neuen Turnieren nicht mehr angekreuzt (sie ist nur bei Ausscheidungsspielen üblich, nicht bei „Jeder gegen jeden“). Die Startzeit eines neuen Turniers ist mit 09:00 Uhr vorbelegt.

- **Schiedsrichter: nur Vereine aus dem Turnier zur Auswahl.** Statt aller Vereine der Stammdaten werden nur die der angemeldeten Mannschaften angeboten – nur dafür wird der Verein gebraucht (damit niemand die eigene Mannschaft pfeift). Ein bereits gesetzter Verein bleibt sichtbar.

- **Mannschaften: Hinweis zum Verein.** Dass Mannschaften desselben Vereins im Spielplan zuerst gegeneinander spielen, gab es schon – es hängt aber am Verein, der nur über die Stammdaten-Auswahl in die Mannschaft kommt. Das steht jetzt beim Auswahlfeld.

- **Benachrichtigung bei neuen Konten: klarer, wo sie hingeht.** Die Adresse, die eine Mail
  bekommt, sobald sich jemand registriert oder eine Einladung annimmt, stand bisher unter der
  Überschrift „E-Mail-Versand (SMTP)“ – dort gelesen, wirkte sie wie ein Detail des Zugangs, und
  die naheliegende Annahme war, die Benachrichtigung gehe ohnehin an den dort eingetragenen
  Absender. Sie hat jetzt einen eigenen Abschnitt, der ausdrücklich sagt, dass sie eigens
  eingetragen werden muss. Ist das Feld leer, steht das jetzt auch da („Zurzeit wird niemand
  benachrichtigt.“) statt nur „Optional“. Ebenfalls ergänzt: dass eine bloße Anmeldung keine
  Benachrichtigung auslöst, auch nicht die erste eines Kontos. Im Server-Protokoll wird jetzt
  vermerkt, wenn eine Benachrichtigung mangels Adresse oder Mail-Einrichtung unterbleibt – vorher
  war das nicht nachvollziehbar.

- **Passwortregeln: Länge statt Sonderzeichen.** Ein Passwort muss jetzt mindestens 12 Zeichen
  haben – Großbuchstaben, Ziffern und Sonderzeichen sind nicht mehr vorgeschrieben. Mehrere Wörter
  hintereinander („halle-muenchen-dienstag“) sind damit die einfachste und zugleich sicherste Wahl.
  Zwei Gründe: Solche Vorgaben führen erfahrungsgemäß zu vorhersehbaren Passwörtern wie
  „Sommer26!“, ohne die Sicherheit zu erhöhen – und Sonderzeichen sind mit einem Screenreader
  mühsam einzugeben und zu kontrollieren, was für diese Anwendung besonders zählt. Wer bisher ein
  langes Passwort ganz ohne Sonderzeichen nutzen wollte, konnte sich schlicht nicht registrieren;
  das geht jetzt. Statt der alten Vorgaben werden triviale Passwörter abgewiesen: sehr häufige
  Zeichenfolgen sowie solche, die den eigenen Namen oder die E-Mail-Adresse enthalten. Bestehende
  Passwörter bleiben gültig.

- **Schiedsrichter-Anzeige auf einem zweiten Bildschirm.** Am Feld kann jetzt eine eigene Anzeige
  laufen, die dem Schiedsrichter Spielstand, Restzeit, die 8-Sekunden-Frist, Fouls und Auszeiten
  groß und aus Entfernung lesbar zeigt. Entscheidend: Die Seiten der Mannschaften sind vertauscht –
  der Schiedsrichter steht dem Protokollanten gegenüber, für ihn liegt links, was für den
  Protokollanten rechts liegt (die Schrift bleibt normal). Beim Seitenwechsel zur Halbzeit tauscht
  die Anzeige automatisch mit. Geöffnet wird sie über einen Knopf auf der Protokollseite; sie wird
  nicht bedient und ändert nie Daten.
- **Die Anzeige gehört zum Feld, nicht zu einem Spiel.** Nach dem Abpfiff bleibt sie offen und zeigt
  das letzte Ergebnis und die nächste Begegnung mit Anstoßzeit, bis das nächste Spiel beginnt – sie
  muss also zwischen zwei Spielen nicht umgestellt werden.
- **Hell und dunkel getrennt einstellbar für diese eine Anzeige.** Über die Lesbarkeit am Spielort
  entscheidet die Beleuchtung in der Halle, nicht die persönliche Einstellung – deshalb hat die
  Anzeige einen eigenen Umschalter und folgt nicht dem übrigen Erscheinungsbild. Die Wahl bleibt auf
  dem Rechner gespeichert; der Bildschirm schaltet sich während des Spiels nicht ab.

- **Digitale Protokollierung: Strafwurf und Penalty sind jetzt zwei verschiedene Ereignisse.**
  Bisher gab es nur eines – auf dem Knopf stand „Strafwurf", in der Ereignisliste „Penalty", und
  gemeint war beides Mal das Penalty nach dem dritten Foul. Jetzt gilt die deutsche Handhabung:
  Ein einzelnes Foul zieht einen **Strafwurf** nach sich (neue Taste `S`), das dritte Foul einer
  Mannschaft ein **Penalty** (Taste `P` wie bisher). Gebucht wird bei beiden die Mannschaft, die
  gefoult hat – geworfen wird von der Gegenseite. Nur das Penalty setzt den Foulzähler zurück.
- **Die 8-Sekunden-Anzeige läuft bei Strafwurf und Penalty mit, obwohl die Spieluhr steht.**
  Während beider ruht die Spielzeit, die 8-Sekunden-Regel gilt aber trotzdem – bisher zeigte die
  Anzeige dort nur einen Strich. Die Frist beginnt sofort mit dem Pfiff, weil der Werfer den Ball
  direkt bekommt: ein „K" für Kontrolle ist hier nicht nötig.

- **Sicherung des gesamten Datenbestands:** Unter „Admin → Systemeinstellungen" lässt sich jetzt
  eine Sicherungsdatei herunterladen, die alles enthält – Turniere, Mannschaften, Spiele,
  Protokolle, Stammdaten, Benutzerkonten und Einstellungen. Gedacht als Sicherheitsnetz vor einem
  Turnier: Fällt der Rechner am Spieltag aus, war bisher alles verloren. Die Datei gehört auf einen
  USB-Stick oder einen anderen Rechner – sie enthält auch Zugangsdaten. Zurückspielen geschieht
  bewusst nur über die Konsole, damit ein laufender Turnierbestand nicht versehentlich
  überschrieben wird.
- **Digitale Protokollierung: Nichts geht mehr verloren, wenn kurz das Netz weg ist.** Bricht die
  Verbindung während der Erfassung ab, werden die Ereignisse jetzt gemerkt und automatisch
  nachgesendet, sobald sie wieder da ist – vorher waren sie schlicht weg, und beim Protokollieren
  fällt genau das nicht auf. Der Spielstand bleibt währenddessen korrekt, eine Anzeige nennt die
  Zahl der noch nicht gespeicherten Ereignisse, und das Protokoll lässt sich erst abschließen, wenn
  alles gespeichert ist. Auch ein Neuladen der Seite geht dabei nicht verloren.
- **Schutz vor dem falschen Spielprotokoll:** Wird ein Protokoll geöffnet, das bereits läuft und
  nicht von diesem Gerät begonnen wurde, erscheint zuerst eine Zwischenseite mit den Angaben zum
  Spiel (Begegnung, Feld, geplanter Beginn) und der Frage, ob das wirklich das richtige Spiel ist.
  Gerade bei zwei Feldern ist ein versehentlich geöffnetes falsches Spiel der häufigste Fehlgriff.
  Zusätzlich warnt die Erfassung, wenn währenddessen ein zweites Gerät mitschreibt.
- **Automatisch gespeicherte Felder melden das jetzt hörbar.** Der Großteil der Anwendung speichert
  beim Verlassen eines Feldes, ganz ohne Speichern-Knopf – gemeldet wurde das bisher nur in der
  Ergebniserfassung, und auch dort nicht für Screenreader. Vereine, Teams, Mannschaften, Kader,
  Schiedsrichter, Spielplan und die Turnier-Übersicht speicherten stillschweigend. Jetzt erscheint
  überall ein „✓ gespeichert", das auch vorgelesen wird.
- **„Mein Profil": Kontakt- und Stammdaten speichern feldweise**, der Speichern-Knopf entfällt –
  wie in der Schiedsrichter-Verwaltung, wo dieselben Angaben schon immer sofort gespeichert wurden.
- **Lokale Installation: Der Browser öffnet sich erst, wenn alles bereit ist.** Vorher wurde
  pauschal drei Sekunden gewartet; dauerte der Start länger, landete man auf einer Fehlerseite, die
  sich nicht von selbst aktualisiert. Jetzt zeigt das Startfenster einen Fortschritt und öffnet den
  Browser erst, wenn Datenbank und Server tatsächlich antworten – andernfalls erscheint ein
  verständlicher Hinweis, was zu tun ist.
- **Hilfe bei Problemen:** Das Server-Protokoll wird bei der lokalen Installation jetzt zusätzlich
  in eine Datei geschrieben (bisher nur im minimierten Fenster, nach einem Neustart weg). Mit
  `npm run torball -- diagnose` entsteht daraus ein Bericht zum Weitergeben – ohne Passwörter.
- **Neu in der Hilfe: „Aufbau der Anwendung"** – ein bebilderter Überblick mit sechs Zeichnungen zu
  Bausteinen, Ablauf einer Anfrage, Zugriffsrechten, Datenmodell und Betriebsmodi. Nur für
  angemeldete Personen sichtbar; die Zeichnungen lassen sich anklicken und vergrößern.

- **Digitale Protokollierung (Beta):** Ein Turnier kann jetzt auf „Digital" gestellt werden – dann
  wird jedes Spielereignis live erfasst (Würfe, Tore, Fouls, Strafwürfe, Auszeiten, Wechsel), und
  Spielstand, Restzeit sowie alle Zähler entstehen automatisch aus dem Protokoll. Dazu gehören eine
  Vollbild-Erfassungsansicht mit Tastatursteuerung (auch komplett per Maus/Touch bedienbar),
  Aufstellungen, ein Wechsel-Fenster, nachvollziehbare Korrekturen (nichts wird gelöscht, nur
  gestrichen), der Abschluss mit digitaler Unterschrift (optional mit zusätzlicher Bestätigung durch
  die Turnierleitung) sowie ein eigener Protokollant-Code für Helfer ohne Konto. **Achtung: noch
  nicht ausgiebig getestet und für den produktiven Einsatz nicht freigegeben** – für echte Turniere
  weiterhin „Manuell" verwenden. Details im neuen Hilfe-Thema „Digitale Protokollierung (Beta)".
  Aus den ersten Praxistests kamen dazu noch:
  - Die **Spieluhr hält automatisch an** bei Tor, Eigentor, Foul, Strafwurf und Auszeiten – auf all
    das pfeift der Schiedsrichter neu an, die Zeit läuft in der Unterbrechung nicht. Gestartet wird
    wie gewohnt von Hand (Leertaste) beim Anpfiff.
  - **Deutlichere Rückmeldung bei Regelverstößen:** Der Bildschirm blitzt kurz rot auf, sobald eine
    neue Warnung auftaucht (z. B. der vierte und jeder weitere Wurf in Folge, drittes Foul,
    überzogene Auszeiten), und die Wurf-Anzeige am Spieler färbt sich dabei rot.
  - **Klarere Statusanzeige:** „Noch nicht gestartet", „Pause" und „Spiel beendet" stehen jetzt
    dort, wo vorher pauschal „Unterbrochen" zu lesen war; Warnungen erscheinen zentriert statt am
    Bildrand.
  - Sobald zu einem Spiel ein Protokoll begonnen wurde, lässt sich der **Spielplan nicht mehr neu
    erzeugen** – vorher hätte das in einem kurzen Zeitfenster die Spiele gelöscht und das bereits
    begonnene Protokoll ins Leere laufen lassen.
- **Neue Turnierregel „Max. Spieler je Mannschaft"** (Standard 6, z. B. Bundesliga): der Kader warnt
  bei Überschreitung. Außerdem lässt sich ein leerer Kader jetzt per Knopf automatisch mit
  Platzhalter-Spielern anlegen.

- **Sicherheitskorrektur Turnier-Sync:** Beim Zurückspielen eines Turnierstands von einer lokalen
  Installation prüft der Server jetzt streng, dass jedes übertragene Dokument tatsächlich zu genau
  diesem einen Turnier gehört. Zuvor hätte ein manipuliertes Übertragungspaket fremde oder
  systemweite Daten überschreiben oder anlegen können (u. a. eine unberechtigte Rechteausweitung).
  Der normale Sync-Betrieb ändert sich dadurch nicht.
- **Schutz gegen zu viele Anmeldeversuche:** Wird ein Passwort mehrfach falsch eingegeben, ist die
  Anmeldung für dieses Konto jetzt nur noch **vorübergehend** gesperrt (die Wartezeit läuft von
  selbst ab) statt dauerhaft – niemand kann ein fremdes Konto mehr durch absichtliche Falscheingaben
  dauerhaft aussperren. Ein erfolgreicher Login oder ein Passwort-Reset hebt die Wartezeit sofort
  auf. Zusätzlich sind besonders sensible Aktionen (Registrierung, Passwort-vergessen,
  Ersteinrichtung, Geräte-Kopplung, Turnier-Code-Anmeldung) gegen automatisierte Massenanfragen
  gedrosselt.
- **Sicherheits-Header** ergänzt (Schutz gegen Einbetten fremder Seiten/Clickjacking, MIME-Sniffing,
  Weitergabe von Adressen an fremde Seiten; HTTPS-Erzwingung hinter HTTPS). Für Anwender:innen nicht
  sichtbar, härtet die öffentlich erreichbare Plattform aber ab.
- Weitere interne Härtungen: die Anmeldung braucht bei falscher E-Mail jetzt gleich lange wie bei
  falschem Passwort (verrät über die Antwortzeit nicht mehr, ob eine Adresse registriert ist), und
  die „Wer hat das Turnier angelegt/bearbeitet"-Angaben lassen sich nicht mehr über die Schnittstelle
  fälschen.
- **Sicherheitskorrektur (aus dem Backend-Review):** Über zusätzliche, nicht vorgesehene Felder in
  einer Speichern-Anfrage ließen sich bisher fremde/systemweite Daten anlegen (u. a. ein
  unberechtigtes Admin-Konto) oder in ein anderes Benutzerkonto einschleusen (Passwort/2FA). Solche
  Zusatzfelder werden jetzt an allen betroffenen Stellen ignoriert. Der normale Betrieb ändert sich
  dadurch nicht.
- Spielplan speichern: ein (manuell umsortierter) Spielplan wird jetzt serverseitig auf die harten
  Regeln geprüft, bevor er übernommen wird – keine Mannschaft doppelt im selben Zeit-Slot, keine
  Paarung gegen sich selbst und keine turnierfremde Mannschaft.
- Ein gelöschtes Turnier räumt jetzt alle zugehörigen Daten vollständig mit ab (auch
  Ergebnis-Erfassungslinks, vergebene Freigaben, Sync-Checkouts, Ergebnis-Änderungsverlauf und einen
  dadurch leer gewordenen Wettbewerb) statt Reste zurückzulassen.
- Doppeltes Turnier („jeder gegen jeden", zweimal): im zweiten Durchgang werden Heim und Auswärts
  jetzt getauscht (Rückspiel-Prinzip).
- Ein Turnier, das gerade auf eine lokale Installation ausgecheckt ist, ist auf dem Server jetzt auch
  im Formular vollständig gesperrt (Eingabefelder deaktiviert), nicht mehr nur der Turniername rot
  markiert – so ist sofort erkennbar, dass dort nichts geändert werden kann. Einzig „Freigabe
  aufheben" bleibt bedienbar.
- Neue Turnierregel „Bundesland-Regel bei der Spielplan-Erstellung" (Standard: aus): steuert, ob
  Mannschaften desselben Bundeslands bei der Spielplan-Erzeugung möglichst früh gegeneinander
  eingeplant werden – gedacht für Wettbewerbe mit festem Regionalbezug wie Bundesliga oder
  Deutsche Meisterschaft.
- E-Mail-Versand (für Einladungen und Passwort-Reset) lässt sich jetzt bequem über die
  Systemeinstellungen einrichten (Host, Port, Zugangsdaten, Absender, Verbindungstest) statt nur
  über eine Server-Konfigurationsdatei.
- Neuer Wartungsmodus (Admin-Menü): eine geplante Wartung lässt sich vorab ankündigen (Warnhinweis
  auf der Startseite, Kurzfristhinweis für angemeldete Personen ab 15 Minuten vorher) und bei
  tatsächlichem Beginn per Schalter aktivieren – dann sehen alle außer Admins nur noch eine
  Wartungsseite, bis der Schalter wieder ausgeschaltet wird.
- **Turnier-Sync mit einer lokalen Installation grundlegend überarbeitet und erstmals wirklich
  funktionsfähig:** Ein Fehler, durch den die Kopplung gegen den echten Server seit Einführung des
  Features überhaupt nicht funktionierte (fehlendes `/api`-Präfix hinter dem Webserver), wurde beim
  ersten Live-Einsatz gefunden und behoben. Außerdem überträgt die lokale Installation beim
  regelmäßigen automatischen Melden jetzt den **vollständigen** Turnierstand zurück (Ergebnisse,
  Regeln, Mannschaften, Freigaben) – vorher nur die Ergebnisse. Solange ein Turnier „ausgecheckt"
  ist, ist es auf dem Server neuerdings gegen direkte Änderungen gesperrt und deutlich
  gekennzeichnet (roter Turniername mit Zusatz „(gesperrt)", Stop-Schild in der Turnierliste);
  „Freigabe aufheben" bleibt als manueller Notausstieg.
- **Schiedsrichter-Stammdaten:** Schiedsrichter lassen sich turnierübergreifend als Stammdaten
  pflegen (eigener Menüpunkt „Stammdaten → Schiedsrichter") und per Auswahl in ein Turnier
  übernehmen. Die Schiedsrichter-Zuordnung im Spielplan erkennt den eigenen Verein jetzt über den
  Vereins-Bezug – damit auch eine zweite Mannschaft desselben Vereins im selben Turnier.
- Benutzerverwaltung: beim Einladen kann jetzt auch der Vorname angegeben werden (Anzeige
  einheitlich „Vorname Name"); für noch nicht aktivierte Konten gibt es „Einladung erneut senden"
  (falls die ursprüngliche Mail nie ankam). Ein ungültiger oder abgelaufener Passwort-Reset-Link
  wird sofort beim Aufrufen gemeldet statt erst nach dem Ausfüllen.
- Optionale Benachrichtigung an eine feste E-Mail-Adresse (Systemeinstellungen), sobald sich
  jemand selbst registriert oder eine Einladung annimmt.
- Video-URLs (z. B. das Einführungsvideo auf der öffentlichen Startseite) sind über die
  Systemeinstellungen konfigurierbar statt fest im Code hinterlegt; das Einführungsvideo wird auf
  der Gäste-Startseite eingebunden (datensparsam über youtube-nocookie, lädt erst bei Wiedergabe).
- Neue Turnierregel „Pause zwischen Spielen" (Standard 10 Minuten): die Spielplan-Zeitberechnung
  plant jetzt einen realistischen Puffer zwischen zwei aufeinanderfolgenden Spielen auf demselben
  Feld ein – bisher ergab sich die nächste Startzeit allein aus Spielzeit und Halbzeitpause.
- Spielzeit, Anzahl Halbzeiten, Pausen sowie Spielmodus/Protokollierung sind gesperrt, sobald der
  Spielplan läuft (mindestens ein Spiel gestartet oder ein Ergebnis erfasst) – eine nachträgliche
  Änderung würde den laufenden Zeitplan unbemerkt verfälschen.
- Eine lokale Installation zeigt ein eigenes blaues Kennzeichnungs-Banner, damit bei mehreren
  offenen Browser-Reitern (z. B. während der Kopplung) erkennbar ist, auf welcher Instanz man
  gerade arbeitet.
- Login-Seite: der Hinweis auf die Ersteinrichtung des ersten Admin-Kontos ist jetzt ein deutlich
  sichtbarer Button statt eines leicht zu übersehenden Text-Links.
- **Windows-Installation deutlich robuster und laienfreundlicher:** `Setup.cmd` auf der obersten
  Ebene als Einstiegspunkt; vor jeder Änderung am Rechner (Node.js-/CouchDB-Installation) eine
  verständliche Erklärung mit Zustimmungsfrage; alles außerhalb des Projektordners gebündelt unter
  `C:\Torball-Turniere`; diverse CouchDB-Installationsprobleme behoben (u. a. fehlende
  Systemdatenbanken, verwaiste Dienst-/Produktregistrierungen); Server-Fenster startet minimiert
  mit warnendem Titel; scharfes Desktop-Icon; neuer Deinstallierer (`Deinstallieren-Torball.cmd`)
  mit Schritt-für-Schritt-Rückfragen. `Aktualisieren-Torball.cmd` warnt bei einer ZIP-basierten
  Installation jetzt deutlich, dass kein neuer Quellcode geholt wurde (statt fälschlich „fertig"
  zu melden); ein erneuter `Setup.cmd`-Lauf aktualisiert bei einer Git-Installation auch den
  Quellcode. Anleitung für Laien: `AKTUALISIEREN.md`.
- Serverbetrieb: neues Skript `deploy/instanz-entfernen.sh` als Gegenstück zum Deploy (entfernt
  Dienst, nginx-Site, Datenbank samt Benutzer und Checkout – mit Sicherheitsabfrage); Zeitzone
  wird explizit auf `Europe/Berlin` gesetzt, damit Turnier-Startzeiten auf einem UTC-Server nicht
  verschoben angezeigt werden.
- Kleinere Korrekturen: Turniernamen brechen in Übersichtslisten nicht mehr unschön um; die
  Turnier-Übersicht aktualisiert sich nach Spielplan-Änderungen automatisch; Uhrzeit-Eingaben im
  Spielplan speichern erst beim Verlassen des Feldes (keine halbfertigen Werte mehr).

## [0.9.0-beta] - 2026-08-11

Ausgangsstand für die interne Produktiv-Test-Phase (Prod + Demo). Vollständiger
Funktionsüberblick: siehe [README.md](README.md).

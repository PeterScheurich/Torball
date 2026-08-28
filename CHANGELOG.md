# Changelog

Nennenswerte Änderungen an Torball-Turniere, angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Einträge in einfachen, für
Anwender:innen verständlichen Worten – kein Rohauszug aus der Git-Historie. Ablauf für einen
neuen Versionseintrag: siehe Abschnitt „Release-Prozess" in `CLAUDE.md`.

## [Unveröffentlicht]

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

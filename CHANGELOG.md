# Changelog

Nennenswerte Änderungen an Torball-Turniere, angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Einträge in einfachen, für
Anwender:innen verständlichen Worten – kein Rohauszug aus der Git-Historie. Ablauf für einen
neuen Versionseintrag: siehe Abschnitt „Release-Prozess" in `CLAUDE.md`.

## [Unveröffentlicht]

- **Sicherheitskorrektur Turnier-Sync:** Beim Zurückspielen eines Turnierstands von einer lokalen
  Installation prüft der Server jetzt streng, dass jedes übertragene Dokument tatsächlich zu genau
  diesem einen Turnier gehört. Zuvor hätte ein manipuliertes Übertragungspaket fremde oder
  systemweite Daten überschreiben oder anlegen können (u. a. eine unberechtigte Rechteausweitung).
  Der normale Sync-Betrieb ändert sich dadurch nicht.
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

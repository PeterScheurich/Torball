# Changelog

Nennenswerte Änderungen an Torball-Turniere, angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Einträge in einfachen, für
Anwender:innen verständlichen Worten – kein Rohauszug aus der Git-Historie. Ablauf für einen
neuen Versionseintrag: siehe Abschnitt „Release-Prozess" in `CLAUDE.md`.

## [Unveröffentlicht]

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

## [0.9.0-beta] - 2026-08-11

Ausgangsstand für die interne Produktiv-Test-Phase (Prod + Demo). Vollständiger
Funktionsüberblick: siehe [README.md](README.md).

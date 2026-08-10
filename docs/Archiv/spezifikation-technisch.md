# Spezifikation technisch
**Version:** 0.1  
**Datum:** Juli 2026  
**Status:** Entwurf

---

## Inhaltsverzeichnis

1. Systemübersicht
2. Technologie-Stack
3. Infrastruktur
4. Betriebsmodi
5. Datenmodell
6. Berechtigungskonzept
7. Spielprotokoll und Event-Sourcing
8. Synchronisation
9. Barrierefreiheit und UI
10. Sicherheit
11. Migration und Deployment
12. Offene Punkte

---

## 1. Systemübersicht

Die Torball-Turniersoftware ist eine webbasierte Anwendung zur Planung, Durchführung und Auswertung von Torball-Turnieren. Sie besteht aus folgenden Modulen:

| Modul | Beschreibung | Priorität |
|---|---|---|
| Turnierplanung | Planung und Vorbereitung von Turnieren | Hoch |
| Turnier/Protokoll | Live-Protokollierung während eines Spiels | Hoch |
| Live-Ergebnisse | Öffentliche Anzeige von Ergebnissen | Mittel |
| Analysen | Auswertungen und Statistiken | Niedrig |

**Entwicklungsreihenfolge:**
1. Entwicklungsumgebung und Infrastruktur
2. Datenmodell
3. Modul Turnierplanung
4. Modul Turnier/Protokoll
5. Modul Live-Ergebnisse
6. Modul Analysen

---

## 2. Technologie-Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| Frontend | React (TypeScript) | Barrierefreiheit, große Community, PWA-fähig |
| Backend | Node.js / Fastify | TypeScript-nativ, performant |
| Datenbank (lokal) | PouchDB | Läuft im Browser, offline-fähig |
| Datenbank (zentral) | CouchDB | Automatische Bi-direktionale Synchronisation mit PouchDB |
| Webserver | Nginx | Reverse Proxy, HTTPS |
| Versionierung | Gitea (self-hosted) | Bereits vorhanden auf Proxmox |

**Progressive Web App (PWA):**
Die Anwendung wird als PWA entwickelt. Das bedeutet:
- Funktioniert wie eine native App auf dem Smartphone
- Kein App Store nötig
- Funktioniert im lokalen Netzwerk ohne Internet
- Installation über Browser (Icon auf Homescreen)

---

## 3. Infrastruktur

### 3.1 Entwicklungsumgebung (lokal)

```
Entwicklungsrechner (Windows 11)
├── VS Code (Editor)
├── Node.js (via nvm)
├── Git (Versionierung)
└── Browser (Chrome/Firefox für Tests)
```

### 3.2 Proxmox-Struktur

```
Proxmox
├── LXC Container 1: Entwicklung/Test
│   ├── Node.js
│   ├── CouchDB
│   └── Gitea (bereits vorhanden, Port 3000)
│
├── LXC Container 2: Staging
│   ├── Node.js
│   ├── CouchDB
│   └── Nginx
│
└── LXC Container 3: Produktion
    ├── Node.js
    ├── CouchDB
    └── Nginx
```

### 3.3 Produktions-Hosting

**Phase 1:** Self-Hosting auf Proxmox
- Kostenfrei
- Volle Kontrolle
- Ausfälle nicht turnierkritisch (lokaler Betrieb funktioniert unabhängig)

**Phase 2 (zukünftig):** Externer Anbieter (z.B. IONOS)
- Höhere Verfügbarkeit
- 24/7 erreichbar
- Prüfen ob bestehender Vertrag des Torball-Fördervereins nutzbar

**Migrationsstrategie:**
- Keine Abhängigkeiten von spezifischer Hardware
- Konfiguration über Umgebungsvariablen
- CouchDB-Replikation ermöglicht einfachen Umzug

### 3.4 Lokale Installation (Windows)

Für den lokalen Betrieb (Standalone/LAN) wird ein Windows-Installer-Paket bereitgestellt:
- Enthält Node.js, CouchDB und die Anwendung
- Einmalige Installation, danach sofort nutzbar
- Kein technisches Wissen erforderlich

---

## 4. Betriebsmodi

### 4.1 Standalone

```
Ein Rechner
├── Browser (Frontend)
├── Node.js / Fastify (Backend)
└── PouchDB (lokale Datenbank im Browser)
```
- Kein Netzwerk nötig
- Keine Benutzeranmeldung
- Alles auf einem Gerät

### 4.2 Lokales Netzwerk

```
Zentraler Rechner (Turnierleitung)
├── Node.js / Fastify
├── CouchDB
└── Nginx

Weitere Geräte (Spielleitung, Anzeige, Smartphones)
└── Browser → verbinden per IP/WLAN
```
- Kein Internet nödig
- Zugang über Turnier-Codes (siehe Abschnitt 6)
- PWA auf Smartphones für Live-Anzeige

### 4.3 Zentrale Plattform

```
Internet
├── Zentraler Server
│   ├── Node.js / Fastify
│   ├── CouchDB (zentral)
│   └── Nginx (HTTPS)
│
└── Lokale Geräte
    └── PouchDB ↔ Sync ↔ CouchDB
```
- Vollständige Benutzerverwaltung
- Automatische Synchronisation
- Live-Ergebnisse öffentlich abrufbar

---

## 5. Datenmodell

### 5.1 Hierarchie

```
Wettbewerb (optional, für mehrtägige Turniere)
  └── Spieltag/Turnier
        ├── Turnierpausen (0 oder mehr)
        ├── Mannschaft-im-Turnier
        │     └── Spieler (turnierbezogen)
        ├── Schiedsrichter-im-Turnier
        └── Spielplan
              └── Spiel
                    └── Spielprotokoll
                          └── Events (chronologisch)
```

### 5.2 Wettbewerb

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

### 5.3 Turnier

```
Turnier
  - turnier_id
  - wettbewerb_id (optional, Referenz)
  - name
  - datum
  - startzeit
  - status (entwurf/aktiv/archiviert)
  
  Spielort:
  - spielort_name
  - spielort_adresse
  - spielort_geo (optional)
  
  Spielfelder:
  - felder (Array: [{feld_id, name}])
  
  Spielregeln:
  - modus
  - spielzeit_minuten (Default: 5)
  - anzahl_halbzeiten (Default: 2)
  - pause_minuten (Default: 2)
  - seitenwechsel (Default: true)
  - timeouts_je_halbzeit (Default: 1)
  - timeout_dauer_sekunden (Default: 30)
  - auswechslungen_je_halbzeit (Default: 3)
  - tordifferenz_abbruch (Default: true)
  - tordifferenz_limit (Default: 10)
  - verlaengerung_aktiv (Default: true)
  - silbernes_tor (Default: true)
  - max_sehende_spieler (Default: 1)
  - einstellige_trikotnummern (Default: true)
  - passwort_mindestlaenge (Default: 8)
  
  Punktevergabe:
  - punkte_sieg (Default: 2)
  - punkte_unentschieden (Default: 1)
  - punkte_niederlage (Default: 0)
  
  Tabellenreihenfolge bei Gleichstand:
  - kriterien (Array: [punkte, tordifferenz, 
    tore, direkter_vergleich, freiwerfe])
  
  Datenschutz:
  - spielernamen_oeffentlich (Default: false)
  
  Kontakt:
  - turnierleitung_name
  - turnierleitung_kontakt
  - ansprechpartner_name
  - ansprechpartner_kontakt
  - zusatzinfo (Text)
  
  Metadaten:
  - erstellt_von (benutzer_id)
  - erstellt_am (timestamp)
  - geaendert_von (benutzer_id)
  - geaendert_am (timestamp)
```

### 5.4 Turnierpause

```
Turnierpause
  - pause_id
  - turnier_id (Referenz)
  - startzeit (geplant)
  - dauer_minuten
  - gilt_fuer (alle/[feld_id, ...])
  - typ (mittagspause/synchronisation)
```

### 5.5 Verein und Mannschaft

```
Verein
  - verein_id
  - name
  - anschrift
  - ansprechpartner_name
  - ansprechpartner_telefon
  - ansprechpartner_email

Mannschaft-im-Turnier
  - mannschaft_id
  - turnier_id (Referenz)
  - verein_id (Referenz)
  - name
  - bundesland (optional)
  - ansprechpartner_name
  - ansprechpartner_telefon
  - ansprechpartner_email
  - importiert_aus_turnier_id (optional)
```

**Hinweis:** Im Normalfall ist Verein:Mannschaft = 1:1. Die UI vereinfacht diesen Fall – Verein wird im Hintergrund automatisch angelegt. Nur bei mehreren Mannschaften eines Vereins wird die Trennung sichtbar.

### 5.6 Spieler

```
Spieler
  - spieler_id
  - mannschaft_id (Referenz, turnierbezogen)
  - name
  - vorname
  - trikotnummer
  - klassifizierung (B1/B2/B3/sehend/AB)
  - status (aktiv/gesperrt)
  - importiert_aus_turnier_id (optional)
```

### 5.7 Schiedsrichter

```
Schiedsrichter-im-Turnier
  - schiedsrichter_id
  - turnier_id (Referenz)
  - name
  - vorname
  - telefon (optional)
  - email (optional)
  - lizenz_vorhanden (boolean)
  - mannschaft_id (optional, Referenz)
  - ist_turnierleitung (boolean)
  - importiert_aus_turnier_id (optional)
```

### 5.8 Spiel

```
Spiel
  - spiel_id
  - turnier_id (Referenz)
  - runde (z.B. 1, 2, "Finale", "Platz 3")
  - feld_id (Referenz)
  - startzeit_geplant
  - startzeit_voraussichtlich (dynamisch)
  - startzeit_tatsaechlich
  - endzeit_tatsaechlich
  - mannschaft_a_id (Referenz)
  - mannschaft_b_id (Referenz)
  - schiedsrichter_id (Referenz)
  - status (geplant/laeuft/beendet/abgeschlossen)
  - ergebnis_a (Tore, berechnet)
  - ergebnis_b (Tore, berechnet)
```

### 5.9 Spielprotokoll

```
Spielprotokoll
  - protokoll_id
  - spiel_id (Referenz)
  - status (offen/beendet/abgeschlossen)
  - erstellt_von (benutzer_id)
  - protokollant_name (Unterschrift)
  - protokollant_bestaetigt_am (timestamp)
```

### 5.10 Event

```
Event
  - event_id
  - protokoll_id (Referenz)
  - zeitstempel (Uhrzeit)
  - spielzeit (laufende Spieluhr in Sekunden)
  - halbzeit (1/2/V1/V2/FW)
  - event_typ (siehe Abschnitt 7)
  - mannschaft (A/B/null)
  - spieler_id (optional)
  - spieler_raus_id (optional, bei Wechsel)
  - ist_eigentor (boolean, bei Tor)
  - ist_korrektur (boolean)
  - korrigiert_event_id (optional)
  - zusatz (JSON, für eventspezifische Daten)
  - erstellt_von (benutzer_id)
```

### 5.11 Benutzer

```
Benutzer
  - benutzer_id
  - email (= Benutzername)
  - passwort_hash
  - name
  - telefon (optional)
  - globale_rolle (admin/manager/benutzer)
  - 2fa_aktiv (boolean)
  - 2fa_secret (verschlüsselt)
  - gesperrt (boolean)
  - letzte_anmeldung (timestamp)
  - erstellt_von (benutzer_id)
  - erstellt_am (timestamp)
```

### 5.12 Turnier-Berechtigung

```
Turnier-Berechtigung
  - berechtigung_id
  - turnier_id (Referenz)
  - benutzer_id (Referenz)
  - rolle (turnierleitung/spielleitung/lesen)
  - vergeben_von (benutzer_id)
  - vergeben_am (timestamp)
```

### 5.13 Audit-Log

```
Audit-Log-Eintrag
  - log_id
  - turnier_id (optional)
  - benutzer_id
  - aktion (z.B. "turnier_geaendert", 
             "spieler_hinzugefuegt",
             "protokoll_korrigiert")
  - details (JSON)
  - zeitstempel
```

---

## 6. Berechtigungskonzept

### 6.1 Globale Rollen

| Rolle | Benutzer anlegen | Turniere anlegen | Zugriff |
|---|---|---|---|
| Admin | Alle inkl. Admins | Ja | Alles |
| Manager | Benutzer + Manager | Ja (Hauptaufgabe) | Eigene + zugewiesene |
| Benutzer | Nein | Nein | Nur zugewiesene |

### 6.2 Turnierbezogene Berechtigungen

| Berechtigung | Beschreibung | Kann vergeben von |
|---|---|---|
| Schreiben | Vollzugriff auf Turnier | Admin, Manager (eigene Turniere) |
| Lesen | Lesezugriff auf interne Daten | Jeder mit Schreibzugriff |

**Prinzipien:**
- Berechtigungen gelten pro Turnier
- Wer Schreibrecht hat, kann anderen Schreib- oder Leserecht geben
- Wer nur Leserecht hat, kann anderen nur Leserecht geben
- Schreibrechte können entzogen werden von jedem mit Schreibrecht
- Manager behalten immer Zugriff auf ihre eigenen Turniere
- Öffentliche Turnierdaten (Status: aktiv) sind ohne Anmeldung sichtbar

### 6.3 Turnier-Codes (Offline/LAN-Modus)

Beim Anlegen eines lokalen Turniers ohne Internetverbindung:

```
Pflichtfelder:
  - Turniername
  - Datum
  - Code Turnierleitung (frei wählbar)
  - Code Spielleitung (frei wählbar)
```

- Wer den Code kennt, erhält die entsprechende Rolle
- Bei späterer Synchronisation: Benutzer mit Account meldet sich an → Turnier wird seinem Account zugeordnet → Codes werden ungültig
- Ohne Account: Admin ordnet das Turnier manuell zu

### 6.4 Passwort-Richtlinien

- Mindestlänge: konfigurierbar (Minimum: 8 Zeichen, Admin-Einstellung)
- Pflicht: mind. 1 Großbuchstabe, 1 Zahl, 1 Sonderzeichen
- Änderungen gelten nur für neue/geänderte Passwörter
- Benutzer werden beim Login informiert, wenn Passwort aktuelle Anforderungen nicht erfüllt

### 6.5 Passwort-Reset

1. Benutzer klickt „Passwort vergessen"
2. Eingabe der E-Mail-Adresse
3. Einmal-Link wird an E-Mail gesendet (gültig 24 Stunden)
4. Benutzer setzt neues Passwort (Passwortregeln gelten)
5. Alle aktiven Sessions werden beendet
6. Benachrichtigung an E-Mail bei Passwortänderung

### 6.6 Zwei-Faktor-Authentifizierung (2FA)

- Verpflichtend für Admin
- Optional für alle anderen
- Wird bei erster Anmeldung eingerichtet

---

## 7. Spielprotokoll und Event-Sourcing

### 7.1 Grundprinzip

Der aktuelle Spielstand wird nicht gespeichert – er wird aus der Event-Liste berechnet. Jedes Ereignis wird als unveränderlicher Eintrag gespeichert. Korrekturen erzeugen neue Einträge mit Referenz auf das ursprüngliche Event.

**Aus der Event-Liste berechnet:**
- Aktueller Spielstand (Tore)
- Laufende Spielzeit
- Foulzähler je Mannschaft
- Wurfzähler je Spieler
- Timeout-Kontingent
- Auswechslungs-Kontingent
- Aktuelle Feldbesetzung

### 7.2 Event-Typen

| Typ | Beschreibung | Mannschaft | Spieler |
|---|---|---|---|
| GO | Spielzeit starten | - | - |
| STOP | Spielzeit anhalten | - | - |
| B | Halbzeit/Pause | - | - |
| VB | Verlängerung beginnt | - | - |
| End | Spiel beendet | - | - |
| Fin | Abschluss | - | - |
| W | Wurf | A/B | Ja |
| G | Tor | A/B | Ja (Torschütze) |
| F | Foul | A/B | Ja (Verursacher) |
| P | Penalty | A/B | - |
| PA | Auto-erkannter Penalty (System) | A/B | - |
| T | Timeout | A/B | - |
| TT | Technischer Timeout | A/B (opt.) | - |
| E | Wechsel | A/B | Ja (raus + rein) |
| FW | Freiwurf | A/B | Ja |

### 7.3 Prüfungen je Event-Typ

**W – Wurf:**
- Ist Spieler auf dem Feld?
- Wurfzähler des Spielers: bei 3 → Hinweis, bei 4+ → Foul-Hinweis
- Wurfzähler anderer Spieler der Mannschaft → reset

**G – Tor:**
- Vorheriges Wurf-Event vorhanden?
- Tordifferenz erreicht Limit → Hinweis
- Bei Eigentor: Tor der gegnerischen Mannschaft, kein Torschütze

**F – Foul:**
- Foulzähler nach diesem Foul = 3 → Penalty-Hinweis
- Bei drittem Foul: Foulzähler reset (erst wenn Penalty protokolliert)

**T – Timeout:**
- Noch Timeouts verfügbar? Nein → Team-Penalty-Hinweis
- Mannschaft in Ballbesitz? Nein → Team-Penalty-Hinweis

**E – Wechsel:**
- Spieler raus: auf dem Feld?
- Spieler rein: auf der Bank?
- Auswechslungskontingent verfügbar?
- Während Penalty: nicht möglich
- Sehender Spieler: Limit prüfen

**GO/STOP:**
- Läuft/läuft nicht bereits?

**Alle Events:**
- Entscheidung liegt immer beim Schiedsrichter
- Software warnt, blockiert nicht (außer technisch unmögliche Aktionen)

### 7.4 Spielzeit-Verhalten

```
Je Spielabschnitt:
  - Timer startet bei 0:00
  - Signal bei definierter Zeit
  - Timer läuft weiter (Überhang)
  - Nächster Abschnitt startet bei 0:00

Gespeichert je Abschnitt:
  - Definierte Dauer
  - Tatsächliche Startzeit
  - Tatsächliche Endzeit
  - Überhang (berechnet)
```

---

## 8. Synchronisation

### 8.1 Technologie

PouchDB (lokal) ↔ CouchDB (zentral) synchronisieren automatisch in beide Richtungen sobald eine Verbindung besteht.

### 8.2 Synchronisations-Strategie

**Erste Synchronisation:**
- Lokale Daten werden ins Zentralsystem übertragen
- Kein Konflikt möglich

**Folge-Synchronisation:**
```
Vor jeder Synchronisation:
  1. Zeitstempel beider Versionen vergleichen

  Fall 1: Nur lokal geändert
    → Normale Synchronisation mit Bestätigung

  Fall 2: Nur zentral geändert
    → Hinweis + Auswahl:
        a) Lokal ins Zentral übertragen
        b) Zentral lokal übernehmen
        c) Abbrechen

  Fall 3: Beide Seiten geändert
    → Deutliche Warnung
    → Zeitstempel beider Versionen anzeigen
    → Explizite Entscheidung erforderlich:
        a) Lokale Version
        b) Zentrale Version
        c) Abbrechen

Bei allen Fällen:
  → Automatisches Backup vor Überschreiben
  → Backup nach konfigurierbarer Zeit gelöscht
```

### 8.3 Offline-Turnier → Synchronisation

```
Option A: Benutzer hat Account
  → Anmeldung mit Account
  → Turnier wird Account zugeordnet
  → Codes werden ungültig

Option B: Kein Account
  → Admin ordnet Turnier manuell zu
  → Codes werden ungültig
```

---

## 9. Barrierefreiheit und UI

### 9.1 Barrierefreiheits-Standard

- **Pflicht:** WCAG 2.1 Level AA
- **Ziel:** WCAG 2.1 Level AAA wo sinnvoll umsetzbar

**Konkrete Anforderungen (AA):**
- Kontrastverhältnis mind. 4,5:1 für normalen Text
- Kontrastverhältnis mind. 3:1 für große Texte
- Alle Funktionen per Tastatur bedienbar
- Fokus-Indikatoren sichtbar
- Screenreader-kompatibel (semantisches HTML, ARIA-Labels)
- aria-live-Regionen für dynamische Spielstandsänderungen
- Fehlermeldungen klar beschriftet
- Keine reinen Farb-Informationen

**Optimiert für:**
- JAWS (Windows) – primäres Ziel
- NVDA (Windows)
- VoiceOver (iOS/macOS)
- TalkBack (Android)

### 9.2 Responsive Design

- Funktioniert auf Desktop, Tablet und Smartphone
- Anpassung an verschiedene Bildschirmauflösungen
- Touch-optimiert für mobile Geräte

### 9.3 Themes

```
Standard-Themes:
  - Hell (Light Mode)
  - Dunkel (Dark Mode)
  - Default: Systemeinstellung des OS 
    (prefers-color-scheme)

Verwaltung:
  - Phase 1: Nur Admin kann Themes definieren
  - Phase 2 (später): Jeder Benutzer für sich

Theme-Einstellung:
  - Wird je Benutzer gespeichert
  - Überschreibt Systemeinstellung
```

### 9.4 Tastatur-Konfiguration (Protokollierung)

Standardtasten für die Spielprotokollierung (konfigurierbar pro Turnier):

**Je Team (mit STRG für Team B):**

| Taste | Ereignis |
|---|---|
| 0-9 | Wurf (Spielernummer) |
| G | Tor |
| F | Foul |
| T | Timeout |
| P | Penalty |
| E | Wechsel |

**Für das Spiel:**

| Taste | Ereignis |
|---|---|
| Space | GO/STOP (umschalten) |
| M | Technischer Timeout |
| B | Halbzeit/Pause |
| End | Spielende |
| F12 | Abschluss |

---

## 10. Sicherheit

### 10.1 Authentifizierung

- E-Mail = Benutzername (eindeutig, klar)
- Passwort-Hash (bcrypt oder Argon2)
- 2FA via TOTP (Google Authenticator, Authy)
- Session-Management mit sicheren Tokens
- Automatischer Logout nach Inaktivität (konfigurierbar)

### 10.2 Erstanmeldung

1. Admin/Manager legt Benutzer an
2. System sendet Einmal-Link per E-Mail
3. Benutzer setzt Passwort beim ersten Login
4. Bei Admin: 2FA wird direkt eingerichtet

### 10.3 Sperrung

- Gesperrte Benutzer können sich nicht anmelden
- Laufende Spielprotokollierung wird nicht unterbrochen
- Sperrung wirkt nach dem laufenden Spiel

### 10.4 E-Mail-Änderung

1. Benutzer gibt neue E-Mail ein
2. Bestätigungs-Link an neue E-Mail
3. Erst nach Bestätigung wird E-Mail geändert
4. Benachrichtigung an alte E-Mail
5. Admin kann E-Mail ohne Bestätigung ändern

---

## 11. Migration und Deployment

### 11.1 Datenmigration bei Umzug

CouchDB ermöglicht einfache Migration:
- Eingebaute Replikation zwischen Instanzen
- Neue Instanz aufsetzen → Replikation starten → DNS umstellen
- Kein manueller Export/Import nötig

### 11.2 DB-Struktur-Änderungen (Schema-Migration)

```
Versionierung:
  - Jede Struktur-Änderung erhält Versionsnummer
  - Migrations-Skripte: migration_v1_to_v2.js
  - Skripte sind idempotent (mehrfach ausführbar 
    ohne Schaden)

Beim Anwendungsstart:
  1. Aktuelle DB-Version prüfen
  2. Fehlende Migrationen ausführen
  3. Ergebnis ins Audit-Log schreiben

Vor jeder Migration:
  - Automatisches Backup
  - Rollback möglich
```

### 11.3 Backup-Strategie

- Automatisches Backup vor jeder Synchronisation (Konfliktfall)
- Regelmäßige Backups der CouchDB (konfigurierbar)
- Backup-Aufbewahrung: konfigurierbar (Default: 30 Tage)

### 11.4 Archivierung

```
Turnier-Status: Entwurf → Aktiv → Archiviert

Archivierung:
  - Nur durch Admin
  - Relevante Daten werden in Archiv-Pool 
    übertragen (Ergebnisse, Tabellen, 
    Torschützen)
  - Detaillierte Protokolle bleiben im Original
  - Archivierte Turniere öffentlich sichtbar 
    (nur Ergebnisse)

Automatismus (zukünftig):
  - Nach konfigurierbarer Zeit ohne Einspruch
  - Grundfunktion bereits von Anfang an einplanen
```

---

## 12. Offene Punkte

| Punkt | Beschreibung | Priorität |
|---|---|---|
| Offline-Auth | Authentifizierung bei kurzfristig angelegten lokalen Turnieren ohne Account | Vor Implementierung Offline-Modus |
| Spielplan-Algorithmus | Details der automatischen Spielplan-Generierung (insb. bei mehreren Feldern und Bundesland-Regel) | Vor Modul Turnierplanung |
| IONOS-Prüfung | Bestehenden Vertrag des Fördervereins prüfen für zukünftiges externes Hosting | Niedrig |
| Protest-Workflow | Technische Umsetzung des Protest-Prozesses im Protokoll | Vor Modul Turnier/Protokoll |
| Analysen-Modul | Spezifikation noch nicht vollständig | Niedrig |
| Mobile App | Native App für Android/iOS (PWA ist ausreichend für Phase 1) | Sehr niedrig |

---

*Dieses Dokument wurde auf Basis der IBSA Torball Regeln (Stand Januar 2014), der Nationalen Ligaordnung des DBS (Stand August 2019), dem DBS-Meldeformular und Gesprächen mit dem Projektinhaber erstellt.*

*Version 0.1 – Entwurf*

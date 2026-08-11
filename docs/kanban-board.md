# Entwicklungs-Kanban-Board

Kleines Kanban-Board zur Organisation der Weiterentwicklung. Es hat fachlich
**nichts** mit den Torball-Turnieren zu tun, sondern dient nur der internen
Aufgabenverwaltung. Sichtbar und bedienbar ausschließlich für **Admins**.

Erreichbar über das Menü **Stammdaten → Entwicklungs-Board** (nur Admin) unter
der Route `/entwicklungs-board`.

## Funktionsumfang

- Vier Spalten: **Offen**, **In Arbeit**, **Testen**, **Erledigt**
  (Fluss von links nach rechts).
- Karte: Titel, Beschreibung, **Kategorie** (Bug, Feature, Wunsch, Aufgabe,
  Sonstiges) und **Priorität** (Hoch, Mittel, Niedrig). Zusätzlich wird der
  Ersteller-Name und der Zeitpunkt der letzten Änderung angezeigt.
- Verschieben ohne Drag & Drop (barrierefrei): ▲/▼ ordnet innerhalb der Spalte,
  ◀/▶ verschiebt in die vorherige/nächste Spalte.
- Bearbeiten und Löschen je Karte.

## Datenhaltung

Die Karten liegen als eigener Dokumenttyp `kanbanKarte` in derselben CouchDB wie
alle übrigen Daten (kein zusätzlicher Server, keine zusätzliche Datenbank). Die
Route liegt in `backend/src/routes/kanban.ts`, der Typ in
`shared/src/types/kanban.ts`.

## Abgleich zwischen den Umgebungen (Dev ↔ Prod)

Ziel: gleiche Kartenstände auf der Entwicklungs- und der Produktiv-Instanz, ohne
einen zentralen Server und ohne Netz-Konfiguration. Umgesetzt als
**JSON-Export/-Import mit Zusammenführung**.

### So funktioniert es

- **Export** (auf jeder Instanz möglich): lädt alle Karten als JSON-Datei
  herunter (`kanban-export-JJJJ-MM-TT.json`). Reines Herunterladen, unkritisch.
- **Import** (nur auf der Entwicklungs-Instanz freigeschaltet): **zweistufig** –
  erst eine Vorschau, dann nach Entscheidung anwenden.

Die Zusammenführung erfolgt **je Karte anhand der stabilen `kanbanId`**. Die
Vorschau (schreibt noch nichts) teilt die Karten in drei Gruppen:

- **Neu** – Karte lokal noch nicht vorhanden → wird eingefügt.
- **Unverändert** – vorhanden und inhaltlich identisch → nichts zu tun.
- **Konflikt** – vorhanden, aber inhaltlich abweichend. **Es wird bewusst NICHT
  automatisch der neuere Stand genommen.** Stattdessen entscheidet man je Karte,
  welche Fassung gewinnt: *lokal behalten* oder *importierte übernehmen*. Beide
  Seiten werden mit Spalte/Kategorie/Priorität/Zeitpunkt/Autor angezeigt, der
  jeweils neuere Stand ist nur als „(neuer)" markiert – als Hinweis, nicht als
  Automatik. Vorbelegt ist „lokal behalten", damit nie etwas ungefragt
  überschrieben wird. Buttons „Alle: lokal" / „Alle: importierte" für den
  Schnellfall.

Für den Inhaltsvergleich zählen nur die redaktionellen Felder (Titel,
Beschreibung, Spalte, Kategorie, Priorität) – reines Umsortieren (`reihenfolge`)
oder abweichende Provenienz lösen bewusst keinen Konflikt aus.

Wählt man überall „lokal behalten" und gibt es keine neuen Karten, ändert der
Import nichts (idempotent).

**Ersteller (für Rückfragen):** Name **und** E-Mail des Erstellers werden als
Kopie direkt auf der Karte gespeichert („denormalisiert", nicht anonymisiert) –
zusätzlich zur Benutzer-ID. So bleibt der tatsächliche Urheber auch dann
eindeutig sichtbar, wenn die Karte auf einer Instanz angezeigt wird, die das
Benutzerkonto der Quell-Instanz gar nicht kennt (die Benutzer-ID wäre dort nicht
auflösbar). Die E-Mail wird als `mailto`-Link angezeigt. Da die Funktion stets
angemeldet läuft (Admin/Manager), ist immer ein eindeutiger Benutzer verfügbar.

### Warum ist der Import nur auf Dev möglich?

Vorgabe: der Abgleich soll zentral von der Entwicklungs-Instanz aus gesteuert
werden. Deshalb ist der schreibende Import an das Flag **`KANBAN_SYNC=true`** in
`backend/.env` gebunden – gesetzt nur auf Dev. Auf Prod (Flag aus) ist der
Import-Endpunkt gesperrt (403) und die Import-Schaltfläche ausgeblendet; der
Export bleibt dort möglich, damit die auf Prod erfassten Karten herausgetragen
und auf Dev eingespielt werden können.

### Typischer Ablauf

1. Tester/Admins legen auf Prod Karten an.
2. Auf Prod: **Export** → JSON-Datei.
3. Datei auf die Dev-Instanz übertragen (z. B. per Datei-Kopie).
4. Auf Dev: **Import** → Stände werden zusammengeführt.
5. Optional zurück: auf Dev exportieren und die Datei auf Prod bereitstellen
   (Prod importiert nicht selbst – dort müsste das Flag gesetzt werden).

### Bekannte Grenze

**Löschungen werden nicht synchronisiert.** Eine auf einer Instanz gelöschte
Karte, die in einer importierten Datei noch enthalten ist, wird wieder angelegt.
Für ein kleines internes Board bewusst so belassen (kein Tombstone-Mechanismus).
Löschungen ggf. auf beiden Seiten nachziehen.

## Späterer Ausbau: automatische Replikation

Der JSON-Weg ist topologie-unabhängig und braucht keine Infrastruktur. Wenn die
Produktiv-Instanz später ausgehend die Entwicklungs-CouchDB erreichen kann
(z. B. beide auf demselben Host/PVE, oder per VPN), lässt sich der Abgleich ohne
Datenmodell-Änderung auf **native CouchDB-Replikation** umstellen:

- Replikation wird von der Seite **aktiv angestoßen**, die die andere erreichen
  kann; die anstoßende Seite braucht **keine eingehende Öffnung**.
- Da die Produktiv-CouchDB nur auf `127.0.0.1` lauscht, bliebe sie nach außen
  dicht und würde die Replikation selbst initiieren (ausgehend zur Dev-DB).
- Alternativ eine gefilterte Replikation nur der `kanbanKarte`-Dokumente, damit
  nur diese unkritischen Daten die Instanz verlassen, nicht die Turnier-/
  Benutzerdaten.

Bis dahin genügt Export/Import.

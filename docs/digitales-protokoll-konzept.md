# Digitale Protokollierung – Design-Konzept (Stand: 21.08.2026)

Design-Pass für die digitale Live-Protokollierung (Gesamtspezifikation Abschnitte 6, 7, 20.10–20.12,
22, 24.4; Ereignis-Erfassung je Wurf/Foul/Tor statt reiner Endergebnis-Eingabe). Entwickelt auf dem
Branch `feature/digitales-protokoll`; auf `main` bleibt das Feature hinter dem bestehenden
Pro-Turnier-Gate `protokollierungsart: "digital"` schlafend. Dieses Dokument hält die
Architektur-Entscheidungen fest, **bevor** Code entsteht – die offenen Entscheidungen stehen
gesammelt in Abschnitt 12.

Verwandte Dokumente: `torball-protokoll-panel-konzept.md` (physisches HID-Tastenpanel),
`torball_gesamtspezifikation.md` (fachliche Referenz).

## 1. Ausgangslage

- Die `shared`-Typen existieren bereits vollständig (`shared/src/types/spielprotokoll.ts`,
  `event.ts` – aus einem früheren Typisierungs-Pass), es gibt aber **null** Backend-/Frontend-Code
  dazu: keine Route, kein `docType`-Vorkommen im Backend, keine Seite.
- Der `manuell`-Pfad (`ergebnis.ts`, `ergebnisToken.ts`, `tabelle.ts`) bleibt unangetastet
  (Additiv-Disziplin): neue docTypes additiv in die Union, neue Routen in neuen Dateien, neue
  Seiten mit eigener Router-Route.
- Die Tabellenberechnung (`tabelle.ts`) liest ausschließlich `Spiel`-Dokumente
  (`ergebnisA/B`, `istForfait`, `ergebnisAbgeschlossen`) – **die Integration des digitalen Pfads
  läuft deshalb komplett darüber, dass das Protokoll diese Spiel-Felder pflegt** (Abschnitt 5).
  Tabelle, öffentliche Seite, PDFs und Wettbewerbs-Gesamttabelle funktionieren dann unverändert.

## 2. Datenmodell

### 2.1 Bestehende Typen, nötige Ergänzungen

`Spielprotokoll` (Singleton je Spiel) und `Event` bleiben wie typisiert, mit diesen Ergänzungen:

**`Event` bekommt zusätzlich:**

- `turnierId` und `spielId` (denormalisiert). Gründe: (a) die Kaskaden-Löschung in `turnier.ts`
  kann Events direkt über `turnierId` mitnehmen, ohne die Kette Event→Protokoll→Spiel aufzulösen;
  (b) die Sync-Export-Validierung `pruefeTurnierExportPaket` prüft je Dokument die
  Turnier-Zugehörigkeit über `turnierId` – ohne das Feld wäre der neue docType dort nicht
  absicherbar (CLAUDE.md-Regel: bei jeder `TurnierExportPaket`-Erweiterung die Validierung
  mitziehen); (c) Zugriffskontrolle je Request ohne Zusatz-Query.
- `sequenz: number` – vom **Server** beim Anhängen vergeben (höchste vorhandene Sequenz + 1).
  Ordnet die Events deterministisch; `zeitstempel` allein reicht nicht (Uhr des Geräts,
  Sekundengleichheit). Da je Spiel genau ein Protokollant schreibt, sind Konflikte praktisch
  ausgeschlossen; bei einem CouchDB-Konflikt wird einmal neu gelesen und erneut versucht.
- `erstelltVonName?: string` – der Protokollant hat i. d. R. **kein** Benutzerkonto (Code-Sitzung,
  Abschnitt 6); analog zu `zuschreibung()`-Platzhaltern bzw. `ErgebnisAenderung.erfasserName`
  wird der beim Protokoll-Start abgefragte Name mitgeschrieben.

**`Spielprotokoll` bekommt zusätzlich:**

- `turnierId` (denormalisiert, gleiche Gründe).
- `ersterProtokollantName: string` – Name beim Protokoll-Start (die Protokollanten-Historie ist
  laut Spez. 20.11 dieser Startwert plus die HANDOVER-Events).
- `seiteAVertauscht?: boolean` – reine Anzeige-Einstellung „welches Team links/rechts"
  (Spez. 7.3), ändert keine Daten.
- `turnierleitungBestaetigtAm?` / `turnierleitungBestaetigtVonName?` – nur beim Vier-Augen-
  Abschluss (Abschnitt 9) gesetzt.

**`Turnier` bekommt zusätzlich:** `protokollantCodeHash?` (dritter Turnier-Code, Abschnitt 6)
und `protokollBestaetigungErforderlich?: boolean` (Vier-Augen-Abschluss, Abschnitt 9).

Beide neuen docTypes (`spielprotokoll`, `event`) werden additiv in die `TorballDokument`-Union
aufgenommen. **Wichtig:** `docs/Archiv` zeigt, dass `NIE_ZURUECKSETZEN` (Demo-Snapshot) nur
Instanz-Einstellungen ausschließt – Protokolle/Events sind normaler Turnier-Inhalt und laufen
automatisch korrekt im Demo-Reset mit (Ausschluss-Logik, nichts zu tun).

### 2.2 Unveränderlichkeit

Events werden **nie** geändert oder gelöscht (Spez. 7.1) – es gibt serverseitig ausschließlich
„anhängen". Korrekturen sind neue Events mit `istKorrektur: true` + `korrigiertEventId`
(Semantik in Abschnitt 3). Einzige Ausnahme vom Nie-Löschen: die Kaskaden-Löschung beim
Turnier-Löschen (wie bei allen anderen turnierbezogenen Dokumenten).

## 3. Event-Semantik, Korrekturen, Undo

### 3.1 Korrektur-Semantik (die eine zentrale Regel)

Ein Event mit `istKorrektur: true` und `korrigiertEventId: X` bedeutet: **Event X gilt als
annulliert.** Trägt das Korrektur-Event selbst Nutzdaten (`eventTyp`/`mannschaft`/`spielerId`…),
gilt es zugleich als Ersatz („X war falsch, richtig ist …"); trägt es keine (nur die Referenz),
ist X ersatzlos gestrichen. Jede Auswertung (Reducer, Ergebnis-Ableitung) filtert zuerst alle
annullierten Events heraus und wertet dann den Rest aus. Eine Korrektur einer Korrektur
annulliert das Korrektur-Event – das ursprüngliche Event lebt dadurch wieder auf (Kette sauber
auflösbar, keine Sonderfälle).

Sonderfall **PROT** (Spez. 22.3): Die spätere Entscheidung der Turnierleitung wird als
Korrektur-Event auf das PROT-Event erfasst, annulliert es aber fachlich **nicht** – bei
`korrigiertEventId` auf ein PROT-Event gilt „ergänzt" statt „annulliert" (das Protest-Event
bleibt sichtbar, die Entscheidung kommt dazu). Das ist die einzige Typ-Sonderregel.

### 3.2 Undo (Panel-Taste / UI-Knopf)

„Undo" erzeugt eine ersatzlose Korrektur auf das **letzte nicht annullierte** Event des
Protokolls. Mehrfach-Undo arbeitet sich rückwärts durch. Kein Löschen, volle Nachvollziehbarkeit.

### 3.3 UI-Aktionen vs. Event-Typen

Das Panel-Konzept denkt in Nutzer-Aktionen („Tor", „Fehlwurf"), die Spezifikation in atomaren
Events (W, G, …). Zuordnung:

| UI-Aktion (Panel/Bildschirm) | erzeugte Events | Spielernummer nötig |
|---|---|---|
| Tor | `W` + `G` (zwei Events, gleiche Spielzeit) | ja (Werfer = Torschütze) |
| Eigentor | `G` mit `istEigentor` (kein `W`, kein Torschütze) | nein |
| Fehlwurf | `W` | ja (Werfer) |
| Kontrolle | `K` | nein |
| Foul | `F` | ja (Verursacher) |
| Strafwurf (Penalty) | `P` | nein |
| Auszeit | `T` | nein |
| Techn. Auszeit | `TT` | nein (Mannschaft optional) |
| Wechsel | `E` (raus + rein) | ja, zwei Nummern |
| Aufstellung (vor Anpfiff/Pause, per Bildschirm-Auswahl statt Tastenfolge) | `AUF` (`zusatz.spielerIds`, drei Spieler) | Auswahl aus dem Kader |
| Freiwurf | `FW` | ja (Werfer) |
| Uhr Start/Stop | `GO` / `STOP` (Umschalten) | – |
| Halbzeit | `B` | – |
| Verlängerung | `VB` | – |
| Spielende | `End` | – |
| Abschluss | `Fin` | – |
| Protokollantenwechsel | `HANDOVER` (`zusatz.neuerProtokollant`) | – |
| Protest | `PROT` (`zusatz.begruendung`) | – |

Begründung für „Tor = W+G": Die 3-Wurf-Regel (Spez. 6.3) zählt **Würfe**. Würde die Tor-Aktion
nur ein `G` schreiben, fehlte der Wurf im Zähler des Torschützen und die Warnlogik wäre falsch.
Mit dem Doppel-Event bleibt jedes Event atomar (Spez.-konform), und die G-Prüfung „vorheriges
Wurf-Event vorhanden?" ist automatisch erfüllt. Ein Undo auf „Tor" annulliert beide Events
(das UI weiß, dass sie zusammengehören – gleiche Sequenz-Nachbarn, W direkt vor G).

`PA` (auto-erkannter Penalty) wird vom **Client** geschrieben, sobald der Foulzähler einer
Mannschaft nach einem F-Event auf 3 steht – rein dokumentarischer System-Hinweis; das echte
Penalty (`P`) erfasst der Protokollant weiterhin manuell, erst dann wird der Foulzähler
zurückgesetzt (Spez. 6.4/22.3).

### 3.4 Antworten auf die offenen Punkte des Panel-Konzepts

1. **Unvollständige Eingabe + Uhr/Halbzeit-Taste:** Die offene Eingabe wird **verworfen**, die
   Uhr-/Halbzeit-Aktion wird gebucht. Begründung: Uhr-Ereignisse sind zeitkritisch (Abpfiff!),
   eine halbfertige Wechsel-Eingabe ist es nicht – sie kann danach neu begonnen werden. Das UI
   zeigt einen kurzen Hinweis „Eingabe verworfen".
2. **Timeout bei offener Eingabe:** Ja – automatischer Reset der offenen Eingabe nach
   10 Sekunden Inaktivität (nur die Eingabe, kein gebuchtes Event betroffen).
3. **Spielernummern:** siehe Tabelle oben (Tor, Fehlwurf, Foul, Freiwurf: eine Nummer;
   Wechsel: zwei; alle anderen: keine).
4. **Halbzeit und Seitenwechsel:** `B` löst **keinen** automatischen Seitentausch der Anzeige
   aus. Die Seitenansicht ist ein manueller Umschalter (`seiteAVertauscht`, Spez. 7.3) – ob die
   Teams real die Seiten wechseln, ist Sache der Halle, nicht der Software.

## 4. Aggregation: Wo wird der Spielstand berechnet?

Der komplette Live-Zustand (Spielstand, Uhr, Foul-/Wurf-/Timeout-/Wechselzähler, Feldbesetzung,
Timer A/B, „kurzzeitig ausgesetzt", Hinweise) wird laut Spez. 22.1 aus der Event-Liste
berechnet – nirgends gespeichert. Die Frage ist nur: wo läuft diese Berechnung?

**Entscheidung: Der volle Reducer läuft ausschließlich im Frontend** –
`frontend/src/protokoll/stand.ts`, reine Funktion `berechneProtokollStand(events, kontext)`.
Er muss ohnehin dort laufen (jeder Tastendruck braucht sofortiges Feedback, Timer ticken
clientseitig), und **alle** Prüfungen aus Spez. 22.3 sind Warnungen, keine Blockaden („die
Software warnt, blockiert nicht") – der Server muss sie also gar nicht durchsetzen.

Das Backend braucht nur eine **kleine** Ableitung `ergebnisAusEvents(events)`
(`backend/src/protokoll/ergebnis.ts`): annullierte Events herausfiltern, `G`-Events je Seite
zählen (Eigentor → Gegner), fertig – ca. 20 Zeilen, per `node:test` getestet. Damit entfällt
das Risiko eines großen Frontend↔Backend-Duplikats (CommonJS-Regel: `shared` kann dem Frontend
keine Laufzeit-Logik liefern); dupliziert wird nur der winzige Annullierungs-Filter, der in
beiden Dateien mit Verweis aufeinander kommentiert wird (bestehendes Muster, wie
`zeitplanung.ts`).

Die Uhr: `GO`/`STOP`-Events tragen den Server-Zeitstempel; der Client berechnet die laufende
Spielzeit aus „Summe der abgeschlossenen Laufphasen + (jetzt − letztes GO)". Events tragen die
vom Client berechnete `spielzeit` (Sekunden im Abschnitt) als Protokoll-Wahrheit – die Software
dokumentiert, der Schiedsrichter entscheidet.

## 5. Integration in Spiel & Tabelle (das Gate)

Alles hinter `turnier.protokollierungsart === "digital"`; der `manuell`-Pfad bleibt unberührt.

Der Protokoll-Endpunkt pflegt bei jedem Schreiben die vorhandenen `Spiel`-Felder – dadurch
funktionieren Tabelle, öffentliche Seite, Polling und PDFs ohne jede Änderung:

| Protokoll-Ereignis | Wirkung auf `Spiel` |
|---|---|
| Protokoll angelegt + erstes `GO` | `status: "laeuft"`, `startzeitTatsaechlich` |
| `G` / Korrektur, die ein `G` betrifft | `ergebnisA/B` neu aus `ergebnisAusEvents()` |
| `End` | `status: "beendet"`, `endzeitTatsaechlich`, Ergebnis final berechnet |
| `Fin` (Abschluss) | `ergebnisAbgeschlossen: true`, `status: "abgeschlossen"` |

Damit ist auch das **Live-Ergebnis** auf der öffentlichen Turnierseite automatisch da: die
pollt ohnehin alle 10–15 s die Spiel-Dokumente – ein Tor erscheint dort ohne neuen Endpunkt.
(Ob das gewollt ist oder das Ergebnis erst bei Spielende sichtbar werden soll → offene
Entscheidung 12.2.)

Die Ergebnis-Erfassung des `manuell`-Pfads (`ErgebnisVerwaltung`, Token-Seite) zeigt bei
`protokollierungsart: "digital"` ihre Eingabefelder nicht an (bestehende Weiche in
`ErgebnisVerwaltung.tsx` prüfen/ergänzen) – Korrekturen laufen im digitalen Pfad über
Korrektur-Events, nicht über direkte Ergebnis-PUTs.

## 6. Zugang: Wer darf protokollieren?

**Entscheidung (Nutzer, 21.08.2026): ein eigener dritter Turnier-Code „Protokollant"** –
zusätzlich zu Turnierleitung- und Spielleitung-Code, gleiches Muster (Abschnitt 21.3):

- Neues optionales Feld `Turnier.protokollantCodeHash` (analog den beiden bestehenden
  Code-Hashes, gehasht, nie über GET zurückgegeben). Setzen/Ändern über die bestehende Route
  `PUT/GET /turniere/:id/codes` (erweitert), Anmeldung über die bestehende öffentliche
  `POST /turniere/:id/code-anmeldung` (prüft den dritten Hash mit).
- `TurnierCodeSession.rolle` bekommt den dritten Wert `"protokollant"` (eigener Typ
  `TurnierCodeRolle` in `session.ts`; `TurnierRolle`/`TurnierBerechtigung` bleiben unberührt –
  „Protokollant" ist keine vergebbare Benutzer-Berechtigung, nur eine Code-Rolle).
- **Zugriffsstufen-Mapping:** Protokollant-Code → `lesen` (darf Spielplan/Ergebnisse ansehen,
  nichts davon ändern). Das Protokollieren selbst läuft über ein eigenes Prädikat
  `darfProtokollieren(turnier, akteur)` in `turnierZugriff.ts`: wahr bei
  `hatMindestens(schreiben_spielbetrieb)` ODER passendem Protokollant-Code. Die dreistufige
  `Zugriffsstufe` bleibt damit unangetastet (kein vierter Rang nötig).
- Frontend: eigene Route `/turniere/:id/code/protokollant` → `ProtokollantCodePage`
  (außerhalb `GeschuetzteRoute`, wie die beiden bestehenden Code-Seiten): Spielplan
  **lesend** + je Spiel der Einstieg „Protokollieren". `TurnierFreigabe` zeigt das dritte
  Code-Feld nur bei `protokollierungsart: "digital"` (bei „manuell" wäre der Code nutzlos).
- Der **Name** des Protokollanten (die „Unterschrift", Spez. 7.4) ist vom Konto entkoppelt:
  beim ersten Öffnen eines Protokolls wird er abgefragt (Muster `ErgebnisAenderung.erfasserName`)
  und in `ersterProtokollantName` bzw. bei HANDOVER in `zusatz.neuerProtokollant` geführt.
  `erstelltVon` (BenutzerId) bleibt optional daneben, wenn ein echtes Konto angemeldet ist.
  `zuschreibung()` bekommt den Platzhalter „Protokollant-Code" für die Code-Rolle.
- Protokollieren können damit: Admin, Turnier-Ersteller, `TurnierBerechtigung`-Inhaber ab
  Spielleitung, Turnierleitung-/Spielleitung-Code **und** Protokollant-Code – letzterer kann
  ausschließlich protokollieren, sonst nichts schreiben.

## 7. Protokollier-Seite (UI)

Neue Route `/turniere/:turnierId/spiele/:spielId/protokoll` (`ProtokollPage.tsx`), erreichbar
aus Spielplan-Sicht und `SpielleitungCodePage`. Aufbau (eine Seite, kein Tab-Wirrwarr –
Vollbild-tauglich für den Protokollanten-Laptop):

1. **Scoreboard-Zeile:** Spielstand groß, Mannschaftsnamen (Seiten per `seiteAVertauscht`
   tauschbar), Abschnitt (1/2/V1/V2/FW), laufende Spielzeit (tickend, Überhang ins Minus
   weiterzählend mit deutlichem Hinweis – Spez. 6.1).
2. **Status-Zeile je Team:** Foulzähler (0–2, bei 3 → Penalty-Hinweis), verbrauchte
   Timeouts/Wechsel, Kader mit Trikotnummern, letzter Werfer mit Wurfzähler (3-Wurf-Regel).
   *(In der Umsetzung bewusst KEINE Feldbesetzungs-Verfolgung – siehe Abschnitt 11.)*
3. **Timer A/B** (8-Sekunden-Anzeigen, Spez. 6.2): Timer A startet mit jedem `W`, Timer B mit
   `K`; reine Anzeige mit Signalfarbe bei Ablauf – kein automatisches Foul.
4. **Eingabebereich:** Team-Kontext-Umschalter (A/B, deutlich sichtbarer farbiger Balken –
   Monitor-Feedback fürs displaylose Panel), Aktions-Buttons (Tabelle 3.3), Ziffernfeld.
   Bildschirm-Buttons und Tastatur (`keydown`) treiben **dieselbe** Zustandsmaschine.
5. **Ereignisliste** (neueste oben): Zeit, Typ, Team, Spieler; annullierte Events
   durchgestrichen; Undo-Knopf; bei Bedarf gezielte Korrektur einzelner Events.
6. **Hinweis-Bereich** (`aria-live="polite"`): Warnungen aus dem Reducer (3. Wurf, 4. Wurf,
   drittes Foul → Penalty, Timeout ohne Kontingent, Tordifferenz-Limit, …) – warnen, nie
   blockieren.

Barrierefreiheit von Anfang an: komplette Tastatur-Bedienbarkeit ist hier der Kern (nicht
Beiwerk), sichtbarer Fokus, große Schrift/Kontraste (Halle!), Hinweise über `aria-live`,
volle Textfarbe.

**Synchronisation:** Die Seite hängt am Polling-Muster des Projekts (Events nachladen alle
10–15 s bei sichtbarem Tab) – primär schreibt sie aber selbst und hängt jedes bestätigte Event
sofort lokal an (optimistisch, Server-Sequenz aus der Antwort). Zwei parallel schreibende
Protokollanten sind kein Design-Ziel (fachlich gibt es genau einen); ein zweites offenes Gerät
sieht die Events per Polling nur lesend nach.

## 8. Eingabe-Zustandsmaschine & Tastatur

Eine Zustandsmaschine (`frontend/src/protokoll/eingabe.ts`, rein, testbar im Kopf – Logik
bewusst trivial gehalten): `{ teamKontext: "A"|"B"|null, aktion: UiAktion|null,
ziffern: number[] }`. Übergänge nach Panel-Konzept: Team wählen → Aktion → Ziffer(n) → OK
bucht; `Uhr`/`Halbzeit` buchen sofort, verwerfen offene Eingaben und setzen den Team-Kontext
zurück; `Undo`/`OK` erhalten den Kontext; 10-s-Inaktivitäts-Reset der offenen Eingabe.

**Entscheidung: Das Panel-Bedienmodell (Team-Kontext-Toggle) ist DAS Eingabemodell** – auch
für die normale Tastatur. Die Belegung aus Spez. 24.4 (gleiche Taste + STRG für Team B) wird
**nicht** umgesetzt: zwei parallele Modelle hieße doppelte Logik, und der STRG-Ansatz
funktioniert am HID-Panel nicht (das Panel sendet einzelne Keycodes; genau deshalb wurde im
Panel-Konzept der Toggle entworfen). Die Spezifikation 24.4 wird entsprechend angepasst.

Standard-Belegung (ein flaches `KEYMAP`-Objekt, damit die spätere Konfigurierbarkeit je
Turnier – Spez. 24.4 – nur noch UI ist; im ersten Wurf fest):

| Taste(n) | Bedeutung |
|---|---|
| `A` / `B` | Team-Kontext A / B |
| `0`–`9` | Ziffer (Spielernummer) |
| `G` | Tor · `X` Fehlwurf · `K` Kontrolle · `F` Foul · `P` Strafwurf · `T` Auszeit · `M` Techn. Auszeit · `E` Wechsel · `R` Freiwurf |
| `Leertaste` | Uhr Start/Stop |
| `H` | Halbzeit/Pause · `V` Verlängerung |
| `Backspace` | Undo |
| `Enter` | OK/Bestätigen |
| `Escape` | offene Eingabe verwerfen |

(`B` ist als Team-Taste vergeben, deshalb Halbzeit auf `H` statt Spez.-`B`; „End"/„F11"/„F12"
aus 24.4 entfallen als Tasten – Spielende, Protokollantenwechsel, Protest und Abschluss sind
seltene, bewusste Aktionen mit Bestätigungsdialog und laufen nur über Bildschirm-Buttons.)
Das ESP32-Panel sendet später schlicht diese Keycodes – die finale Firmware-Belegung fällt
damit direkt aus dieser Tabelle (Panel-Konzept „Nächste Schritte").

## 9. Abschluss-Workflow & Protest

Dem Ablauf aus Spez. 7.4 folgend, auf dem `Spielprotokoll.status` abgebildet:

1. `End`-Event → Protokoll `status: "beendet"`, Spiel `status: "beendet"`. Korrekturen durch
   die Spielleitung weiterhin möglich (auch PROT nachträglich).
2. Unterschrift: Protokollant bestätigt mit Namen (`protokollantName`,
   `protokollantBestaetigtAm` am Protokoll).
3. `Fin`-Event (nur mit Unterschrift möglich) → Protokoll `status: "abgeschlossen"` – ab
   jetzt nimmt der Server keine Events mehr an (409), einzige Ausnahme: die
   Protest-**Entscheidung** der Turnierleitung (Korrektur auf PROT, verlangt `schreiben_voll`).
4. **Bestätigung durch die Turnierleitung (Spez. 7.4 Punkt 5): konfigurierbar je Turnier**
   (Nutzer-Entscheidung 21.08.2026 – Bundesliga hat härtere Vorschriften als normale
   Turniere). Neues Feld `Turnier.protokollBestaetigungErforderlich: boolean` (Default
   `false`, einstellbar neben dem Protokollierung-Dropdown im Übersicht-Reiter, nur bei
   `digital` sichtbar):
   - **aus:** `Fin` setzt zugleich Spiel `ergebnisAbgeschlossen: true` + `status:
     "abgeschlossen"` – fertig (einstufig).
   - **an (Vier-Augen):** `Fin` schließt nur das Protokoll ab; das Spiel bleibt `beendet`.
     Erst `POST /protokolle/:id/bestaetigen` (verlangt `schreiben_voll`, also Turnierleitung)
     setzt `turnierleitungBestaetigtAm/VonName` am Protokoll und `ergebnisAbgeschlossen` +
     `status: "abgeschlossen"` am Spiel. Das Live-Ergebnis steht dabei längst in der Tabelle
     (die wertet jedes Spiel mit gesetztem Ergebnis) – die Bestätigung finalisiert nur.

Dazu ein read-only **Spielbericht** (eigene Sicht oder Abschnitt der Protokollseite):
vollständige Ereignisliste inkl. Korrektur-Historie, Protokollanten-Historie („Person A bis
14:32, Person B ab 14:32"), Proteste samt Entscheidung. PDF-Export des Spielberichts bewusst
später (bestehendes `PdfDokument`-Modell ist vorbereitet, aber nicht Teil des MVP).

## 10. Backend-Routen (alle in neuer Datei `backend/src/routes/protokoll.ts`)

| Route | Zweck | Stufe |
|---|---|---|
| `GET /spiele/:spielId/protokoll` | Protokoll + alle Events (sortiert nach `sequenz`) | `lesen` |
| `POST /spiele/:spielId/protokoll` | Protokoll anlegen (idempotent: existiert schon → 409 mit Verweis), `ersterProtokollantName` Pflicht | `schreiben_spielbetrieb` |
| `POST /protokolle/:id/events` | Event anhängen (Server vergibt `sequenz`, validiert Typ-Schema, pflegt Spiel-Felder nach Abschnitt 5) | `schreiben_spielbetrieb` |
| `POST /protokolle/:id/unterschreiben` | Unterschrift (Name) setzen | `schreiben_spielbetrieb` |
| `POST /protokolle/:id/bestaetigen` | Turnierleitungs-Bestätigung (nur bei `protokollBestaetigungErforderlich`) | `schreiben_voll` |
| `PUT /protokolle/:id/anzeige` | `seiteAVertauscht` umschalten | `schreiben_spielbetrieb` |

Alle Stufen-Angaben mit `schreiben_spielbetrieb` meinen `darfProtokollieren()` (Abschnitt 6):
mindestens Spielleitung **oder** Protokollant-Code.

Querschnitt (Projekt-Regeln, gelten alle auch hier): `turnierGesperrt()` +
`turnierAusgecheckt()` an allen Schreibrouten; `ohneFelder()`-Stripping beim Event-Body
(`_id`/`_rev`/`docType`/`sequenz`/`erstelltVon*` sind server-kontrolliert);
`markiereTurnierBearbeitet()` bewusst **nicht** (Protokollieren ist Ergebnis-Erfassung im
Sinne der bestehenden Ausnahme); Fastify-Body-Schemata je Route; kein `db.find` ohne
`findAllBySelector`. Sync-Export: `TurnierExportPaket` um `spielprotokolle`/`events` erweitern
**und** `pruefeTurnierExportPaket` (Präfix + docType + turnierId) mitziehen.

## 11. Bewusst NICHT im ersten Wurf (MVP-Schnitt)

- **Beamer-/Zuschauer-Livesicht** des laufenden Spiels (Scoreboard-Ansicht für die Halle) –
  die öffentliche Seite zeigt Live-Ergebnisse bereits über das bestehende Polling.
- **PDF-Spielbericht** (Modell vorhanden, kommt nach dem MVP).
- **Konfigurierbare Tastenbelegung je Turnier** (Spez. 24.4) – erst festes Standard-Keymap;
  die Datenstruktur (ein `KEYMAP`-Objekt) ist darauf vorbereitet.
- **Statistiken/Torschützenliste** aus Events (Spez. 9.3/9.4, Wettbewerbs-Torschützen-Summe) –
  Datengrundlage entsteht automatisch, Auswertung später.
- **Freiwurf-Entscheidung als geführter Modus** (Nominierung dreier Spieler, abwechselnde
  Würfe) – im MVP werden Freiwürfe als einfache `FW`-Events erfasst, die Führung macht der
  Mensch.
- **Panel-Hardware/Firmware** – folgt separat auf Basis des Keymaps (Abschnitt 8).
- ~~Feldbesetzungs-/Aufstellungs-Verfolgung~~ **Nachgezogen am selben Tag (Nutzer-Vorgabe:
  „vor dem Anpfiff muss definiert werden, wer auf dem Feld steht"):** neues Event `AUF`
  (`zusatz.spielerIds`, je Mannschaft) legt die Start-Drei fest, `E`-Wechsel schreiben die
  Feldbesetzung fort; die Seite zeigt vor dem Anpfiff automatisch die Aufstellungs-Auswahl
  (Kader-Buttons, genau 3), warnt bei fehlender/unvollständiger Aufstellung und bei Aktionen
  von Spielern, die nicht auf dem Feld stehen (bucht aber trotzdem – warnen, nie blockieren).
  Weiterhin offen bleibt nur der abgeleitete Status „kurzzeitig ausgesetzt" (Spez. 20.18,
  Foul → raus für einen Freiwurf).

## 12. Entschiedene Punkte (Nutzer, 21.08.2026)

1. **Protokollant-Zugang: eigener dritter Turnier-Code „Protokollant"** (statt Wiederverwendung
   des Spielleitung-Codes) – Umsetzung siehe Abschnitt 6.
2. **Live-Ergebnis: sofort bei jedem Tor** – Tor-Events aktualisieren `Spiel.ergebnisA/B`
   direkt; bei freigegebenen Ergebnissen zeigt die öffentliche Seite den Spielstand live
   (Freigabe steuern weiterhin die `oeffentlich*`-Häkchen).
3. **Tor = W+G-Doppel-Event** (Abschnitt 3.3) – die 3-Wurf-Zählung bleibt damit korrekt.
4. **Turnierleitungs-Bestätigung des Abschlusses: konfigurierbar je Turnier**
   (`protokollBestaetigungErforderlich`, Default aus – Bundesliga u. ä. schalten es ein),
   siehe Abschnitt 9.

## 13. Umsetzungsphasen (nach Freigabe der Entscheidungen)

1. **Shared + Backend-Kern:** Typ-Ergänzungen (2.1), Union, `protokoll.ts`-Routen,
   `ergebnisAusEvents()`, Spiel-Feld-Pflege, Sync-Export + Validierung; `node:test` für
   Ergebnis-Ableitung/Korrektur-Semantik + Integrationstest (Route inkl. Sperren).
2. **Frontend-Kern:** Reducer `stand.ts`, Eingabe-Zustandsmaschine `eingabe.ts`, Keymap,
   `ProtokollPage` (Erfassung + Scoreboard + Timer + Ereignisliste + Undo).
3. **Abschluss & Bericht:** Unterschrift, `Fin`, Protest inkl. Entscheidung, Spielbericht,
   Einstiege in Spielplan-Sicht/`SpielleitungCodePage`, Hilfe-Thema.
4. **Härtung:** Browser-Ende-zu-Ende-Test am Testturnier, Test-Instanz-Deploy
   (`BRANCH=feature/digitales-protokoll`), danach Merge-Entscheidung.

Jede Phase endet mit grünem `npm run build` + Lint + Tests; Zwischenstände werden auf dem
Feature-Branch committet.

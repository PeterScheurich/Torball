# Protokoll: Ergebniserfassung

**Datum:** 10.08.2026
**Ziel dieser Sitzung:** Abschnitt 9/14/20.14 der Gesamtspezifikation umsetzen
– Endergebnisse je Spiel erfassen, Tabellenberechnung, und die in Abschnitt 14
beschriebene Token-basierte Ergebniserfassung ohne Login für Gelegenheits-
nutzer (Spielleitung vor Ort ohne eigenen Account).

---

## 1. Scoping-Entscheidung: nur `protokollierungsart = manuell`

Die Spezifikation kennt zwei Wege, ein Ergebnis zu bekommen: das digitale
Live-Ereignisprotokoll (Abschnitt 22, Würfe/Fouls/Tore als Einzelereignisse)
oder – bei `manuell` – ausschließlich Endergebnisse per Token (Abschnitt 14).
Das Live-Protokoll existiert in diesem Projekt noch nicht. Diese Sitzung
deckt deshalb bewusst nur den `manuell`-Pfad ab; `digital`-Turniere können
aktuell noch gar keine Ergebnisse bekommen (dazu fehlt die gesamte
Ereigniserfassung). Die Turnier-Übersicht weist jetzt explizit darauf hin,
wenn ein Turnier auf „Digital" steht.

**Default-Entscheidung ohne Rückfrage:** Bei der Turnier-Anlage ist
`protokollierungsart` jetzt standardmäßig auf `manuell` vorausgewählt (die
Spezifikation selbst trifft dazu keine Aussage außer "Vorgabewert aus der
Systemkonfiguration", die es noch nicht gibt). Begründung: `digital` als
Default wäre aktuell eine Falle – jedes neue Turnier wäre ohne Umschalten auf
der Übersicht komplett unfähig, ein Ergebnis zu bekommen. Sobald das
Live-Protokoll existiert, sollte dieser Default neu bewertet werden.

## 2. Tabellenberechnung (`backend/src/ergebnisse/tabelle.ts`)

Reine, getestete Funktion (`tabelle.test.ts`, 5 Tests). Wichtige Punkte:

- **Kein Abschluss nötig:** Abschnitt 14 sagt explizit "Eine Bestätigung durch
  die Turnierleitung vor Einfließen in die Tabelle ist zunächst nicht
  erforderlich" – die Tabelle berücksichtigt deshalb jedes Spiel mit
  gesetztem Ergebnis, unabhängig von `ergebnisAbgeschlossen`.
- **Forfait-Punktabzug (Abschnitt 9.2):** Das Spiel-Dokument hält nicht fest,
  *welche* Mannschaft nicht angetreten ist – nur `istForfait: boolean`. Bei
  einem Forfait-Ergebnis ist das aber immer die Seite mit dem niedrigeren
  Ergebnis (ein Forfait-Ergebnis ist per Definition einseitig), daraus wird
  die betroffene Mannschaft abgeleitet. 2 Punkte Abzug sind hartkodiert
  (`FORFAIT_PUNKTABZUG`) – dieselbe Einschränkung wie bei der
  Passwort-Mindestlänge: Systemkonfiguration hat noch keine CRUD-Routen.
- **"Freiwürfe" (5. Sortierkriterium) ist ein No-Op:** ohne Live-Protokoll
  gibt es keine Freiwurf-Zählung.
- **"Direkter Vergleich" nur paarweise:** korrekt für den häufigen Fall von
  zwei gleichstehenden Mannschaften; bei einem zirkulären Dreier-Gleichstand
  (A schlägt B, B schlägt C, C schlägt A – alle mit identischen
  Punkten/Tordifferenz/Toren) liefert das keine eindeutige Reihenfolge. Eine
  vollständige Mini-Tabelle unter den betroffenen Mannschaften ist bewusst
  nicht umgesetzt (seltener Randfall, deutlich höherer Aufwand).

## 3. Backend-Routen

- **`PUT /spiele/:id/ergebnis`** ([`routes/ergebnis.ts`](../../backend/src/routes/ergebnis.ts)):
  Ergebnis setzen/ändern, authentifiziert (Turnier-Schreibzugriff). Bewusst
  **ohne** Sperre durch `ergebnisAbgeschlossen` – Abschnitt 14: "Nach
  Abschluss ändert nur noch die Turnierleitung" heißt nicht "niemand mehr",
  nur "nicht mehr per Token". Das ist der zentrale Unterschied zur
  Token-Route unten.
- **`PUT /spiele/:id/abschliessen`** / **`PUT /turniere/:id/spiele/abschliessen`**:
  einzeln bzw. gesammelt abschließen (Abschnitt 14). Kein
  "Wieder-öffnen"-Endpunkt – "Ein Zurücksetzen auf 'per Token änderbar' ist
  nicht vorgesehen".
- **`GET /turniere/:id/tabelle`**: berechnet die Tabelle live, kein
  gespeichertes Dokument.
- **`ErgebnisToken`** ([`routes/ergebnisToken.ts`](../../backend/src/routes/ergebnisToken.ts)):
  Verwaltung (erzeugen/anzeigen/widerrufen, authentifiziert) plus zwei
  **öffentliche** Routen ohne Login: `GET /ergebnis-erfassung/:tokenWert`
  (Turnier-Kurzinfo + Spiele, keine sensiblen Daten) und
  `PUT /ergebnis-erfassung/:tokenWert/spiele/:spielId` (Ergebnis setzen,
  inkl. `erfasserName`/`geraetKennung`, protokolliert als `ErgebnisAenderung`
  – Abschnitt 20.14: "wer/wann/alter/neuer Wert"). Lehnt Änderungen an
  bereits abgeschlossenen Spielen mit `409` ab.

**Entscheidung ohne echte Alternative in der Spezifikation:** Der
Token-Wert wird – anders als Einladungs-/Passwort-Reset-Tokens – im
**Klartext** gespeichert, nicht gehasht. Begründung: Er ist explizit zum
Weitergeben gedacht und muss über `GET` jederzeit wieder anzeigbar sein
(z. B. um ihn erneut zu kopieren); sein Missbrauchspotential ist eng
begrenzt (nur Endergebnisse *dieses* Turniers, jederzeit revoke-/audit-bar) –
anders als ein Einladungs-Token, der einen vollen Account-Zugriff eröffnet.

## 4. Frontend

- **`ErgebnisVerwaltung.tsx`**: neuer Tab "Ergebnisse" in `TurnierVerwaltenPage`.
  Ergebniseingabe je Spiel, Schnellaktionen "A/B nicht angetreten" (setzen
  automatisch 0:3 bzw. 3:0 mit `istForfait: true` und speichern direkt),
  Abschließen einzeln/gesamt, Tabelle-Anzeige, Erzeugen/Widerrufen des
  öffentlichen Links.
- **`ErgebnisErfassungPage.tsx`** (neue öffentliche Route
  `/ergebnis-erfassung/:tokenWert`, außerhalb `GeschuetzteRoute`): fragt
  einmalig einen Namen ab (in `localStorage` gemerkt, Abschnitt 14: "am
  Gerät gespeichert"), erzeugt zusätzlich eine lokale Geräte-Kennung
  (`crypto.randomUUID()`, ebenfalls in `localStorage`). Zeigt danach die
  Spiele des Turniers mit editierbaren Ergebnissen; bereits abgeschlossene
  Spiele sind über die deaktivierten Eingabefelder erkennbar.

## 5. End-to-End-Verifikation gegen die echte CouchDB

Kompletter Testlauf mit einem Wegwerf-Testaccount und einem 4-Mannschaften-
Turnier (danach vollständig entfernt):

- Tabelle vor jedem Ergebnis: alle Mannschaften bei 0.
- Ergebnis setzen → Tabelle aktualisiert sich **ohne** Abschluss.
- Ungültiges Ergebnis (negative Zahl) → `400`.
- Forfait (0:3, `istForfait: true`) → Tabelle zieht der verlierenden
  Mannschaft zusätzlich 2 Punkte ab, kumuliert korrekt mit einem bereits
  vorhandenen Unentschieden aus einem anderen Spiel.
- Abschließen ohne gesetztes Ergebnis → `400`.
- Einzeln abschließen, dann trotzdem per authentifizierter Route änderbar
  (Turnierleitung darf immer) – bulk-Abschluss schließt nur die Spiele mit
  Ergebnis, die noch nicht abgeschlossen waren.
- Token erzeugen → öffentlicher Abruf funktioniert ohne Cookie/Login.
- Öffentliches Ergebnis setzen auf einem offenen Spiel → `200`, `ErgebnisAenderung`
  korrekt mit Name/neuen Werten/Zeitstempel gespeichert.
- Öffentliches Ändern eines bereits abgeschlossenen Spiels → `409`.
- Token widerrufen → öffentlicher Zugriff danach `404`.
- Kompletter Durchklick im Browser (nicht nur `curl`): Ergebnisse-Tab,
  Tabelle-Anzeige, Link erzeugen, Link in neuem Tab ohne Anmeldung öffnen,
  Namens-Abfrage, Ergebnis speichern – Status wechselt sichtbar von "Offen"
  zu "Erfasst".

## 6. Spezifikations-Abgleich

Keine Abweichung entdeckt, die eine Korrektur von
`docs/torball_gesamtspezifikation.md` nötig gemacht hätte – die Lücken oben
(Systemkonfiguration-Werte hartkodiert, `direkter_vergleich` nur paarweise,
`digital`-Pfad nicht umgesetzt) sind Umsetzungsstand, keine fachliche
Klärung. Deshalb hier keine Dokument-Änderung.

---

## Offene Punkte für die nächste Sitzung

- **Live-Ereignisprotokoll** (Abschnitt 22, `protokollierungsart = digital`)
  – der bisher komplett fehlende zweite Weg zu einem Ergebnis.
- **Systemkonfiguration-CRUD**, damit Forfait-Ergebnis/-Punktabzug und
  Passwort-Mindestlänge nicht mehr hartkodiert sind.
- **"Ausscheiden einer Mannschaft"** (Abschnitt 9.2: alle bisherigen
  Ergebnisse annulliert) und **"Vorzeitiger Abbruch"** (5:0) sind nicht
  modelliert – beide passen eher zum Live-Protokoll-Kontext als zum
  einfachen manuellen Pfad.
- **Öffentliche, unauthentifizierte Ergebnis-/Tabellen-Ansicht**
  (`oeffentlichErgebnisse`-Flag existiert auf dem Turnier, wird aber noch
  nirgends ausgewertet) – weiterhin offen aus dem letzten Protokoll.

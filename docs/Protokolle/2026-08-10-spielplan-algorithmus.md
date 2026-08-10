# Protokoll: Spielplan-Algorithmus (Abschnitt 8/28)

**Datum:** 10.08.2026
**Ziel dieser Sitzung:** Den offenen technischen Punkt „Spielplan-Algorithmus"
(Abschnitt 28 der Gesamtspezifikation) angehen – automatische Generierung eines
Spielplan-**Vorschlags** aus Mannschaften und Spielfeldern, unter Einhaltung der
harten und weichen Regeln aus Abschnitt 8.

---

## 1. Ausgangslage und Entscheidung: Heuristik statt exakter Solver

**Warum keine Constraint-Solver-Bibliothek (z. B. ILP/CP-SAT):** Der Spielplan ist
laut Spezifikation ausdrücklich nur ein **Vorschlag**, den die Turnierleitung
jederzeit händisch anpassen darf. Ein exakter Solver würde eine schwere
Zusatzabhängigkeit einführen für einen Anwendungsfall, der keine mathematisch
beweisbare Optimallösung braucht. Entscheidung (mit Nutzer abgestimmt): ein
schneller, abhängigkeitsfreier **Greedy-Algorithmus**.

**Modus-Vereinfachung:** Auf Ebene eines einzelnen Spieltags (= ein Turnier-
Dokument) reduzieren sich alle in Abschnitt 4 gelisteten Modi auf zwei Grundfälle:
„Jeder gegen Jeden" (`wiederholungen=1`) oder „Jeder zweimal gegen Jeden"
(`wiederholungen=2`, für kleine Ligen mit 4–5 Mannschaften). Die Bundesliga-
Variante mit zwei Spieltagen ist eine Frage der `Wettbewerb`-Verknüpfung
(Abschnitt 20.3) zweier separater Turnier-Dokumente, nicht des Algorithmus selbst.
Endspiele und Vor-/Hauptrunden-Gruppen sind bewusst zurückgestellt (Abschnitt 29
sinngemäß) – Ausbaustufe für später.

---

## 2. Algorithmus-Design

Zwei Bausteine, neu unter `backend/src/spielplan/`:

- [`paarungen.ts`](../../backend/src/spielplan/paarungen.ts) – `erzeugePaarungen(mannschaften, wiederholungen)`
  erzeugt alle nötigen Paarungen und ordnet jeder eine Priorität zu:
  `verein` (gleicher Verein) > `bundesland` (gleiches Bundesland) > `neutral`
  (Abschnitt 8, "Bevorzugte Reihenfolge").
- [`planung.ts`](../../backend/src/spielplan/planung.ts) – `erstelleSpielplanVorschlag(paarungen, felder)`
  verteilt die Paarungen in fortlaufende Zeit-Slots (mehrere Felder pro Slot =
  parallel). Harte Regeln werden als **Eignungsfilter** umgesetzt (Team schon in
  diesem Slot verplant? Team hat im unmittelbar vorigen Slot gespielt?), die
  Prioritätsreihenfolge nur als **Sortierung** unter den jeweils zulässigen
  Paarungen – das setzt exakt die in Abschnitt 5.2 verlangte Reihenfolge um:
  „Vermeidung von Back-to-Back hat Vorrang vor früher Derby-Platzierung".
  Zwei Durchläufe pro Slot: 1. nur ausgeruhte Paarungen, 2. (nur falls der erste
  Durchlauf gar kein Spiel platzieren konnte) Back-to-Back als letztes Mittel,
  markiert über ein `warnung`-Feld statt stillschweigend zugelassen zu werden
  – passend zum Grundprinzip „die Software warnt, entscheidet nicht".

---

## 3. Wichtiger Fund: Zielkonflikt zwischen zwei "harten" Regeln

Beim Testen (siehe Abschnitt 4) fiel auf, dass Abschnitt 8 zwei Dinge gleichzeitig
verlangt, die sich **gegenseitig ausschließen**, sobald genug Felder für volle
Parallelität vorhanden sind (Felder ≥ Mannschaften/2):

- „Spiele auf verschiedenen Feldern sollen möglichst parallel stattfinden"
- „Eine Mannschaft hat keine zwei Spiele hintereinander"

Sind genug Felder da, dass ohnehin **alle** Mannschaften gleichzeitig spielen,
spielt zwangsläufig jede Mannschaft jede Runde – eine Pause ist nur durch bewusst
ungenutzte Feldkapazität möglich. Empirischer Beleg (Testskript mit variabler
Mannschafts-/Feldanzahl):

| Mannschaften | Felder | Anzahl Spiele | Warnungen |
|---|---|---|---|
| 6 | 1 | 15 | 2 |
| 6 | 2 | 15 | 10 |
| 6 | 3 (= voll parallel) | 15 | 12 |

**Weniger** Felder relativ zur Mannschaftszahl liefern also **weniger**
Back-to-Back-Fälle, nicht mehr – gegenläufig zur ersten Intuition.

**Klärung mit Nutzer:** Im Normalfall wird mit **einem** Spielfeld gespielt, in
Ausnahmefällen mit zwei; mehr Felder wären nur mit mehreren Gruppen sinnvoll
(eigenes Thema für später). Genau im Bereich 1–2 Felder liefert der Algorithmus
kaum Warnungen; bei sehr kleinen Ligen (4–5 Mannschaften) mit 2 Feldern sind
Warnungen dagegen erwartbar und wurden bewusst in einem Test dokumentiert, damit
sie später nicht als Regression missverstanden werden.

---

## 4. Tests

Neu: [`paarungen.test.ts`](../../backend/src/spielplan/paarungen.test.ts) und
[`planung.test.ts`](../../backend/src/spielplan/planung.test.ts), ausgeführt über
Node's eingebauten Test-Runner (kein zusätzliches Test-Framework):

```bash
npm run test --workspace=backend
# entspricht: tsx --test src/**/*.test.ts
```

Geprüft wird u. a.:
- Anzahl Paarungen korrekt für einfach/doppelt (`C(n,2)` bzw. `2 * C(n,2)`)
- Priorität korrekt zugeordnet (Verein/Bundesland/neutral)
- Kein Team spielt zweimal im selben Slot (harte Regel 1, immer geprüft)
- Normalfall (1 Feld, 8 Mannschaften): höchstens 2 unvermeidbare Back-to-Back-Fälle
- Ausnahmefall (2 Felder, 4 Mannschaften): Warnungen sind erwartbar (siehe Abschnitt 3)
- Vereins-Duell wird nachweislich früher eingeplant als neutrale Paarungen

Alle 10 Tests grün.

---

## 5. REST-Endpunkt und End-to-End-Test

Neuer Endpunkt:
```
GET /turniere/:id/spielplan-vorschlag?wiederholungen=1|2
```
lädt das Turnier und seine Mannschaften (`MannschaftImTurnier`, gefiltert über
`turnierId`) aus CouchDB und berechnet den Vorschlag – ohne ihn zu persistieren
(genau der "Vorschlag"-Charakter aus Abschnitt 8). Dafür wurden minimale
CRUD-Routen für `MannschaftImTurnier` ergänzt
([`backend/src/routes/mannschaft.ts`](../../backend/src/routes/mannschaft.ts)),
die bisher fehlten.

End-to-End gegen die echte CouchDB getestet: Turnier mit 1 Feld angelegt, 5
Mannschaften (2 davon im selben Verein), Vorschlag abgerufen – das Vereins-Duell
landete korrekt im ersten Zeit-Slot, insgesamt 10 Spiele (`C(5,2)`), nur eine
unvermeidbare Warnung ganz am Ende. Testdaten anschließend wieder gelöscht.

---

## 6. Merge-Konflikt beim Push

Der zuvor als Hintergrund-Task gestartete `npm audit fix` (siehe vorheriges
Protokoll) hatte in einer separaten Session bereits gepusht, bevor diese Session
gelöscht wurde. Der eigene Push wurde deshalb als Non-Fast-Forward abgelehnt:

```bash
git push
# ! [rejected] main -> main (non-fast-forward)

git fetch origin
git log --oneline HEAD..origin/main
# 988053e Merge branch 'claude/inspiring-mayer-f821bf'
# 934a668 Behebe 2 High-Severity-Sicherheitsluecken in Backend-Dependencies
```

Änderung betraf ausschließlich `package-lock.json` (Patch-Version-Bumps,
kein Konflikt mit den eigenen Dateien):

```bash
git pull --no-edit
npm run build && npm run test --workspace=backend   # zur Sicherheit erneut geprueft
git push
```

---

## Offene Punkte für die nächste Sitzung

- Endspiele (Finale/Platz 3) und Vor-/Hauptrunden-Gruppen im Spielplan-Algorithmus
- Spielprotokoll/Event-Sourcing (Abschnitt 22) – noch keine CRUD-Routen
- Der Endpunkt erzeugt aktuell nur einen Vorschlag; das tatsächliche Anlegen der
  `Spiel`-Dokumente (Übernahme in Modul „Turnier", Abschnitt 8) fehlt noch

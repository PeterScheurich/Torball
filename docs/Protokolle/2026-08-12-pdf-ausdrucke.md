# 2026-08-12 – Ausdrucke / PDFs

Druckfertige Dokumente, „immer aktuell", lokal speicherbar, **nichts serverseitig abgelegt**
(clientseitig erzeugt). Gefordert (Nutzer):

1. **Turnierinformationen** (intern, zum Verschicken): alle bekannten Grunddaten + Mannschaften +
   Regeln/Zusatzinfo, mit Link + QR-Code zur öffentlichen Turnierseite.
2. **Spielplan** (Aushang + Aushändigung an Mannschaften): Paarungen + Grunddaten (Name, Datum,
   Startzeit, Spielort, Turnierleitung), Link + QR zur öffentlichen **Ergebnisseite**.
3. **Schiedsrichter-Einteilung**: ein gemeinsames PDF, **eine Seite je Schiedsrichter** (wann/auf
   welchem Feld), je Seite Turnierkontext + QR zur Ergebnisseite.
4. **Öffentliche Seite**: Info-Dokument + Spielplan-Dokument (letzteres identisch zum Aushang).

## Entscheidungen (mit Nutzer)

- **Beide Ausgabewege**, danach ggf. einen entfernen:
  - **Getaggtes PDF über den Druckdialog** (barrierefrei): semantisches HTML → Chrome „Als PDF
    speichern" erzeugt ein **getaggtes** PDF (H1/H2-Struktur, Lesereihenfolge, Alt-Text).
  - **jsPDF-Direktdownload** (Ein-Klick-Datei): Best-Effort barrierefrei, aber **ohne** echte
    Struktur-Tags (jsPDF kann kein PDF/UA).
- Barrierefreiheit ausdrücklich wichtig (Torball!). Der getaggte Druckweg ist deshalb der eigentlich
  barrierefreie; jsPDF ist die bequeme Alternative.
- Schiedsrichter: **ein** PDF, eine Seite je Person.

## Architektur (DRY: ein Modell, zwei Ausgaben)

- `frontend/src/pdf/dokumente.ts`: quellen-agnostisches **Dokument-Modell** (`PdfDokument` mit
  Titel/Kopffeldern/QR/Abschnitten) + Builder `baueInfoDokument` / `baueSpielplanDokument` /
  `baueSchiedsrichterDokument`. Bekommen bereits formatierte Werte (Datum/Uhrzeit formatiert der
  Aufrufer), damit intern (volle Daten) **und** öffentlich (nur freigegebene) sie speisen.
- `frontend/src/pdf/DruckDokument.tsx`: rendert ein `PdfDokument` als **semantisches HTML**
  (genau ein `<h1>`, `<h2>` je Abschnitt, echte `<table>`, QR mit lesbarem Ziel-Link).
- `frontend/src/pdf/erzeugeJsPdf.ts`: jsPDF + jspdf-autotable, **dynamisch importiert** (eigener
  Lazy-Chunk, kein Haupt-Bundle-Ballast). `setLanguage("de")`, Titel-Metadatum, QR-Ziel zusätzlich
  als Text.
- Seiten: `DruckansichtPage` (intern, `?doc=info|spielplan|schiedsrichter`, lädt Turnier/
  Mannschaften/Spiele/Schiedsrichter) und `OeffentlicheDruckansichtPage` (öffentliche Daten,
  `?doc=info|spielplan`). Beide zeigen dieselbe `DruckDokument`-Vorschau + zwei Knöpfe
  („Als PDF speichern" = drucken, „PDF herunterladen" = jsPDF).
- Routen `/turniere/:id/druck` (geschützt) und `/turniere/:id/oeffentlich/druck` (öffentlich).
- Einstiege: Turnier-Übersicht → Abschnitt „Ausdrucke (PDF)" (Info/Spielplan/Schiedsrichter);
  öffentliche Seite → „Als PDF: Turnierinformationen / Spielplan" (Spielplan nur, wenn freigegeben).
- Druck-CSS (`@media print` in `index.css`): blendet Kopfzeile + Bedienelemente (`.kein-druck`,
  `.druck-aktionen`) aus, Seitenumbruch je Schiedsrichter (`.druck-seitenumbruch`), Tabellenzeilen/
  QR nicht umbrechen.

QR-Ziele: Info → öffentliche Turnierseite; Spielplan/Schiedsrichter → öffentliche Ergebnisseite
(`…/oeffentlich?tab=ergebnisse`).

## Verifikation (laufende Instanz)

- Intern Spielplan: 1× `<h1>`, 1× `<h2>`, Kopffelder + 10-Zeilen-Tabelle, QR = Ergebnisseite (auch
  als Text).
- Intern Schiedsrichter (5 Schiris, alle Spiele zugeteilt): 1× `<h1>`, 5 Abschnitte (je Person ein
  `<h2>`), Seitenumbruch vor jedem außer dem ersten, Kontextzeile + Spiele-Tabelle + QR pro Seite.
  „Nur Turnierleitung"-Personen sind ausgeschlossen (client-seitiger Filter).
- Öffentlich Info: 1× `<h1>`, `<h2>` Mannschaften + Turnierregeln, QR = öffentliche Seite. Felder
  nicht freigegebener Sektionen fehlen entsprechend.
- jsPDF-Download: Klick auf „PDF herunterladen" erzeugt die Datei ohne Fehler (Lazy-Chunk geladen).
- `npm run build` / `lint` / `test` grün. jspdf/jspdf-autotable/html2canvas liegen als eigene
  Lazy-Chunks (nur bei Bedarf geladen; html2canvas ist eine optionale jsPDF-Abhängigkeit, wird zur
  Laufzeit nicht benötigt).

## Nachtrag (Feinschliff nach Sichtung)

- **Spielplan-Tabelle:** Schriftgröße bleibt normal (war ausreichend); stattdessen die ersten beiden
  Spalten (Nr., Zeit) schmal (`PdfTabelle.schmaleFuehrungsspalten`) – jsPDF via `columnStyles`, HTML
  via `.druck-tabelle-spielplan`. Die Mannschaftsspalten werden dadurch breit.
- **Schiedsrichter-Blatt:** der **Turniername** steht jetzt als Seitenkopf oben auf **jeder** Seite
  (`PdfAbschnitt.seitenkopf`), zusätzlich zur Kontextzeile unter dem Namen.

## Offen / später

- Nutzer entscheidet noch, ob einer der beiden Wege (Druck-PDF vs. jsPDF) wieder entfällt.
- Turnier-Logo (nächster Backlog-Punkt) ließe sich später in den Dokumentkopf aufnehmen.
- Ergebnis-/Tabellen-PDF bewusst (noch) nicht: Ergebnisse liegen live auf der öffentlichen Seite
  (QR). Bei Bedarf als weiteres Dokument ergänzbar.

# Ausgechecktes Turnier: Eingabefelder im Frontend deaktivieren

**Datum:** 20.08.2026

Aus einer Feedback-Mail des Nutzers (als Kanban-Karte „Schreibschutz für lokal übernommene Turniere
auf Server nicht wirksam") und der anschließenden Code-Review-Diagnose.

## Befund

Der Nutzer meldete, dass sich ein auf eine lokale Installation übernommenes (ausgechecktes) Turnier
auf dem Server zwar als schreibgeschützt *anzeigt*, die Feldinhalte aber weiterhin bearbeitbar
sind.

Diagnose per Reproduktion: **Der Server setzt die Sperre bereits korrekt durch** – ein PUT auf ein
ausgechecktes Turnier liefert 409, die Änderung wird nicht persistiert (alle acht turnierbezogenen
Schreibrouten prüfen `turnierAusgecheckt()`). Die Ursache lag im **Frontend**: nach der bewussten
„schlank"-Entscheidung vom 19.08. wurde beim ausgecheckten Turnier nur der Turniername rot markiert,
die Eingabefelder blieben bedienbar; die 409-Meldung erschien erst beim Speichern. Das wirkte wie ein
nicht greifender Schutz.

## Entscheidung (Nutzer-Vorgabe)

Die „schlank"-Entscheidung zurücknehmen: bei ausgechecktem Turnier **alle** Eingaben proaktiv
deaktivieren (wie beim `istGesperrt`-Muster für abgeschlossene Turniere). **Einzige Ausnahme: der
„Freigabe aufheben"-Button.**

## Umsetzung

`TurnierVerwaltenPage.tsx` und `SpielleitungCodePage.tsx` berechnen `eingabeGesperrt = istGesperrt ||
ausgecheckt`. `ausgecheckt` sperrt dabei **genau das, was auch der Server bei ausgechecktem Turnier
ablehnt** – also mehr als der reine Abschluss (`istGesperrt`):

- Alle bereits über `istGesperrt` gesteuerten Felder/Tabs (Name, Ort/Kontakt, Zusatzinfo, Spielfeld-
  Namen, Modus/Protokollierung, Logo, Regeln-Fieldset, Mannschaften, Schiedsrichter, Spielplan) →
  `istGesperrt` durch `eingabeGesperrt` ersetzt.
- **Zusätzlich nur bei `ausgecheckt`** (bei bloß abgeschlossenem Turnier bleiben sie bedienbar): die
  `oeffentlich*`-Checkboxen, die Status-Buttons (abschließen/wieder-öffnen), `regeln-entsperren`,
  sowie – per `disabled`-`<fieldset>` – `TurnierFreigabe` (Teilen + Turnier-Codes) und
  `ErgebnisVerwaltung` (hat keinen eigenen `gesperrt`-Prop).
- **`TurnierSync` (mit „Freigabe aufheben") steht bewusst außerhalb aller Sperr-`<fieldset>`** und
  bleibt aktiv.
- Ein eigener Hinweis erklärt den Zustand („… wird gerade auf einer lokalen Installation verwaltet …
  zuerst die Freigabe aufheben"); er hat Vorrang vor dem Abschluss-Hinweis.

## Verifikation

Im Browser end-to-end verifiziert (ausgechecktes Test-Turnier, als Admin eingeloggt):
- Turniername rot „(gesperrt)", Ausgecheckt-Hinweis sichtbar.
- Name/Zusatzinfo/Modus/Öffentlich-Checkbox/„Turnier abschließen" deaktiviert; die vier Fieldsets
  (Regeln/Schiedsrichter/Ergebnisse) `disabled`; Turnier-Codes (`code-turnierleitung`/
  `-spielleitung`) effektiv gesperrt (per `matches(':disabled')` geprüft – das IDL-`.disabled`
  lügt bei Fieldset-Kindern).
- **„Freigabe aufheben" aktiv**; im Übersicht-Reiter blieben sonst nur „Turnier prüfen" (Analyse)
  und „Link kopieren" (read-only) bedienbar.

Build/Lint grün.

## Rollout

Reine Frontend-Änderung – wirkt nach Rebuild + Neuausrollen je Instanz (die Server-Durchsetzung war
schon vorher korrekt; das hier ist die sichtbare Absicherung darüber).

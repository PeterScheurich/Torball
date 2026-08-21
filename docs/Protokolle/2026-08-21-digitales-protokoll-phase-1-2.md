# Digitale Protokollierung: Design-Pass + Phase 1 (Backend) + Phase 2 (Frontend) – 21.08.2026

Branch `feature/digitales-protokoll` (main bleibt unberührt; Feature zusätzlich hinter dem
Pro-Turnier-Gate `protokollierungsart: "digital"`). Design-Dokument mit allen Entscheidungen:
`docs/digitales-protokoll-konzept.md` – dieses Protokoll hält nur Ablauf und Funde fest.

## Ablauf

1. **Design-Pass zuerst, kein Code** (Vorgabe aus der vorigen Sitzung): Konzept geschrieben,
   vier offene Entscheidungen an Peter gestellt. Entscheidungen: eigener dritter Turnier-Code
   „Protokollant" (statt Spielleitung-Code-Mitnutzung), Live-Ergebnis sofort bei jedem Tor,
   Tor als W+G-Doppel-Event, Turnierleitungs-Bestätigung des Abschlusses als konfigurierbare
   Option je Turnier (`protokollBestaetigungErforderlich` – Bundesliga strenger als normale
   Turniere).
2. **Phase 1 (Backend, Commit 35ca6c4):** shared-Typ-Ergänzungen (denormalisierte
   `turnierId`/`spielId`, Server-`sequenz`, `erstelltVonName`, neuer EventTyp `ANNULLIERT`,
   `TurnierCodeRolle`), `routes/protokoll.ts` (append-only Event-Strom, pflegt die bestehenden
   Spiel-Felder → Tabelle/öffentliche Seite unverändert), reine Auswertung
   `protokoll/ereignisse.ts` mit node:test, dritter Code in `turnierCode.ts`,
   `darfProtokollieren()` in `turnierZugriff.ts` (Dreistufigkeit unangetastet),
   Kaskaden-Löschung + Sync-Export/-Import/-Validierung erweitert, 3 neue Integrationstests
   (Lebenszyklus, digital-Gate + Protokollant-Code, Vier-Augen) – `npm run test:integration`
   101/101 grün.
3. **Phase 2 (Frontend, Commit ed36418):** Reducer `protokoll/stand.ts`, Eingabe-Maschine
   `protokoll/eingabe.ts` (Panel-Bedienmodell, ein Keymap-Objekt), `ProtokollPage`,
   `ProtokollantCodePage`, dritter Code in `TurnierFreigabe`, `ErgebnisVerwaltung` im
   digital-Modus (Anzeige + Protokoll-Links statt Direkteingabe), Vier-Augen-Checkbox im
   Übersicht-Reiter. Browser-Ende-zu-Ende verifiziert (Testturnier per API aufgebaut,
   kompletter Ablauf per simulierten Tastatur-Events: GO → Tor A per `A`,`G`,`2`,`Enter` →
   Kontrolle → Fehlwürfe → Foul → Timeout → Undo → End → Unterschrift → Fin; Spiel-Dokument,
   Tabelle (2 Punkte, 1:0) und Protokollant-Code-Session (lesen 200 / Turnier-PUT 403)
   geprüft).
4. Spezifikation nachgezogen (20.11/20.12 Felder, 22.2 ANNULLIERT + W+G-Hinweis, 24.4 neues
   Bedienmodell statt STRG-Belegung).

## Funde

- **Seiteneffekte im setState-Updater doppeln sich im React-StrictMode** (live erwischt):
  `fuehreBefehlAus()` lief zunächst im Updater von `setEingabe` → jeder Tastendruck buchte
  das Event doppelt, die zwei parallelen POSTs erwischten dabei sogar **dieselbe Sequenz**
  (beide lasen max+1, kein CouchDB-Konflikt, da verschiedene `_id`s). Fix: Eingabe-Zustand
  zusätzlich in einer Ref führen, Befehle außerhalb des Updaters ausführen; Sortierung auf
  beiden Seiten mit deterministischem Tie-Break (`sequenz`, `zeitstempel`, `_id`).
- **Spezifikations-Lücke Feldbesetzung:** es gibt kein Aufstellungs-Ereignis – „Spieler auf
  dem Feld" ist aus Wechsel-Events allein nicht berechenbar. Zunächst zurückgestellt, dann
  **am selben Tag auf Nutzer-Vorgabe nachgezogen** („vor dem Anpfiff muss definiert werden,
  wer auf dem Feld steht"): neues Event `AUF` (`zusatz.spielerIds`, je Mannschaft) setzt die
  Start-Drei, `E`-Wechsel schreiben die Feldbesetzung fort; die Seite zeigt die
  Aufstellungs-Auswahl automatisch, solange sie fehlt (danach über „Aufstellung ändern",
  z. B. für die Halbzeitpause), warnt bei unvollständiger Aufstellung und bei Aktionen von
  Spielern, die laut Aufstellung nicht auf dem Feld stehen – gebucht wird trotzdem (warnen,
  nie blockieren). Browser-verifiziert inkl. Wechsel-Fortschreibung (Nr. 1 raus/Nr. 7 rein →
  „Auf dem Feld" aktualisiert, Wurf der Nr. 1 erzeugt den Hinweis). Offen bleibt nur noch der
  abgeleitete Status „kurzzeitig ausgesetzt" (Spez. 20.18).
- Das anfangs torlose 0:0 wird bewusst erst beim Spielende ans Spiel geschrieben – sonst
  stünde ein gerade angepfiffenes Spiel bereits als 0:0-Remis in der Tabelle
  (`berechneTabelle` wertet jedes Spiel mit gesetztem Ergebnis).

## Offen (nächste Schritte auf dem Branch)

- Hilfe-Thema zur digitalen Protokollierung (`frontend/src/hilfe/inhalte.ts`).
- Test-Instanz-Deploy (`BRANCH=feature/digitales-protokoll torball-aktualisieren <name> …`)
  + Praxistest durch Peter; Merge nach `main` erst wenn stabil.
- Später (Konzept Abschnitt 11): PDF-Spielbericht, Beamer-Sicht, konfigurierbares Keymap,
  Statistiken/Torschützen, Freiwurf-Führung, Feldbesetzung/Aufstellungs-Event,
  Panel-Firmware.
- Auf der Dev-Instanz liegt ein Spielwiese-Turnier „Protokoll-Spielwiese (Claude)" mit
  laufendem Protokoll zum Ausprobieren (frei löschbar).

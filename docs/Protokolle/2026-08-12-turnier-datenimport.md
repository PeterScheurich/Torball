# 2026-08-12 – Turnier-Datenimport (Spieltag-Ableitung)

Datenübernahme zwischen Spieltagen: Ein neues Turnier (zweiter Spieltag, Hin-/Rückspiel an
getrennten Tagen, v. a. Bundesliga) wird aus einem **abgeschlossenen** Vorgänger abgeleitet;
die Ergebnisse beider Spieltage werden zu einer Gesamttabelle summiert.

## Finalisierte fachliche Spec (mit dem Nutzer abgestimmt)

- **Umfang jetzt: genau 2 Spieltage.** Mehr Spieltage / andere Sportarten = späterer Release.
  Gruppierung trotzdem über die bestehende **`Wettbewerb`-Klammer** (gemeinsame `wettbewerbId`),
  damit das Datenmodell >2 Tage bereits trägt; zusätzlich `basisTurnierId` (Abstammung/Reihenfolge)
  und `spieltagNummer`.
- **Mannschaften: übernommen + HART gesperrt** – kein Hinzufügen/Entfernen/Umbenennen/Umsortieren,
  kein Entsperren (fachlich: Umbenennen bedeutete real Zwangsabstieg). Herkunft:
  `importiertAusMannschaftId`.
- **Kader: übernommen, aber editierbar.** Spieler je Spieltag eigenständig; gleiche Nummer kann
  andere Person sein (Nr. 5 = Hans Tag 1, Hugo Tag 2). Herkunft `importiertAusSpielerId` wird
  gesetzt (für die spätere „gleiche Person"-Erkennung der Torschützen-Summe).
- **Regeln: übernommen + gesperrt** (`regelnGesperrt`), aber Turnierleitung kann **entsperren**
  (Escape-Hatch, bewusst später leicht entfernbar).
- **Spielplan Tag 2: Spiegelung** des Vorgängers (Heim/Auswärts getauscht, Startzeiten auf den
  neuen Termin neu berechnet, Ergebnisse/Schiedsrichter zurückgesetzt), danach normal anpassbar.
- **Aggregation:** Tabelle über beide Tage summiert – **jetzt** umgesetzt. **Torschützenliste
  erst mit dem digitalen Protokoll** (manueller Pfad kennt keine Einzel-Torschützen); die
  Herkunftsverweise sind aber schon gesetzt.
- **Öffentliche Seite (Stufe 4, NOCH OFFEN):** auf derselben Seite Tabs „Gesamt | Spieltag 1 |
  Spieltag 2". Gesamt = Summentabelle + nur die Spiele des aktuellen Spieltags; je Spieltag eigene
  Ergebnisse + Platzierungen.
- **Interne Ergebnisübersicht:** summierte Tabelle genügt.
- **Korrektur an Tag 1:** erfordert Wiederöffnen (abgeschlossenes Turnier ist gesperrt), danach
  rechnet die Gesamttabelle neu.

## Umgesetzt (Stufen 1–3, 5, 6)

- **Datenmodell** (`shared/src/types`): `Turnier.basisTurnierId`, `spieltagNummer`, `regelnGesperrt`
  (+ vorhandene `wettbewerbId`); `MannschaftImTurnier.importiertAusMannschaftId`;
  `Spieler.importiertAusSpielerId`. Commit `48214df`.
- **Ableiten-Endpunkt** `POST /turniere/:id/ableiten` (`backend/src/routes/turnier.ts`): legt bei
  Bedarf einen `Wettbewerb` an und verknüpft beide Spieltage; kopiert Mannschaften + Kader (mit
  Herkunft), übernimmt Regeln gesperrt, spiegelt den Spielplan (+ `spielplanBasis`-Schnappschuss).
  Frontend-API `turnierAbleiten()`. Commit `94fc368`. **Wichtig:** Das Turnier-Dokument wird
  **einmal** am Ende (inkl. `spielplanBasis`) gespeichert – ein zweites `insertDoc` mit demselben
  `_id`/veraltetem `_rev` gab sonst einen CouchDB-Conflict.
- **Sperren** (`a0a311e`): `istAbgeleitet()`/`turnierGesperrt()` + Fehlertexte in
  `backend/src/auth/turnierZugriff.ts`. Mannschaft-Routen lehnen Änderungen an abgeleiteten
  Turnieren mit 409 ab; `PUT /turniere/:id` lehnt Regel-Feld-Änderungen bei `regelnGesperrt` ab;
  `POST /turniere/:id/regeln-entsperren` als Escape-Hatch. Frontend: Banner + `disabled`-Fieldset
  + Entsperren-Knopf (`TurnierVerwaltenPage`).
- **Gesamttabelle** (`26fb8cb`): `berechneGesamttabelle()` (`backend/src/ergebnisse/tabelle.ts`)
  bildet alle Spiele über die Herkunfts-Wurzel auf die Mannschaften des **angezeigten** Turniers
  ab (so lösen die Namen im jeweiligen Kontext auf) und wertet wie eine Tabelle (inkl. direktem
  Vergleich über beide Tage). `GET /turniere/:id/tabelle` liefert bei gesetzter `wettbewerbId` die
  Summentabelle – damit zeigt die interne `ErgebnisVerwaltung` automatisch den summierten Stand
  (Stufe 5).
- **Anlege-UI** (`4fb59bd`): `TurnierAnlegenPage` fragt „Daten aus abgeschlossenem Turnier
  übernehmen?"; bei Auswahl entfallen die vom Vorgänger übernommenen Felder, es wird abgeleitet
  und direkt in die Verwaltung gesprungen.

## Noch offen

- **Stufe 4:** öffentliche Seite mit „Gesamt | Spieltag 1 | Spieltag 2" (öffentliche Route +
  Seite umbauen).
- **Torschützen-Summe:** erst mit der digitalen Protokollierung (Herkunft ist vorbereitet).
- **>2 Spieltage / andere Sportarten:** späterer Release (Datenmodell trägt es über `wettbewerbId`).

## Verifikation

Alle Stufen end-to-end gegen die laufende Instanz geprüft (Ableiten kopiert Mannschaften/Kader/
Regeln/Spielplan korrekt inkl. Swap; Sperren geben 409, Kader bleibt editierbar, Entsperren wirkt;
Summentabelle = Tag 1 + Tag 2, mit den Mannschaften des Turniers auflösbar; Anlege-UI leitet ab
und springt in die Verwaltung). `npm run build` / `lint` / `test` nach jeder Stufe grün.

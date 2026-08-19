# Pause zwischen Spielen – fehlender Zeitplanungs-Parameter ergänzt

**Datum:** 20.08.2026

## Ausgangslage

Beim eigenen Testen fiel dem Nutzer auf, dass die Spielplan-Zeitberechnung keinen Puffer
zwischen zwei aufeinanderfolgenden Spielen auf demselben Feld vorsah – die geplante Startzeit
ergab sich bisher ausschließlich aus Spielzeit × Anzahl Halbzeiten + Pause zwischen Halbzeiten
(`backend/src/spielplan/zeitplanung.ts::spieldauerMinuten`). In der Praxis dauert ein Spiel aber
länger als die reine Spielzeit, da im Torball nur die Netto-Spielzeit gezählt wird (Abschnitt 6.1
der Gesamtspezifikation) – Unterbrechungen, Wurfvorbereitung, Wechsel zum nächsten Spiel usw.
verbrauchen zusätzliche Zeit, die bisher nirgends eingeplant war.

Der Bedarf war der Spezifikation selbst nicht fremd: Abschnitt 8 erwähnte bereits eine
„konfigurierbare Toleranz" zwischen Spielen bei mehreren Feldern – dieser Halbsatz wurde aber nie
als eigenes, tatsächlich konfigurierbares Feld umgesetzt. Auch ein Code-Kommentar in
`zeitplanung.ts` wies seit der Erst-Umsetzung explizit auf diese Lücke hin.

## Entscheidung

Neues Feld `Turnierregeln.pauseZwischenSpielenMinuten` (Standardwert **10 Minuten** – Einschätzung
des Nutzers als realistischer Wert für die tatsächliche Mehrdauer eines Spiels gegenüber der
reinen Netto-Spielzeit). Fließt zusätzlich zur Halbzeitpause in die Startzeit-Berechnung jedes
Spiels ein, editierbar im Regeln-Formular (Abschnitt „Spielzeit"), gesperrt sobald der Spielplan
bereits läuft (derselbe Mechanismus wie bei Spielzeit/Anzahl Halbzeiten/Pause zwischen
Halbzeiten).

Migration bestehender Turniere ohne dieses Feld wurde bewusst nicht behandelt (Nutzer-Vorgabe: die
Software befindet sich noch in der alleinigen Testphase durch den Entwickler selbst, bestehende
Test-Turniere/-Spiele werden ohnehin gelöscht) – lediglich eine `?? 0`-Absicherung in der
Zeitberechnung selbst verhindert, dass ein fehlendes Feld die Zeitberechnung mit `NaN` bricht.

## Umsetzung

Da `Turnierregeln` als gemeinsamer Typ an vielen Stellen verwendet wird (Turnier, Systemkonfiguration,
öffentliche Turnierseite, Spielplan-Basis-Schnappschuss, Demo-Basisdaten), betraf die Änderung
technisch harmlos, aber mechanisch breit gestreut ca. 18 Dateien – Details siehe `CLAUDE.md`,
Abschnitt zu `Turnierregeln als gemeinsamer Typ`.

Im Browser Ende-zu-Ende verifiziert: gespeicherter Wert korrekt in der Spielplan-Vorschlag-Berechnung
berücksichtigt (Slot-Abstand = Spielzeit × Halbzeiten + Pause zwischen Halbzeiten + Pause zwischen
Spielen).

## Betroffene Abschnitte der Gesamtspezifikation

- **Abschnitt 5.1** (Turnierdaten → Spielregeln): „Pause zwischen Spielen" als weiterer
  konfigurierbarer Standardwert ergänzt.
- **Abschnitt 8** (Spielplan-Generierung → Zeitplanung): Formel für die geplante Startzeit
  explizit gemacht, inkl. Begründung für den zusätzlichen Puffer.

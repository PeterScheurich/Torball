import { test } from "node:test";
import assert from "node:assert/strict";
import { fuelleFehlendeAuf, pruefeRegelWerte } from "./regelnPruefung";

test("fehlende und null-Werte werden uebersprungen", () => {
  assert.equal(pruefeRegelWerte({}), undefined);
  assert.equal(pruefeRegelWerte({ spielzeitMinuten: null, pauseMinuten: undefined }), undefined);
});

test("unsinnige Zahlen werden abgewiesen", () => {
  assert.match(pruefeRegelWerte({ spielzeitMinuten: -5 })!, /Spielzeit/);
  assert.match(pruefeRegelWerte({ anzahlHalbzeiten: 0 })!, /Halbzeiten/);
  assert.match(pruefeRegelWerte({ punkteSieg: "viele" })!, /ganze Zahl/);
  assert.match(pruefeRegelWerte({ spielzeitMinuten: 2.5 })!, /ganze Zahl/);
  assert.match(pruefeRegelWerte({ pauseZwischenSpielenMinuten: 100000 })!, /zwischen/);
});

test("Ergebnis bei Nichtantreten muss die Form n:m haben", () => {
  assert.equal(pruefeRegelWerte({ forfaitErgebnis: "5:0" }), undefined);
  assert.match(pruefeRegelWerte({ forfaitErgebnis: "fuenf zu null" })!, /Format/);
  assert.match(pruefeRegelWerte({ forfaitErgebnis: 3 })!, /Format/);
});

test("Regeln einer aelteren Systemkonfiguration werden mit den Standardwerten aufgefuellt", () => {
  const standard = { spielzeitMinuten: 5, pauseZwischenSpielenMinuten: 13, forfaitErgebnis: "3:0" };
  const alt = { spielzeitMinuten: 7, forfaitErgebnis: undefined } as Partial<typeof standard>;
  const ergebnis = fuelleFehlendeAuf(alt as typeof standard, standard);
  assert.equal(ergebnis.spielzeitMinuten, 7, "gespeicherte Werte bleiben");
  assert.equal(ergebnis.pauseZwischenSpielenMinuten, 13, "fehlendes Feld kommt aus den Standardwerten");
  assert.equal(ergebnis.forfaitErgebnis, "3:0", "ein undefinierter Wert zaehlt als fehlend");
});

test("die Standardwerte selbst sind gueltige Regeln", () => {
  assert.equal(
    pruefeRegelWerte({ spielzeitMinuten: 5, anzahlHalbzeiten: 2, pauseMinuten: 2, pauseZwischenSpielenMinuten: 13, timeoutsJeHalbzeit: 1, timeoutDauerSekunden: 30, auswechslungenJeHalbzeit: 3, tordifferenzLimit: 10, punkteSieg: 2, punkteUnentschieden: 1, punkteNiederlage: 0, forfaitErgebnis: "3:0" }),
    undefined,
  );
});

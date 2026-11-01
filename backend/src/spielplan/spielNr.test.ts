import { test } from "node:test";
import assert from "node:assert/strict";
import type { Spiel } from "@torball/shared";
import { spielNummern } from "@torball/shared";
import { mitSpielNr } from "./spielNr";

/**
 * Spielnummer ueber das ganze Turnier (Auftraggeber 01.11.2026): bisher zaehlte jede Halle fuer sich,
 * bei zwei Feldern kamen Nummern doppelt vor.
 */
const felder = [
  { feldId: "feld:1", name: "Halle A" },
  { feldId: "feld:2", name: "Halle B" },
];

function spiel(id: string, runde: number, feldId: string): Spiel {
  return { _id: id, runde: String(runde), feldId } as unknown as Spiel;
}

test("zwei Felder im selben Slot bekommen verschiedene Nummern, Feld A zuerst", () => {
  const nr = spielNummern(
    [
      { id: "b1", slot: 1, feldId: "feld:2" },
      { id: "a1", slot: 1, feldId: "feld:1" },
      { id: "a2", slot: 2, feldId: "feld:1" },
      { id: "b2", slot: 2, feldId: "feld:2" },
    ],
    felder,
  );
  assert.deepEqual([nr.get("a1"), nr.get("b1"), nr.get("a2"), nr.get("b2")], [1, 2, 3, 4]);
});

test("die Nummern sind lueckenlos und eindeutig, auch bei einem Slot-Sprung", () => {
  const spiele = [spiel("x", 1, "feld:1"), spiel("y", 1, "feld:2"), spiel("z", 7, "feld:1")];
  const nummern = mitSpielNr(spiele, felder).map((s) => s.spielNr);
  assert.deepEqual(nummern, [1, 2, 3]);
});

test("ein Tausch der Zeit-Slots tauscht die Nummern mit", () => {
  const vorher = mitSpielNr([spiel("s1", 1, "feld:1"), spiel("s2", 2, "feld:1")], felder);
  const nachher = mitSpielNr([spiel("s1", 2, "feld:1"), spiel("s2", 1, "feld:1")], felder);
  assert.equal(vorher.find((s) => s._id === "s1")?.spielNr, 1);
  assert.equal(nachher.find((s) => s._id === "s1")?.spielNr, 2);
});

test("ein Feld, das dem Turnier nicht (mehr) gehoert, sortiert ans Ende des Slots statt Fehler zu werfen", () => {
  const nr = spielNummern(
    [
      { id: "fremd", slot: 1, feldId: "feld:99" },
      { id: "a", slot: 1, feldId: "feld:1" },
    ],
    felder,
  );
  assert.equal(nr.get("a"), 1);
  assert.equal(nr.get("fremd"), 2);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import type { MannschaftImTurnier } from "@torball/shared";
import { erzeugePaarungen } from "./paarungen";

function mannschaft(id: string, vereinId?: string, bundesland?: string): MannschaftImTurnier {
  return {
    _id: id,
    docType: "mannschaftImTurnier",
    mannschaftId: id,
    turnierId: "turnier:test",
    name: id,
    vereinId,
    bundesland,
    reihenfolge: 0,
  };
}

test("einfaches Turnier: jede Paarung genau einmal", () => {
  const teams = [mannschaft("a"), mannschaft("b"), mannschaft("c"), mannschaft("d")];
  const paarungen = erzeugePaarungen(teams, 1);

  assert.equal(paarungen.length, 6); // C(4,2)
  assert.ok(paarungen.every((p) => p.durchgang === 1));
});

test("doppeltes Turnier: jede Paarung genau zweimal", () => {
  const teams = [mannschaft("a"), mannschaft("b"), mannschaft("c")];
  const paarungen = erzeugePaarungen(teams, 2);

  assert.equal(paarungen.length, 6); // C(3,2) * 2
  const durchgang1 = paarungen.filter((p) => p.durchgang === 1);
  const durchgang2 = paarungen.filter((p) => p.durchgang === 2);
  assert.equal(durchgang1.length, 3);
  assert.equal(durchgang2.length, 3);
});

test("Vereins-Duell wird als 'verein' priorisiert, auch bei gleichem Bundesland", () => {
  const teams = [
    mannschaft("a", "verein:1", "Bayern"),
    mannschaft("b", "verein:1", "Bayern"),
  ];
  const [paarung] = erzeugePaarungen(teams, 1);
  assert.equal(paarung.prioritaet, "verein");
});

test("Bundesland-Derby wird als 'bundesland' priorisiert, wenn Vereine unterschiedlich sind", () => {
  const teams = [
    mannschaft("a", "verein:1", "Bayern"),
    mannschaft("b", "verein:2", "Bayern"),
  ];
  const [paarung] = erzeugePaarungen(teams, 1);
  assert.equal(paarung.prioritaet, "bundesland");
});

test("Bundesland-Abgleich tolerant gegenueber Gross-/Kleinschreibung und Leerzeichen", () => {
  const teams = [
    mannschaft("a", "verein:1", " bayern "),
    mannschaft("b", "verein:2", "Bayern"),
  ];
  const [paarung] = erzeugePaarungen(teams, 1);
  assert.equal(paarung.prioritaet, "bundesland");
});

test("Paarung ohne gemeinsamen Verein/Bundesland ist 'neutral'", () => {
  const teams = [
    mannschaft("a", "verein:1", "Bayern"),
    mannschaft("b", "verein:2", "Hessen"),
  ];
  const [paarung] = erzeugePaarungen(teams, 1);
  assert.equal(paarung.prioritaet, "neutral");
});

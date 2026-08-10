import { test } from "node:test";
import assert from "node:assert/strict";
import type { SchiedsrichterImTurnier, Spiel } from "@torball/shared";
import { schlageSchiedsrichterVor } from "./schiedsrichterZuordnung";

function spiel(id: string, runde: string, a: string, b: string): Spiel {
  return {
    _id: id,
    docType: "spiel",
    spielId: id,
    turnierId: "t",
    runde,
    mannschaftAId: a,
    mannschaftBId: b,
    status: "geplant",
    istForfait: false,
    ergebnisAbgeschlossen: false,
  } as Spiel;
}

function sr(id: string, mannschaftId?: string): SchiedsrichterImTurnier {
  return {
    _id: id,
    docType: "schiedsrichterImTurnier",
    schiedsrichterId: id,
    turnierId: "t",
    name: id,
    lizenzVorhanden: false,
    istTurnierleitung: false,
    mannschaftId,
  } as SchiedsrichterImTurnier;
}

test("P1: ein Schiedsrichter pfeift nicht das Spiel der eigenen Mannschaft", () => {
  const z = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], [sr("srA", "A"), sr("srN")]);
  assert.equal(z.get("g1"), "srN");
});

test("Ist der einzige Schiedsrichter die eigene Mannschaft, bleibt das Spiel bewusst unbesetzt", () => {
  const z = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], [sr("srA", "A")]);
  assert.equal(z.get("g1"), undefined);
});

test("Ohne Schiedsrichter bleibt jede Zuordnung leer", () => {
  const z = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], []);
  assert.equal(z.get("g1"), undefined);
});

test("Neutrale Schiedsrichter (ohne Mannschaft) werden zur Lastverteilung gestreut", () => {
  // Zwei Spiele in verschiedenen Slots, zwei neutrale Schiedsrichter -> je einer pro Spiel.
  const z = schlageSchiedsrichterVor(
    [spiel("g1", "1", "A", "B"), spiel("g2", "2", "C", "D")],
    [sr("n1"), sr("n2")],
  );
  assert.notEqual(z.get("g1"), z.get("g2"));
});

test("P2: gleichzeitig spielende eigene Mannschaft wird vermieden, P1 nie verletzt (zwei Felder)", () => {
  // g1 und g2 im selben Slot (parallele Felder). srC gehoert zu Mannschaft C (spielt in g2).
  const spiele = [spiel("g1", "1", "A", "B"), spiel("g2", "1", "C", "D")];
  const z = schlageSchiedsrichterVor(spiele, [sr("srC", "C"), sr("n1"), sr("n2")]);
  assert.notEqual(z.get("g1"), "srC", "P2: srC spielt gleichzeitig, sollte g1 nicht zugeteilt sein");
  assert.notEqual(z.get("g2"), "srC", "P1: srC darf sein eigenes Spiel g2 nie pfeifen");
  assert.ok(z.get("g2"), "fuer g2 steht ein neutraler Schiedsrichter bereit");
});

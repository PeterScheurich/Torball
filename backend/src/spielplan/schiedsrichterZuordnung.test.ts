import { test } from "node:test";
import assert from "node:assert/strict";
import type { MannschaftImTurnier, SchiedsrichterImTurnier, Spiel } from "@torball/shared";
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

/** Mannschaft-Fixtur (mannschaftId == der im Spiel verwendete Buchstabe A/B/C/D), optional mit
 *  Vereinszugehoerigkeit - Grundlage der Konflikterkennung ueber vereinId. */
function mannschaft(id: string, vereinId?: string): MannschaftImTurnier {
  return {
    _id: id,
    docType: "mannschaftImTurnier",
    mannschaftId: id,
    turnierId: "t",
    name: id,
    vereinId,
    reihenfolge: 0,
  } as MannschaftImTurnier;
}

function sr(id: string, vereinId?: string): SchiedsrichterImTurnier {
  return {
    _id: id,
    docType: "schiedsrichterImTurnier",
    schiedsrichterId: id,
    turnierId: "t",
    name: id,
    lizenzVorhanden: false,
    istTurnierleitung: false,
    vereinId,
  } as SchiedsrichterImTurnier;
}

const MANNSCHAFTEN_AB = [mannschaft("A", "vA"), mannschaft("B", "vB")];
const MANNSCHAFTEN_ABCD = [mannschaft("A", "vA"), mannschaft("B", "vB"), mannschaft("C", "vC"), mannschaft("D", "vD")];

test("P1: ein Schiedsrichter pfeift nicht das Spiel seines eigenen Vereins", () => {
  const z = schlageSchiedsrichterVor(
    [spiel("g1", "1", "A", "B")],
    [sr("srA", "vA"), sr("srN")],
    MANNSCHAFTEN_AB,
  );
  assert.equal(z.get("g1"), "srN");
});

test("Ist der einzige Schiedsrichter vom eigenen Verein, bleibt das Spiel bewusst unbesetzt", () => {
  const z = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], [sr("srA", "vA")], MANNSCHAFTEN_AB);
  assert.equal(z.get("g1"), undefined);
});

test("Ohne Schiedsrichter bleibt jede Zuordnung leer", () => {
  const z = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], [], MANNSCHAFTEN_AB);
  assert.equal(z.get("g1"), undefined);
});

test("'nur Turnierleitung' pfeift nicht: wird nie vorgeschlagen, auch wenn kein anderer bereitsteht", () => {
  const nurTL = { ...sr("tl"), istTurnierleitung: true, nurTurnierleitung: true } as SchiedsrichterImTurnier;
  // Einziger Kandidat ist die reine Turnierleitung -> Spiel bleibt bewusst unbesetzt.
  const alleine = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], [nurTL], MANNSCHAFTEN_AB);
  assert.equal(alleine.get("g1"), undefined);
  // Mit einem echten Schiedsrichter daneben wird nur dieser gewaehlt.
  const zusammen = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], [nurTL, sr("srN")], MANNSCHAFTEN_AB);
  assert.equal(zusammen.get("g1"), "srN");
});

test("Neutrale Schiedsrichter (ohne Verein) werden zur Lastverteilung gestreut", () => {
  // Zwei Spiele in verschiedenen Slots, zwei neutrale Schiedsrichter -> je einer pro Spiel.
  const z = schlageSchiedsrichterVor(
    [spiel("g1", "1", "A", "B"), spiel("g2", "2", "C", "D")],
    [sr("n1"), sr("n2")],
    MANNSCHAFTEN_ABCD,
  );
  assert.notEqual(z.get("g1"), z.get("g2"));
});

test("P2: gleichzeitig spielende eigene Mannschaft wird vermieden, P1 nie verletzt (zwei Felder)", () => {
  // g1 und g2 im selben Slot (parallele Felder). srC gehoert zu Verein vC (spielt in g2).
  const spiele = [spiel("g1", "1", "A", "B"), spiel("g2", "1", "C", "D")];
  const z = schlageSchiedsrichterVor(spiele, [sr("srC", "vC"), sr("n1"), sr("n2")], MANNSCHAFTEN_ABCD);
  assert.notEqual(z.get("g1"), "srC", "P2: srC spielt gleichzeitig, sollte g1 nicht zugeteilt sein");
  assert.notEqual(z.get("g2"), "srC", "P1: srC darf sein eigenes Spiel g2 nie pfeifen");
  assert.ok(z.get("g2"), "fuer g2 steht ein neutraler Schiedsrichter bereit");
});

test("P1 erkennt auch eine zweite Mannschaft desselben Vereins im Turnier", () => {
  // Verein vX hat zwei Mannschaften im Turnier (z.B. I- und II-Mannschaft) - der Vorteil
  // gegenueber der frueheren mannschaftId-Zuordnung: beide werden erkannt, nicht nur die,
  // die beim Anlegen des Schiedsrichters zufaellig ausgewaehlt wurde.
  const mannschaften = [mannschaft("A", "vX"), mannschaft("B", "vY"), mannschaft("A2", "vX")];
  const z = schlageSchiedsrichterVor([spiel("g1", "1", "A2", "B")], [sr("srX", "vX"), sr("n1")], mannschaften);
  assert.notEqual(z.get("g1"), "srX", "srX gehoert zu Verein vX, das gilt auch fuer dessen zweite Mannschaft A2");
});

test("Mannschaft ohne Vereinszuordnung (Ad-hoc-Erfassung) loest keinen Konflikt aus", () => {
  // Realistische Einschraenkung der vereinId-basierten Erkennung: eine ohne Stammdaten-Bezug
  // erfasste Mannschaft hat kein vereinId und kann daher nicht als "eigener Verein" erkannt
  // werden, selbst wenn der Schiedsrichter faktisch dazugehoert.
  const mannschaften = [mannschaft("A"), mannschaft("B", "vB")];
  const z = schlageSchiedsrichterVor([spiel("g1", "1", "A", "B")], [sr("srA", "vA")], mannschaften);
  assert.equal(z.get("g1"), "srA", "kein Konflikt erkennbar, da Mannschaft A keine vereinId traegt");
});

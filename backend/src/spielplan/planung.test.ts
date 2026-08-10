import { test } from "node:test";
import assert from "node:assert/strict";
import type { Spielfeld } from "@torball/shared";
import type { Paarung } from "./paarungen";
import { erstelleSpielplanVorschlag } from "./planung";

function paarung(a: string, b: string, prioritaet: Paarung["prioritaet"] = "neutral"): Paarung {
  return { mannschaftAId: a, mannschaftBId: b, prioritaet, durchgang: 1 };
}

function felder(anzahl: number): Spielfeld[] {
  return Array.from({ length: anzahl }, (_, i) => ({ feldId: `feld:${i + 1}`, name: `Feld ${i + 1}` }));
}

test("kein Team spielt zweimal im selben Slot (harte Regel 1)", () => {
  const paarungen = [
    paarung("a", "b"),
    paarung("c", "d"),
    paarung("a", "c"),
    paarung("b", "d"),
    paarung("a", "d"),
    paarung("b", "c"),
  ];
  const plan = erstelleSpielplanVorschlag(paarungen, felder(2));

  const teamsProSlot = new Map<number, Set<string>>();
  for (const eintrag of plan) {
    const teams = teamsProSlot.get(eintrag.slot) ?? new Set<string>();
    assert.ok(!teams.has(eintrag.mannschaftAId), `Team ${eintrag.mannschaftAId} doppelt in Slot ${eintrag.slot}`);
    assert.ok(!teams.has(eintrag.mannschaftBId), `Team ${eintrag.mannschaftBId} doppelt in Slot ${eintrag.slot}`);
    teams.add(eintrag.mannschaftAId);
    teams.add(eintrag.mannschaftBId);
    teamsProSlot.set(eintrag.slot, teams);
  }
});

test("Normalfall (1 Feld, viele Mannschaften): Back-to-Back wird fast durchgehend vermieden", () => {
  // Bei nur 1 Feld gibt es immer reichlich ausgeruhte Alternativ-Paarungen -
  // die Zahl der unvermeidbaren Faelle (nur ganz am Ende, wenn kaum noch
  // Paarungen offen sind) bleibt empirisch sehr klein.
  const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const paarungen: Paarung[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      paarungen.push(paarung(teams[i], teams[j]));
    }
  }

  const plan = erstelleSpielplanVorschlag(paarungen, felder(1));

  assert.equal(plan.length, 28); // C(8,2)
  const warnungen = plan.filter((e) => e.warnung !== undefined).length;
  assert.ok(warnungen <= 2, `Erwartete <= 2 unvermeidbare Faelle, tatsaechlich: ${warnungen}`);
});

test("Kleine Liga mit 2 Feldern (Ausnahmefall): volle Parallelitaet macht Back-to-Back-Warnungen erwartbar", () => {
  // Bei 4 Mannschaften und 2 Feldern spielt in jeder Runde bereits jede Mannschaft
  // gleichzeitig - "kein direktes Folgespiel" ist dann strukturell nicht durchgehend
  // erfuellbar (siehe Modul-Kommentar in planung.ts). Das ist kein Bug, sondern wird
  // hier bewusst dokumentiert, damit es nicht spaeter als Regression missverstanden wird.
  const paarungen = [
    paarung("a", "b"),
    paarung("c", "d"),
    paarung("a", "c"),
    paarung("b", "d"),
    paarung("a", "d"),
    paarung("b", "c"),
  ];
  const plan = erstelleSpielplanVorschlag(paarungen, felder(2));

  assert.equal(plan.length, 6);
  const warnungen = plan.filter((e) => e.warnung !== undefined).length;
  assert.ok(warnungen > 0, "Erwartungsgemaess treten hier Back-to-Back-Warnungen auf");
});

test("Back-to-Back wird nur als letztes Mittel zugelassen und markiert (1 Feld, 4 Mannschaften)", () => {
  const paarungen = [
    paarung("a", "b"),
    paarung("c", "d"),
    paarung("a", "c"),
    paarung("b", "d"),
    paarung("a", "d"),
    paarung("b", "c"),
  ];
  const plan = erstelleSpielplanVorschlag(paarungen, felder(1));

  assert.equal(plan.length, 6);
  // Mit nur einem Feld ist mind. ein Back-to-Back mathematisch unvermeidbar (siehe Modul-Kommentar) -
  // der Algorithmus muss das ueber `warnung` transparent machen statt es zu verschweigen.
  assert.ok(plan.some((e) => e.warnung !== undefined));
});

test("Vereins-Duell wird gegenueber neutraler Paarung fruehzeitig eingeplant", () => {
  const paarungen = [
    paarung("a", "b", "neutral"),
    paarung("c", "d", "neutral"),
    paarung("e", "f", "verein"),
  ];
  const plan = erstelleSpielplanVorschlag(paarungen, felder(1));

  const slotVereinsduell = plan.find((e) => e.mannschaftAId === "e" && e.mannschaftBId === "f")!.slot;
  const slotNeutral1 = plan.find((e) => e.mannschaftAId === "a")!.slot;
  const slotNeutral2 = plan.find((e) => e.mannschaftAId === "c")!.slot;

  assert.ok(slotVereinsduell <= slotNeutral1);
  assert.ok(slotVereinsduell <= slotNeutral2);
});

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

test("Normalfall (1 Feld, 8 Mannschaften): komplett kollisionsfrei moeglich und wird gefunden", () => {
  // Graphentheoretisch (Kneser-Graph K(n,2)) ist eine vollstaendig kollisionsfreie
  // Reihenfolge ab 5 Mannschaften immer moeglich; der Algorithmus muss sie ueber
  // mehrere Versuche mit zufaelliger Reihenfolge auch tatsaechlich finden.
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
  assert.equal(warnungen, 0, "Ab 5 Mannschaften sollte eine kollisionsfreie Reihenfolge existieren und gefunden werden");
});

test("Kleine Liga (5 Mannschaften, 1 Feld): ebenfalls kollisionsfrei", () => {
  const teams = ["a", "b", "c", "d", "e"];
  const paarungen: Paarung[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      paarungen.push(paarung(teams[i], teams[j]));
    }
  }

  const plan = erstelleSpielplanVorschlag(paarungen, felder(1));

  assert.equal(plan.length, 10); // C(5,2)
  const warnungen = plan.filter((e) => e.warnung !== undefined).length;
  assert.equal(warnungen, 0);
});

test("Genau 3 oder 4 Mannschaften (1 Feld): Kollision bleibt mathematisch unvermeidbar", () => {
  // Kneser-Graph K(3,2) ist kantenlos, K(4,2) ein perfektes Matching -
  // in beiden Faellen existiert kein Hamiltonpfad, egal wie oft neu versucht wird.
  const dreiTeams: Paarung[] = [paarung("a", "b"), paarung("a", "c"), paarung("b", "c")];
  const planDrei = erstelleSpielplanVorschlag(dreiTeams, felder(1));
  assert.ok(planDrei.some((e) => e.warnung !== undefined));
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

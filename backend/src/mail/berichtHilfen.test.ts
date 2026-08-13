import { test } from "node:test";
import assert from "node:assert/strict";
import type { KanbanKarte } from "@torball/shared";
import { kanbanKategorieFuer, naechsteReihenfolgeOffen } from "./berichtHilfen";
import type { Klassifikationsergebnis } from "./klassifikation";

function karte(spalte: KanbanKarte["spalte"], reihenfolge: number): KanbanKarte {
  return {
    _id: `kanbanKarte:${spalte}-${reihenfolge}`,
    docType: "kanbanKarte",
    kanbanId: `kanbanKarte:${spalte}-${reihenfolge}`,
    titel: "Testkarte",
    spalte,
    kategorie: "aufgabe",
    prioritaet: "mittel",
    reihenfolge,
    erstelltAm: "2026-01-01T00:00:00.000Z",
    aktualisiertAm: "2026-01-01T00:00:00.000Z",
  };
}

test("naechsteReihenfolgeOffen: 0 bei leerer Spalte 'offen'", () => {
  assert.equal(naechsteReihenfolgeOffen([karte("inArbeit", 0), karte("erledigt", 3)]), 0);
});

test("naechsteReihenfolgeOffen: haengt hinter die hoechste bestehende Reihenfolge in 'offen' an", () => {
  assert.equal(naechsteReihenfolgeOffen([karte("offen", 0), karte("offen", 2), karte("inArbeit", 9)]), 3);
});

function ergebnis(kategorie: Klassifikationsergebnis["kategorie"]): Klassifikationsergebnis {
  return { kategorie, kiZusammenfassung: "Test", istAnforderung: true };
}

test("kanbanKategorieFuer: Fehlermeldungen werden zu 'bug'", () => {
  assert.equal(kanbanKategorieFuer(ergebnis("fehlermeldung")), "bug");
});

test("kanbanKategorieFuer: alles andere (Anregung/Kritik/Sonstiges) wird zu 'wunsch'", () => {
  assert.equal(kanbanKategorieFuer(ergebnis("anregung")), "wunsch");
  assert.equal(kanbanKategorieFuer(ergebnis("kritik")), "wunsch");
  assert.equal(kanbanKategorieFuer(ergebnis("sonstiges")), "wunsch");
});

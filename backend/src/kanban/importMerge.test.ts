import { test } from "node:test";
import assert from "node:assert/strict";
import type { KanbanKarte } from "@torball/shared";
import { loeseKonflikte, normalisiereImportKarte, planeImport } from "./importMerge";

function karte(teil: Partial<KanbanKarte> & { kanbanId: string; aktualisiertAm: string }): KanbanKarte {
  return {
    _id: teil.kanbanId,
    docType: "kanbanKarte",
    kanbanId: teil.kanbanId,
    titel: teil.titel ?? "Titel",
    beschreibung: teil.beschreibung,
    spalte: teil.spalte ?? "offen",
    kategorie: teil.kategorie ?? "feature",
    prioritaet: teil.prioritaet ?? "mittel",
    reihenfolge: teil.reihenfolge ?? 0,
    erstelltVon: teil.erstelltVon,
    erstelltVonName: teil.erstelltVonName,
    erstelltAm: teil.erstelltAm ?? teil.aktualisiertAm,
    aktualisiertAm: teil.aktualisiertAm,
    _rev: teil._rev,
  };
}

test("neue Karte landet in 'neu', _id an kanbanId gekoppelt, fremder _rev verworfen", () => {
  const eingehend = karte({ kanbanId: "kanbanKarte:1", aktualisiertAm: "2026-08-01T10:00:00Z", _rev: "9-fremd" });
  const plan = planeImport([], [eingehend]);

  assert.equal(plan.neu.length, 1);
  assert.equal(plan.konflikte.length, 0);
  assert.equal(plan.neu[0]._id, "kanbanKarte:1");
  assert.equal(plan.neu[0]._rev, undefined);
});

test("inhaltlich gleiche Karte gilt als identisch, KEIN Konflikt (auch bei anderem Zeitstempel/Reihenfolge)", () => {
  const lokal = karte({ kanbanId: "kanbanKarte:1", titel: "A", spalte: "testen", reihenfolge: 0, aktualisiertAm: "2026-08-01T10:00:00Z" });
  const eingehend = karte({ kanbanId: "kanbanKarte:1", titel: "A", spalte: "testen", reihenfolge: 5, aktualisiertAm: "2999-01-01T00:00:00Z" });

  const plan = planeImport([lokal], [eingehend]);
  assert.equal(plan.identisch, 1);
  assert.equal(plan.konflikte.length, 0);
  assert.equal(plan.neu.length, 0);
});

test("abweichender Inhalt erzeugt einen Konflikt statt automatischem Last-Write-Wins", () => {
  const lokal = karte({ kanbanId: "kanbanKarte:1", titel: "lokal", spalte: "offen", aktualisiertAm: "2026-08-01T10:00:00Z" });
  // Bewusst AELTERER Zeitstempel, waere aber inhaltlich abweichend -> muss trotzdem Konflikt sein.
  const eingehend = karte({ kanbanId: "kanbanKarte:1", titel: "eingehend", spalte: "testen", aktualisiertAm: "2020-01-01T00:00:00Z" });

  const plan = planeImport([lokal], [eingehend]);
  assert.equal(plan.konflikte.length, 1);
  assert.equal(plan.neu.length, 0);
  assert.equal(plan.identisch, 0);
  assert.equal(plan.konflikte[0].lokal.titel, "lokal");
  assert.equal(plan.konflikte[0].eingehend.titel, "eingehend");
});

test("Konfliktauflösung 'eingehend' überschreibt und behält lokalen _id/_rev (kein 409)", () => {
  const lokal = karte({ kanbanId: "kanbanKarte:1", titel: "lokal", aktualisiertAm: "2026-08-01T10:00:00Z", _rev: "3-lokal" });
  const eingehend = karte({ kanbanId: "kanbanKarte:1", titel: "eingehend", spalte: "erledigt", aktualisiertAm: "2026-08-02T10:00:00Z", _rev: "7-fremd" });
  const plan = planeImport([lokal], [eingehend]);

  const res = loeseKonflikte(plan.konflikte, { "kanbanKarte:1": "eingehend" });
  assert.equal(res.upserts.length, 1);
  assert.equal(res.upserts[0].titel, "eingehend");
  assert.equal(res.upserts[0]._rev, "3-lokal", "muss den lokalen _rev tragen");
  assert.equal(res.lokalBehalten, 0);
});

test("Konfliktauflösung 'lokal' ändert nichts", () => {
  const lokal = karte({ kanbanId: "kanbanKarte:1", titel: "lokal", aktualisiertAm: "2026-08-01T10:00:00Z" });
  const eingehend = karte({ kanbanId: "kanbanKarte:1", titel: "eingehend", aktualisiertAm: "2026-08-02T10:00:00Z" });
  const plan = planeImport([lokal], [eingehend]);

  const res = loeseKonflikte(plan.konflikte, { "kanbanKarte:1": "lokal" });
  assert.equal(res.upserts.length, 0);
  assert.equal(res.lokalBehalten, 1);
  assert.equal(res.offen, 0);
});

test("Konflikt ohne getroffene Wahl bleibt offen (wird nicht angewendet)", () => {
  const lokal = karte({ kanbanId: "kanbanKarte:1", titel: "lokal", aktualisiertAm: "2026-08-01T10:00:00Z" });
  const eingehend = karte({ kanbanId: "kanbanKarte:1", titel: "eingehend", aktualisiertAm: "2026-08-02T10:00:00Z" });
  const plan = planeImport([lokal], [eingehend]);

  const res = loeseKonflikte(plan.konflikte, {});
  assert.equal(res.upserts.length, 0);
  assert.equal(res.offen, 1);
});

test("unbrauchbare Einträge werden übersprungen, gültige daneben verarbeitet", () => {
  const gueltig = karte({ kanbanId: "kanbanKarte:1", aktualisiertAm: "2026-08-01T10:00:00Z" });
  const plan = planeImport(
    [],
    [gueltig, null, {}, { kanbanId: "x" /* titel/aktualisiertAm fehlen */ }, "kaputt"],
  );
  assert.equal(plan.neu.length, 1);
  assert.equal(plan.uebersprungen, 4);
});

test("normalisiereImportKarte fällt bei unbekannten Enum-Werten auf sichere Defaults zurück", () => {
  const roh = {
    kanbanId: "kanbanKarte:1",
    titel: "T",
    aktualisiertAm: "2026-08-01T10:00:00Z",
    spalte: "quatsch",
    kategorie: "unbekannt",
    prioritaet: "riesig",
  };
  const norm = normalisiereImportKarte(roh);
  assert.ok(norm);
  assert.equal(norm.spalte, "offen");
  assert.equal(norm.kategorie, "sonstiges");
  assert.equal(norm.prioritaet, "mittel");
});

test("normalisiereImportKarte akzeptiert die Spalte 'testen'", () => {
  const norm = normalisiereImportKarte({ kanbanId: "k:1", titel: "T", aktualisiertAm: "2026-08-01T10:00:00Z", spalte: "testen" });
  assert.ok(norm);
  assert.equal(norm.spalte, "testen");
});

test("normalisiereImportKarte lehnt Karten ohne Pflichtfelder ab", () => {
  assert.equal(normalisiereImportKarte({ titel: "ohne id", aktualisiertAm: "2026-08-01T10:00:00Z" }), null);
  assert.equal(normalisiereImportKarte({ kanbanId: "k:1", aktualisiertAm: "2026-08-01T10:00:00Z" }), null);
  assert.equal(normalisiereImportKarte({ kanbanId: "k:1", titel: "ohne datum" }), null);
});

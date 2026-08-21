import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Event, EventTyp, Mannschaftsseite } from "@torball/shared";
import { ergebnisAusEvents, wirksameEvents } from "./ereignisse";

let naechsteSequenz = 1;

function ev(
  eventTyp: EventTyp,
  extra: Partial<Event> & { mannschaft?: Mannschaftsseite } = {},
): Event {
  const sequenz = extra.sequenz ?? naechsteSequenz++;
  return {
    _id: extra._id ?? `event:${sequenz}`,
    docType: "event",
    eventId: extra._id ?? `event:${sequenz}`,
    protokollId: "spielprotokoll:p1",
    turnierId: "turnier:t1",
    spielId: "spiel:s1",
    sequenz,
    zeitstempel: "2026-08-21T10:00:00.000Z",
    eventTyp,
    istEigentor: false,
    istKorrektur: false,
    ...extra,
  };
}

test("zaehlt Tore je Seite; Eigentor wird der Gegenseite gutgeschrieben", () => {
  const events = [
    ev("GO"),
    ev("W", { mannschaft: "A" }),
    ev("G", { mannschaft: "A" }),
    ev("W", { mannschaft: "B" }),
    ev("G", { mannschaft: "B" }),
    // Eigentor: Mannschaft B befoerdert den Ball ins eigene Tor -> Gutschrift A (Spez. 6.10).
    ev("G", { mannschaft: "B", istEigentor: true }),
  ];
  assert.deepEqual(ergebnisAusEvents(events), { ergebnisA: 2, ergebnisB: 1 });
});

test("ANNULLIERT streicht das referenzierte Event ersatzlos (Undo)", () => {
  const tor = ev("G", { mannschaft: "A" });
  const events = [
    ev("GO"),
    tor,
    ev("ANNULLIERT", { istKorrektur: true, korrigiertEventId: tor._id }),
  ];
  assert.deepEqual(ergebnisAusEvents(events), { ergebnisA: 0, ergebnisB: 0 });
  // Das ANNULLIERT-Event selbst taucht in den wirksamen Events nie auf.
  assert.deepEqual(
    wirksameEvents(events).map((e) => e.eventTyp),
    ["GO"],
  );
});

test("eine Korrektur mit Nutzdaten ersetzt: Ziel annulliert, Korrektur zaehlt selbst", () => {
  const falschesTor = ev("G", { mannschaft: "A" });
  const events = [
    falschesTor,
    // "Tor war fuer B, nicht fuer A": Ersatz-Event annulliert das falsche und zaehlt selbst.
    ev("G", { mannschaft: "B", istKorrektur: true, korrigiertEventId: falschesTor._id }),
  ];
  assert.deepEqual(ergebnisAusEvents(events), { ergebnisA: 0, ergebnisB: 1 });
});

test("Korrektur der Korrektur laesst das urspruengliche Event wieder aufleben", () => {
  const tor = ev("G", { mannschaft: "A" });
  const streichung = ev("ANNULLIERT", { istKorrektur: true, korrigiertEventId: tor._id });
  const events = [
    tor,
    streichung,
    // Das Undo war selbst ein Fehler -> Undo des Undo.
    ev("ANNULLIERT", { istKorrektur: true, korrigiertEventId: streichung._id }),
  ];
  assert.deepEqual(ergebnisAusEvents(events), { ergebnisA: 1, ergebnisB: 0 });
});

test("PROT: Entscheidungs-Korrektur ergaenzt (beide wirksam), ANNULLIERT streicht", () => {
  const protest = ev("PROT", { mannschaft: "A", zusatz: { begruendung: "Fehlentscheidung" } });
  const entscheidung = ev("PROT", {
    mannschaft: "A",
    istKorrektur: true,
    korrigiertEventId: protest._id,
    zusatz: { entscheidung: "abgelehnt" },
  });
  const mitEntscheidung = wirksameEvents([protest, entscheidung]);
  assert.deepEqual(
    mitEntscheidung.map((e) => e._id),
    [protest._id, entscheidung._id],
  );

  // Versehentlich erfasster Protest laesst sich dagegen per Undo streichen.
  const fehlProtest = ev("PROT", { mannschaft: "B" });
  const undo = ev("ANNULLIERT", { istKorrektur: true, korrigiertEventId: fehlProtest._id });
  assert.deepEqual(wirksameEvents([fehlProtest, undo]), []);
});

test("Korrektur auf ein unbekanntes Event wird ignoriert", () => {
  const events = [
    ev("G", { mannschaft: "A" }),
    ev("ANNULLIERT", { istKorrektur: true, korrigiertEventId: "event:gibt-es-nicht" }),
  ];
  assert.deepEqual(ergebnisAusEvents(events), { ergebnisA: 1, ergebnisB: 0 });
});

test("sortiert nach Sequenz, nicht nach Array-Reihenfolge", () => {
  const spaet = ev("G", { mannschaft: "A", sequenz: 5 });
  const frueh = ev("GO", { sequenz: 1 });
  assert.deepEqual(
    wirksameEvents([spaet, frueh]).map((e) => e.sequenz),
    [1, 5],
  );
});

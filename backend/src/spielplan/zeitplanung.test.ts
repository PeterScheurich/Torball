import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turnier } from "@torball/shared";
import { berechneStartzeit, datumUndStartzeitAus, spieldauerMinuten } from "./zeitplanung";

function turnier(ueberschreibung: Partial<Turnier> = {}): Turnier {
  return {
    _id: "turnier:test",
    docType: "turnier",
    turnierId: "turnier:test",
    name: "Test",
    datum: "2026-08-22",
    startzeit: "10:00",
    status: "entwurf",
    felder: [{ feldId: "feld:1", name: "Feld 1" }],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    spielzeitMinuten: 5,
    anzahlHalbzeiten: 2,
    pauseMinuten: 2,
    pauseZwischenSpielenMinuten: 0,
    seitenwechsel: true,
    timeoutsJeHalbzeit: 1,
    timeoutDauerSekunden: 30,
    auswechslungenJeHalbzeit: 3,
    tordifferenzAbbruch: true,
    tordifferenzLimit: 10,
    verlaengerungAktiv: true,
    silbernesTor: true,
    maxSehendeSpieler: 1,
    einstelligeTrikotnummern: true,
    punkteSieg: 2,
    punkteUnentschieden: 1,
    punkteNiederlage: 0,
    tabellenKriterien: ["punkte", "tordifferenz", "tore", "direkter_vergleich", "freiwuerfe"],
    forfaitErgebnis: "3:0",
    bundeslandBeruecksichtigen: false,
    spielernamenOeffentlich: false,
    spielplanVersion: 0,
    oeffentlichTurnierinfos: false,
    oeffentlichAnfahrtDokumente: false,
    oeffentlichSpielplan: false,
    oeffentlichErgebnisse: false,
    oeffentlichRegeln: false,
    erstelltAm: new Date().toISOString(),
    ...ueberschreibung,
  };
}

test("datumUndStartzeitAus ist die Umkehrung von berechneStartzeit (Slot 0)", () => {
  const t = turnier();
  const iso = berechneStartzeit(t, 0)!;
  assert.deepEqual(datumUndStartzeitAus(iso), { datum: t.datum, startzeit: t.startzeit });
});

test("datumUndStartzeitAus fuellt Stunden/Minuten mit fuehrenden Nullen auf", () => {
  const t = turnier({ startzeit: "09:05" });
  const iso = berechneStartzeit(t, 0)!;
  assert.deepEqual(datumUndStartzeitAus(iso), { datum: t.datum, startzeit: "09:05" });
});

test("datumUndStartzeitAus nach einem Spieldauer-Verschub (spaeterer Slot) liefert den erwarteten Folgetag bei Ueberlauf", () => {
  const t = turnier({ startzeit: "23:50", spielzeitMinuten: 10, anzahlHalbzeiten: 2, pauseMinuten: 5 });
  // spieldauer = 10*2+5 = 25 min, Slot 1 = 23:50 + 25min = 00:15 (naechster Tag)
  assert.equal(spieldauerMinuten(t), 25);
  const iso = berechneStartzeit(t, 1)!;
  assert.deepEqual(datumUndStartzeitAus(iso), { datum: "2026-08-23", startzeit: "00:15" });
});

test("spieldauerMinuten beruecksichtigt die Pause zwischen Spielen zusaetzlich zur Halbzeitpause", () => {
  const t = turnier({ spielzeitMinuten: 10, anzahlHalbzeiten: 2, pauseMinuten: 5, pauseZwischenSpielenMinuten: 3 });
  // 10*2 + 5 (Halbzeitpause) + 3 (Pause zwischen Spielen) = 28
  assert.equal(spieldauerMinuten(t), 28);
});

test("spieldauerMinuten faellt bei fehlendem pauseZwischenSpielenMinuten (Turnier vor Einfuehrung des Feldes) auf 0 zurueck", () => {
  const t = turnier({ spielzeitMinuten: 10, anzahlHalbzeiten: 2, pauseMinuten: 5 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (t as any).pauseZwischenSpielenMinuten;
  assert.equal(spieldauerMinuten(t), 25);
});

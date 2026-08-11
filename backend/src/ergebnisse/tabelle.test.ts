import { test } from "node:test";
import assert from "node:assert/strict";
import type { MannschaftImTurnier, Spiel, TabellenKriterium, Turnier } from "@torball/shared";
import { berechneTabelle } from "./tabelle";

function turnier(tabellenKriterien: TabellenKriterium[]): Turnier {
  return {
    _id: "turnier:test",
    docType: "turnier",
    turnierId: "turnier:test",
    name: "Test",
    datum: "2026-08-10",
    status: "entwurf",
    felder: [{ feldId: "feld:1", name: "Feld 1" }],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    spielzeitMinuten: 5,
    anzahlHalbzeiten: 2,
    pauseMinuten: 2,
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
    tabellenKriterien,
    forfaitErgebnis: "3:0",
    spielernamenOeffentlich: false,
    spielplanFreigegeben: false,
    spielplanVersion: 1,
    oeffentlichTurnierinfos: false,
    oeffentlichAnfahrtDokumente: false,
    oeffentlichSpielplan: false,
    oeffentlichErgebnisse: false,
    oeffentlichRegeln: false,
    erstelltAm: new Date().toISOString(),
  };
}

function mannschaft(id: string): MannschaftImTurnier {
  return { _id: id, docType: "mannschaftImTurnier", mannschaftId: id, turnierId: "turnier:test", name: id, reihenfolge: 0 };
}

let spielZaehler = 0;
function spiel(
  mannschaftAId: string,
  mannschaftBId: string,
  ergebnisA: number | undefined,
  ergebnisB: number | undefined,
  istForfait = false,
): Spiel {
  spielZaehler += 1;
  const id = `spiel:test-${spielZaehler}`;
  return {
    _id: id,
    docType: "spiel",
    spielId: id,
    turnierId: "turnier:test",
    runde: String(spielZaehler),
    mannschaftAId,
    mannschaftBId,
    status: "geplant",
    ergebnisA,
    ergebnisB,
    istForfait,
    ergebnisAbgeschlossen: false,
  };
}

const STANDARD_KRITERIEN: TabellenKriterium[] = ["punkte", "tordifferenz", "tore", "direkter_vergleich", "freiwuerfe"];

test("nur Spiele mit erfasstem Ergebnis fliessen ein, unabhaengig vom Abschluss-Status", () => {
  const t = turnier(STANDARD_KRITERIEN);
  const mannschaften = [mannschaft("a"), mannschaft("b")];
  const spiele = [spiel("a", "b", 5, 2), spiel("a", "b", undefined, undefined)];

  const tabelle = berechneTabelle(t, mannschaften, spiele);
  const a = tabelle.find((z) => z.mannschaftId === "a")!;
  assert.equal(a.spiele, 1);
  assert.equal(a.punkte, 2);
});

test("Punkte, Tordifferenz und Tore korrekt berechnet, bei Punkte-/Tordifferenz-Gleichstand entscheiden die meisten Tore", () => {
  const t = turnier(STANDARD_KRITERIEN);
  const mannschaften = [mannschaft("a"), mannschaft("b"), mannschaft("c")];
  const spiele = [
    spiel("a", "b", 5, 2), // a gewinnt
    spiel("a", "c", 3, 3), // Unentschieden
    spiel("b", "c", 1, 4), // c gewinnt
  ];

  const tabelle = berechneTabelle(t, mannschaften, spiele);

  const a = tabelle.find((z) => z.mannschaftId === "a")!;
  const b = tabelle.find((z) => z.mannschaftId === "b")!;
  const c = tabelle.find((z) => z.mannschaftId === "c")!;
  assert.equal(a.punkte, 3); // Sieg (2) + Unentschieden (1)
  assert.equal(c.punkte, 3); // Unentschieden (1) + Sieg (2)
  assert.equal(b.punkte, 0);
  assert.equal(a.tordifferenz, c.tordifferenz); // beide +3, Punkte und Tordifferenz allein trennen a/c nicht

  // a und c gleich bei Punkten und Tordifferenz, aber a hat mehr Tore erzielt (8 vs. 7) -> a vor c.
  assert.deepEqual(tabelle.map((z) => z.mannschaftId), ["a", "c", "b"]);
});

test("Nichterscheinen: Forfait-Ergebnis zieht der nicht angetretenen Mannschaft zusaetzlich 2 Punkte ab", () => {
  const t = turnier(STANDARD_KRITERIEN);
  const mannschaften = [mannschaft("a"), mannschaft("b")];
  // "a" tritt nicht an, "b" gewinnt per Forfait 3:0.
  const spiele = [spiel("a", "b", 0, 3, true)];

  const tabelle = berechneTabelle(t, mannschaften, spiele);
  const a = tabelle.find((z) => z.mannschaftId === "a")!;
  const b = tabelle.find((z) => z.mannschaftId === "b")!;
  assert.equal(b.punkte, 2); // regulaerer Sieg
  assert.equal(a.punkte, -2); // 0 (Niederlage) - 2 (Forfait-Abzug)
});

test("direkter Vergleich entscheidet bei Punkte-/Tordifferenz-/Tore-Gleichstand", () => {
  const t = turnier(STANDARD_KRITERIEN);
  const mannschaften = [mannschaft("a"), mannschaft("b"), mannschaft("c")];
  // a und b jeweils 1 Sieg, 1 Niederlage, exakt gleiche Tordifferenz (0) und gleiche
  // Tore (1) - aber a hat b im direkten Duell bezwungen und sollte deshalb vorne stehen.
  const spiele = [
    spiel("a", "b", 1, 0), // a schlaegt b direkt
    spiel("a", "c", 0, 1), // a verliert gegen c
    spiel("b", "c", 1, 0), // b schlaegt c
  ];

  const tabelle = berechneTabelle(t, mannschaften, spiele);
  const a = tabelle.find((z) => z.mannschaftId === "a")!;
  const b = tabelle.find((z) => z.mannschaftId === "b")!;
  assert.equal(a.punkte, b.punkte);
  assert.equal(a.tordifferenz, b.tordifferenz);
  assert.equal(a.toreFuer, b.toreFuer);

  const aIndex = tabelle.findIndex((z) => z.mannschaftId === "a");
  const bIndex = tabelle.findIndex((z) => z.mannschaftId === "b");
  assert.ok(aIndex < bIndex, "a hat b direkt bezwungen und sollte vor b stehen");
});

test("leere Mannschaftsliste liefert leere Tabelle, kein Fehler", () => {
  const t = turnier(STANDARD_KRITERIEN);
  const tabelle = berechneTabelle(t, [], []);
  assert.deepEqual(tabelle, []);
});

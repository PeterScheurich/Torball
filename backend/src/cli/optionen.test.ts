import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOptionen } from "./optionen";

test("Optionen mit Wert werden gelesen, auch mit Leerzeichen und Gleichheitszeichen im Wert", () => {
  assert.deepEqual(parseOptionen(['--datei=C:\a b\c.json', "--wert=x=y"]), { datei: "C:\a b\c.json", wert: "x=y" });
});

test("Schalter ohne Wert stehen mit leerem Wert in den Optionen (wichtig fuer --ersetzen und --ueberschreiben)", () => {
  const o = parseOptionen(["--ersetzen", "--datei=x.json"]);
  assert.ok("ersetzen" in o);
  assert.equal(o.ersetzen, "");
  assert.equal(o.datei, "x.json");
});

test("alles andere wird ignoriert", () => {
  assert.deepEqual(parseOptionen(["datei", "-x", ""]), {});
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { einrichtungsCodeStimmt, konfigurierterEinrichtungsCode, normalisiereEinrichtungsCode } from "./einrichtungsCode";

test("Einrichtungs-Code: Gross-/Kleinschreibung, Bindestriche und Leerzeichen spielen beim Abtippen keine Rolle", () => {
  assert.equal(normalisiereEinrichtungsCode(" gan4-6akr h5u9 "), "GAN46AKRH5U9");
  assert.ok(einrichtungsCodeStimmt("gan4-6akr-h5u9", "GAN4-6AKR-H5U9"));
  assert.ok(einrichtungsCodeStimmt("GAN46AKRH5U9", "GAN4-6AKR-H5U9"));
  assert.ok(einrichtungsCodeStimmt("  Gan4 6Akr H5u9  ", "GAN4-6AKR-H5U9"));
});

test("Einrichtungs-Code: falsche, fehlende, zu kurze und zu lange Eingaben stimmen nicht", () => {
  const code = "GAN4-6AKR-H5U9";
  assert.equal(einrichtungsCodeStimmt(undefined, code), false);
  assert.equal(einrichtungsCodeStimmt("", code), false);
  assert.equal(einrichtungsCodeStimmt("GAN4-6AKR-H5U8", code), false, "ein Zeichen daneben");
  assert.equal(einrichtungsCodeStimmt("GAN4-6AKR", code), false, "zu kurz");
  assert.equal(einrichtungsCodeStimmt("GAN4-6AKR-H5U9-XXXX", code), false, "zu lang");
  assert.equal(einrichtungsCodeStimmt("---- ----", code), false, "nur Trennzeichen");
});

test("Einrichtungs-Code: ohne gesetzte Umgebungsvariable (oder leer) wird keiner verlangt", () => {
  const vorher = process.env.ERSTEINRICHTUNGS_CODE;
  try {
    delete process.env.ERSTEINRICHTUNGS_CODE;
    assert.equal(konfigurierterEinrichtungsCode(), undefined);
    process.env.ERSTEINRICHTUNGS_CODE = "   ";
    assert.equal(konfigurierterEinrichtungsCode(), undefined);
    process.env.ERSTEINRICHTUNGS_CODE = "GAN4-6AKR-H5U9";
    assert.equal(konfigurierterEinrichtungsCode(), "GAN4-6AKR-H5U9");
  } finally {
    if (vorher === undefined) delete process.env.ERSTEINRICHTUNGS_CODE;
    else process.env.ERSTEINRICHTUNGS_CODE = vorher;
  }
});

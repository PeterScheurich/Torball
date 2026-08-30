import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PASSWORT_MINDESTLAENGE, passwortRegelVerstoss } from "./passwort";

/**
 * Regeln seit 2026-08-30: Es zaehlt die Laenge, nicht die Zusammensetzung. Die Tests halten vor
 * allem die Faelle fest, die zur Umstellung gefuehrt haben - ein langes generiertes Passwort ohne
 * Sonderzeichen und eine Passphrase aus Kleinbuchstaben mussten vorher scheitern.
 */

test("eine Passphrase aus Woertern ist gueltig - der Regelfall fuer die Zielgruppe", () => {
  assert.equal(passwortRegelVerstoss("halle-muenchen-dienstag"), undefined);
  assert.equal(passwortRegelVerstoss("korrekt pferd batterie"), undefined);
});

test("ein langes generiertes Passwort ohne Sonderzeichen ist gueltig", () => {
  // Genau der gemeldete Fall: 64 Zeichen aus Gross-, Kleinbuchstaben und Zahlen.
  assert.equal(passwortRegelVerstoss("aZ3kQ9mW2xR7tY4uI8oP1sD6fG5hJ0kL3zX9cV2bN7mQ4wE1rT8yU5iO6pA"), undefined);
});

test("Sonderzeichen sind weiterhin erlaubt, nur nicht mehr verlangt", () => {
  assert.equal(passwortRegelVerstoss("Sommer-Fest-2026!"), undefined);
});

test("zu kurz wird abgelehnt, mit der Laenge im Text", () => {
  const verstoss = passwortRegelVerstoss("Kurz-1a!x");
  assert.ok(verstoss?.includes(String(PASSWORT_MINDESTLAENGE)));
});

test("genau die Mindestlaenge genuegt", () => {
  assert.equal("hallentorneu".length, PASSWORT_MINDESTLAENGE);
  assert.equal(passwortRegelVerstoss("hallentorneu"), undefined);
});

test("haeufige Zeichenfolgen werden abgelehnt - auch als Teil und in anderer Schreibweise", () => {
  assert.ok(passwortRegelVerstoss("passwortpasswort"));
  assert.ok(passwortRegelVerstoss("MeinPasswortIstGut"));
  assert.ok(passwortRegelVerstoss("qwertzuiopasdf"));
});

test("alltaegliche Woerter bleiben erlaubt - die Sperrliste ist bewusst kurz", () => {
  // Ein frueherer Entwurf sperrte "sommer"/"winter"/"torball" und haette diese abgelehnt.
  assert.equal(passwortRegelVerstoss("Sommer-Fest-Muenchen-2026"), undefined);
  assert.equal(passwortRegelVerstoss("torball-halle-dienstag"), undefined);
  assert.equal(passwortRegelVerstoss("winterpause-verlaengert"), undefined);
});

test("der eigene Name darf nicht im Passwort stehen", () => {
  const kontext = { name: "Peter Scheurich", email: "peter.scheurich@example.invalid" };
  assert.ok(passwortRegelVerstoss("scheurich-dienstag", kontext));
  assert.ok(passwortRegelVerstoss("dienstag-in-peter-halle", kontext));
  // Ohne Kontext greift die Pruefung nicht - deshalb wird er ueberall mitgegeben, wo er bekannt ist.
  assert.equal(passwortRegelVerstoss("scheurich-dienstag"), undefined);
});

test("kurze Namensbestandteile loesen keinen Fehlalarm aus", () => {
  // "van" hat nur drei Zeichen und wuerde sonst halbe Woerterbuecher sperren.
  const kontext = { name: "Jan van Dijk", email: "jan@example.invalid" };
  assert.equal(passwortRegelVerstoss("vanille-eis-am-stiel", kontext), undefined);
});

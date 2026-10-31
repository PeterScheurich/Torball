import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHIEDSRICHTER_ANZEIGE_ELEMENTE,
  pruefeSchiedsrichterAnzeige,
  schiedsrichterAnzeigeOptionen,
} from "@torball/shared";

test("ohne Einstellung sind alle Elemente sichtbar (Altbestand aendert sich nicht)", () => {
  const opt = schiedsrichterAnzeigeOptionen(undefined);
  for (const { schluessel } of SCHIEDSRICHTER_ANZEIGE_ELEMENTE) assert.equal(opt[schluessel], true, schluessel);
});

test("nur ein ausdrueckliches false blendet aus", () => {
  const opt = schiedsrichterAnzeigeOptionen({ restzeit: false, auszeiten: true });
  assert.equal(opt.restzeit, false);
  assert.equal(opt.auszeiten, true);
  assert.equal(opt.wurfzaehler, true, "nicht genannt = sichtbar");
});

test("Pruefung: erlaubt bekannte Schluessel mit Wahrheitswerten, sonst eine Fehlermeldung", () => {
  assert.equal(pruefeSchiedsrichterAnzeige({}), undefined);
  assert.equal(pruefeSchiedsrichterAnzeige({ restzeit: false, strafwurf: true }), undefined);
  assert.match(pruefeSchiedsrichterAnzeige({ werbung: true }) ?? "", /Unbekannt/);
  assert.match(pruefeSchiedsrichterAnzeige({ restzeit: 0 }) ?? "", /Wahrheitswert/);
  assert.ok(pruefeSchiedsrichterAnzeige(null));
  assert.ok(pruefeSchiedsrichterAnzeige([]));
  assert.ok(pruefeSchiedsrichterAnzeige("alles"));
});

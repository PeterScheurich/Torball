import { test } from "node:test";
import assert from "node:assert/strict";
import type { KontoHinweis } from "@torball/shared";
import { MAX_KONTO_HINWEISE, fuegeKontoHinweisHinzu, kontoHinweisText, ungeleseneKontoHinweise } from "@torball/shared";

const hinweis = (n: number, extra: Partial<KontoHinweis> = {}): KontoHinweis => ({
  id: `h${n}`,
  art: "passwort-geaendert",
  zeitpunkt: new Date(2026, 10, 2, 10, n).toISOString(),
  gelesen: false,
  ...extra,
});

test("Hinweistext nennt die Aenderung, den Zusatz und die ausloesende Person", () => {
  assert.equal(kontoHinweisText({ art: "passwort-geaendert" }), "Dein Passwort wurde geändert.");
  assert.equal(
    kontoHinweisText({ art: "passwort-geaendert", detail: "Es wurde über einen Zurücksetzen-Link gesetzt." }),
    "Dein Passwort wurde geändert. Es wurde über einen Zurücksetzen-Link gesetzt.",
  );
  assert.equal(
    kontoHinweisText({ art: "rolle-geaendert", detail: "Neue Rolle: Manager.", durch: "Erika Mustermann" }),
    "Die Rolle deines Kontos wurde geändert. Neue Rolle: Manager. Ausgelöst durch: Erika Mustermann.",
  );
});

test("Die Liste der Hinweise bleibt begrenzt, die neuesten bleiben", () => {
  let liste: KontoHinweis[] | undefined;
  for (let n = 0; n < MAX_KONTO_HINWEISE + 5; n++) liste = fuegeKontoHinweisHinzu(liste, hinweis(n));
  assert.equal(liste!.length, MAX_KONTO_HINWEISE);
  assert.equal(liste![0]!.id, "h5", "die ältesten fallen heraus");
  assert.equal(liste!.at(-1)!.id, `h${MAX_KONTO_HINWEISE + 4}`);
});

test("Nur ungelesene Hinweise werden angezeigt", () => {
  const liste = [hinweis(1, { gelesen: true }), hinweis(2), hinweis(3, { gelesen: true }), hinweis(4)];
  assert.deepEqual(
    ungeleseneKontoHinweise(liste).map((h) => h.id),
    ["h2", "h4"],
  );
  assert.deepEqual(ungeleseneKontoHinweise(undefined), []);
});

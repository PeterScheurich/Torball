import assert from "node:assert/strict";
import { test } from "node:test";
import { schwaerzeTokens } from "./logSchutz";

const TOKEN = "f021f5a66438b89366cb93085dcc93da9483d1657b0a86bdf6adcd6b0073feb5";

test("Tokens in Anfrage-URLs werden geschwaerzt, der Rest der URL bleibt lesbar", () => {
  assert.equal(schwaerzeTokens(`/benutzer/einladung/${TOKEN}`), "/benutzer/einladung/***");
  assert.equal(schwaerzeTokens(`/benutzer/einladung/${TOKEN}/annehmen`), "/benutzer/einladung/***/annehmen");
  assert.equal(schwaerzeTokens(`/benutzer/passwort-reset/${TOKEN}`), "/benutzer/passwort-reset/***");
  assert.equal(
    schwaerzeTokens(`/ergebnis-erfassung/${TOKEN}/spiele/spiel:1`),
    "/ergebnis-erfassung/***/spiele/spiel:1",
  );
});

test("auch der Reset-Link aus dem Server-Log (ohne Mailversand) wird geschwaerzt", () => {
  const zeile = `Passwort-Reset fuer a@example.invalid: /passwort-reset/${TOKEN} (24h gueltig)`;
  assert.ok(!schwaerzeTokens(zeile).includes(TOKEN));
  assert.ok(schwaerzeTokens(zeile).includes("/passwort-reset/***"));
});

test("andere URLs bleiben unveraendert", () => {
  assert.equal(schwaerzeTokens("/turniere/turnier:abc/spiele"), "/turniere/turnier:abc/spiele");
  assert.equal(schwaerzeTokens("/auth/login"), "/auth/login");
});

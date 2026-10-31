import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { zentralerFehlerHandler } from "./fehlerBehandlung";

/**
 * Serverfehler duerfen dem Client keine Interna verraten (OWASP A10, 2026-10-31). Bei einem
 * Datenbankausfall steht in der Originalmeldung z. B. die Adresse der Datenbank.
 */
function appMit(fehler: () => never) {
  const app = Fastify();
  app.setErrorHandler(zentralerFehlerHandler);
  app.get("/boom", async () => fehler());
  app.post("/pruefen", { schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } }, async () => ({ ok: true }));
  return app;
}

test("ein Serverfehler liefert eine allgemeine Meldung ohne Interna", async () => {
  const app = appMit(() => {
    throw new Error("Connect Timeout Error (attempted address: 10.10.20.114:5984, timeout: 10000ms)");
  });
  const antwort = await app.inject({ method: "GET", url: "/boom" });
  assert.equal(antwort.statusCode, 500);
  assert.ok(!antwort.body.includes("10.10.20.114"), "die Datenbank-Adresse darf nicht in der Antwort stehen");
  assert.ok(!antwort.body.includes("Timeout"), "keine Originalmeldung in der Antwort");
  assert.match(antwort.json().error, /Interner Fehler/);
  await app.close();
});

test("ein Fehler mit eigenem 5xx-Status behaelt den Status, aber nicht die Meldung", async () => {
  const app = appMit(() => {
    throw Object.assign(new Error("geheimes Detail"), { statusCode: 503 });
  });
  const antwort = await app.inject({ method: "GET", url: "/boom" });
  assert.equal(antwort.statusCode, 503);
  assert.ok(!antwort.body.includes("geheimes Detail"));
  await app.close();
});

test("ein Versionskonflikt (409) bleibt die verstaendliche deutsche Meldung", async () => {
  const app = appMit(() => {
    throw Object.assign(new Error("Document update conflict."), { statusCode: 409 });
  });
  const antwort = await app.inject({ method: "GET", url: "/boom" });
  assert.equal(antwort.statusCode, 409);
  assert.match(antwort.json().error, /Bitte neu laden/);
  await app.close();
});

test("Fehler des Aufrufers (4xx, z. B. Schema-Pruefung) behalten ihre Meldung", async () => {
  const app = appMit(() => {
    throw new Error("egal");
  });
  const antwort = await app.inject({ method: "POST", url: "/pruefen", payload: {} });
  assert.equal(antwort.statusCode, 400);
  assert.match(antwort.body, /name/, "die Schema-Meldung muss weiter erklaeren, was fehlt");
  await app.close();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE_ANMELDUNG_RATE_LIMIT, ermittleTrustProxy, GLOBAL_RATE_LIMIT, SENSIBEL_RATE_LIMIT } from "./rateLimit";

// Reine Funktion + Plugin-Verhalten (via app.inject) - kein CouchDB noetig, laeuft im normalen npm test.

test("ermittleTrustProxy: Default vertraut Loopback + privaten Netzbereichen", () => {
  const alt = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  try {
    const wert = ermittleTrustProxy();
    assert.ok(Array.isArray(wert));
    assert.ok((wert as string[]).includes("127.0.0.1"));
    assert.ok((wert as string[]).includes("10.0.0.0/8"));
  } finally {
    if (alt === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = alt;
  }
});

test("ermittleTrustProxy: 'false'/'true'/Kommaliste werden korrekt interpretiert", () => {
  const alt = process.env.TRUST_PROXY;
  try {
    process.env.TRUST_PROXY = "false";
    assert.equal(ermittleTrustProxy(), false);
    process.env.TRUST_PROXY = "true";
    assert.equal(ermittleTrustProxy(), true);
    process.env.TRUST_PROXY = "1.2.3.4, 10.0.0.0/8";
    assert.deepEqual(ermittleTrustProxy(), ["1.2.3.4", "10.0.0.0/8"]);
  } finally {
    if (alt === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = alt;
  }
});

test("ermittleTrustProxy: eine reine Hop-Zahl wird abgelehnt (GHSA-3m5p-2c4r-xxw2)", () => {
  const alt = process.env.TRUST_PROXY;
  try {
    process.env.TRUST_PROXY = "2";
    assert.throws(() => ermittleTrustProxy(), /Hop-Anzahl/);
  } finally {
    if (alt === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = alt;
  }
});

test("die Limits sind plausibel gestaffelt (sensibel < code < global)", () => {
  assert.ok(SENSIBEL_RATE_LIMIT.max < CODE_ANMELDUNG_RATE_LIMIT.max);
  assert.ok(CODE_ANMELDUNG_RATE_LIMIT.max < GLOBAL_RATE_LIMIT.max);
});

test("globales Rate-Limit: nach 'max' Anfragen folgt 429", async () => {
  const Fastify = (await import("fastify")).default;
  const fastifyRateLimit = (await import("@fastify/rate-limit")).default;
  const app = Fastify();
  await app.register(fastifyRateLimit, { global: true, max: 3, timeWindow: "1 minute" });
  app.get("/ping", async () => ({ ok: true }));
  try {
    for (let i = 1; i <= 3; i++) {
      const a = await app.inject({ method: "GET", url: "/ping" });
      assert.equal(a.statusCode, 200, `Anfrage ${i} sollte durchgehen`);
    }
    const zuViel = await app.inject({ method: "GET", url: "/ping" });
    assert.equal(zuViel.statusCode, 429, "4. Anfrage sollte gedrosselt werden");
  } finally {
    await app.close();
  }
});

test("route-spezifisches Limit (config.rateLimit) verschaerft das globale Limit", async () => {
  const Fastify = (await import("fastify")).default;
  const fastifyRateLimit = (await import("@fastify/rate-limit")).default;
  const app = Fastify();
  await app.register(fastifyRateLimit, { global: true, max: 100, timeWindow: "1 minute" });
  app.post("/sensibel", { config: { rateLimit: { max: 1, timeWindow: "1 minute" } } }, async () => ({ ok: true }));
  try {
    const erste = await app.inject({ method: "POST", url: "/sensibel", payload: {} });
    assert.equal(erste.statusCode, 200);
    const zweite = await app.inject({ method: "POST", url: "/sensibel", payload: {} });
    assert.equal(zweite.statusCode, 429, "2. Anfrage auf die sensible Route sollte gedrosselt werden");
  } finally {
    await app.close();
  }
});

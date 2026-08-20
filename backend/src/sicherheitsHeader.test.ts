import assert from "node:assert/strict";
import { test } from "node:test";
import { sicherheitsHeaderHook } from "./sicherheitsHeader";

// Reiner Hook-Test (kein CouchDB): registriert den onSend-Hook auf einer Fastify-Instanz und prueft
// die gesetzten Header per app.inject.

async function baueApp(cookieSecure: boolean) {
  const Fastify = (await import("fastify")).default;
  const app = Fastify();
  app.addHook("onSend", sicherheitsHeaderHook);
  app.get("/x", async () => ({ ok: true }));
  const alt = process.env.COOKIE_SECURE;
  process.env.COOKIE_SECURE = cookieSecure ? "true" : "false";
  return { app, restore: () => (alt === undefined ? delete process.env.COOKIE_SECURE : (process.env.COOKIE_SECURE = alt)) };
}

test("Sicherheits-Header sind auf jeder Antwort gesetzt", async () => {
  const { app, restore } = await baueApp(false);
  try {
    const antwort = await app.inject({ method: "GET", url: "/x" });
    assert.equal(antwort.headers["x-content-type-options"], "nosniff");
    assert.equal(antwort.headers["x-frame-options"], "DENY");
    assert.equal(antwort.headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.match(String(antwort.headers["content-security-policy"]), /frame-ancestors 'none'/);
    assert.match(String(antwort.headers["permissions-policy"]), /camera=\(\)/);
  } finally {
    restore();
    await app.close();
  }
});

test("HSTS nur bei COOKIE_SECURE=true", async () => {
  const ohne = await baueApp(false);
  try {
    const a = await ohne.app.inject({ method: "GET", url: "/x" });
    assert.equal(a.headers["strict-transport-security"], undefined, "ohne HTTPS kein HSTS");
  } finally {
    ohne.restore();
    await ohne.app.close();
  }

  const mit = await baueApp(true);
  try {
    const b = await mit.app.inject({ method: "GET", url: "/x" });
    assert.match(String(b.headers["strict-transport-security"]), /max-age=\d+/);
    assert.doesNotMatch(String(b.headers["strict-transport-security"]), /includeSubDomains/, "bewusst ohne includeSubDomains");
  } finally {
    mit.restore();
    await mit.app.close();
  }
});

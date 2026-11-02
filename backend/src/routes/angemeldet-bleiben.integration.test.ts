import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Session } from "@torball/shared";

/**
 * "Angemeldet bleiben" (2026-11-02): Ohne Haken bekommt das Session-Cookie KEIN Ablaufdatum (der Browser wirft es
 * beim Schliessen weg), mit Haken genau die Hoechstdauer von 12 Stunden. Unabhaengig davon beendet der Server jede
 * Session spaetestens 12 Stunden nach der Anmeldung - auch wenn sie dauernd benutzt wird oder der Browser das
 * Cookie ueber einen Neustart behalten hat. Laeuft gegen die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const PASSWORT = "Halle-Dienstag-Test-77";
const STUNDE = 60 * 60 * 1000;

test(
  "Angemeldet bleiben: Cookie-Laufzeit je Wahl, harte 12-Stunden-Grenze auf dem Server",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authRoutes } = await import("./auth");
    const { authPreHandler, SESSION_COOKIE_NAME } = await import("../auth/plugin");
    const { erstelleSession } = await import("../auth/session");
    const { findById, findByIdUngeprueft, insertDoc, deleteDoc, newId } = await import("../repository");
    const { hashePasswort } = await import("../auth/passwort");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(authRoutes);

    const id = newId("benutzer");
    const sessionIds: string[] = [];
    await insertDoc<Benutzer>({
      _id: id,
      docType: "benutzer",
      benutzerId: id,
      email: `${id}@example.invalid`,
      passwortHash: await hashePasswort(PASSWORT),
      name: "Bleiben-Test",
      globaleRolle: "benutzer",
      sprache: "de",
      zweiFaAktiv: false,
      gesperrt: false,
      erstelltAm: new Date().toISOString(),
    });

    const anmelden = (extra: object = {}) =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: `${id}@example.invalid`, passwort: PASSWORT, ...extra },
      });
    const sessionCookie = (res: Awaited<ReturnType<typeof anmelden>>) =>
      res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    const ich = (token: string) =>
      app.inject({ method: "GET", url: "/auth/me", headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });

    /** Setzt den Anmeldezeitpunkt einer Session zurueck (sie bleibt dabei "gerade eben benutzt"). */
    async function altern(token: string, stundenAlt: number) {
      const { createHash } = await import("node:crypto");
      const sid = `session:${createHash("sha256").update(token).digest("hex")}`;
      const s = await findById<Session>(sid, "session");
      assert.ok(s, "Session vorhanden");
      await insertDoc({ ...s, erstelltAm: new Date(Date.now() - stundenAlt * STUNDE).toISOString() });
      return sid;
    }

    try {
      // --- 1. Ohne Angabe und mit "false": Cookie ohne Ablaufdatum, aber sonst gleich gesichert
      for (const extra of [{}, { angemeldetBleiben: false }]) {
        const r = await anmelden(extra);
        assert.equal(r.statusCode, 200);
        const c = sessionCookie(r);
        assert.ok(c, "Session-Cookie gesetzt");
        assert.equal(c.maxAge, undefined, "kein Max-Age ohne Haken");
        assert.equal(c.expires, undefined, "kein Expires ohne Haken");
        assert.equal(c.httpOnly, true);
        assert.equal(c.sameSite, "Lax");
        sessionIds.push(`session:${(await import("node:crypto")).createHash("sha256").update(c.value).digest("hex")}`);
      }

      // --- 2. Mit Haken: genau 12 Stunden
      const mit = await anmelden({ angemeldetBleiben: true });
      assert.equal(mit.statusCode, 200);
      const cMit = sessionCookie(mit)!;
      assert.equal(cMit.maxAge, 12 * 60 * 60, "Max-Age = 12 Stunden");
      assert.equal(cMit.httpOnly, true);
      assert.equal(cMit.sameSite, "Lax");
      assert.equal((await ich(cMit.value)).statusCode, 200, "frisch angemeldet");

      // --- 3. Ein Wert, der kein Wahrheitswert ist, wird abgewiesen statt als "an" gedeutet
      const kaputt = await anmelden({ angemeldetBleiben: { $ne: false } });
      assert.equal(kaputt.statusCode, 400);

      // --- 4. Harte Grenze: 11 Stunden nach der Anmeldung noch gueltig, 13 Stunden nicht mehr -
      //        obwohl das Inaktivitaets-Fenster durch die Anfrage davor immer wieder verlaengert wurde.
      sessionIds.push(await altern(cMit.value, 11));
      assert.equal((await ich(cMit.value)).statusCode, 200, "11 Stunden alt: noch gueltig");
      await altern(cMit.value, 13);
      assert.equal((await ich(cMit.value)).statusCode, 401, "13 Stunden alt: abgelaufen, trotz regelmaessiger Nutzung");
      assert.equal(await findById<Session>(sessionIds[sessionIds.length - 1]!, "session"), null, "Session geloescht");

      // --- 5. Dasselbe gilt fuer eine Anmeldung OHNE Haken (Browser, der das Cookie ueber einen Neustart behaelt)
      const ohne = await anmelden();
      const cOhne = sessionCookie(ohne)!;
      await altern(cOhne.value, 13);
      assert.equal((await ich(cOhne.value)).statusCode, 401, "auch ohne Haken endet die Session nach 12 Stunden");

      // --- 6. Eine Session ohne lesbaren Anmeldezeitpunkt wird nicht akzeptiert (fail closed)
      const { token } = await erstelleSession(id);
      const { createHash } = await import("node:crypto");
      const sid6 = `session:${createHash("sha256").update(token).digest("hex")}`;
      const s6 = await findById<Session>(sid6, "session");
      await insertDoc({ ...s6!, erstelltAm: "kein-datum" });
      assert.equal((await ich(token)).statusCode, 401);
    } finally {
      await app.close();
      const alle = [...sessionIds];
      for (const sid of alle) {
        const d = await findByIdUngeprueft(sid);
        if (d) await deleteDoc(sid, (d as { _rev: string })._rev);
      }
      // Uebrige Sessions dieses Kontos (wurden nicht einzeln mitgeschrieben).
      const { loescheAlleSessionenVonBenutzer } = await import("../auth/session");
      await loescheAlleSessionenVonBenutzer(id);
      const b = await findByIdUngeprueft(id);
      if (b) await deleteDoc(id, (b as { _rev: string })._rev);
    }
  },
);

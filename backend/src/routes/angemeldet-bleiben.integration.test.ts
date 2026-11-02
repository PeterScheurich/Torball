import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Session } from "@torball/shared";

/**
 * "Angemeldet bleiben" (2026-11-02): Ohne Haken bekommt das Session-Cookie KEIN Ablaufdatum (der Browser wirft es
 * beim Schliessen weg), mit Haken 12 Stunden - und der Server erneuert es bei jeder Anfrage. Eine Session endet
 * nur nach 12 Stunden OHNE Aktivitaet; wer arbeitet (z. B. digitales Protokoll), wird nie abgemeldet. Laeuft gegen
 * die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const PASSWORT = "Halle-Dienstag-Test-77";
const STUNDE = 60 * 60 * 1000;

test(
  "Angemeldet bleiben: Cookie-Laufzeit je Wahl, Session endet nur nach Inaktivitaet, nie waehrend der Nutzung",
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

    const sidVon = async (token: string) => {
      const { createHash } = await import("node:crypto");
      return `session:${createHash("sha256").update(token).digest("hex")}`;
    };
    /** Aendert Felder der gespeicherten Session (z. B. um Zeit verstreichen zu lassen). */
    async function aendere(token: string, patch: Partial<Session>) {
      const sid = await sidVon(token);
      const s = await findById<Session>(sid, "session");
      assert.ok(s, "Session vorhanden");
      await insertDoc({ ...s, ...patch } as Session);
      return sid;
    }
    const vor = (stunden: number) => new Date(Date.now() - stunden * STUNDE).toISOString();
    const in_ = (stunden: number) => new Date(Date.now() + stunden * STUNDE).toISOString();

    try {
      // --- 1. Ohne Angabe und mit "false": Cookie ohne Ablaufdatum, aber sonst gleich gesichert
      let ohneToken = "";
      for (const extra of [{}, { angemeldetBleiben: false }]) {
        const r = await anmelden(extra);
        assert.equal(r.statusCode, 200);
        const c = sessionCookie(r);
        assert.ok(c, "Session-Cookie gesetzt");
        assert.equal(c.maxAge, undefined, "kein Max-Age ohne Haken");
        assert.equal(c.expires, undefined, "kein Expires ohne Haken");
        assert.equal(c.httpOnly, true);
        assert.equal(c.sameSite, "Lax");
        ohneToken = c.value;
        sessionIds.push(await sidVon(c.value));
        assert.equal((await findById<Session>(sessionIds[sessionIds.length - 1]!, "session"))!.dauerhaft, false);
      }

      // --- 2. Mit Haken: 12 Stunden, und die Session merkt es sich
      const mit = await anmelden({ angemeldetBleiben: true });
      assert.equal(mit.statusCode, 200);
      const cMit = sessionCookie(mit)!;
      assert.equal(cMit.maxAge, 12 * 60 * 60, "Max-Age = 12 Stunden");
      assert.equal(cMit.httpOnly, true);
      assert.equal(cMit.sameSite, "Lax");
      const sidMit = await sidVon(cMit.value);
      sessionIds.push(sidMit);
      assert.equal((await findById<Session>(sidMit, "session"))!.dauerhaft, true);

      // --- 3. Ein Wert, der kein Wahrheitswert ist, wird abgewiesen statt als "an" gedeutet
      const kaputt = await anmelden({ angemeldetBleiben: { $ne: false } });
      assert.equal(kaputt.statusCode, 400);

      // --- 4. Das Cookie "Angemeldet bleiben" wandert mit: jede Anfrage erneuert das Ablaufdatum.
      //        Ohne Haken setzt der Server nie ein neues Cookie.
      const erneuert = await ich(cMit.value);
      assert.equal(erneuert.statusCode, 200);
      assert.equal(erneuert.cookies.find((c) => c.name === SESSION_COOKIE_NAME)?.maxAge, 12 * 60 * 60);
      const nichtErneuert = await ich(ohneToken);
      assert.equal(nichtErneuert.statusCode, 200);
      assert.equal(nichtErneuert.cookies.find((c) => c.name === SESSION_COOKIE_NAME), undefined);

      // --- 5. Wer arbeitet, wird nie abgemeldet: 30 Stunden nach der Anmeldung, aber gerade eben benutzt
      //        (Inaktivitaets-Fenster laeuft noch) - weder mit noch ohne Haken ein Rauswurf.
      await aendere(cMit.value, { erstelltAm: vor(30) });
      await aendere(ohneToken, { erstelltAm: vor(30) });
      assert.equal((await ich(cMit.value)).statusCode, 200, "30 Stunden alt, aber aktiv: angemeldet");
      assert.equal((await ich(ohneToken)).statusCode, 200, "dasselbe ohne Haken");

      // --- 6. Erst bei der naechsten Benutzung NACH 12 Stunden Pause greift die Grenze
      sessionIds.push(await aendere(cMit.value, { laeuftAbAm: vor(0.01), letzteAktivitaetAm: vor(12) }));
      assert.equal((await ich(cMit.value)).statusCode, 401, "12 Stunden ohne Aktivitaet: abgelaufen");
      assert.equal(await findById<Session>(sidMit, "session"), null, "abgelaufene Session geloescht");
      await aendere(ohneToken, { laeuftAbAm: in_(-1) });
      assert.equal((await ich(ohneToken)).statusCode, 401, "auch ohne Haken");

      // --- 7. Eine Session ohne lesbares Ablaufdatum wird nicht akzeptiert (fail closed)
      const { token } = await erstelleSession(id);
      await aendere(token, { laeuftAbAm: "kein-datum" });
      assert.equal((await ich(token)).statusCode, 401);

      // --- 8. Login und Logout: Ein auf dieser Anfrage mitgeschicktes altes Cookie darf nicht dazwischenfunken
      const zweit = await anmelden({ angemeldetBleiben: true });
      const cZweit = sessionCookie(zweit)!;
      sessionIds.push(await sidVon(cZweit.value));
      const neuerLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cZweit.value}` },
        payload: { email: `${id}@example.invalid`, passwort: PASSWORT, angemeldetBleiben: true },
      });
      const sessionCookies = neuerLogin.cookies.filter((c) => c.name === SESSION_COOKIE_NAME);
      assert.equal(sessionCookies.length, 1, "genau ein Session-Cookie in der Login-Antwort");
      assert.notEqual(sessionCookies[0]!.value, cZweit.value, "das neue, nicht das alte");
      sessionIds.push(await sidVon(sessionCookies[0]!.value));

      const abmeldung = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cZweit.value}` },
      });
      assert.equal(abmeldung.statusCode, 204);
      const geleert = abmeldung.cookies.filter((c) => c.name === SESSION_COOKIE_NAME);
      assert.equal(geleert.length, 1, "genau ein Session-Cookie in der Logout-Antwort");
      assert.equal(geleert[0]!.value, "", "Logout leert das Cookie");
      assert.equal((await ich(cZweit.value)).statusCode, 401, "nach dem Logout nicht mehr angemeldet");
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

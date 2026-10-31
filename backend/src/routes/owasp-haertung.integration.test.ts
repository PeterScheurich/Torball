import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Turnier, TurnierCodeSession } from "@torball/shared";

/**
 * Kleine Haertungen aus dem OWASP-Durchgang vom 2026-10-31, je mit einem Beleg:
 *  - Turnier-Codes brauchen eine Mindestlaenge (neu gesetzte Codes);
 *  - ein geaenderter/geloeschter Code beendet die damit angemeldeten Sitzungen;
 *  - der Status laesst sich per PUT nur zwischen entwurf und aktiv wechseln (nicht nach abgeschlossen);
 *  - zwei Routen pruefen jetzt auch ein ABGESCHLOSSENES Turnier (Mannschafts-Reihenfolge, Schiedsrichter-Zuordnung).
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuerAdmin(): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    passwortHash: await hashePasswort("Halle-Dienstag-Test-77"),
    name: "Admin",
    globaleRolle: "admin",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

async function neuesTurnier(erstelltVon: string, status: string): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const id = newId("turnier");
  await insertDoc({
    _id: id,
    docType: "turnier",
    turnierId: id,
    name: "Haertungs-Test",
    datum: "2026-10-31",
    startzeit: "09:00",
    status,
    felder: [],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    erstelltVon,
    erstelltVonName: "Admin",
    erstelltAm: new Date().toISOString(),
  } as unknown as Turnier);
  return id;
}

async function aufraeumen(ids: string[]) {
  const { findByIdUngeprueft, deleteDoc, findAllBySelector } = await import("../repository");
  for (const id of ids) {
    const d = await findByIdUngeprueft(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
    // evtl. angelegte Code-Sitzungen dieses Turniers
    for (const s of await findAllBySelector<TurnierCodeSession>({
      docType: "session",
      sessionArt: "code",
      turnierId: id,
    })) {
      await deleteDoc(s._id, s._rev!);
    }
  }
}

test(
  "Turnier-Codes: Mindestlaenge, und ein neuer Code beendet die Sitzungen mit dem alten",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierCodeRoutes } = await import("./turnierCode");
    const { erstelleSession } = await import("../auth/session");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierCodeRoutes);

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId, "aktiv");
    const adminCookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const codesUrl = `/turniere/${turnierId}/codes`;

    try {
      // zu kurz -> 400, nichts gesetzt
      const kurz = await app.inject({ method: "PUT", url: codesUrl, headers: { cookie: adminCookie }, payload: { spielleitungCode: "1234" } });
      assert.equal(kurz.statusCode, 400, "ein 4-stelliger Code muss abgelehnt werden");

      // ausreichend lang -> ok; null (loeschen) bleibt erlaubt
      const ok = await app.inject({ method: "PUT", url: codesUrl, headers: { cookie: adminCookie }, payload: { spielleitungCode: "halle-sued-2026" } });
      assert.equal(ok.statusCode, 200);

      // Anmeldung per Code -> Sitzung funktioniert
      const anmeldung = await app.inject({ method: "POST", url: `/turniere/${turnierId}/code-anmeldung`, payload: { code: "halle-sued-2026" } });
      assert.equal(anmeldung.statusCode, 200);
      const setCookie = String(anmeldung.headers["set-cookie"]);
      const codeCookie = setCookie.split(";")[0];
      const davor = await app.inject({ method: "GET", url: "/turnier-code/me", headers: { cookie: codeCookie } });
      assert.equal(davor.statusCode, 200, "die Code-Sitzung muss vor dem Wechsel gueltig sein");

      // Code wechseln -> die alte Sitzung ist beendet
      const wechsel = await app.inject({ method: "PUT", url: codesUrl, headers: { cookie: adminCookie }, payload: { spielleitungCode: "neuer-code-2026" } });
      assert.equal(wechsel.statusCode, 200);
      const danach = await app.inject({ method: "GET", url: "/turnier-code/me", headers: { cookie: codeCookie } });
      assert.equal(danach.statusCode, 401, "die Sitzung mit dem alten Code muss beendet sein");

      // Der NEUE Code funktioniert, der alte nicht mehr
      const neu = await app.inject({ method: "POST", url: `/turniere/${turnierId}/code-anmeldung`, payload: { code: "neuer-code-2026" } });
      assert.equal(neu.statusCode, 200);
      const alt = await app.inject({ method: "POST", url: `/turniere/${turnierId}/code-anmeldung`, payload: { code: "halle-sued-2026" } });
      assert.equal(alt.statusCode, 401);

      // Eine Sitzung einer ANDEREN Rolle bleibt von einem Wechsel unberuehrt.
      await app.inject({ method: "PUT", url: codesUrl, headers: { cookie: adminCookie }, payload: { protokollantCode: "protokoll-2026" } });
      const protokollant = await app.inject({ method: "POST", url: `/turniere/${turnierId}/code-anmeldung`, payload: { code: "protokoll-2026" } });
      const protokollantCookie = String(protokollant.headers["set-cookie"]).split(";")[0];
      await app.inject({ method: "PUT", url: codesUrl, headers: { cookie: adminCookie }, payload: { spielleitungCode: "wieder-neu-2026" } });
      const unberuehrt = await app.inject({ method: "GET", url: "/turnier-code/me", headers: { cookie: protokollantCookie } });
      assert.equal(unberuehrt.statusCode, 200, "die Protokollant-Sitzung darf vom Spielleitung-Wechsel nicht betroffen sein");
    } finally {
      await aufraeumen([turnierId, adminId]);
      await app.close();
    }
  },
);

test(
  "PUT /turniere/:id: Status nur entwurf<->aktiv; abgeschlossen/archiviert nur ueber die eigenen Endpunkte",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { erstelleSession } = await import("../auth/session");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierRoutes);

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId, "entwurf");
    const cookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const put = (payload: object) =>
      app.inject({ method: "PUT", url: `/turniere/${turnierId}`, headers: { cookie }, payload });

    try {
      assert.equal((await put({ status: "abgeschlossen" })).statusCode, 400);
      assert.equal((await put({ status: "archiviert" })).statusCode, 400);
      assert.equal((await put({ status: "irgendwas" })).statusCode, 400);
      assert.equal((await put({ status: "aktiv" })).statusCode, 200, "entwurf -> aktiv bleibt erlaubt");
      assert.equal((await put({ status: "entwurf" })).statusCode, 200, "aktiv -> entwurf bleibt erlaubt");
      assert.equal((await put({ name: "Umbenannt", status: "entwurf" })).statusCode, 200, "gleicher Status im Body ist kein Wechsel");
    } finally {
      await aufraeumen([turnierId, adminId]);
      await app.close();
    }
  },
);

test(
  "Abgeschlossenes Turnier: Mannschafts-Reihenfolge und Schiedsrichter-Zuordnung liefern 409",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { mannschaftRoutes } = await import("./mannschaft");
    const { spielRoutes } = await import("./spiel");
    const { erstelleSession } = await import("../auth/session");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(mannschaftRoutes);
    await app.register(spielRoutes);

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId, "abgeschlossen");
    const cookie = `torball_session=${(await erstelleSession(adminId)).token}`;

    try {
      const reihenfolge = await app.inject({
        method: "PUT",
        url: `/turniere/${turnierId}/mannschaften/reihenfolge`,
        headers: { cookie },
        payload: { mannschaftIds: ["mannschaftImTurnier:egal"] },
      });
      assert.equal(reihenfolge.statusCode, 409);

      const zuordnung = await app.inject({
        method: "POST",
        url: `/turniere/${turnierId}/schiedsrichter-zuordnung`,
        headers: { cookie },
      });
      assert.equal(zuordnung.statusCode, 409);
    } finally {
      await aufraeumen([turnierId, adminId]);
      await app.close();
    }
  },
);

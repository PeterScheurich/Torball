import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, GlobaleRolle, Systemeinstellungen } from "@torball/shared";

/**
 * Laenderliste (Admin -> Laender): lesen darf jede Anmeldung, pflegen nur ein Admin; gespeichert wird
 * bereinigt (ohne Leerzeilen/Doppelte) und sortiert. Laeuft gegen die echte CouchDB, Skip-Guard wie
 * die anderen Integrationstests. Die Systemeinstellungen sind ein Singleton - der Test stellt den
 * Zustand davor wieder her.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuesKonto(rolle: GlobaleRolle): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    name: `Konto ${rolle}`,
    globaleRolle: rolle,
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

test(
  "Laender: Standardliste, nur Admin pflegt, Eingabe wird bereinigt und sortiert",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { systemeinstellungenRoutes } = await import("./systemeinstellungen");
    const { erstelleSession } = await import("../auth/session");
    const { findByIdUngeprueft, deleteDoc, insertDoc } = await import("../repository");
    const { SYSTEMEINSTELLUNGEN_ID, STANDARD_LAENDER } = await import("../systemeinstellungen");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(systemeinstellungenRoutes);

    const vorher = (await findByIdUngeprueft(SYSTEMEINSTELLUNGEN_ID)) as (Systemeinstellungen & { _rev: string }) | null;
    const adminId = await neuesKonto("admin");
    const benutzerId = await neuesKonto("benutzer");
    const admin = `torball_session=${(await erstelleSession(adminId)).token}`;
    const benutzer = `torball_session=${(await erstelleSession(benutzerId)).token}`;

    try {
      // Ohne Anmeldung gibt es nichts.
      assert.equal((await app.inject({ method: "GET", url: "/laender" })).statusCode, 401);

      // Ohne gepflegte Liste gilt die Standardliste - fuer jede Anmeldung lesbar.
      if (!vorher?.laender) {
        const lesen = await app.inject({ method: "GET", url: "/laender", headers: { cookie: benutzer } });
        assert.equal(lesen.statusCode, 200);
        assert.deepEqual(lesen.json(), STANDARD_LAENDER);
      }

      // Pflegen: nicht fuer eine normale Rolle.
      const verboten = await app.inject({
        method: "PUT",
        url: "/laender",
        headers: { cookie: benutzer },
        payload: { laender: ["Spanien"] },
      });
      assert.equal(verboten.statusCode, 403);

      // Admin: Leerzeilen, Leerzeichen und Doppelte (auch anders geschrieben) fallen weg, Rest ist sortiert.
      const gesetzt = await app.inject({
        method: "PUT",
        url: "/laender",
        headers: { cookie: admin },
        payload: { laender: ["  Österreich ", "", "Belgien", "belgien", "Deutschland", "   "] },
      });
      assert.equal(gesetzt.statusCode, 200);
      assert.deepEqual(gesetzt.json(), ["Belgien", "Deutschland", "Österreich"]);

      const gelesen = await app.inject({ method: "GET", url: "/laender", headers: { cookie: benutzer } });
      assert.deepEqual(gelesen.json(), ["Belgien", "Deutschland", "Österreich"]);

      // Eine bewusst leere Liste bleibt leer (kein Rueckfall auf die Standardliste).
      const leer = await app.inject({ method: "PUT", url: "/laender", headers: { cookie: admin }, payload: { laender: [] } });
      assert.deepEqual(leer.json(), []);
      const leerGelesen = await app.inject({ method: "GET", url: "/laender", headers: { cookie: admin } });
      assert.deepEqual(leerGelesen.json(), []);
    } finally {
      // Singleton wiederherstellen bzw. entfernen, falls der Test es angelegt hat.
      const jetzt = (await findByIdUngeprueft(SYSTEMEINSTELLUNGEN_ID)) as (Systemeinstellungen & { _rev: string }) | null;
      if (jetzt) {
        if (vorher) await insertDoc<Systemeinstellungen>({ ...jetzt, laender: vorher.laender });
        else await deleteDoc(jetzt._id, jetzt._rev);
      }
      for (const id of [adminId, benutzerId]) {
        const doc = (await findByIdUngeprueft(id)) as { _rev: string } | null;
        if (doc) await deleteDoc(id, doc._rev);
      }
      await app.close();
    }
  },
);

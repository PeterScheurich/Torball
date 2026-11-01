import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, MannschaftImTurnier, SchiedsrichterImTurnier, Spiel, Turnier } from "@torball/shared";

/**
 * Eingabepruefungen, die ein Simulationslauf (2026-11-01) vermisst hat: ganze Tore, bekannte Hallen,
 * keine Mannschaft entfernen, die schon gespielt hat, und plausible Regelwerte. Laeuft gegen die echte
 * CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL && !!process.env.COUCHDB_DB && !!process.env.COUCHDB_USER && !!process.env.COUCHDB_PASSWORD;

test(
  "Eingabepruefung: Tore, Hallen, Mannschaft entfernen, Regelwerte",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { mannschaftRoutes } = await import("./mannschaft");
    const { spielplanRoutes } = await import("./spielplan");
    const { spielRoutes } = await import("./spiel");
    const { ergebnisRoutes } = await import("./ergebnis");
    const { erstelleSession } = await import("../auth/session");
    const { insertDoc, newId, deleteDoc, findAllBySelector, findByIdUngeprueft } = await import("../repository");
    const { hashePasswort } = await import("../auth/passwort");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    for (const r of [turnierRoutes, mannschaftRoutes, spielplanRoutes, spielRoutes, ergebnisRoutes]) await app.register(r);

    const adminId = newId("benutzer");
    await insertDoc<Benutzer>({
      _id: adminId, docType: "benutzer", benutzerId: adminId, email: `${adminId}@example.invalid`,
      passwortHash: await hashePasswort("Halle-Dienstag-Test-77"), name: "Eingabe-Admin", globaleRolle: "admin",
      sprache: "de", zweiFaAktiv: false, gesperrt: false, erstelltAm: new Date().toISOString(),
    });
    const cookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const anfrage = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    let turnierId: string | undefined;

    try {
      // Unsinnige Regelwerte schon beim Anlegen und beim Aendern
      assert.equal((await anfrage("POST", "/turniere", { name: "x", datum: "2026-11-01", startzeit: "09:00", anzahlHalbzeiten: 0 })).statusCode, 400);
      const angelegt = await anfrage("POST", "/turniere", { name: "Eingabe-Test", datum: "2026-11-01", startzeit: "09:00" });
      assert.equal(angelegt.statusCode, 201);
      turnierId = (angelegt.json() as Turnier)._id;
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}`, { spielzeitMinuten: -5 })).statusCode, 400);
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}`, { punkteSieg: "viele" })).statusCode, 400);
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}`, { spielzeitMinuten: 6 })).statusCode, 200, "gueltige Werte gehen weiter durch");
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}`, { felder: [{ feldId: "feld:1", name: "Halle A" }, { feldId: "feld:2", name: "Halle B" }] })).statusCode, 200);

      const ids: string[] = [];
      for (const name of ["M1", "M2", "M3"]) ids.push(((await anfrage("POST", "/mannschaften", { turnierId, name })).json() as MannschaftImTurnier)._id);
      assert.equal((await anfrage("POST", "/mannschaften", { turnierId, name: "X".repeat(201) })).statusCode, 400, "uebermaessig langer Name");
      assert.ok([200, 201].includes((await anfrage("POST", `/turniere/${turnierId}/spielplan`)).statusCode));
      const spiele = (await findAllBySelector<Spiel>({ docType: "spiel", turnierId })).sort((a, b) => Number(a.runde) - Number(b.runde));

      // Nur ganze Tore in einem sinnvollen Bereich
      assert.equal((await anfrage("PUT", `/spiele/${spiele[0]._id}/ergebnis`, { ergebnisA: 1.5, ergebnisB: 0 })).statusCode, 400);
      assert.equal((await anfrage("PUT", `/spiele/${spiele[0]._id}/ergebnis`, { ergebnisA: 99999, ergebnisB: 0 })).statusCode, 400);

      // Halle: nur eine, die das Turnier kennt
      assert.equal((await anfrage("PUT", `/spiele/${spiele[1]._id}`, { feldId: "feld:99" })).statusCode, 400);
      assert.equal((await anfrage("PUT", `/spiele/${spiele[1]._id}`, { feldId: "feld:2" })).statusCode, 200);

      // Mannschaft entfernen: erst nach dem ersten Ergebnis nicht mehr
      assert.equal((await anfrage("PUT", `/spiele/${spiele[0]._id}/ergebnis`, { ergebnisA: 2, ergebnisB: 1 })).statusCode, 200);
      const gespielt = new Set([spiele[0].mannschaftAId, spiele[0].mannschaftBId]);
      const ungespielt = ids.find((id) => !gespielt.has(id))!;
      const abgewiesen = await anfrage("DELETE", `/mannschaften/${spiele[0].mannschaftAId}`);
      assert.equal(abgewiesen.statusCode, 409);
      assert.match((abgewiesen.json() as { error: string }).error, /bereits gespielt/);
      assert.equal((await anfrage("DELETE", `/mannschaften/${ungespielt}`)).statusCode, 204, "ohne Ergebnis darf sie weg");
    } finally {
      if (turnierId) {
        for (const d of [
          ...(await findAllBySelector<Spiel>({ docType: "spiel", turnierId })),
          ...(await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId })),
          ...(await findAllBySelector<SchiedsrichterImTurnier>({ docType: "schiedsrichterImTurnier", turnierId })),
        ]) await deleteDoc(d._id, d._rev!);
        const t = await findByIdUngeprueft(turnierId);
        if (t) await deleteDoc(turnierId, (t as { _rev: string })._rev);
      }
      const a = await findByIdUngeprueft(adminId);
      if (a) await deleteDoc(adminId, (a as { _rev: string })._rev);
      await app.close();
    }
  },
);

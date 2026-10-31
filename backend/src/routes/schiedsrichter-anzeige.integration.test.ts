import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, SchiedsrichterImTurnier, Turnier } from "@torball/shared";

/**
 * Einstellung der Schiedsrichter-Anzeige am Turnier (Auftraggeber 2026-10-31: "konfigurierbar, wo
 * moeglich und sinnvoll"). Das Feld hat kein Fastify-Schema - die Pruefung ist von Hand, deshalb
 * wird hier belegt, dass sie greift: bekannte Elemente mit Wahrheitswerten werden gespeichert,
 * alles andere mit 400 abgelehnt und nichts davon landet im Dokument. Laeuft gegen die echte
 * CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
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

async function aufraeumen(ids: string[]) {
  const { findByIdUngeprueft, deleteDoc, findAllBySelector } = await import("../repository");
  for (const id of ids) {
    for (const sr of await findAllBySelector<SchiedsrichterImTurnier>({
      docType: "schiedsrichterImTurnier",
      turnierId: id,
    })) {
      await deleteDoc(sr._id, sr._rev!);
    }
    const d = await findByIdUngeprueft(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
  }
}

test(
  "Schiedsrichter-Anzeige: bekannte Elemente werden gespeichert, alles andere abgelehnt",
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
    const cookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const angelegt: string[] = [];
    const anlegen = async (extra: object = {}) =>
      app.inject({
        method: "POST",
        url: "/turniere",
        headers: { cookie },
        payload: { name: "Anzeige-Test", datum: "2026-10-31", startzeit: "09:00", ...extra },
      });
    const aendern = (id: string, payload: object) =>
      app.inject({ method: "PUT", url: `/turniere/${id}`, headers: { cookie }, payload });

    try {
      const neu = await anlegen();
      assert.equal(neu.statusCode, 201);
      const turnier = neu.json() as Turnier;
      angelegt.push(turnier._id);
      assert.equal(turnier.schiedsrichterAnzeige, undefined, "ohne Angabe fehlt das Feld (= alles sichtbar)");

      const gut = await aendern(turnier._id, { schiedsrichterAnzeige: { restzeit: false, achtSekunden: true } });
      assert.equal(gut.statusCode, 200);
      assert.deepEqual((gut.json() as Turnier).schiedsrichterAnzeige, { restzeit: false, achtSekunden: true });

      // Abgelehnt: unbekanntes Element, kein Wahrheitswert, falsche Form - und der Bestand bleibt.
      for (const schlecht of [
        { schiedsrichterAnzeige: { werbung: true } },
        { schiedsrichterAnzeige: { restzeit: "nein" } },
        { schiedsrichterAnzeige: "alles" },
        { schiedsrichterAnzeige: null },
        { schiedsrichterAnzeige: [true] },
      ]) {
        const r = await aendern(turnier._id, schlecht);
        assert.equal(r.statusCode, 400, JSON.stringify(schlecht));
      }
      const { findById } = await import("../repository");
      const danach = (await findById<Turnier>(turnier._id, "turnier"))!;
      assert.deepEqual(danach.schiedsrichterAnzeige, { restzeit: false, achtSekunden: true });

      // Auch beim Anlegen wird geprueft.
      assert.equal((await anlegen({ schiedsrichterAnzeige: { werbung: true } })).statusCode, 400);
      const mitWert = await anlegen({ schiedsrichterAnzeige: { auszeiten: false } });
      assert.equal(mitWert.statusCode, 201);
      angelegt.push((mitWert.json() as Turnier)._id);
    } finally {
      await aufraeumen([...angelegt, adminId]);
      await app.close();
    }
  },
);

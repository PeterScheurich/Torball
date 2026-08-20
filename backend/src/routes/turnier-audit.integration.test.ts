import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, SchiedsrichterImTurnier, Turnier } from "@torball/shared";

/**
 * Audit-Feld-Haertung: der Client darf server-kontrollierte Felder (erstelltVon/zuletztBearbeitetVon
 * usw.) beim Turnier-POST/PUT nicht ueberschreiben. Laeuft gegen die echte CouchDB-Dev-Instanz,
 * Skip-Guard wie die anderen Integrationstests.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuerAdmin() {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    passwortHash: await hashePasswort("TestPasswort!42"),
    name: "Echter Admin",
    globaleRolle: "admin",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

async function aufraeumenTurnier(turnierId: string) {
  const { findAllBySelector, findById, deleteDoc } = await import("../repository");
  const schiris = await findAllBySelector<SchiedsrichterImTurnier>({ docType: "schiedsrichterImTurnier", turnierId });
  for (const s of schiris) await deleteDoc(s._id, s._rev!);
  const t = await findById<Turnier>(turnierId);
  if (t) await deleteDoc(t._id, t._rev!);
}

async function aufraeumen(ids: string[]) {
  const { findById, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const doc = await findById(id);
    if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
  }
}

test(
  "POST/PUT /turniere: server-kontrollierte Felder aus dem Body werden ignoriert",
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
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;
    let turnierId: string | undefined;

    try {
      // POST mit gefaelschtem erstelltVon/erstelltVonName + direktem status "abgeschlossen".
      const angelegt = await app.inject({
        method: "POST",
        url: "/turniere",
        headers: { cookie },
        payload: {
          name: "Audit-Test",
          datum: "2026-08-20",
          startzeit: "10:00",
          erstelltVon: "benutzer:GEFAELSCHT",
          erstelltVonName: "Angreifer",
        },
      });
      assert.equal(angelegt.statusCode, 201);
      const turnier = angelegt.json() as Turnier;
      turnierId = turnier._id;
      assert.equal(turnier.erstelltVon, adminId, "erstelltVon muss der echte Ersteller sein");
      assert.equal(turnier.erstelltVonName, "Echter Admin", "erstelltVonName darf nicht gefaelscht sein");

      // PUT mit gefaelschtem zuletztBearbeitetVon + abgeschlossenVon.
      const geaendert = await app.inject({
        method: "PUT",
        url: `/turniere/${turnierId}`,
        headers: { cookie },
        payload: {
          name: "Audit-Test geaendert",
          zuletztBearbeitetVon: "benutzer:GEFAELSCHT",
          zuletztBearbeitetVonName: "Angreifer",
          abgeschlossenVon: "benutzer:GEFAELSCHT",
        },
      });
      assert.equal(geaendert.statusCode, 200);
      const nachher = geaendert.json() as Turnier;
      assert.equal(nachher.name, "Audit-Test geaendert", "erlaubtes Feld wird uebernommen");
      assert.equal(nachher.zuletztBearbeitetVon, adminId, "zuletztBearbeitetVon muss der echte Bearbeiter sein");
      assert.equal(nachher.zuletztBearbeitetVonName, "Echter Admin");
      assert.equal(nachher.abgeschlossenVon, undefined, "abgeschlossenVon darf nicht aus dem Body kommen");
    } finally {
      if (turnierId) await aufraeumenTurnier(turnierId);
      await aufraeumen([adminId]);
      await app.close();
    }
  },
);

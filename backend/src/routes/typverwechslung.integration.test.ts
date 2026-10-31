import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Verein } from "@torball/shared";

/**
 * Pfad-IDs eines fremden Dokumenttyps (OWASP-Durchgang A01, 2026-10-31): Routen, die eine ID aus der
 * URL laden, muessen ein Dokument eines anderen Typs wie "nicht gefunden" behandeln - beim Lesen,
 * Aendern und Loeschen. Laeuft gegen die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen
 * Integrationstests.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuerBenutzer(name: string, rolle: "admin" | "manager" | "benutzer"): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    passwortHash: await hashePasswort("Halle-Dienstag-Test-77"),
    name,
    globaleRolle: rolle,
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

async function aufraeumen(ids: string[]) {
  const { findByIdUngeprueft, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const doc = await findByIdUngeprueft(id);
    if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
  }
}

test(
  "Pfad-ID eines FREMDEN Dokumenttyps wird wie 'nicht gefunden' behandelt (Verein/Team/Schiedsrichter-Stammdaten)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { vereinRoutes } = await import("./verein");
    const { teamRoutes } = await import("./team");
    const { schiedsrichterStammdatenRoutes } = await import("./schiedsrichterStammdaten");
    const { erstelleSession } = await import("../auth/session");
    const { findByIdUngeprueft } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(vereinRoutes);
    await app.register(teamRoutes);
    await app.register(schiedsrichterStammdatenRoutes);

    const managerId = await neuerBenutzer("Manager", "manager");
    const adminId = await neuerBenutzer("Admin", "admin");
    const benutzerId = await neuerBenutzer("Normaler Benutzer", "benutzer");
    const managerCookie = `torball_session=${(await erstelleSession(managerId)).token}`;
    const benutzerCookie = `torball_session=${(await erstelleSession(benutzerId)).token}`;
    const vereinId = "verein:typtest-echter-verein";
    const { insertDoc } = await import("../repository");
    await insertDoc<Verein>({ _id: vereinId, docType: "verein", vereinId, name: "Echter Verein" } as Verein);

    try {
      // --- Rechteausweitung: Manager setzt ueber /vereine/:id die Rolle des eigenen Kontos auf admin.
      for (const pfad of ["vereine", "teams", "schiedsrichter-stammdaten"]) {
        const put = await app.inject({
          method: "PUT",
          url: `/${pfad}/${managerId}`,
          headers: { cookie: managerCookie },
          payload: { name: "x", vorname: "x", vereinId, globaleRolle: "admin" },
        });
        assert.equal(put.statusCode, 404, `PUT /${pfad}/<benutzer-id> muss 404 liefern, war ${put.statusCode}`);
      }
      const manager = (await findByIdUngeprueft(managerId)) as Benutzer;
      assert.equal(manager.globaleRolle, "manager", "die Rolle des Managers darf sich nicht geaendert haben");

      // --- Passwort-Hash eines Admins austauschen.
      const hashVorher = ((await findByIdUngeprueft(adminId)) as Benutzer).passwortHash;
      const hashAngriff = await app.inject({
        method: "PUT",
        url: `/vereine/${adminId}`,
        headers: { cookie: managerCookie },
        payload: { name: "x", passwortHash: "$2b$12$abcdefghijklmnopqrstuv", zweiFaAktiv: false },
      });
      assert.equal(hashAngriff.statusCode, 404);
      assert.equal(((await findByIdUngeprueft(adminId)) as Benutzer).passwortHash, hashVorher);

      // --- Lesen: ein normaler Benutzer darf ueber die Vereins-/Team-Routen keine fremden Dokumente sehen.
      for (const pfad of ["vereine", "teams", "schiedsrichter-stammdaten"]) {
        for (const fremdeId of [adminId, "systemeinstellungen:global"]) {
          const get = await app.inject({
            method: "GET",
            url: `/${pfad}/${fremdeId}`,
            headers: { cookie: benutzerCookie },
          });
          assert.equal(get.statusCode, 404, `GET /${pfad}/${fremdeId} muss 404 liefern, war ${get.statusCode}`);
          assert.ok(!get.body.includes("passwortHash"), "kein Passwort-Hash in der Antwort");
        }
      }

      // --- Loeschen: DELETE auf die ID eines Benutzers darf nichts loeschen.
      for (const pfad of ["vereine", "teams", "schiedsrichter-stammdaten"]) {
        const del = await app.inject({
          method: "DELETE",
          url: `/${pfad}/${adminId}`,
          headers: { cookie: managerCookie },
        });
        assert.equal(del.statusCode, 404, `DELETE /${pfad}/<benutzer-id> muss 404 liefern, war ${del.statusCode}`);
        assert.ok(await findByIdUngeprueft(adminId), "das Admin-Konto muss noch existieren");
      }

      // --- Regression: ein ECHTER Verein bleibt les- und aenderbar.
      const ok = await app.inject({ method: "GET", url: `/vereine/${vereinId}`, headers: { cookie: benutzerCookie } });
      assert.equal(ok.statusCode, 200);
      const aendern = await app.inject({
        method: "PUT",
        url: `/vereine/${vereinId}`,
        headers: { cookie: managerCookie },
        payload: { name: "Umbenannter Verein" },
      });
      assert.equal(aendern.statusCode, 200);
    } finally {
      await aufraeumen([managerId, adminId, benutzerId, vereinId]);
      await app.close();
    }
  },
);

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Turnier } from "@torball/shared";

/**
 * Turnier-Codes setzen ist bei einem ausgecheckten Turnier gesperrt (409), wie alle anderen
 * turnierbezogenen Schreib-Routen (Backend-Review 2026-08-20, Nebenbefund). Läuft gegen die echte
 * CouchDB-Dev-Instanz, Skip-Guard wie die anderen Integrationstests.
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
    passwortHash: await hashePasswort("TestPasswort!42"),
    name: "Code-Admin",
    globaleRolle: "admin",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

async function neuesTurnier(erstelltVon: string): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const id = newId("turnier");
  await insertDoc({
    _id: id,
    docType: "turnier",
    turnierId: id,
    name: "Code-Sperre-Test",
    datum: "2026-08-20",
    startzeit: "10:00",
    status: "aktiv",
    felder: [],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    erstelltVon,
    erstelltVonName: "Code-Admin",
    erstelltAm: new Date().toISOString(),
  } as unknown as Turnier);
  return id;
}

async function aufraeumen(ids: string[]) {
  const { findById, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const d = await findById(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
  }
}

test(
  "PUT /turniere/:id/codes: gesperrt (409) bei ausgechecktem Turnier, sonst erlaubt",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierCodeRoutes } = await import("./turnierCode");
    const { erstelleSession } = await import("../auth/session");
    const { insertDoc, newId } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierCodeRoutes);

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId);
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;
    const url = `/turniere/${turnierId}/codes`;
    let checkoutId: string | undefined;

    try {
      // Ohne Checkout: Codes setzen ist erlaubt.
      const ohne = await app.inject({
        method: "PUT",
        url,
        headers: { cookie },
        payload: { turnierleitungCode: "geheim123" },
      });
      assert.equal(ohne.statusCode, 200, "ohne Checkout muss das Setzen erlaubt sein");
      assert.equal(ohne.json().turnierleitungCodeAktiv, true);

      // Aktives Checkout anlegen -> Turnier gilt als ausgecheckt.
      checkoutId = newId("turnierCheckout");
      await insertDoc({
        _id: checkoutId,
        docType: "turnierCheckout",
        checkoutId,
        turnierId,
        instanzId: "verbundeneInstanz:code-test",
        status: "aktiv",
        stammdatenMitnehmen: false,
        angefordertAm: new Date().toISOString(),
      } as unknown as Parameters<typeof insertDoc>[0]);

      const mitCheckout = await app.inject({
        method: "PUT",
        url,
        headers: { cookie },
        payload: { spielleitungCode: "neu456" },
      });
      assert.equal(mitCheckout.statusCode, 409, "bei ausgechecktem Turnier muss das Setzen abgelehnt werden");
    } finally {
      await aufraeumen([checkoutId, turnierId, adminId].filter(Boolean) as string[]);
      await app.close();
    }
  },
);

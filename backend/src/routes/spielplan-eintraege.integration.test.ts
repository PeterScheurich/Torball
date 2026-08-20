import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";

/**
 * Spielplan speichern: die vom Client mitgeschickte (ggf. manuell umsortierte) Eintragsliste muss
 * gegen die harten Regeln geprüft werden (Backend-Review 2026-08-20, Karte B). Läuft gegen die echte
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
    name: "Spielplan-Admin",
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
    name: "Spielplan-Eintragstest",
    datum: "2026-08-20",
    startzeit: "10:00",
    status: "entwurf",
    felder: [{ feldId: "feld:1", name: "Feld 1" }],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    spielplanVersion: 0,
    // Regelfelder, damit berechneStartzeit() beim Persistieren nicht auf NaN laeuft.
    spielzeitMinuten: 5,
    anzahlHalbzeiten: 2,
    pauseMinuten: 2,
    pauseZwischenSpielenMinuten: 10,
    erstelltVon,
    erstelltVonName: "Spielplan-Admin",
    erstelltAm: new Date().toISOString(),
  } as unknown as Turnier);
  return id;
}

async function neueMannschaft(turnierId: string, name: string): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const id = newId("mannschaftImTurnier");
  await insertDoc<MannschaftImTurnier>({
    _id: id,
    docType: "mannschaftImTurnier",
    mannschaftId: id,
    turnierId,
    name,
    reihenfolge: 0,
  });
  return id;
}

async function aufraeumen(turnierId: string, extra: string[]) {
  const { findAllBySelector, findById, deleteDoc } = await import("../repository");
  const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId });
  for (const s of spiele) await deleteDoc(s._id, s._rev!);
  for (const id of extra) {
    const d = await findById(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
  }
}

test(
  "POST /turniere/:id/spielplan: ungültige eintraege werden abgewiesen, gültige gespeichert",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { spielplanRoutes } = await import("./spielplan");
    const { erstelleSession } = await import("../auth/session");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(spielplanRoutes);

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId);
    const m1 = await neueMannschaft(turnierId, "Alpha");
    const m2 = await neueMannschaft(turnierId, "Beta");
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;
    const url = `/turniere/${turnierId}/spielplan`;

    try {
      // (1) Fremde Mannschaft -> 400
      const fremd = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: { eintraege: [{ mannschaftAId: m1, mannschaftBId: "mannschaftImTurnier:fremd", feldId: "feld:1", slot: 0 }] },
      });
      assert.equal(fremd.statusCode, 400, "fremde Mannschaft muss abgewiesen werden");

      // (2) Doppelbelegung im selben Slot -> 400
      const doppelt = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: {
          eintraege: [
            { mannschaftAId: m1, mannschaftBId: m2, feldId: "feld:1", slot: 0 },
            { mannschaftAId: m2, mannschaftBId: m1, feldId: "feld:1", slot: 0 },
          ],
        },
      });
      assert.equal(doppelt.statusCode, 400, "Doppelbelegung im selben Slot muss abgewiesen werden");

      // (3) Team gegen sich selbst -> 400
      const selbst = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: { eintraege: [{ mannschaftAId: m1, mannschaftBId: m1, feldId: "feld:1", slot: 0 }] },
      });
      assert.equal(selbst.statusCode, 400, "Team gegen sich selbst muss abgewiesen werden");

      // (4) Gültige Eintragsliste -> 201
      const gueltig = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: { eintraege: [{ mannschaftAId: m1, mannschaftBId: m2, feldId: "feld:1", slot: 0 }] },
      });
      assert.equal(gueltig.statusCode, 201, "gültige Eintragsliste muss gespeichert werden");
      assert.equal(gueltig.json().anzahlSpiele, 1);
    } finally {
      await aufraeumen(turnierId, [m1, m2, turnierId, adminId]);
      await app.close();
    }
  },
);

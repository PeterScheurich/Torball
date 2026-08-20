import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, MannschaftImTurnier, Turnier, Verein } from "@torball/shared";

/**
 * Feld-Injektion über den Request-Body (Backend-Review 2026-08-20, Karten A1-A3): unbekannte
 * Body-Felder dürfen nicht als _id/docType (Anlage eines Fremd-Dokuments) oder als sensible
 * Benutzerfelder (Konto-Übernahme) durchschlagen. Läuft gegen die echte CouchDB-Dev-Instanz,
 * Skip-Guard wie die anderen Integrationstests.
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
    name: "Echter Admin",
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
  await insertDoc<Turnier>({
    _id: id,
    docType: "turnier",
    turnierId: id,
    name: "Injektionstest",
    datum: "2026-08-20",
    startzeit: "10:00",
    status: "entwurf",
    felder: [],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    erstelltVon,
    erstelltVonName: "Echter Admin",
    erstelltAm: new Date().toISOString(),
    // Minimaldokument fuer den Test (die Mannschaft-Route braucht nur Existenz + Status/Flags);
    // die uebrigen Turnierregeln-Felder sind hier irrelevant, daher bewusster Cast ueber unknown.
  } as unknown as Turnier);
  return id;
}

async function aufraeumen(ids: string[]) {
  const { findById, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const doc = await findById(id);
    if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
  }
}

test(
  "POST /mannschaften: injiziertes _id/docType wird ignoriert (kein Fremd-Dokument)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { mannschaftRoutes } = await import("./mannschaft");
    const { erstelleSession } = await import("../auth/session");
    const { findById } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(mannschaftRoutes);

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId);
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;
    const fremdeId = "benutzer:injektion-opfer";
    let mannschaftId: string | undefined;

    try {
      const antwort = await app.inject({
        method: "POST",
        url: "/mannschaften",
        headers: { cookie },
        payload: {
          turnierId,
          name: "Reguläre Mannschaft",
          _id: fremdeId,
          docType: "benutzer",
          globaleRolle: "admin",
          passwortHash: "$2b$12$abcdefghijklmnopqrstuv",
        },
      });
      assert.equal(antwort.statusCode, 201);
      const m = antwort.json() as MannschaftImTurnier;
      mannschaftId = m._id;

      // Regression: die Mannschaft wurde normal angelegt.
      assert.equal(m.name, "Reguläre Mannschaft");
      assert.ok(m._id.startsWith("mannschaftImTurnier:"), "_id muss server-vergeben sein");
      assert.equal(m.docType, "mannschaftImTurnier", "docType darf nicht injiziert werden");
      assert.equal(typeof m.reihenfolge, "number");

      // Kern des Fixes: KEIN Fremd-Dokument unter der injizierten _id angelegt.
      const fremd = await findById(fremdeId);
      assert.equal(fremd, null, "unter der injizierten _id darf nichts existieren");
    } finally {
      await aufraeumen([mannschaftId, fremdeId, turnierId, adminId].filter(Boolean) as string[]);
      await app.close();
    }
  },
);

test(
  "POST /vereine: injiziertes _id/docType wird ignoriert",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { vereinRoutes } = await import("./verein");
    const { erstelleSession } = await import("../auth/session");
    const { findById } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(vereinRoutes);

    const adminId = await neuerAdmin();
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;
    const fremdeId = "benutzer:injektion-opfer-2";
    let vereinId: string | undefined;

    try {
      const antwort = await app.inject({
        method: "POST",
        url: "/vereine",
        headers: { cookie },
        payload: { name: "Regulärer Verein", _id: fremdeId, docType: "benutzer", globaleRolle: "admin" },
      });
      assert.equal(antwort.statusCode, 201);
      const v = antwort.json() as Verein;
      vereinId = v._id;
      assert.ok(v._id.startsWith("verein:"));
      assert.equal(v.docType, "verein");
      assert.equal(await findById(fremdeId), null);
    } finally {
      await aufraeumen([vereinId, fremdeId, adminId].filter(Boolean) as string[]);
      await app.close();
    }
  },
);

test(
  "PUT /benutzer/:id: injizierter passwortHash wird nicht übernommen",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { benutzerRoutes } = await import("./benutzer");
    const { erstelleSession } = await import("../auth/session");
    const { findById } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(benutzerRoutes);

    const adminId = await neuerAdmin();
    const zielId = await neuerAdmin(); // zweites Konto als Ziel
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;

    try {
      const vorher = await findById<Benutzer>(zielId);
      const hashVorher = vorher!.passwortHash;

      const antwort = await app.inject({
        method: "PUT",
        url: `/benutzer/${zielId}`,
        headers: { cookie },
        payload: {
          name: "Neuer Name",
          passwortHash: "$2b$12$INJIZIERT0000000000000000000000000000000000000000000",
          zweiFaSecret: "GEHEIM",
          email: "uebernahme@example.invalid",
        },
      });
      assert.equal(antwort.statusCode, 200);

      const nachher = await findById<Benutzer>(zielId);
      // Regression: erlaubtes Feld (name) wurde übernommen.
      assert.equal(nachher!.name, "Neuer Name");
      // Kern des Fixes: sensible Felder NICHT injiziert.
      assert.equal(nachher!.passwortHash, hashVorher, "passwortHash darf nicht injizierbar sein");
      assert.equal(nachher!.zweiFaSecret, undefined, "zweiFaSecret darf nicht injizierbar sein");
      assert.notEqual(nachher!.email, "uebernahme@example.invalid", "email nicht über diesen Weg änderbar");
    } finally {
      await aufraeumen([adminId, zielId]);
      await app.close();
    }
  },
);

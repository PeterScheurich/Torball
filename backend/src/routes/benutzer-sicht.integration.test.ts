import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Verein } from "@torball/shared";

/**
 * Eingeschraenkte Sicht fuer Manager (Datenschutz, Auftraggeber-Entscheidung 2026-10-31): Ein Manager
 * sieht und bearbeitet nur sich selbst, die von ihm eingeladenen Konten und die Konten seines Vereins
 * - und von anderen nur die zum Verwalten noetigen Felder. Der Verein am Konto wird ausschliesslich
 * von einem Admin vergeben. Laeuft gegen die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuesKonto(name: string, rolle: "admin" | "manager" | "benutzer", extra: Partial<Benutzer> = {}) {
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
    ...extra,
  });
  return id;
}

async function aufraeumen(ids: string[]) {
  const { findByIdUngeprueft, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const d = await findByIdUngeprueft(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
  }
}

test(
  "Manager sehen nur eigene, eingeladene und Vereins-Konten; nur Admins ordnen Konten Vereinen zu",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { benutzerRoutes } = await import("./benutzer");
    const { erstelleSession } = await import("../auth/session");
    const { insertDoc, newId } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(benutzerRoutes);

    const vereinA = newId("verein");
    const vereinB = newId("verein");
    await insertDoc<Verein>({ _id: vereinA, docType: "verein", vereinId: vereinA, name: "Verein A" } as Verein);
    await insertDoc<Verein>({ _id: vereinB, docType: "verein", vereinId: vereinB, name: "Verein B" } as Verein);

    const admin = await neuesKonto("Admin", "admin");
    const m1 = await neuesKonto("Manager Eins", "manager", { vereinId: vereinA });
    const m2 = await neuesKonto("Manager Zwei (ohne Verein)", "manager");
    const kollege = await neuesKonto("Kollege A", "benutzer", {
      vereinId: vereinA,
      telefon: "0123 4567",
      adresse: "Musterweg 1",
    });
    const fremd = await neuesKonto("Fremder B", "benutzer", { vereinId: vereinB });
    const ohne = await neuesKonto("Ohne Verein", "benutzer");
    const vonM2 = await neuesKonto("Von M2 eingeladen", "benutzer", { erstelltVon: m2 });

    const cookie = async (id: string) => `torball_session=${(await erstelleSession(id)).token}`;
    const [adminC, m1C, m2C] = [await cookie(admin), await cookie(m1), await cookie(m2)];
    const liste = async (c: string) =>
      ((await app.inject({ method: "GET", url: "/benutzer", headers: { cookie: c } })).json() as Array<
        Record<string, unknown>
      >).map((k) => k._id as string);
    const angelegt: string[] = [];

    try {
      // --- Liste
      const adminSieht = await liste(adminC);
      for (const id of [admin, m1, m2, kollege, fremd, ohne, vonM2]) {
        assert.ok(adminSieht.includes(id), "ein Admin sieht ALLE Konten");
      }
      const m1Sieht = await liste(m1C);
      assert.deepEqual(
        [m1, kollege].sort(),
        m1Sieht.filter((id) => [m1, m2, kollege, fremd, ohne, vonM2].includes(id)).sort(),
        "Manager Eins: sich selbst und das Konto seines Vereins - nichts sonst",
      );
      const m2Sieht = await liste(m2C);
      assert.deepEqual(
        [m2, vonM2].sort(),
        m2Sieht.filter((id) => [m1, m2, kollege, fremd, ohne, vonM2].includes(id)).sort(),
        "Manager Zwei ohne Verein: sich selbst und die selbst eingeladene Person",
      );

      // --- keine Kontaktdaten in der Manager-Sicht
      const m1Antwort = await app.inject({ method: "GET", url: "/benutzer", headers: { cookie: m1C } });
      assert.ok(!m1Antwort.body.includes("0123 4567") && !m1Antwort.body.includes("Musterweg"), "keine Kontaktdaten");
      assert.ok(!m1Antwort.body.includes("passwortHash"));
      const adminAntwort = await app.inject({ method: "GET", url: "/benutzer", headers: { cookie: adminC } });
      assert.ok(adminAntwort.body.includes("0123 4567"), "ein Admin sieht weiterhin das volle Profil");

      // --- Bearbeiten ueber die ID: fremde Konten sind "nicht gefunden"
      const put = (id: string, c: string, payload: object) =>
        app.inject({ method: "PUT", url: `/benutzer/${id}`, headers: { cookie: c }, payload });
      assert.equal((await put(fremd, m1C, { name: "Umbenannt" })).statusCode, 404);
      assert.equal((await put(ohne, m1C, { gesperrt: true })).statusCode, 404);
      assert.equal((await put(kollege, m1C, { name: "Kollege A (neu)" })).statusCode, 200, "eigener Verein: erlaubt");
      for (const pfad of ["passwort-reset-ausloesen", "einladung-erneut-senden"]) {
        const r = await app.inject({ method: "POST", url: `/benutzer/${fremd}/${pfad}`, headers: { cookie: m1C } });
        assert.equal(r.statusCode, 404, `${pfad} fuer ein fremdes Konto: nicht gefunden`);
      }

      // --- Vereinszuordnung nur durch Admins
      const m1setzt = await put(kollege, m1C, { vereinId: vereinB });
      assert.equal(m1setzt.statusCode, 403, "ein Manager darf keinen Verein vergeben");
      const unbekannt = await put(ohne, adminC, { vereinId: "verein:gibt-es-nicht" });
      assert.equal(unbekannt.statusCode, 400);
      const adminSetzt = await put(ohne, adminC, { vereinId: vereinA });
      assert.equal(adminSetzt.statusCode, 200);
      assert.ok((await liste(m1C)).includes(ohne), "nach der Zuordnung sieht Manager Eins das Konto");
      const loeschen = await put(ohne, adminC, { vereinId: null });
      assert.equal(loeschen.statusCode, 200);
      assert.ok(!(await liste(m1C)).includes(ohne), "nach dem Entfernen nicht mehr");

      // --- Einladung durch einen Manager erbt dessen Verein und erscheint in seiner Liste
      const einladung = await app.inject({
        method: "POST",
        url: "/benutzer",
        headers: { cookie: m1C },
        payload: { email: `neu-${Date.now()}@example.invalid`, name: "Neu Eingeladen", globaleRolle: "benutzer" },
      });
      assert.equal(einladung.statusCode, 201);
      const neuId = ((einladung.json() as { benutzer: { _id: string; vereinId?: string } }).benutzer);
      angelegt.push(neuId._id);
      assert.equal(neuId.vereinId, vereinA, "die Einladung erbt den Verein des Managers");
      assert.ok((await liste(m1C)).includes(neuId._id));
      // Ein Manager darf beim Einladen keinen anderen Verein vorgeben ...
      const fremdVorgabe = await app.inject({
        method: "POST",
        url: "/benutzer",
        headers: { cookie: m1C },
        payload: { email: `neu2-${Date.now()}@example.invalid`, name: "X", globaleRolle: "benutzer", vereinId: vereinB },
      });
      assert.equal(fremdVorgabe.statusCode, 403);
      // ... ein Admin schon.
      const adminLaedt = await app.inject({
        method: "POST",
        url: "/benutzer",
        headers: { cookie: adminC },
        payload: { email: `neu3-${Date.now()}@example.invalid`, name: "Y", globaleRolle: "benutzer", vereinId: vereinB },
      });
      assert.equal(adminLaedt.statusCode, 201);
      const adminNeu = (adminLaedt.json() as { benutzer: { _id: string; vereinId?: string } }).benutzer;
      angelegt.push(adminNeu._id);
      assert.equal(adminNeu.vereinId, vereinB);
    } finally {
      await aufraeumen([...angelegt, admin, m1, m2, kollege, fremd, ohne, vonM2, vereinA, vereinB]);
      await app.close();
    }
  },
);

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Auftraggeber-Entscheidung 02.11.2026: Zugangsdaten verteilen Admins. Ohne Mailversand bekommt NUR ein Admin den Klartext-
 * Einladungslink (beim Einladen und bei "Einladung erneut senden"); ein Manager bekommt `mailVersendet: false` ohne Link und muss
 * einen Admin bitten. Wer den Link haette, koennte das Konto selbst aktivieren und als die eingeladene Person auftreten.
 * Laeuft gegen die echte CouchDB-Testdatenbank, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuesKonto(name: string, rolle: "admin" | "manager") {
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
    const d = await findByIdUngeprueft(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
  }
}

test(
  "Ohne Mailversand: Einladungslink nur fuer Admins, ein Manager bekommt keinen",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async (t) => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { benutzerRoutes } = await import("./benutzer");
    const { erstelleSession } = await import("../auth/session");
    const { aktuelleSystemeinstellungen, smtpVerbindungAus } = await import("../systemeinstellungen");

    if (smtpVerbindungAus(await aktuelleSystemeinstellungen())) {
      t.skip("In dieser Datenbank ist ein Mailversand eingerichtet - der Test setzt keinen voraus und verschickt keine Mails.");
      return;
    }

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(benutzerRoutes);

    const admin = await neuesKonto("Admintest", "admin");
    const manager = await neuesKonto("Managertest", "manager");
    const cookie = async (id: string) => `torball_session=${(await erstelleSession(id)).token}`;
    const [adminC, managerC] = [await cookie(admin), await cookie(manager)];
    const angelegt: string[] = [];
    const einladen = async (c: string, mail: string) => {
      const antwort = await app.inject({
        method: "POST",
        url: "/benutzer",
        headers: { cookie: c },
        payload: { name: "Eingeladen", email: mail, globaleRolle: "benutzer" },
      });
      const json = antwort.json() as { benutzer?: { _id: string }; einladungsToken?: string; mailVersendet?: boolean };
      if (json.benutzer) angelegt.push(json.benutzer._id);
      return { status: antwort.statusCode, json };
    };

    try {
      const vomAdmin = await einladen(adminC, `von-admin-${Date.now()}@example.invalid`);
      assert.equal(vomAdmin.status, 201);
      assert.equal(vomAdmin.json.mailVersendet, false);
      assert.ok(vomAdmin.json.einladungsToken, "Admin bekommt den Link");

      const vomManager = await einladen(managerC, `von-manager-${Date.now()}@example.invalid`);
      assert.equal(vomManager.status, 201);
      assert.equal(vomManager.json.mailVersendet, false);
      assert.equal(vomManager.json.einladungsToken, undefined, "Manager bekommt KEINEN Link");

      const eingeladenerId = vomManager.json.benutzer!._id;
      const erneut = (c: string) =>
        app.inject({ method: "POST", url: `/benutzer/${eingeladenerId}/einladung-erneut-senden`, headers: { cookie: c } });

      const managerErneut = await erneut(managerC);
      assert.equal(managerErneut.statusCode, 200);
      assert.equal((managerErneut.json() as { einladungsToken?: string }).einladungsToken, undefined);
      assert.equal((managerErneut.json() as { mailVersendet: boolean }).mailVersendet, false);

      const adminErneut = await erneut(adminC);
      assert.equal(adminErneut.statusCode, 200);
      assert.ok((adminErneut.json() as { einladungsToken?: string }).einladungsToken, "Admin holt den Link ueber 'erneut senden'");
    } finally {
      await aufraeumen([...angelegt, admin, manager]);
      await app.close();
    }
  },
);

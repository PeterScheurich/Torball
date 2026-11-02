import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Einrichtungs-Code fuer die Ersteinrichtung im Browser (02.11.2026). Eine echte Ersteinrichtung braucht eine Datenbank
 * OHNE jedes Konto; die gemeinsame Testdatenbank hat welche. Deshalb prueft dieser Test, was sich auch so beobachten
 * laesst: Mit gesetztem Code wird ein falscher oder fehlender mit 403 abgewiesen (VOR der Frage, ob es schon Konten gibt),
 * ein richtiger kommt bis zur Konto-Pruefung (409 "es gibt schon einen Benutzer") durch, und der Code selbst wird nie
 * ausgeliefert. Ohne gesetzten Code gilt das alte Verhalten. Laeuft gegen die CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const CODE = "GAN4-6AKR-H5U9";

test(
  "Ersteinrichtung: ein gesetzter Einrichtungs-Code wird verlangt, geprueft und nie ausgeliefert",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authRoutes } = await import("./auth");
    const { insertDoc, findByIdUngeprueft, deleteDoc, newId } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    await app.register(authRoutes);

    // Mindestens ein Konto, damit die Ersteinrichtung in dieser Testdatenbank NIE wirklich anlegt.
    const id = newId("benutzer");
    await insertDoc<Benutzer>({
      _id: id,
      docType: "benutzer",
      benutzerId: id,
      email: `${id}@example.invalid`,
      name: "Code-Test",
      globaleRolle: "benutzer",
      sprache: "de",
      zweiFaAktiv: false,
      gesperrt: false,
      erstelltAm: new Date().toISOString(),
    } as Benutzer);

    const koerper = { email: "erster@example.invalid", passwort: "Halle-Dienstag-Test-77", name: "Erster" };
    const einrichten = (extra: object = {}) =>
      app.inject({ method: "POST", url: "/auth/bootstrap-admin", payload: { ...koerper, ...extra } });

    const vorher = process.env.ERSTEINRICHTUNGS_CODE;
    try {
      // --- Mit gesetztem Code
      process.env.ERSTEINRICHTUNGS_CODE = CODE;
      assert.equal((await einrichten()).statusCode, 403, "ohne Code");
      assert.equal((await einrichten({ einrichtungsCode: "" })).statusCode, 403, "leerer Code");
      assert.equal((await einrichten({ einrichtungsCode: "GAN4-6AKR-H5U8" })).statusCode, 403, "falscher Code");
      assert.equal((await einrichten({ einrichtungsCode: 123456 as unknown as string })).statusCode, 403, "Zahl statt Text");
      const falsch = await einrichten({ einrichtungsCode: "falsch" });
      assert.ok(!falsch.body.includes(CODE), "die Fehlermeldung verraet den Code nicht");

      for (const richtig of [CODE, CODE.toLowerCase(), CODE.replace(/-/g, ""), ` ${CODE} `]) {
        const r = await einrichten({ einrichtungsCode: richtig });
        assert.equal(r.statusCode, 409, `richtiger Code (${JSON.stringify(richtig)}) kommt bis zur Konto-Pruefung`);
      }

      // Die Verfuegbarkeits-Abfrage verraet nie den Code. Es gibt in dieser Datenbank schon Konten: dann ist nichts mehr
      // zu verlangen.
      const verfuegbar = await app.inject({ method: "GET", url: "/auth/bootstrap-verfuegbar" });
      assert.equal(verfuegbar.statusCode, 200);
      assert.ok(!verfuegbar.body.includes(CODE));
      assert.deepEqual(verfuegbar.json(), { verfuegbar: false, codeErforderlich: false });

      // --- Ohne gesetzten Code: wie bisher, kein Code noetig (hier 409, weil es Konten gibt)
      delete process.env.ERSTEINRICHTUNGS_CODE;
      assert.equal((await einrichten()).statusCode, 409);
    } finally {
      if (vorher === undefined) delete process.env.ERSTEINRICHTUNGS_CODE;
      else process.env.ERSTEINRICHTUNGS_CODE = vorher;
      await app.close();
      const d = await findByIdUngeprueft(id);
      if (d) await deleteDoc(id, (d as { _rev: string })._rev);
    }
  },
);

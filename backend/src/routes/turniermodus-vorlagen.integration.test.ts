import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, SchiedsrichterImTurnier, Turnier, TurniermodusVorlage } from "@torball/shared";
import type { ModusAnsicht } from "../spielplan/modus";

/**
 * Eigene Turniermodi (Kopien): nur die Administration legt sie an, aendert und loescht sie; mitgelieferte
 * Vorlagen bleiben schreibgeschuetzt; ein Turnier traegt eine KOPIE seiner Vorlage und laeuft nach dem Loeschen
 * der Vorlage unveraendert weiter. Laeuft gegen die CouchDB-Testdatenbank, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL && !!process.env.COUCHDB_DB && !!process.env.COUCHDB_USER && !!process.env.COUCHDB_PASSWORD;

test(
  "Turniermodi kopieren, anpassen, verwenden und loeschen",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { turniermodusRoutes } = await import("./turniermodus");
    const { erstelleSession } = await import("../auth/session");
    const { hashePasswort } = await import("../auth/passwort");
    const { findAllBySelector, findByIdUngeprueft, deleteDoc, insertDoc, newId } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    for (const r of [turnierRoutes, turniermodusRoutes]) await app.register(r);

    const konto = async (rolle: "admin" | "manager"): Promise<{ id: string; cookie: string }> => {
      const id = newId("benutzer");
      await insertDoc<Benutzer>({
        _id: id, docType: "benutzer", benutzerId: id, email: `${id}@example.invalid`,
        passwortHash: await hashePasswort("Halle-Dienstag-Test-77"), name: `Modi-${rolle}`, globaleRolle: rolle,
        sprache: "de", zweiFaAktiv: false, gesperrt: false, erstelltAm: new Date().toISOString(),
      });
      return { id, cookie: `torball_session=${(await erstelleSession(id)).token}` };
    };
    const admin = await konto("admin");
    const manager = await konto("manager");
    const als = (k: { cookie: string }) => (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie: k.cookie }, ...(payload ? { payload } : {}) });
    const alsAdmin = als(admin);
    const alsManager = als(manager);
    let turnierId: string | undefined;
    let kopieId: string | undefined;

    try {
      const liste = async () => (await alsAdmin("GET", "/turniermodi")).json() as TurniermodusVorlage[];
      const eingebaut = (await liste()).filter((v) => v.eingebaut).length;
      assert.equal(eingebaut, 5);

      // Nur die Administration legt Kopien an.
      assert.equal((await alsManager("POST", "/turniermodi/gruppen-endrunde/kopie", {})).statusCode, 403);
      assert.equal((await alsAdmin("POST", "/turniermodi/gibt-es-nicht/kopie", {})).statusCode, 404);

      const kopie = await alsAdmin("POST", "/turniermodi/gruppen-endrunde/kopie", {});
      assert.equal(kopie.statusCode, 201);
      const k = kopie.json() as TurniermodusVorlage;
      kopieId = k.id;
      assert.equal(k.name, "Zwei Gruppen mit Endrunde (Kopie)");
      assert.equal(k.eingebaut, false);
      assert.equal(k.gruppen, 2, "die Gruppenzahl kommt aus der Quelle");
      assert.match(k.id, /^turniermodus:/);
      assert.ok((await liste()).some((v) => v.id === k.id), "die Kopie erscheint in der Liste");

      // Mitgelieferte Vorlagen bleiben schreibgeschuetzt.
      const aenderung = {
        name: "Sechser-Endrunde", beschreibung: "Nur die Besten.", doppeltWaehlbar: false,
        endrundeGroessen: [0, 6], standardEndrunde: 6, platz3Standard: false, platzierungsspieleStandard: true,
      };
      assert.equal((await alsAdmin("PUT", "/turniermodi/gruppen-endrunde", aenderung)).statusCode, 400);
      assert.equal((await alsAdmin("DELETE", "/turniermodi/gruppen-endrunde")).statusCode, 400);

      // Pruefung der Eingabe
      assert.equal((await alsAdmin("PUT", `/turniermodi/${k.id}`, { ...aenderung, endrundeGroessen: [3] })).statusCode, 400, "3 gibt es nicht");
      assert.equal((await alsAdmin("PUT", `/turniermodi/${k.id}`, { ...aenderung, standardEndrunde: 4 })).statusCode, 400, "Standard muss möglich sein");
      assert.equal((await alsAdmin("PUT", `/turniermodi/${k.id}`, { ...aenderung, name: "  " })).statusCode, 400);
      assert.equal((await alsManager("PUT", `/turniermodi/${k.id}`, aenderung)).statusCode, 403);

      // Aendern: Gruppen und Bausteine lassen sich nicht ueber den Body verstellen.
      const geaendert = await alsAdmin("PUT", `/turniermodi/${k.id}`, { ...aenderung, gruppen: 1, eingebaut: true, _id: "turniermodus:fremd" });
      assert.equal(geaendert.statusCode, 200);
      const g = geaendert.json() as TurniermodusVorlage;
      assert.equal(g.name, "Sechser-Endrunde");
      assert.equal(g.version, 2);
      assert.equal(g.gruppen, 2, "Gruppenzahl bleibt");
      assert.equal(g.eingebaut, false);
      assert.deepEqual(g.endrundeGroessen, [0, 6]);

      // Ein Turnier waehlt die eigene Vorlage; die Standardwerte der Vorlage gelten.
      const angelegt = await alsAdmin("POST", "/turniere", { name: "Vorlagen-Test", datum: "2026-11-01", startzeit: "09:00" });
      turnierId = (angelegt.json() as Turnier)._id;
      const gewaehlt = await alsAdmin("PUT", `/turniere/${turnierId}/modus`, { turniermodusId: k.id });
      assert.equal(gewaehlt.statusCode, 200);
      const ansicht = gewaehlt.json() as ModusAnsicht;
      assert.equal(ansicht.einstellungen.endrundeGroesse, 6);
      assert.equal(ansicht.einstellungen.platzierungsspiele, true);
      assert.equal(ansicht.vorlage.name, "Sechser-Endrunde");
      assert.equal((await alsAdmin("PUT", `/turniere/${turnierId}/modus`, { turniermodusId: k.id, einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: true } })).statusCode, 400, "4 ist in dieser Vorlage nicht erlaubt");

      // Nach dem Loeschen der Vorlage laeuft das Turnier mit seiner Kopie weiter.
      assert.equal((await alsManager("DELETE", `/turniermodi/${k.id}`)).statusCode, 403);
      assert.equal((await alsAdmin("DELETE", `/turniermodi/${k.id}`)).statusCode, 204);
      kopieId = undefined;
      assert.ok(!(await liste()).some((v) => v.id === k.id), "gelöschte Vorlage ist weg");
      assert.equal((await alsAdmin("DELETE", `/turniermodi/${k.id}`)).statusCode, 404);
      const weiter = (await alsAdmin("GET", `/turniere/${turnierId}/modus-plan`)).json() as ModusAnsicht;
      assert.equal(weiter.vorlage.name, "Sechser-Endrunde", "das Turnier traegt seine eigene Kopie");
      assert.equal((await alsAdmin("PUT", `/turniere/${turnierId}/modus`, { turniermodusId: k.id })).statusCode, 400, "gelöschte Vorlage ist nicht mehr wählbar");
    } finally {
      if (turnierId) {
        for (const d of await findAllBySelector<SchiedsrichterImTurnier>({ docType: "schiedsrichterImTurnier", turnierId })) {
          await deleteDoc(d._id, d._rev!);
        }
        const t = await findByIdUngeprueft(turnierId);
        if (t) await deleteDoc(turnierId, (t as { _rev: string })._rev);
      }
      if (kopieId) {
        const d = await findByIdUngeprueft(kopieId);
        if (d) await deleteDoc(kopieId, (d as { _rev: string })._rev);
      }
      for (const id of [admin.id, manager.id]) {
        const a = await findByIdUngeprueft(id);
        if (a) await deleteDoc(id, (a as { _rev: string })._rev);
      }
      await app.close();
    }
  },
);

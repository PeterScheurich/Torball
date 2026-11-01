import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, MannschaftImTurnier, SchiedsrichterImTurnier, Spiel, Turnier } from "@torball/shared";
import type { ModusAnsicht } from "../spielplan/modus";

/**
 * Automatisches Erzeugen der Endrunde (`einstellungen.endrundeAutomatisch`): Sobald die letzte noetige Paarung
 * feststeht, entstehen die Spiele von allein - auch die naechste Stufe, aber erst nach der Entscheidung bei einem
 * Unentschieden. Zwei fast gleichzeitige Ergebnisse duerfen keine doppelten Spiele anlegen. Laeuft gegen die echte
 * CouchDB-Testdatenbank, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL && !!process.env.COUCHDB_DB && !!process.env.COUCHDB_USER && !!process.env.COUCHDB_PASSWORD;

test(
  "Endrunde automatisch erzeugen: Stufe fuer Stufe, ohne Doppelungen",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { mannschaftRoutes } = await import("./mannschaft");
    const { spielplanRoutes } = await import("./spielplan");
    const { turniermodusRoutes } = await import("./turniermodus");
    const { ergebnisRoutes } = await import("./ergebnis");
    const { erstelleSession } = await import("../auth/session");
    const { hashePasswort } = await import("../auth/passwort");
    const { findAllBySelector, findByIdUngeprueft, deleteDoc, insertDoc, newId } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    for (const r of [turnierRoutes, mannschaftRoutes, spielplanRoutes, turniermodusRoutes, ergebnisRoutes]) await app.register(r);

    const adminId = newId("benutzer");
    await insertDoc<Benutzer>({
      _id: adminId, docType: "benutzer", benutzerId: adminId, email: `${adminId}@example.invalid`,
      passwortHash: await hashePasswort("Halle-Dienstag-Test-77"), name: "Automatik-Admin", globaleRolle: "admin",
      sprache: "de", zweiFaAktiv: false, gesperrt: false, erstelltAm: new Date().toISOString(),
    });
    const cookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const anfrage = (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    let turnierId: string | undefined;

    try {
      const angelegt = await anfrage("POST", "/turniere", { name: "Automatik-Test", datum: "2026-11-01", startzeit: "09:00" });
      turnierId = (angelegt.json() as Turnier)._id;
      await anfrage("PUT", `/turniere/${turnierId}`, { felder: [{ feldId: "feld:1", name: "Halle A" }] });
      const ids: string[] = [];
      for (const name of ["M1", "M2", "M3", "M4", "M5"]) {
        ids.push(((await anfrage("POST", "/mannschaften", { turnierId, name })).json() as MannschaftImTurnier)._id);
      }
      const modus = await anfrage("PUT", `/turniere/${turnierId}/modus`, {
        turniermodusId: "jeder-gegen-jeden-endrunde",
        einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: false, endrundeAutomatisch: true },
      });
      assert.equal(modus.statusCode, 200);
      assert.equal(
        (await anfrage("PUT", `/turniere/${turnierId}/modus`, {
          turniermodusId: "jeder-gegen-jeden-endrunde",
          einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: false, endrundeAutomatisch: "ja" },
        })).statusCode,
        400,
        "nur ein Wahrheitswert",
      );
      assert.ok([200, 201].includes((await anfrage("POST", `/turniere/${turnierId}/spielplan`)).statusCode));

      const spiele = async () => await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnierId! });
      const plan = async () => (await anfrage("GET", `/turniere/${turnierId}/modus-plan`)).json() as ModusAnsicht;
      const rang = (id: string) => ids.indexOf(id);
      const vorrunde = (await spiele()).sort((a, b) => Number(a.runde) - Number(b.runde));
      assert.equal(vorrunde.length, 10);

      // Vorrunde: M1 schlaegt alle, M2 alle ausser M1 ... (kein Gleichstand). Nach dem vorletzten Ergebnis ist noch nichts erzeugt.
      const erfasse = async (s: Spiel) => {
        const aGewinnt = rang(s.mannschaftAId) < rang(s.mannschaftBId);
        await anfrage("PUT", `/spiele/${s._id}/ergebnis`, { ergebnisA: aGewinnt ? 2 : 0, ergebnisB: aGewinnt ? 0 : 2 });
      };
      for (const s of vorrunde.slice(0, 8)) {
        await erfasse(s);
        assert.equal((await anfrage("PUT", `/spiele/${s._id}/abschliessen`)).statusCode, 200);
      }
      assert.equal((await spiele()).filter((s) => s.planId).length, 0, "vor dem letzten Ergebnis wird nichts erzeugt");

      // Die letzten beiden Ergebnisse GLEICHZEITIG abschliessen: keine doppelten Endrundenspiele.
      await erfasse(vorrunde[8]);
      await erfasse(vorrunde[9]);
      await Promise.all([vorrunde[8], vorrunde[9]].map((s) => anfrage("PUT", `/spiele/${s._id}/abschliessen`)));
      let endrunde = (await spiele()).filter((s) => s.planId);
      assert.deepEqual(endrunde.map((s) => s.planId).sort(), ["HF1", "HF2"], "genau je ein Halbfinale, keine Doppelungen");
      const hf1 = endrunde.find((s) => s.planId === "HF1")!;
      const hf2 = endrunde.find((s) => s.planId === "HF2")!;
      assert.deepEqual([hf1.mannschaftAId, hf1.mannschaftBId], [ids[0], ids[3]], "Halbfinale 1: 1. gegen 4.");

      // Halbfinale 1 entschieden, Halbfinale 2 unentschieden: Finale und Platz 3 warten auf die Entscheidung.
      await anfrage("PUT", `/spiele/${hf1._id}/ergebnis`, { ergebnisA: 3, ergebnisB: 1 });
      await anfrage("PUT", `/spiele/${hf1._id}/abschliessen`);
      await anfrage("PUT", `/spiele/${hf2._id}/ergebnis`, { ergebnisA: 1, ergebnisB: 1 });
      await anfrage("PUT", `/spiele/${hf2._id}/abschliessen`);
      assert.equal((await spiele()).filter((s) => s.planId).length, 2, "bei Unentschieden wartet die naechste Stufe");

      // Nach dem Anfangen der Endrunde laesst sich NUR die Automatik umschalten, nichts anderes.
      assert.equal(
        (await anfrage("PUT", `/turniere/${turnierId}/modus`, {
          turniermodusId: "jeder-gegen-jeden-endrunde",
          einstellungen: { endrundeGroesse: 2, platz3: true, platzierungsspiele: false, endrundeAutomatisch: true },
        })).statusCode,
        409,
        "andere Einstellungen bleiben gesperrt",
      );

      // Die Entscheidung der Turnierleitung loest die naechste Stufe aus.
      const offen = (await plan()).plan.find((p) => p.planId === "HF2")!;
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}/modus/plan/HF2`, { entscheidung: offen.mannschaftBId })).statusCode, 200);
      endrunde = (await spiele()).filter((s) => s.planId);
      assert.deepEqual(endrunde.map((s) => s.planId).sort(), ["F", "HF1", "HF2", "P3"], "Finale und Platz 3 entstehen nach der Entscheidung");

      // Ausschalten ist auch jetzt noch moeglich (betrifft nur kuenftige Stufen).
      const aus = await anfrage("PUT", `/turniere/${turnierId}/modus`, {
        turniermodusId: "jeder-gegen-jeden-endrunde",
        einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: false, endrundeAutomatisch: false },
      });
      assert.equal(aus.statusCode, 200);
      assert.equal(((await findByIdUngeprueft(turnierId)) as Turnier).modus?.einstellungen.endrundeAutomatisch, false);
    } finally {
      if (turnierId) {
        for (const d of [
          ...(await findAllBySelector<Spiel>({ docType: "spiel", turnierId })),
          ...(await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId })),
          ...(await findAllBySelector<SchiedsrichterImTurnier>({ docType: "schiedsrichterImTurnier", turnierId })),
        ]) {
          await deleteDoc(d._id, d._rev!);
        }
        const t = await findByIdUngeprueft(turnierId);
        if (t) await deleteDoc(turnierId, (t as { _rev: string })._rev);
      }
      const a = await findByIdUngeprueft(adminId);
      if (a) await deleteDoc(adminId, (a as { _rev: string })._rev);
      await app.close();
    }
  },
);

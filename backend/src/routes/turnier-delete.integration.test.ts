import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Integration-Test gegen die echte CouchDB-Dev-Instanz (siehe
 * docs/Protokolle/2026-08-10-couchdb-backend-setup.md). Es gibt in diesem Projekt
 * (noch) keine Mock-/Fake-DB-Infrastruktur - db.ts wirft beim Import, wenn die
 * COUCHDB_*-Umgebungsvariablen fehlen. Deshalb wird hier bewusst per Dynamic Import
 * erst zur Laufzeit (und nur, wenn die Variablen gesetzt sind) geladen, damit
 * `npm test` ohne konfigurierte Dev-DB nicht fehlschlaegt, sondern den Test ueberspringt.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

test(
  "DELETE /turniere/:id loescht auch zugehoerige Mannschaften, Spieler und Spiele (Kaskade)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { findAllBySelector, findById, insertDoc, newId } = await import("../repository");
    const Fastify = (await import("fastify")).default;
    const { turnierRoutes } = await import("./turnier");
    const { mannschaftRoutes } = await import("./mannschaft");
    const { spielRoutes } = await import("./spiel");

    const app = Fastify();
    await app.register(turnierRoutes);
    await app.register(mannschaftRoutes);
    await app.register(spielRoutes);

    const turnierId = newId("turnier");
    await insertDoc({
      _id: turnierId,
      docType: "turnier",
      turnierId,
      name: "Kaskaden-Test-Turnier",
      datum: "2026-08-10",
      status: "entwurf",
      felder: [],
      protokollierungsart: "digital",
      spielzeitMinuten: 5,
      anzahlHalbzeiten: 2,
      pauseMinuten: 2,
      seitenwechsel: true,
      timeoutsJeHalbzeit: 1,
      timeoutDauerSekunden: 30,
      auswechslungenJeHalbzeit: 3,
      tordifferenzAbbruch: true,
      tordifferenzLimit: 10,
      verlaengerungAktiv: true,
      silbernesTor: true,
      maxSehendeSpieler: 1,
      einstelligeTrikotnummern: true,
      punkteSieg: 2,
      punkteUnentschieden: 1,
      punkteNiederlage: 0,
      tabellenKriterien: ["punkte", "tordifferenz", "tore", "direkter_vergleich", "freiwuerfe"],
      spielernamenOeffentlich: false,
      spielplanFreigegeben: false,
      spielplanVersion: 0,
      oeffentlichTurnierinfos: false,
      oeffentlichAnfahrtDokumente: false,
      oeffentlichSpielplan: false,
      oeffentlichErgebnisse: false,
      erstelltAm: new Date().toISOString(),
    } as unknown as Parameters<typeof insertDoc>[0]);

    const mannschaftAId = newId("mannschaftImTurnier");
    const mannschaftBId = newId("mannschaftImTurnier");
    await insertDoc({
      _id: mannschaftAId,
      docType: "mannschaftImTurnier",
      mannschaftId: mannschaftAId,
      turnierId,
      name: "Team A",
    } as unknown as Parameters<typeof insertDoc>[0]);
    await insertDoc({
      _id: mannschaftBId,
      docType: "mannschaftImTurnier",
      mannschaftId: mannschaftBId,
      turnierId,
      name: "Team B",
    } as unknown as Parameters<typeof insertDoc>[0]);

    const spielerId = newId("spieler");
    await insertDoc({
      _id: spielerId,
      docType: "spieler",
      spielerId,
      mannschaftId: mannschaftAId,
      name: "Testspieler",
      trikotnummer: "1",
      klassifizierung: "B1",
      status: "aktiv",
    } as unknown as Parameters<typeof insertDoc>[0]);

    const spielId = newId("spiel");
    await insertDoc({
      _id: spielId,
      docType: "spiel",
      spielId,
      turnierId,
      runde: "1",
      feldId: "feld:1",
      startzeitGeplant: new Date().toISOString(),
      mannschaftAId,
      mannschaftBId,
      status: "geplant",
      istForfait: false,
      ergebnisAbgeschlossen: false,
    } as unknown as Parameters<typeof insertDoc>[0]);

    try {
      const response = await app.inject({ method: "DELETE", url: `/turniere/${turnierId}` });
      assert.equal(response.statusCode, 204);

      assert.equal(await findById(turnierId), null, "Turnier haette geloescht sein muessen");

      const verbleibendeMannschaften = await findAllBySelector({
        docType: "mannschaftImTurnier",
        turnierId,
      });
      assert.equal(
        verbleibendeMannschaften.length,
        0,
        "Mannschaften haetten mit dem Turnier mitgeloescht werden muessen",
      );

      const verbleibendeSpiele = await findAllBySelector({ docType: "spiel", turnierId });
      assert.equal(verbleibendeSpiele.length, 0, "Spiele haetten mit dem Turnier mitgeloescht werden muessen");

      // Spieler haengen am mannschaftId (nicht am turnierId) - die Kaskade muss sie ueber
      // die zugehoerigen Mannschaften ebenfalls mitgeloescht haben.
      const verbleibendeSpieler = await findAllBySelector({ docType: "spieler", mannschaftId: mannschaftAId });
      assert.equal(verbleibendeSpieler.length, 0, "Spieler haetten mit dem Turnier mitgeloescht werden muessen");
    } finally {
      // Aufraeumen falls der Test selbst fehlschlaegt, bevor die Kaskade greifen konnte.
      for (const id of [turnierId, mannschaftAId, mannschaftBId, spielId, spielerId]) {
        const doc = await findById(id);
        if (doc) await import("../repository").then((r) => r.deleteDoc(id, (doc as { _rev: string })._rev));
      }
      await app.close();
    }
  },
);

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
  "DELETE /turniere/:id loescht die vollstaendige Kaskade (Mannschaften/Spieler/Schiedsrichter/Spiele + Token/Berechtigungen/Checkouts/Ergebnis-Aenderungen/verwaisten Wettbewerb)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { findAllBySelector, findById, insertDoc, newId, deleteDoc } = await import("../repository");
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler, SESSION_COOKIE_NAME } = await import("../auth/plugin");
    const { erstelleSession } = await import("../auth/session");
    const { turnierRoutes } = await import("./turnier");
    const { mannschaftRoutes } = await import("./mannschaft");
    const { spielRoutes } = await import("./spiel");

    const app = Fastify();
    // Cookie-Plugin + Auth-Hook auf der Root-Instanz registrieren, genau wie in index.ts -
    // die DELETE-Route verlangt requireAuth, ein Request ohne Session bekommt sonst 401
    // statt 204 (siehe Kommentar oben zur Test-Historie).
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierRoutes);
    await app.register(mannschaftRoutes);
    await app.register(spielRoutes);

    const benutzerId = newId("benutzer");
    await insertDoc({
      _id: benutzerId,
      docType: "benutzer",
      benutzerId,
      email: `${benutzerId}@test.invalid`,
      name: "Test-Admin",
      globaleRolle: "admin",
      sprache: "de",
      zweiFaAktiv: false,
      gesperrt: false,
      erstelltAm: new Date().toISOString(),
    } as unknown as Parameters<typeof insertDoc>[0]);
    const { token: sessionToken, session } = await erstelleSession(benutzerId);

    const wettbewerbId = newId("wettbewerb");
    await insertDoc({
      _id: wettbewerbId,
      docType: "wettbewerb",
      wettbewerbId,
      name: "Kaskaden-Test-Wettbewerb",
      erstelltAm: new Date().toISOString(),
    } as unknown as Parameters<typeof insertDoc>[0]);

    const turnierId = newId("turnier");
    await insertDoc({
      _id: turnierId,
      docType: "turnier",
      turnierId,
      wettbewerbId,
      name: "Kaskaden-Test-Turnier",
      datum: "2026-08-10",
      status: "entwurf",
      felder: [],
      protokollierungsart: "digital",
      spielzeitMinuten: 5,
      anzahlHalbzeiten: 2,
      pauseMinuten: 2,
      pauseZwischenSpielenMinuten: 10,
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

    const schiedsrichterId = newId("schiedsrichterImTurnier");
    await insertDoc({
      _id: schiedsrichterId,
      docType: "schiedsrichterImTurnier",
      schiedsrichterId,
      turnierId,
      name: "Testschiedsrichter",
      lizenzVorhanden: false,
      istTurnierleitung: true,
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

    // Weitere direkt/indirekt am Turnier haengende Dokumente (Backend-Review Karte C).
    const ergebnisTokenId = newId("ergebnisToken");
    await insertDoc({
      _id: ergebnisTokenId,
      docType: "ergebnisToken",
      tokenId: ergebnisTokenId,
      turnierId,
      tokenWert: "kaskaden-test-token",
      erstelltAm: new Date().toISOString(),
      widerrufen: false,
    } as unknown as Parameters<typeof insertDoc>[0]);

    const berechtigungId = newId("turnierBerechtigung");
    await insertDoc({
      _id: berechtigungId,
      docType: "turnierBerechtigung",
      berechtigungId,
      turnierId,
      benutzerId,
      rolle: "lesen",
      vergebenAm: new Date().toISOString(),
    } as unknown as Parameters<typeof insertDoc>[0]);

    const checkoutId = newId("turnierCheckout");
    await insertDoc({
      _id: checkoutId,
      docType: "turnierCheckout",
      checkoutId,
      turnierId,
      instanzId: "verbundeneInstanz:kaskaden-test",
      // "freigegeben" (nicht aktiv) - sonst wuerde die Ausgecheckt-Sperre das Loeschen blockieren.
      status: "freigegeben",
      stammdatenMitnehmen: false,
      angefordertAm: new Date().toISOString(),
    } as unknown as Parameters<typeof insertDoc>[0]);

    const aenderungId = newId("ergebnisAenderung");
    await insertDoc({
      _id: aenderungId,
      docType: "ergebnisAenderung",
      aenderungId,
      spielId,
      erfasserName: "Tester",
      neuerWertA: 1,
      neuerWertB: 0,
      zeitstempel: new Date().toISOString(),
    } as unknown as Parameters<typeof insertDoc>[0]);

    try {
      const response = await app.inject({
        method: "DELETE",
        url: `/turniere/${turnierId}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
      });
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

      const verbleibendeSchiedsrichter = await findAllBySelector({ docType: "schiedsrichterImTurnier", turnierId });
      assert.equal(
        verbleibendeSchiedsrichter.length,
        0,
        "Schiedsrichter haetten mit dem Turnier mitgeloescht werden muessen",
      );

      // Erweiterte Kaskade (Karte C): keine Waisen-Dokumente zurueckgeblieben.
      assert.equal(
        (await findAllBySelector({ docType: "ergebnisToken", turnierId })).length,
        0,
        "Ergebnis-Token haetten mitgeloescht werden muessen",
      );
      assert.equal(
        (await findAllBySelector({ docType: "turnierBerechtigung", turnierId })).length,
        0,
        "Berechtigungen haetten mitgeloescht werden muessen",
      );
      assert.equal(
        (await findAllBySelector({ docType: "turnierCheckout", turnierId })).length,
        0,
        "Checkouts haetten mitgeloescht werden muessen",
      );
      assert.equal(
        (await findAllBySelector({ docType: "ergebnisAenderung", spielId })).length,
        0,
        "Ergebnis-Aenderungen haetten mitgeloescht werden muessen",
      );
      assert.equal(await findById(wettbewerbId), null, "verwaister Wettbewerb haette mitgeloescht werden muessen");
    } finally {
      // Aufraeumen falls der Test selbst fehlschlaegt, bevor die Kaskade greifen konnte.
      for (const id of [
        turnierId,
        wettbewerbId,
        mannschaftAId,
        mannschaftBId,
        spielId,
        spielerId,
        schiedsrichterId,
        ergebnisTokenId,
        berechtigungId,
        checkoutId,
        aenderungId,
        benutzerId,
        session._id,
      ]) {
        const doc = await findById(id);
        if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
      }
      await app.close();
    }
  },
);

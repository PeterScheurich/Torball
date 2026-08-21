import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Spiel, Turnier } from "@torball/shared";

/**
 * Digitale Protokollierung (Abschnitt 22): kompletter Lebenszyklus ueber die echten Routen -
 * Protokoll anlegen, Events anhaengen (inkl. Live-Ergebnis + Undo), Spielende, Unterschrift,
 * Abschluss - plus digital-Gate, Protokollant-Code-Zugriff und Vier-Augen-Abschluss. Laeuft gegen
 * die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen Integrationstests.
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
    name: "Protokoll-Admin",
    globaleRolle: "admin",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

async function neuesTurnier(
  erstelltVon: string,
  extra: Partial<Turnier> = {},
): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const id = newId("turnier");
  await insertDoc({
    _id: id,
    docType: "turnier",
    turnierId: id,
    name: "Protokoll-Test",
    datum: "2026-08-21",
    startzeit: "10:00",
    status: "aktiv",
    felder: [],
    protokollierungsart: "digital",
    spielplanModus: "einfach",
    erstelltVon,
    erstelltVonName: "Protokoll-Admin",
    erstelltAm: new Date().toISOString(),
    ...extra,
  } as unknown as Turnier);
  return id;
}

async function neuesSpiel(turnierId: string): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const id = newId("spiel");
  await insertDoc({
    _id: id,
    docType: "spiel",
    spielId: id,
    turnierId,
    mannschaftAId: "mannschaftImTurnier:protokoll-test-a",
    mannschaftBId: "mannschaftImTurnier:protokoll-test-b",
    status: "geplant",
    istForfait: false,
    ergebnisAbgeschlossen: false,
  } as unknown as Spiel);
  return id;
}

async function aufraeumen(ids: string[]) {
  const { findById, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const d = await findById(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
  }
}

async function baueApp() {
  const Fastify = (await import("fastify")).default;
  const fastifyCookie = (await import("@fastify/cookie")).default;
  const { authPreHandler } = await import("../auth/plugin");
  const { protokollRoutes } = await import("./protokoll");
  const app = Fastify();
  await app.register(fastifyCookie);
  app.addHook("preHandler", authPreHandler);
  await app.register(protokollRoutes);
  return app;
}

test(
  "Protokoll-Lebenszyklus: anlegen, Events, Live-Ergebnis, Undo, End, Unterschrift, Fin",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { erstelleSession } = await import("../auth/session");
    const { findById } = await import("../repository");
    const app = await baueApp();

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId);
    const spielId = await neuesSpiel(turnierId);
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;
    const angelegt: string[] = [];

    async function sendeEvent(payload: Record<string, unknown>, erwartet = 200) {
      const res = await app.inject({
        method: "POST",
        url: `/protokolle/${angelegt[0]}/events`,
        headers: { cookie },
        payload,
      });
      assert.equal(res.statusCode, erwartet, res.body);
      if (res.statusCode === 200) angelegt.push(res.json().event._id);
      return res.json();
    }

    try {
      // Noch kein Protokoll -> 404.
      const ohne = await app.inject({ method: "GET", url: `/spiele/${spielId}/protokoll`, headers: { cookie } });
      assert.equal(ohne.statusCode, 404);

      // Anlegen (mit Protokollant-Name); zweites Anlegen -> 409.
      const anlegen = await app.inject({
        method: "POST",
        url: `/spiele/${spielId}/protokoll`,
        headers: { cookie },
        payload: { ersterProtokollantName: "Testperson" },
      });
      assert.equal(anlegen.statusCode, 200, anlegen.body);
      angelegt.unshift(anlegen.json()._id);
      const doppelt = await app.inject({
        method: "POST",
        url: `/spiele/${spielId}/protokoll`,
        headers: { cookie },
        payload: { ersterProtokollantName: "Testperson" },
      });
      assert.equal(doppelt.statusCode, 409);

      // GO startet das Spiel; ohne Tore noch KEIN 0:0 am Spiel (sonst zaehlte die Tabelle ein
      // gerade angepfiffenes Spiel bereits als Remis).
      const nachGo = await sendeEvent({ eventTyp: "GO" });
      assert.equal(nachGo.spiel.status, "laeuft");
      assert.equal(nachGo.spiel.ergebnisA, undefined);

      // Tor fuer A (als W+G-Doppel-Event, Konzept 3.3) -> Live-Ergebnis 1:0.
      await sendeEvent({ eventTyp: "W", mannschaft: "A", spielerId: "spieler:p1" });
      const nachTor = await sendeEvent({ eventTyp: "G", mannschaft: "A", spielerId: "spieler:p1" });
      assert.equal(nachTor.spiel.ergebnisA, 1);
      assert.equal(nachTor.spiel.ergebnisB, 0);

      // Eigentor von A -> Gutschrift B (1:1).
      const nachEigentor = await sendeEvent({ eventTyp: "G", mannschaft: "A", istEigentor: true });
      assert.equal(nachEigentor.spiel.ergebnisB, 1);

      // Undo des Eigentors -> 1:0.
      const eigentorId = angelegt[angelegt.length - 1];
      const nachUndo = await sendeEvent({
        eventTyp: "ANNULLIERT",
        istKorrektur: true,
        korrigiertEventId: eigentorId,
      });
      assert.equal(nachUndo.spiel.ergebnisA, 1);
      assert.equal(nachUndo.spiel.ergebnisB, 0);

      // Korrektur auf ein fremdes/unbekanntes Event -> 400.
      await sendeEvent({ eventTyp: "ANNULLIERT", istKorrektur: true, korrigiertEventId: "event:fremd" }, 400);

      // Fin vor der Unterschrift -> 400; End + Unterschrift + Fin -> Spiel abgeschlossen.
      await sendeEvent({ eventTyp: "Fin" }, 400);
      const nachEnde = await sendeEvent({ eventTyp: "End" });
      assert.equal(nachEnde.spiel.status, "beendet");
      assert.equal(nachEnde.protokoll.status, "beendet");
      const unterschrift = await app.inject({
        method: "POST",
        url: `/protokolle/${angelegt[0]}/unterschreiben`,
        headers: { cookie },
        payload: { name: "Testperson" },
      });
      assert.equal(unterschrift.statusCode, 200, unterschrift.body);
      const nachFin = await sendeEvent({ eventTyp: "Fin" });
      assert.equal(nachFin.protokoll.status, "abgeschlossen");
      assert.equal(nachFin.spiel.ergebnisAbgeschlossen, true);
      assert.equal(nachFin.spiel.status, "abgeschlossen");

      // Nach dem Abschluss keine weiteren Events (409) ...
      await sendeEvent({ eventTyp: "G", mannschaft: "A" }, 409);
      // ... ausser der Protest-Entscheidung als Korrektur auf ein PROT-Event - hier nicht
      // vorhanden, deshalb ebenfalls 409 (istKorrektur auf ein Nicht-PROT-Event zaehlt nicht).
      await sendeEvent(
        { eventTyp: "ANNULLIERT", istKorrektur: true, korrigiertEventId: angelegt[1] },
        409,
      );

      // GET liefert Protokoll + Events sortiert.
      const abruf = await app.inject({ method: "GET", url: `/spiele/${spielId}/protokoll`, headers: { cookie } });
      assert.equal(abruf.statusCode, 200);
      const events = abruf.json().events as { sequenz: number }[];
      assert.deepEqual(
        events.map((e) => e.sequenz),
        events.map((_, i) => i + 1),
      );

      const spiel = await findById<Spiel>(spielId);
      assert.equal(spiel?.ergebnisA, 1);
      assert.equal(spiel?.ergebnisB, 0);
    } finally {
      await aufraeumen([...angelegt, spielId, turnierId, adminId]);
      await app.close();
    }
  },
);

test(
  "digital-Gate und Protokollant-Code-Zugriff",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { erstelleCodeSession } = await import("../auth/session");
    const app = await baueApp();

    const adminId = await neuerAdmin();
    const manuellTurnierId = await neuesTurnier(adminId, { protokollierungsart: "manuell" } as Partial<Turnier>);
    const manuellSpielId = await neuesSpiel(manuellTurnierId);
    const digitalTurnierId = await neuesTurnier(adminId);
    const digitalSpielId = await neuesSpiel(digitalTurnierId);
    const angelegt: string[] = [];

    // Code-Session der Rolle "protokollant" fuer das digitale Turnier.
    const { token } = await erstelleCodeSession(digitalTurnierId, "protokollant");
    const cookie = `torball_session=${token}`;

    try {
      // manuell-Turnier: Protokoll anlegen -> 400 (falsche Protokollierungsart) - hier mit einer
      // Admin-Session, damit nicht schon der Zugriff scheitert.
      const { erstelleSession } = await import("../auth/session");
      const adminCookie = `torball_session=${(await erstelleSession(adminId)).token}`;
      const beiManuell = await app.inject({
        method: "POST",
        url: `/spiele/${manuellSpielId}/protokoll`,
        headers: { cookie: adminCookie },
        payload: { ersterProtokollantName: "Testperson" },
      });
      assert.equal(beiManuell.statusCode, 400, beiManuell.body);

      // Protokollant-Code darf am digitalen Turnier anlegen + protokollieren.
      const anlegen = await app.inject({
        method: "POST",
        url: `/spiele/${digitalSpielId}/protokoll`,
        headers: { cookie },
        payload: { ersterProtokollantName: "Code-Person" },
      });
      assert.equal(anlegen.statusCode, 200, anlegen.body);
      angelegt.push(anlegen.json()._id);
      const event = await app.inject({
        method: "POST",
        url: `/protokolle/${angelegt[0]}/events`,
        headers: { cookie },
        payload: { eventTyp: "GO" },
      });
      assert.equal(event.statusCode, 200, event.body);
      angelegt.push(event.json().event._id);
      // Der Name kommt aus der Zuschreibung der Code-Session.
      assert.equal(event.json().event.erstelltVonName, "Protokollant-Code");

      // Aber: am FREMDEN (manuellen) Turnier hat der Code keinerlei Zugriff -> 403.
      const fremd = await app.inject({
        method: "POST",
        url: `/spiele/${manuellSpielId}/protokoll`,
        headers: { cookie },
        payload: { ersterProtokollantName: "Code-Person" },
      });
      assert.equal(fremd.statusCode, 403);
    } finally {
      await aufraeumen([...angelegt, manuellSpielId, manuellTurnierId, digitalSpielId, digitalTurnierId, adminId]);
      await app.close();
    }
  },
);

test(
  "Vier-Augen-Abschluss (protokollBestaetigungErforderlich): Fin allein schliesst das Spiel nicht ab",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { erstelleSession } = await import("../auth/session");
    const app = await baueApp();

    const adminId = await neuerAdmin();
    const turnierId = await neuesTurnier(adminId, { protokollBestaetigungErforderlich: true } as Partial<Turnier>);
    const spielId = await neuesSpiel(turnierId);
    const { token } = await erstelleSession(adminId);
    const cookie = `torball_session=${token}`;
    const angelegt: string[] = [];

    try {
      const anlegen = await app.inject({
        method: "POST",
        url: `/spiele/${spielId}/protokoll`,
        headers: { cookie },
        payload: { ersterProtokollantName: "Testperson" },
      });
      assert.equal(anlegen.statusCode, 200, anlegen.body);
      const protokollId = anlegen.json()._id as string;
      angelegt.push(protokollId);

      for (const payload of [
        { eventTyp: "GO" },
        { eventTyp: "G", mannschaft: "A" },
        { eventTyp: "End" },
      ]) {
        const res = await app.inject({
          method: "POST",
          url: `/protokolle/${protokollId}/events`,
          headers: { cookie },
          payload,
        });
        assert.equal(res.statusCode, 200, res.body);
        angelegt.push(res.json().event._id);
      }
      await app.inject({
        method: "POST",
        url: `/protokolle/${protokollId}/unterschreiben`,
        headers: { cookie },
        payload: { name: "Testperson" },
      });

      const fin = await app.inject({
        method: "POST",
        url: `/protokolle/${protokollId}/events`,
        headers: { cookie },
        payload: { eventTyp: "Fin" },
      });
      assert.equal(fin.statusCode, 200, fin.body);
      angelegt.push(fin.json().event._id);
      // Protokoll abgeschlossen, Spiel aber noch NICHT final (wartet auf die Turnierleitung).
      assert.equal(fin.json().protokoll.status, "abgeschlossen");
      assert.equal(fin.json().spiel.ergebnisAbgeschlossen, false);
      assert.equal(fin.json().spiel.status, "beendet");

      const bestaetigt = await app.inject({
        method: "POST",
        url: `/protokolle/${protokollId}/bestaetigen`,
        headers: { cookie },
      });
      assert.equal(bestaetigt.statusCode, 200, bestaetigt.body);
      assert.equal(bestaetigt.json().spiel.ergebnisAbgeschlossen, true);
      assert.equal(bestaetigt.json().spiel.status, "abgeschlossen");
      assert.ok(bestaetigt.json().protokoll.turnierleitungBestaetigtAm);

      // Doppelte Bestaetigung -> 409.
      const doppelt = await app.inject({
        method: "POST",
        url: `/protokolle/${protokollId}/bestaetigen`,
        headers: { cookie },
      });
      assert.equal(doppelt.statusCode, 409);
    } finally {
      await aufraeumen([...angelegt, spielId, turnierId, adminId]);
      await app.close();
    }
  },
);

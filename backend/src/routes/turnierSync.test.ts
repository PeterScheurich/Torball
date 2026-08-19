import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, VerbundeneInstanz } from "@torball/shared";

/**
 * Turnier-Sync (Grundlage, Abschnitt 21.3/23): Instanz-Kopplung, Check-in, Download-Anforderung/
 * -Freigabe, Sync-Import (neu/ersetzen). Wie die anderen Integrationstests in diesem Projekt
 * (siehe turnier-delete.integration.test.ts, auth/turnierZugriff.test.ts) laeuft das gegen die
 * echte CouchDB-Dev-Instanz und wird per Dynamic Import + Skip-Guard nur ausgefuehrt, wenn die
 * COUCHDB_*-Umgebungsvariablen gesetzt sind.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuerBenutzer(globaleRolle: "admin" | "manager" | "benutzer" = "admin") {
  const { insertDoc, newId } = await import("../repository");
  const benutzerId = newId("benutzer");
  await insertDoc({
    _id: benutzerId,
    docType: "benutzer",
    benutzerId,
    email: `${benutzerId}@example.invalid`,
    name: "Test-Benutzer",
    globaleRolle,
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return benutzerId;
}

function turnierFelder(turnierId: string, erstelltVon: string) {
  return {
    _id: turnierId,
    docType: "turnier",
    turnierId,
    name: "Sync-Test-Turnier",
    datum: "2026-08-13",
    status: "entwurf",
    felder: [],
    protokollierungsart: "manuell",
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
    erstelltVon,
    erstelltAm: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

async function neuesTurnier(erstelltVon: string) {
  const { insertDoc, newId } = await import("../repository");
  const turnierId = newId("turnier");
  await insertDoc(turnierFelder(turnierId, erstelltVon));
  return turnierId;
}

async function aufraeumen(ids: string[]) {
  const { findById, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const doc = await findById(id);
    if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
  }
}

test(
  "Instanz-Kopplung: gueltiger Code liefert Instanz-Token, Check-in damit erfolgreich, ungueltiger/widerrufener Token liefert 401",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { insertDoc, findById } = await import("../repository");
    const { erzeugeToken, hashe } = await import("../auth/token");
    const Fastify = (await import("fastify")).default;
    const { instanzSyncRoutes } = await import("./instanzSync");

    const app = Fastify();
    await app.register(instanzSyncRoutes);

    const benutzerId = await neuerBenutzer();
    const { token: kopplungscode, hash } = erzeugeToken();
    const benutzer = await findById<Benutzer>(benutzerId);
    await insertDoc({
      ...(benutzer as object),
      instanzKopplungscodeHash: hash,
      instanzKopplungscodeAblauf: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const aufzuraeumendeIds = [benutzerId];
    try {
      const einloesen = await app.inject({
        method: "POST",
        url: "/instanzen/kopplung-einloesen",
        payload: { kopplungscode, bezeichnung: "Test-Instanz" },
      });
      assert.equal(einloesen.statusCode, 201);
      const { instanzToken, instanzId } = einloesen.json();
      assert.ok(instanzToken);
      aufzuraeumendeIds.push(instanzId);

      // Kopplungscode ist Einmal-Code - der Benutzer sollte ihn nicht mehr tragen.
      const benutzerNachher = await findById<Benutzer>(benutzerId);
      assert.equal(benutzerNachher!.instanzKopplungscodeHash, undefined);

      const checkinGueltig = await app.inject({
        method: "POST",
        url: "/instanzen/checkin",
        headers: { authorization: `Bearer ${instanzToken}` },
        payload: {},
      });
      assert.equal(checkinGueltig.statusCode, 200);
      assert.deepEqual(checkinGueltig.json().ausstehendeDownloads, []);

      const checkinUngueltig = await app.inject({
        method: "POST",
        url: "/instanzen/checkin",
        headers: { authorization: "Bearer offensichtlich-falsch" },
        payload: {},
      });
      assert.equal(checkinUngueltig.statusCode, 401);

      // Widerrufen -> derselbe (vorher gueltige) Token wird abgelehnt.
      const instanz = await findById<VerbundeneInstanz>(instanzId);
      await insertDoc({
        ...(instanz as object),
        widerrufen: true,
        widerrufenAm: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const checkinWiderrufen = await app.inject({
        method: "POST",
        url: "/instanzen/checkin",
        headers: { authorization: `Bearer ${instanzToken}` },
        payload: {},
      });
      assert.equal(checkinWiderrufen.statusCode, 401);
    } finally {
      await aufraeumen(aufzuraeumendeIds);
      await app.close();
    }
  },
);

test(
  "sammleTurnierExport nimmt Stammdaten nur mit, wenn angefordert",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { insertDoc, newId, findById, deleteDoc } = await import("../repository");
    const { sammleTurnierExport } = await import("../sync/export");

    const benutzerId = await neuerBenutzer();
    const turnierId = await neuesTurnier(benutzerId);
    const vereinId = newId("verein");
    await insertDoc({
      _id: vereinId,
      docType: "verein",
      vereinId,
      name: "Test-Verein",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const mannschaftId = newId("mannschaftImTurnier");
    await insertDoc({
      _id: mannschaftId,
      docType: "mannschaftImTurnier",
      mannschaftId,
      turnierId,
      name: "Team A",
      vereinId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    try {
      const ohneStammdaten = await sammleTurnierExport(turnierId, { stammdatenMitnehmen: false });
      assert.equal(ohneStammdaten.vereine.length, 0);
      assert.equal(ohneStammdaten.mannschaften.length, 1);

      const mitStammdaten = await sammleTurnierExport(turnierId, { stammdatenMitnehmen: true });
      assert.equal(mitStammdaten.vereine.length, 1);
      assert.equal(mitStammdaten.vereine[0]._id, vereinId);
    } finally {
      for (const id of [mannschaftId, vereinId, turnierId, benutzerId]) {
        const doc = await findById(id);
        if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
      }
    }
  },
);

test(
  "sammleTurnierExport nimmt auch den Verein eines Schiedsrichters mit, der keine eigene Mannschaft im Turnier hat",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    // Regressionstest fuer den Vereins- statt Mannschafts-Bezug bei Schiedsrichtern
    // (2026-08-14): ein neutraler, von auswaerts eingeladener Schiedsrichter kann einem Verein
    // angehoeren, der selbst keine Mannschaft in diesem Turnier stellt - dessen Verein muss
    // trotzdem mitexportiert werden, sonst haette die Zielinstanz eine haengende vereinId.
    const { insertDoc, newId } = await import("../repository");
    const { sammleTurnierExport } = await import("../sync/export");

    const benutzerId = await neuerBenutzer();
    const turnierId = await neuesTurnier(benutzerId);
    const vereinIdSchiedsrichter = newId("verein");
    await insertDoc({
      _id: vereinIdSchiedsrichter,
      docType: "verein",
      vereinId: vereinIdSchiedsrichter,
      name: "Verein des Schiedsrichters (keine eigene Mannschaft)",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const schiedsrichterId = newId("schiedsrichterImTurnier");
    await insertDoc({
      _id: schiedsrichterId,
      docType: "schiedsrichterImTurnier",
      schiedsrichterId,
      turnierId,
      name: "Neutraler Schiedsrichter",
      lizenzVorhanden: true,
      vereinId: vereinIdSchiedsrichter,
      istTurnierleitung: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    try {
      const paket = await sammleTurnierExport(turnierId, { stammdatenMitnehmen: true });
      assert.equal(paket.mannschaften.length, 0, "keine Mannschaft im Turnier - Kontrolle des Testaufbaus");
      assert.ok(
        paket.vereine.some((v) => v._id === vereinIdSchiedsrichter),
        "Verein des Schiedsrichters fehlt im Export, obwohl keine Mannschaft ihn referenziert",
      );
    } finally {
      await aufraeumen([schiedsrichterId, vereinIdSchiedsrichter, turnierId, benutzerId]);
    }
  },
);

test(
  "sync-import: neu anlegen erfolgreich, zweiter Import ohne ersetzen liefert 409",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const { instanzSyncRoutes } = await import("./instanzSync");
    const { turnierSyncRoutes } = await import("./turnierSync");
    const { findById, insertDoc, deleteDoc } = await import("../repository");
    const { findeAktivesCheckout } = await import("../sync/instanz");

    const app = Fastify();
    await app.register(instanzSyncRoutes);
    await app.register(turnierSyncRoutes);

    const quellBenutzerId = await neuerBenutzer("benutzer"); // bewusst KEIN Admin - fuer den 403-Fall unten
    // Bewusst NICHT ueber neuesTurnier()+sammleTurnierExport() - das wuerde den Turnier-Import-
    // Zieldoc mit einer bereits in DIESER (einzigen Test-)Datenbank vorhandenen ID kollidieren
    // lassen. Stattdessen ein Paket mit einer frischen, noch nicht existierenden Turnier-ID von
    // Hand bauen - simuliert den "kommt von einer anderen Instanz"-Fall.
    const { newId } = await import("../repository");
    const importTurnierId = newId("turnier");
    const exportPaket = {
      turnier: turnierFelder(importTurnierId, quellBenutzerId),
      mannschaften: [],
      spieler: [],
      spiele: [],
      schiedsrichter: [],
      vereine: [],
      teams: [],
      wettbewerb: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const { erstelleInstanz } = await erstelleTestInstanz(quellBenutzerId);
    const aufzuraeumendeIds = [quellBenutzerId, importTurnierId, erstelleInstanz.instanzId];

    try {
      const ersterImport = await app.inject({
        method: "POST",
        url: "/turniere/sync-import",
        headers: { authorization: `Bearer ${erstelleInstanz.instanzToken}` },
        payload: { export: exportPaket },
      });
      assert.equal(ersterImport.statusCode, 201);
      assert.ok(ersterImport.json().checkoutId);
      aufzuraeumendeIds.push(ersterImport.json().checkoutId);

      const zweiterImportOhneErsetzen = await app.inject({
        method: "POST",
        url: "/turniere/sync-import",
        headers: { authorization: `Bearer ${erstelleInstanz.instanzToken}` },
        payload: { export: exportPaket },
      });
      assert.equal(zweiterImportOhneErsetzen.statusCode, 409);

      // ersetzen=true, aber der erste Import haelt noch ein aktives Checkout -> weiterhin 409
      // (Neu-Verknuepfen ist nur erlaubt, solange kein Checkout aktiv ist).
      const ersetzenMitAktivemCheckout = await app.inject({
        method: "POST",
        url: "/turniere/sync-import",
        headers: { authorization: `Bearer ${erstelleInstanz.instanzToken}` },
        payload: { export: exportPaket, ersetzen: true },
      });
      assert.equal(ersetzenMitAktivemCheckout.statusCode, 409);

      // Checkout freigeben (direkt am Dokument, ohne den session-basierten Freigabe-Endpunkt).
      const aktivesCheckout = await findeAktivesCheckout(importTurnierId);
      await insertDoc({
        ...aktivesCheckout,
        status: "freigegeben",
        freigegebenAm: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // ersetzen=true, kein aktives Checkout mehr, aber weiterhin kein Admin -> 403.
      const ersetzenOhneAdmin = await app.inject({
        method: "POST",
        url: "/turniere/sync-import",
        headers: { authorization: `Bearer ${erstelleInstanz.instanzToken}` },
        payload: { export: exportPaket, ersetzen: true },
      });
      assert.equal(ersetzenOhneAdmin.statusCode, 403);

      // Auf Admin befoerdern -> ersetzen=true jetzt erfolgreich, neues aktives Checkout entsteht.
      const quellBenutzerAktuell = await findById<Benutzer>(quellBenutzerId);
      await insertDoc({ ...(quellBenutzerAktuell as Benutzer), globaleRolle: "admin" });
      const ersetzenAlsAdmin = await app.inject({
        method: "POST",
        url: "/turniere/sync-import",
        headers: { authorization: `Bearer ${erstelleInstanz.instanzToken}` },
        payload: { export: exportPaket, ersetzen: true },
      });
      assert.equal(ersetzenAlsAdmin.statusCode, 200);
      assert.ok(ersetzenAlsAdmin.json().checkoutId);
      aufzuraeumendeIds.push(ersetzenAlsAdmin.json().checkoutId);
    } finally {
      for (const id of aufzuraeumendeIds) {
        const doc = await findById(id);
        if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
      }
      await app.close();
    }
  },
);

test(
  "Ausgechecktes Turnier ist auch ausserhalb von routes/turnierSync.ts schreibgeschuetzt (PUT /turniere/:id -> 409)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { erstelleSession } = await import("../auth/session");
    const { insertDoc, newId, findById, deleteDoc } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierRoutes);

    const benutzerId = await neuerBenutzer("admin");
    const turnierId = await neuesTurnier(benutzerId);
    const { token: sessionToken } = await erstelleSession(benutzerId);
    const cookie = `torball_session=${sessionToken}`;

    const checkoutId = newId("turnierCheckout");
    await insertDoc({
      _id: checkoutId,
      docType: "turnierCheckout",
      checkoutId,
      turnierId,
      instanzId: "verbundeneInstanz:irrelevant",
      status: "aktiv",
      stammdatenMitnehmen: false,
      angefordertAm: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const aufzuraeumendeIds = [benutzerId, turnierId, checkoutId];
    try {
      const versuch = await app.inject({
        method: "PUT",
        url: `/turniere/${turnierId}`,
        headers: { cookie },
        payload: { name: "Waehrend Checkout umbenannt" },
      });
      assert.equal(versuch.statusCode, 409);
      assert.match(versuch.json().error, /lokalen Installation/);

      const turnierUnveraendert = (await findById(turnierId)) as { name: string };
      assert.equal(turnierUnveraendert.name, "Sync-Test-Turnier");

      // Nach Freigabe wieder normal aenderbar.
      const checkout = await findById(checkoutId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await insertDoc({ ...(checkout as object), status: "freigegeben" } as any);
      const versuchNachFreigabe = await app.inject({
        method: "PUT",
        url: `/turniere/${turnierId}`,
        headers: { cookie },
        payload: { name: "Nach Freigabe umbenannt" },
      });
      assert.equal(versuchNachFreigabe.statusCode, 200);
    } finally {
      for (const id of aufzuraeumendeIds) {
        const doc = await findById(id);
        if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
      }
      await app.close();
    }
  },
);

/** Hilfsfunktion: legt eine VerbundeneInstanz direkt an (ohne den Kopplungscode-Umweg), fuer
 *  Tests, die nur den fertig gekoppelten Zustand brauchen. */
async function erstelleTestInstanz(benutzerId: string) {
  const { insertDoc, newId } = await import("../repository");
  const { erzeugeToken } = await import("../auth/token");
  const { token, hash } = erzeugeToken();
  const instanzId = newId("verbundeneInstanz");
  await insertDoc({
    _id: instanzId,
    docType: "verbundeneInstanz",
    instanzId,
    benutzerId,
    instanzTokenHash: hash,
    erstelltAm: new Date().toISOString(),
    widerrufen: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { erstelleInstanz: { instanzId, instanzToken: token } };
}

test(
  "Check-in: vollstaendige Turnierdaten-Uebertragung ueberschreibt den Server-Stand eines aktiv " +
    "ausgecheckten Turniers, ignoriert aber Turniere ohne aktiven Checkout dieser Instanz",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const { instanzSyncRoutes } = await import("./instanzSync");
    const { findById, insertDoc, deleteDoc, newId } = await import("../repository");

    const app = Fastify();
    await app.register(instanzSyncRoutes);

    const benutzerId = await neuerBenutzer("admin");
    const turnierId = await neuesTurnier(benutzerId);
    const fremdesTurnierId = await neuesTurnier(benutzerId); // kein Checkout dafuer - muss unberuehrt bleiben

    const { erstelleInstanz } = await erstelleTestInstanz(benutzerId);
    const checkoutId = newId("turnierCheckout");
    await insertDoc({
      _id: checkoutId,
      docType: "turnierCheckout",
      checkoutId,
      turnierId,
      instanzId: erstelleInstanz.instanzId,
      status: "aktiv",
      stammdatenMitnehmen: false,
      angefordertAm: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const aufzuraeumendeIds = [benutzerId, turnierId, fremdesTurnierId, erstelleInstanz.instanzId, checkoutId];
    try {
      const bestehendesTurnier = await findById(turnierId);
      const geaendertesExportPaket = {
        turnier: { ...(bestehendesTurnier as object), name: "Nach Check-in umbenannt", spielzeitMinuten: 7 },
        mannschaften: [],
        spieler: [],
        spiele: [],
        schiedsrichter: [],
        vereine: [],
        teams: [],
        wettbewerb: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      // Auch ein Paket fuer ein Turnier OHNE aktiven Checkout dieser Instanz mitschicken - darf
      // serverseitig ignoriert werden (Sicherheitscheck: keine Instanz darf ein fremdes/nicht
      // ausgechecktes Turnier ueberschreiben).
      const fremdesExportPaket = {
        ...geaendertesExportPaket,
        turnier: { ...geaendertesExportPaket.turnier, _id: fremdesTurnierId, name: "Sollte nie ankommen" },
      };

      const checkin = await app.inject({
        method: "POST",
        url: "/instanzen/checkin",
        headers: { authorization: `Bearer ${erstelleInstanz.instanzToken}` },
        payload: {
          vollstaendigeUebertragung: [
            { turnierId, export: geaendertesExportPaket },
            { turnierId: fremdesTurnierId, export: fremdesExportPaket },
          ],
        },
      });
      assert.equal(checkin.statusCode, 200);

      const turnierNachher = (await findById(turnierId)) as { name: string; spielzeitMinuten: number };
      assert.equal(turnierNachher.name, "Nach Check-in umbenannt");
      assert.equal(turnierNachher.spielzeitMinuten, 7);

      const fremdesTurnierNachher = (await findById(fremdesTurnierId)) as { name: string };
      assert.equal(fremdesTurnierNachher.name, "Sync-Test-Turnier", "unveraendert, da kein aktiver Checkout");
    } finally {
      for (const id of aufzuraeumendeIds) {
        const doc = await findById(id);
        if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
      }
      await app.close();
    }
  },
);

test(
  "Download anfordern/Freigabe aufheben: Checkout-Status-Uebergaenge, kein doppelter aktiver Checkout",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierSyncRoutes } = await import("./turnierSync");
    const { erstelleSession } = await import("../auth/session");
    const { insertDoc, newId, findById, deleteDoc } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierSyncRoutes);

    const benutzerId = await neuerBenutzer("admin");
    const turnierId = await neuesTurnier(benutzerId);
    const { token: sessionToken } = await erstelleSession(benutzerId);
    const cookie = `torball_session=${sessionToken}`;

    const instanzId = newId("verbundeneInstanz");
    await insertDoc({
      _id: instanzId,
      docType: "verbundeneInstanz",
      instanzId,
      benutzerId,
      instanzTokenHash: "irrelevant-fuer-diesen-test",
      erstelltAm: new Date().toISOString(),
      widerrufen: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const aufzuraeumendeIds = [benutzerId, turnierId, instanzId];
    try {
      const anfordern = await app.inject({
        method: "POST",
        url: `/turniere/${turnierId}/download-anfordern`,
        headers: { cookie },
        payload: { instanzId, stammdatenMitnehmen: false },
      });
      assert.equal(anfordern.statusCode, 201);
      aufzuraeumendeIds.push(anfordern.json()._id);

      const statusAngefordert = await app.inject({
        method: "GET",
        url: `/turniere/${turnierId}/checkout-status`,
        headers: { cookie },
      });
      assert.equal(statusAngefordert.json().ausgecheckt, true);
      assert.equal(statusAngefordert.json().status, "angefordert");

      const zweiterAnfordern = await app.inject({
        method: "POST",
        url: `/turniere/${turnierId}/download-anfordern`,
        headers: { cookie },
        payload: { instanzId, stammdatenMitnehmen: false },
      });
      assert.equal(zweiterAnfordern.statusCode, 409);

      const freigeben = await app.inject({
        method: "POST",
        url: `/turniere/${turnierId}/checkout-freigeben`,
        headers: { cookie },
      });
      assert.equal(freigeben.statusCode, 204);

      const statusDanach = await app.inject({
        method: "GET",
        url: `/turniere/${turnierId}/checkout-status`,
        headers: { cookie },
      });
      assert.equal(statusDanach.json().ausgecheckt, false);
    } finally {
      for (const id of aufzuraeumendeIds) {
        const doc = await findById(id);
        if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
      }
      await app.close();
    }
  },
);

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Brute-Force-Schutz (Login-Sperre nach 10 Fehlversuchen) + Passwort-Reset-Interaktion. Wie die
 * anderen Integrationstests in diesem Projekt laeuft das gegen die echte CouchDB-Dev-Instanz und
 * wird per Dynamic Import + Skip-Guard nur ausgefuehrt, wenn die COUCHDB_*-Umgebungsvariablen
 * gesetzt sind (siehe turnier-delete.integration.test.ts).
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const TEST_PASSWORT = "TestPasswort!42";
const NEUES_PASSWORT = "NeuesPasswort!99";

async function neuerBenutzer(globaleRolle: "admin" | "manager" | "benutzer" = "benutzer") {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const benutzerId = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: benutzerId,
    docType: "benutzer",
    benutzerId,
    email: `${benutzerId}@example.invalid`,
    passwortHash: await hashePasswort(TEST_PASSWORT),
    name: "Test-Benutzer",
    globaleRolle,
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return benutzerId;
}

async function aufraeumen(ids: string[]) {
  const { findById, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const doc = await findById(id);
    if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
  }
}

test(
  "Login: nach 10 falschen Passwoertern wird der Account automatisch gesperrt (gesperrtGrund fehlversuche)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const { authRoutes } = await import("./auth");
    const { findById } = await import("../repository");

    const app = Fastify();
    await app.register(authRoutes);

    const benutzerId = await neuerBenutzer();
    try {
      for (let i = 0; i < 10; i++) {
        const antwort = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: `${benutzerId}@example.invalid`, passwort: "falsches-passwort" },
        });
        assert.equal(antwort.statusCode, 401, `Versuch ${i + 1} sollte 401 liefern`);
      }

      const benutzerNachher = await findById<Benutzer>(benutzerId);
      assert.equal(benutzerNachher!.gesperrt, true);
      assert.equal(benutzerNachher!.gesperrtGrund, "fehlversuche");
      assert.equal(benutzerNachher!.fehlgeschlageneLoginVersuche, 10);

      // Selbst mit dem RICHTIGEN Passwort jetzt 403 statt eines erfolgreichen Logins.
      const versuchMitRichtigemPasswort = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: `${benutzerId}@example.invalid`, passwort: TEST_PASSWORT },
      });
      assert.equal(versuchMitRichtigemPasswort.statusCode, 403);
    } finally {
      await aufraeumen([benutzerId]);
      await app.close();
    }
  },
);

test(
  "Login: ein erfolgreicher Login setzt den Fehlversuche-Zaehler zurueck",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authRoutes } = await import("./auth");
    const { findById } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    await app.register(authRoutes);

    const benutzerId = await neuerBenutzer();
    try {
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: `${benutzerId}@example.invalid`, passwort: "falsches-passwort" },
        });
      }
      const zwischenstand = await findById<Benutzer>(benutzerId);
      assert.equal(zwischenstand!.fehlgeschlageneLoginVersuche, 3);

      const erfolgreich = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: `${benutzerId}@example.invalid`, passwort: TEST_PASSWORT },
      });
      assert.equal(erfolgreich.statusCode, 200);

      const danach = await findById<Benutzer>(benutzerId);
      assert.equal(danach!.fehlgeschlageneLoginVersuche, 0);
    } finally {
      await aufraeumen([benutzerId]);
      await app.close();
    }
  },
);

test(
  "Passwort-Reset hebt eine Fehlversuche-Sperre auf, aber NIE eine manuelle Admin-Sperre",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const { benutzerRoutes } = await import("./benutzer");
    const { insertDoc, findById } = await import("../repository");
    const { erzeugeToken, hashe } = await import("../auth/token");

    const app = Fastify();
    await app.register(benutzerRoutes);

    const fehlversucheId = await neuerBenutzer();
    const manuellId = await neuerBenutzer();
    try {
      const fehlversucheToken = erzeugeToken();
      const fehlversucheBenutzer = await findById<Benutzer>(fehlversucheId);
      await insertDoc<Benutzer>({
        ...fehlversucheBenutzer!,
        gesperrt: true,
        gesperrtGrund: "fehlversuche",
        fehlgeschlageneLoginVersuche: 10,
        resetTokenHash: fehlversucheToken.hash,
        resetAblauf: new Date(Date.now() + 60_000).toISOString(),
      });

      const manuellToken = erzeugeToken();
      const manuellBenutzer = await findById<Benutzer>(manuellId);
      await insertDoc<Benutzer>({
        ...manuellBenutzer!,
        gesperrt: true,
        gesperrtGrund: "manuell",
        resetTokenHash: manuellToken.hash,
        resetAblauf: new Date(Date.now() + 60_000).toISOString(),
      });

      const resetFehlversuche = await app.inject({
        method: "POST",
        url: `/benutzer/passwort-reset/${fehlversucheToken.token}`,
        payload: { neuesPasswort: NEUES_PASSWORT },
      });
      assert.equal(resetFehlversuche.statusCode, 200);
      const fehlversucheDanach = await findById<Benutzer>(fehlversucheId);
      assert.equal(fehlversucheDanach!.gesperrt, false, "Fehlversuche-Sperre haette aufgehoben werden muessen");
      assert.equal(fehlversucheDanach!.gesperrtGrund, undefined);
      assert.equal(fehlversucheDanach!.fehlgeschlageneLoginVersuche, 0);

      const resetManuell = await app.inject({
        method: "POST",
        url: `/benutzer/passwort-reset/${manuellToken.token}`,
        payload: { neuesPasswort: NEUES_PASSWORT },
      });
      assert.equal(resetManuell.statusCode, 200, "Passwort selbst darf trotzdem geaendert werden");
      const manuellDanach = await findById<Benutzer>(manuellId);
      assert.equal(manuellDanach!.gesperrt, true, "Manuelle Sperre darf NICHT aufgehoben werden");
      assert.equal(manuellDanach!.gesperrtGrund, "manuell");
    } finally {
      await aufraeumen([fehlversucheId, manuellId]);
      await app.close();
    }
  },
);

test(
  "Admin-ausgeloester Passwort-Reset + PUT /benutzer/:id setzen gesperrtGrund serverseitig konsistent",
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

    const adminId = await neuerBenutzer("admin");
    const zielId = await neuerBenutzer();
    const { token: sessionToken } = await erstelleSession(adminId);
    const cookie = `torball_session=${sessionToken}`;

    try {
      // Admin-ausgeloester Reset: liefert entweder direkt einen Token (kein Mailversand
      // konfiguriert/erreichbar) oder bestaetigt nur den E-Mail-Versand.
      const ausgeloest = await app.inject({
        method: "POST",
        url: `/benutzer/${zielId}/passwort-reset-ausloesen`,
        headers: { cookie },
      });
      assert.equal(ausgeloest.statusCode, 200);
      const body = ausgeloest.json();
      assert.ok(body.email);
      if (body.resetToken) {
        const abgeschlossen = await app.inject({
          method: "POST",
          url: `/benutzer/passwort-reset/${body.resetToken}`,
          payload: { neuesPasswort: NEUES_PASSWORT },
        });
        assert.equal(abgeschlossen.statusCode, 200);
      }

      // PUT gesperrt:true setzt gesperrtGrund server-seitig auf "manuell", nie vom Client uebernommen.
      const gesperrt = await app.inject({
        method: "PUT",
        url: `/benutzer/${zielId}`,
        headers: { cookie },
        payload: { gesperrt: true },
      });
      assert.equal(gesperrt.statusCode, 200);
      assert.equal(gesperrt.json().gesperrtGrund, "manuell");

      // Vorher ein paar Fehlversuche simulieren, damit das Zuruecksetzen beim Entsperren pruefbar ist.
      const vorEntsperren = await findById<Benutzer>(zielId);
      const { insertDoc } = await import("../repository");
      await insertDoc<Benutzer>({ ...vorEntsperren!, fehlgeschlageneLoginVersuche: 7 });

      const entsperrt = await app.inject({
        method: "PUT",
        url: `/benutzer/${zielId}`,
        headers: { cookie },
        payload: { gesperrt: false },
      });
      assert.equal(entsperrt.statusCode, 200);
      assert.equal(entsperrt.json().gesperrtGrund, undefined);
      const danach = await findById<Benutzer>(zielId);
      assert.equal(danach!.fehlgeschlageneLoginVersuche, 0);
    } finally {
      await aufraeumen([adminId, zielId]);
      await app.close();
    }
  },
);

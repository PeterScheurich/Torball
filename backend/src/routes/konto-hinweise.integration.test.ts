import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Sicherheitsentscheidung 02.11.2026: (A2) Den Reset-Link in der Antwort bekommt nur ein Admin - ein
 * Manager koennte damit ein Konto uebernehmen; ohne Mailversand muss er einen Admin bitten. (A3) Wer eine
 * sicherheitsrelevante Aenderung an seinem Konto nicht selbst vorgenommen hat, erfaehrt es als Hinweis am
 * Konto (zweiter Weg neben der Mail, funktioniert auch ohne Mailversand). Laeuft gegen die echte
 * CouchDB-Testdatenbank, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const ALTES_PASSWORT = "Halle-Dienstag-Test-77";
const NEUES_PASSWORT = "Dienstag-Halle-Baum-Sieben";
const NOCH_NEUERES_PASSWORT = "Mittwoch-Wiese-Fluss-Acht";

async function neuesKonto(name: string, rolle: "admin" | "manager" | "benutzer", extra: Partial<Benutzer> = {}) {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    passwortHash: await hashePasswort(ALTES_PASSWORT),
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
  "Reset-Link nur an Admins; Aenderungen am Konto erscheinen als Hinweis (Passwort-Reset, Link, Rolle, Selbstaenderung)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async (t) => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { benutzerRoutes } = await import("./benutzer");
    const { erstelleSession } = await import("../auth/session");
    const { findById } = await import("../repository");
    const { aktuelleSystemeinstellungen, smtpVerbindungAus } = await import("../systemeinstellungen");

    if (smtpVerbindungAus(await aktuelleSystemeinstellungen())) {
      t.skip("In dieser Datenbank ist ein Mailversand eingerichtet - der Test setzt keinen voraus und verschickt keine Mails.");
      return;
    }

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(benutzerRoutes);

    const admin = await neuesKonto("Admintest", "admin", { vorname: "Ada" });
    const manager = await neuesKonto("Managertest", "manager");
    const ziel = await neuesKonto("Zielkonto", "benutzer", { erstelltVon: manager });
    const cookie = async (id: string) => `torball_session=${(await erstelleSession(id)).token}`;
    const [adminC, managerC] = [await cookie(admin), await cookie(manager)];
    const hinweise = async () => (await findById<Benutzer>(ziel, "benutzer"))!.kontoHinweise ?? [];

    try {
      // --- A2: Manager ohne Mailversand bekommt KEINEN Link, und es entsteht auch kein gueltiger Token
      const abgelehnt = await app.inject({
        method: "POST",
        url: `/benutzer/${ziel}/passwort-reset-ausloesen`,
        headers: { cookie: managerC },
      });
      assert.equal(abgelehnt.statusCode, 409);
      assert.ok(!abgelehnt.body.includes("resetToken"));
      assert.equal((await findById<Benutzer>(ziel, "benutzer"))!.resetTokenHash, undefined, "kein Token angelegt");
      assert.equal((await hinweise()).length, 0, "ein abgelehnter Reset hinterlaesst keinen Hinweis");

      // --- Admin bekommt den Link und der Zielperson wird der Reset gemeldet
      const ausgeloest = await app.inject({
        method: "POST",
        url: `/benutzer/${ziel}/passwort-reset-ausloesen`,
        headers: { cookie: adminC },
      });
      assert.equal(ausgeloest.statusCode, 200);
      const { resetToken } = ausgeloest.json() as { resetToken?: string };
      assert.ok(resetToken, "ein Admin bekommt den Link");
      let h = await hinweise();
      assert.equal(h.length, 1);
      assert.equal(h[0]!.art, "passwort-zuruecksetzen-ausgeloest");
      assert.equal(h[0]!.durch, "Ada Admintest");
      assert.equal(h[0]!.gelesen, false);

      // --- Passwort ueber den Link gesetzt: gemeldet, und NICHT als "selbst bestaetigt"
      const gesetzt = await app.inject({
        method: "POST",
        url: `/benutzer/passwort-reset/${resetToken}`,
        payload: { neuesPasswort: NEUES_PASSWORT },
      });
      assert.equal(gesetzt.statusCode, 200);
      h = await hinweise();
      assert.equal(h.length, 2);
      assert.equal(h[1]!.art, "passwort-geaendert");
      assert.equal(h[1]!.gelesen, false);

      // --- Rolle durch einen Admin geaendert
      const rolle = await app.inject({
        method: "PUT",
        url: `/benutzer/${ziel}`,
        headers: { cookie: adminC },
        payload: { globaleRolle: "manager" },
      });
      assert.equal(rolle.statusCode, 200);
      assert.ok(!rolle.body.includes("kontoHinweise"), "die Antwort fuer eine andere Person enthaelt keine Hinweise");
      h = await hinweise();
      assert.equal(h.at(-1)!.art, "rolle-geaendert");
      assert.equal(h.at(-1)!.durch, "Ada Admintest");
      assert.match(h.at(-1)!.detail ?? "", /Manager/);

      // --- Der Admin sieht in der Benutzerliste keine fremden Hinweise
      const liste = await app.inject({ method: "GET", url: "/benutzer", headers: { cookie: adminC } });
      assert.ok(!liste.body.includes("kontoHinweise"));

      // --- Die Person selbst: aendert ihr Passwort (sofort "gelesen"), bestaetigt dann die uebrigen
      const zielC = await cookie(ziel);
      const eigenesPasswort = await app.inject({
        method: "PUT",
        url: "/benutzer/mich/passwort",
        headers: { cookie: zielC },
        payload: { aktuellesPasswort: NEUES_PASSWORT, neuesPasswort: NOCH_NEUERES_PASSWORT },
      });
      assert.equal(eigenesPasswort.statusCode, 200);
      h = await hinweise();
      assert.equal(h.at(-1)!.art, "passwort-geaendert");
      assert.equal(h.at(-1)!.gelesen, true, "eine Aenderung durch die Person selbst draengt sich nicht auf");
      assert.equal(h.filter((x) => !x.gelesen).length, 3, "die drei Aenderungen durch andere warten auf Bestaetigung");

      const gelesen = await app.inject({
        method: "POST",
        url: "/benutzer/mich/hinweise/gelesen",
        headers: { cookie: zielC },
      });
      assert.equal(gelesen.statusCode, 200);
      assert.equal(((gelesen.json() as Benutzer).kontoHinweise ?? []).filter((x) => !x.gelesen).length, 0);
      assert.equal((await hinweise()).length, 4, "bestaetigte Hinweise bleiben in der Liste stehen");
    } finally {
      await aufraeumen([admin, manager, ziel]);
      await app.close();
    }
  },
);

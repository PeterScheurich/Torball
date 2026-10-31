import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Turnier, TurnierBerechtigung } from "@torball/shared";

/**
 * Turnier-Code-Hashes duerfen nie in einer Antwort stehen (OWASP-Durchgang A01/A04, 2026-10-31):
 * `GET /turniere` und `GET /turniere/:id` lieferten das komplette Dokument - samt der bcrypt-Hashes
 * der drei Turnier-Codes - an JEDEN mit Lesezugriff (Lese-Freigabe, Protokollant-/Spielleitung-Code,
 * `zugriffFuerAlleBenutzer`). Die Codes sind von Menschen gewaehlt und teils kurz: Wer den Hash des
 * Turnierleitung-Codes sah, konnte ihn ohne jede Drosselung offline knacken und hatte Vollzugriff.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuerBenutzer(name: string, rolle: "admin" | "manager" | "benutzer"): Promise<string> {
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
    const doc = await findByIdUngeprueft(id);
    if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
  }
}

test(
  "Turnier-Antworten enthalten keine Code-Hashes - auch nicht fuer reine Leser",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { erstelleSession } = await import("../auth/session");
    const { insertDoc, newId } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierRoutes);

    const adminId = await neuerBenutzer("Admin", "admin");
    const leserId = await neuerBenutzer("Leser", "benutzer");
    const adminCookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const leserCookie = `torball_session=${(await erstelleSession(leserId)).token}`;

    const turnierId = newId("turnier");
    await insertDoc<Turnier>({
      _id: turnierId,
      docType: "turnier",
      turnierId,
      name: "Code-Hash-Test",
      datum: "2026-10-31",
      startzeit: "09:00",
      status: "entwurf",
      felder: [],
      protokollierungsart: "manuell",
      spielplanModus: "einfach",
      erstelltVon: adminId,
      erstelltVonName: "Admin",
      erstelltAm: new Date().toISOString(),
      turnierleitungCodeHash: "$2b$12$turnierleitungHashTurnierleitungHashTurnierleit",
      spielleitungCodeHash: "$2b$12$spielleitungHashSpielleitungHashSpielleitungHash",
      protokollantCodeHash: "$2b$12$protokollantHashProtokollantHashProtokollantHash",
    } as unknown as Turnier);
    const berechtigungId = newId("turnierBerechtigung");
    await insertDoc<TurnierBerechtigung>({
      _id: berechtigungId,
      docType: "turnierBerechtigung",
      berechtigungId,
      turnierId,
      benutzerId: leserId,
      rolle: "lesen",
      vergebenAm: new Date().toISOString(),
    } as unknown as TurnierBerechtigung);

    const pruefe = (name: string, body: string) => {
      assert.ok(!/CodeHash/.test(body), `${name}: enthaelt ein ...CodeHash-Feld`);
      assert.ok(!body.includes("$2b$12$"), `${name}: enthaelt einen bcrypt-Hash`);
    };

    try {
      const einzeln = await app.inject({ method: "GET", url: `/turniere/${turnierId}`, headers: { cookie: leserCookie } });
      assert.equal(einzeln.statusCode, 200);
      assert.equal((einzeln.json() as Turnier).name, "Code-Hash-Test", "das Turnier selbst muss noch lesbar sein");
      pruefe("GET /turniere/:id (Leser)", einzeln.body);

      const liste = await app.inject({ method: "GET", url: "/turniere", headers: { cookie: leserCookie } });
      assert.equal(liste.statusCode, 200);
      assert.ok((liste.json() as Turnier[]).some((t) => t._id === turnierId), "das Turnier muss in der Liste sein");
      pruefe("GET /turniere (Leser)", liste.body);

      // Auch die Antworten der SCHREIBENDEN Routen (volle Stufe) liefern sie nicht mehr aus.
      const aendern = await app.inject({
        method: "PUT",
        url: `/turniere/${turnierId}`,
        headers: { cookie: adminCookie },
        payload: { name: "Code-Hash-Test (umbenannt)" },
      });
      assert.equal(aendern.statusCode, 200);
      pruefe("PUT /turniere/:id (Admin)", aendern.body);

      // Die Hashes bleiben aber IN DER DATENBANK - sonst waere die Code-Anmeldung kaputt.
      const { findById } = await import("../repository");
      const gespeichert = await findById<Turnier>(turnierId, "turnier");
      assert.ok(gespeichert?.turnierleitungCodeHash, "der Hash muss weiter gespeichert sein");
      assert.ok(gespeichert?.protokollantCodeHash, "der Hash muss weiter gespeichert sein");
    } finally {
      await aufraeumen([berechtigungId, turnierId, adminId, leserId]);
      await app.close();
    }
  },
);

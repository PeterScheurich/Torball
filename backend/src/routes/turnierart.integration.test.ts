import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, SchiedsrichterImTurnier, Turnier } from "@torball/shared";

/**
 * Turnierart national/international (Tester-Rueckmeldung 2026-10-06, Auftraggeber-Entscheidung
 * 2026-10-31): Das Regelprofil legt beim Anlegen Voreinstellungen ueber die Standardregeln
 * (Nichtantreten 5:0 statt 3:0) und zieht sie beim Wechsel nach - aber nur, solange sie nicht von
 * Hand geaendert wurden. Laeuft gegen die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
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
    passwortHash: await hashePasswort("Halle-Dienstag-Test-77"),
    name: "Admin",
    globaleRolle: "admin",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

async function aufraeumen(ids: string[]) {
  const { findByIdUngeprueft, deleteDoc, findAllBySelector } = await import("../repository");
  for (const id of ids) {
    // zu einem angelegten Turnier gehoert die automatisch erzeugte Turnierleitung (Schiedsrichter)
    for (const sr of await findAllBySelector<SchiedsrichterImTurnier>({
      docType: "schiedsrichterImTurnier",
      turnierId: id,
    })) {
      await deleteDoc(sr._id, sr._rev!);
    }
    const d = await findByIdUngeprueft(id);
    if (d) await deleteDoc(id, (d as { _rev: string })._rev);
  }
}

test(
  "Turnierart: Regelprofil beim Anlegen, Nachziehen beim Wechsel, Handarbeit bleibt erhalten",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { erstelleSession } = await import("../auth/session");
    const { aktuelleTurnierregeln } = await import("../konfiguration");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierRoutes);

    const adminId = await neuerAdmin();
    const cookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const standardForfait = (await aktuelleTurnierregeln()).regeln.forfaitErgebnis;
    const angelegt: string[] = [];
    const anlegen = async (extra: object = {}) => {
      const antwort = await app.inject({
        method: "POST",
        url: "/turniere",
        headers: { cookie },
        payload: { name: "Turnierart-Test", datum: "2026-10-31", startzeit: "09:00", ...extra },
      });
      assert.equal(antwort.statusCode, 201);
      const t = antwort.json() as Turnier;
      angelegt.push(t._id);
      return t;
    };
    const aendern = (id: string, payload: object) =>
      app.inject({ method: "PUT", url: `/turniere/${id}`, headers: { cookie }, payload });

    try {
      // Anlegen: ohne Angabe national = Standardregeln; international = Profil.
      const national = await anlegen();
      assert.equal(national.forfaitErgebnis, standardForfait, "national: Standardregel bleibt");
      const international = await anlegen({ turnierart: "international" });
      assert.equal(international.turnierart, "international");
      assert.equal(international.forfaitErgebnis, "5:0", "international: Nichtantreten 5:0");

      // Eine ausdrueckliche Angabe im Body schlaegt das Profil.
      const ausdruecklich = await anlegen({ turnierart: "international", forfaitErgebnis: "4:0" });
      assert.equal(ausdruecklich.forfaitErgebnis, "4:0");

      // Wechsel national -> international zieht den (unveraenderten) Standard nach ...
      const nachInternational = await aendern(national._id, { turnierart: "international" });
      assert.equal(nachInternational.statusCode, 200);
      assert.equal((nachInternational.json() as Turnier).forfaitErgebnis, "5:0");
      // ... und zurueck auf den Standard.
      const zurueck = await aendern(national._id, { turnierart: "national" });
      assert.equal((zurueck.json() as Turnier).forfaitErgebnis, standardForfait);

      // Von Hand geaenderte Regel bleibt beim Wechsel unangetastet.
      const handarbeit = await anlegen();
      await aendern(handarbeit._id, { forfaitErgebnis: "2:0" });
      const wechsel = await aendern(handarbeit._id, { turnierart: "international" });
      assert.equal((wechsel.json() as Turnier).forfaitErgebnis, "2:0", "eine Handarbeit wird nicht ueberschrieben");

      // Unbekannte Werte werden abgelehnt (beim Anlegen vom Schema, beim Aendern vom Handler).
      const ungueltigAnlegen = await app.inject({
        method: "POST",
        url: "/turniere",
        headers: { cookie },
        payload: { name: "x", datum: "2026-10-31", startzeit: "09:00", turnierart: "galaktisch" },
      });
      assert.equal(ungueltigAnlegen.statusCode, 400);
      assert.equal((await aendern(national._id, { turnierart: "galaktisch" })).statusCode, 400);

      // Altbestand ohne das Feld gilt als national.
      const { findById, insertDoc } = await import("../repository");
      const altbestand = (await findById<Turnier>(national._id, "turnier"))!;
      const ohneFeld = { ...altbestand } as Partial<Turnier>;
      delete ohneFeld.turnierart;
      await insertDoc(ohneFeld as Turnier);
      const nachAlt = await aendern(national._id, { turnierart: "international" });
      assert.equal((nachAlt.json() as Turnier).forfaitErgebnis, "5:0", "ohne Feld = national: Wechsel zieht nach");
    } finally {
      await aufraeumen([...angelegt, adminId]);
      await app.close();
    }
  },
);

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, Turnier } from "@torball/shared";

/**
 * Freigabe-Suche (Datenschutz-Hinweis eines Testers, 2026-10-06): Eine Person wird ueber ihre
 * GENAUE E-Mail-Adresse gefunden und gibt nur ID und Namen preis - keine Liste, keine Teilsuche,
 * keine weiteren Profilfelder. Laeuft gegen die echte CouchDB-Dev-Instanz, Skip-Guard wie die
 * anderen Integrationstests.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuerBenutzer(
  name: string,
  rolle: "admin" | "manager" | "benutzer",
  extra: Partial<Benutzer> = {},
): Promise<{ id: string; email: string }> {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  const email = `${id}@example.invalid`;
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email,
    passwortHash: await hashePasswort("Halle-Dienstag-Test-77"),
    name,
    globaleRolle: rolle,
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
    ...extra,
  });
  return { id, email };
}

async function neuesTurnier(erstelltVon: string): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const id = newId("turnier");
  await insertDoc<Turnier>({
    _id: id,
    docType: "turnier",
    turnierId: id,
    name: "Freigabe-Suchtest",
    datum: "2026-10-06",
    startzeit: "09:00",
    status: "entwurf",
    felder: [],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    erstelltVon,
    erstelltVonName: "Turnierleiter",
    erstelltAm: new Date().toISOString(),
    // Minimaldokument: die Route braucht nur Existenz + Ersteller; Regelfelder sind hier egal.
  } as unknown as Turnier);
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
  "Freigabe-Suche: genaue Adresse liefert nur ID und Namen, alles andere nicht",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierBerechtigungRoutes } = await import("./turnierBerechtigung");
    const { erstelleSession } = await import("../auth/session");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(turnierBerechtigungRoutes);

    const leiter = await neuerBenutzer("Turnierleiter", "manager");
    const gesucht = await neuerBenutzer("Gesuchte Person", "benutzer", {
      telefon: "0123 4567",
      adresse: "Musterweg 1, Musterstadt",
      vereinVerband: "Beispielverein",
    });
    const gesperrt = await neuerBenutzer("Gesperrte Person", "benutzer", { gesperrt: true });
    const fremder = await neuerBenutzer("Fremde Person ohne Turnierzugriff", "benutzer");
    const turnierId = await neuesTurnier(leiter.id);
    const cookie = `torball_session=${(await erstelleSession(leiter.id)).token}`;
    const fremderCookie = `torball_session=${(await erstelleSession(fremder.id)).token}`;
    const url = `/turniere/${turnierId}/berechtigungen/suche`;
    let berechtigungId: string | undefined;

    try {
      // Treffer: nur benutzerId + name - weder E-Mail noch Telefon/Adresse/Verband.
      const treffer = await app.inject({ method: "POST", url, headers: { cookie }, payload: { email: gesucht.email } });
      assert.equal(treffer.statusCode, 200);
      assert.deepEqual(treffer.json(), { benutzerId: gesucht.id, name: "Gesuchte Person" });

      // Gross-/Kleinschreibung und Leerzeichen am Rand stoeren nicht.
      const anders = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: { email: `  ${gesucht.email.toUpperCase()}  ` },
      });
      assert.equal(anders.statusCode, 200);

      // Keine Teilsuche: ein Adressanfang findet niemanden.
      const teil = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: { email: gesucht.email.slice(0, 12) },
      });
      assert.equal(teil.statusCode, 404);

      // Unbekannte und gesperrte Konten sind nicht auffindbar.
      const unbekannt = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: { email: "gibt-es-nicht@example.invalid" },
      });
      assert.equal(unbekannt.statusCode, 404);
      const gesperrtSuche = await app.inject({
        method: "POST",
        url,
        headers: { cookie },
        payload: { email: gesperrt.email },
      });
      assert.equal(gesperrtSuche.statusCode, 404);

      // Ohne Zugriff auf DIESES Turnier darf niemand suchen (sonst waere es ein offenes Adressbuch).
      const ohneZugriff = await app.inject({
        method: "POST",
        url,
        headers: { cookie: fremderCookie },
        payload: { email: gesucht.email },
      });
      assert.equal(ohneZugriff.statusCode, 403);

      // Ohne Anmeldung ebenso nicht.
      const anonym = await app.inject({ method: "POST", url, payload: { email: gesucht.email } });
      assert.equal(anonym.statusCode, 401);

      // Die Freigabeliste liefert den Namen mit (damit die Oberflaeche keine Benutzerliste braucht)
      // - aber nur den Namen.
      const vergeben = await app.inject({
        method: "POST",
        url: `/turniere/${turnierId}/berechtigungen`,
        headers: { cookie },
        payload: { benutzerId: gesucht.id, rolle: "lesen" },
      });
      assert.equal(vergeben.statusCode, 201);
      berechtigungId = (vergeben.json() as { _id: string })._id;

      const liste = await app.inject({
        method: "GET",
        url: `/turniere/${turnierId}/berechtigungen`,
        headers: { cookie },
      });
      assert.equal(liste.statusCode, 200);
      const eintraege = liste.json() as Array<Record<string, unknown>>;
      assert.equal(eintraege.length, 1);
      assert.equal(eintraege[0].benutzerName, "Gesuchte Person");
      const text = JSON.stringify(eintraege);
      assert.ok(!text.includes(gesucht.email), "die E-Mail-Adresse darf nicht in der Freigabeliste stehen");
      assert.ok(!text.includes("Musterweg"), "die Adresse darf nicht in der Freigabeliste stehen");
    } finally {
      await aufraeumen(
        [berechtigungId, turnierId, leiter.id, gesucht.id, gesperrt.id, fremder.id].filter(Boolean) as string[],
      );
      await app.close();
    }
  },
);

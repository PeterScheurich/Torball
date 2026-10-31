import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Brute-Force-Schutz auch fuer den zweiten Faktor (Sicherheitskarte "2FA-Fehlversuche", 2026-10-31).
 * Vorher zaehlte der Login nur falsche PASSWOERTER: Wer das Passwort kannte, durfte den sechsstelligen
 * Code unbegrenzt raten. Ausserdem war der Zaehler nicht atomar - gleichzeitig gesendete Versuche
 * verschluckten sich gegenseitig, und ein mitgelesener Code liess sich innerhalb seiner 30 Sekunden
 * mehrfach verwenden. Laeuft gegen die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const PASSWORT = "Halle-Dienstag-Test-77";

async function neuesKontoMit2fa(secret: string): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    passwortHash: await hashePasswort(PASSWORT),
    name: "Zwei-Faktor-Test",
    globaleRolle: "benutzer",
    sprache: "de",
    zweiFaAktiv: true,
    zweiFaSecret: secret,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
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

/** Ein Code gilt nur im 30-Sekunden-Fenster - kurz vor dessen Ende lieber auf das naechste warten. */
async function nichtKurzVorFensterEnde() {
  const sekunden = (Date.now() / 1000) % 30;
  if (sekunden > 27) await new Promise((r) => setTimeout(r, (30 - sekunden + 0.5) * 1000));
}

test(
  "2FA: falsche Codes zaehlen und sperren, ein Code gilt nur einmal, parallele Versuche zaehlen alle",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authRoutes } = await import("./auth");
    const { erzeugeTotpSecret } = await import("../auth/totp");
    const { findById, insertDoc } = await import("../repository");
    const { generate } = await import("otplib");

    const app = Fastify();
    await app.register(fastifyCookie);
    await app.register(authRoutes);

    const secret = erzeugeTotpSecret();
    const ids: string[] = [];
    const anmelden = (id: string, extra: object = {}) =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: `${id}@example.invalid`, passwort: PASSWORT, ...extra },
      });
    const zaehler = async (id: string) => (await findById<Benutzer>(id, "benutzer"))!.fehlgeschlageneLoginVersuche ?? 0;

    try {
      // --- 1. Falsche Codes zaehlen; ab der Schwelle gilt die Abkuehlzeit auch fuer den RICHTIGEN Code
      const a = await neuesKontoMit2fa(secret);
      ids.push(a);
      // Ohne Code fragt der Server nur danach und zaehlt nichts (das Passwort stimmt ja).
      const ohneCode = await anmelden(a);
      assert.deepEqual(ohneCode.json(), { benoetigtTotp: true });
      assert.equal(await zaehler(a), 0, "die Frage nach dem Code ist kein Fehlversuch");

      for (let i = 1; i <= 5; i++) {
        const r = await anmelden(a, { totpCode: "000000" });
        assert.equal(r.statusCode, 401, `falscher Code, Versuch ${i}`);
      }
      assert.equal(await zaehler(a), 5, "jeder falsche Code zaehlt");
      const gesperrt = (await findById<Benutzer>(a, "benutzer"))!;
      assert.ok(
        gesperrt.loginKontoGesperrtBis && new Date(gesperrt.loginKontoGesperrtBis).getTime() > Date.now(),
        "nach fuenf falschen Codes beginnt die Abkuehlzeit",
      );
      await nichtKurzVorFensterEnde();
      const richtigerCode = await generate({ secret });
      const waehrendSperre = await anmelden(a, { totpCode: richtigerCode });
      assert.equal(waehrendSperre.statusCode, 401, "waehrend der Abkuehlzeit scheitert selbst der richtige Code");

      // --- 2. Ein Code gilt nur einmal (Wiederverwendungsschutz); danach ist der Zaehler zurueckgesetzt
      const b = await neuesKontoMit2fa(secret);
      ids.push(b);
      await nichtKurzVorFensterEnde();
      const code = await generate({ secret });
      const erster = await anmelden(b, { totpCode: code });
      assert.equal(erster.statusCode, 200, "der richtige Code funktioniert");
      assert.ok(!JSON.stringify(erster.json()).includes("zweiFaLetzterZeitschritt"), "der Zeitschritt verlaesst den Server nicht");
      const zweiter = await anmelden(b, { totpCode: code });
      assert.equal(zweiter.statusCode, 401, "derselbe Code ein zweites Mal wird abgewiesen");
      assert.equal(await zaehler(b), 1, "der Wiederholungsversuch zaehlt als Fehlversuch");

      // Gleichzeitig mit demselben Code: genau EIN Login gelingt.
      const c = await neuesKontoMit2fa(secret);
      ids.push(c);
      await nichtKurzVorFensterEnde();
      const gemeinsamerCode = await generate({ secret });
      const parallel = await Promise.all([1, 2, 3, 4].map(() => anmelden(c, { totpCode: gemeinsamerCode })));
      assert.equal(
        parallel.filter((r) => r.statusCode === 200).length,
        1,
        `genau ein gleichzeitiger Login mit demselben Code darf gelingen (Antworten: ${parallel.map((r) => r.statusCode)})`,
      );

      // --- 3. Gleichzeitige falsche Passwoerter zaehlen ALLE (vorher gingen Versuche verloren)
      const d = await neuesKontoMit2fa(secret);
      ids.push(d);
      const falsch = await Promise.all(
        [1, 2, 3, 4, 5, 6].map(() =>
          app.inject({
            method: "POST",
            url: "/auth/login",
            payload: { email: `${d}@example.invalid`, passwort: "falsches-passwort-xyz" },
          }),
        ),
      );
      assert.ok(falsch.every((r) => r.statusCode === 401));
      assert.equal(await zaehler(d), 6, "alle sechs gleichzeitigen Fehlversuche sind gezaehlt");

      // Ein vollstaendig gelungener Login setzt den Zaehler zurueck (Abkuehlzeit vorher ablaufen lassen).
      const vorher = (await findById<Benutzer>(d, "benutzer"))!;
      await insertDoc<Benutzer>({ ...vorher, loginKontoGesperrtBis: new Date(Date.now() - 1000).toISOString() });
      await nichtKurzVorFensterEnde();
      // Der Code aus Fall 2/3 liegt im selben Fenster - dieses Konto hat ihn noch nicht verbraucht.
      const ok = await anmelden(d, { totpCode: await generate({ secret }) });
      assert.equal(ok.statusCode, 200);
      assert.equal(await zaehler(d), 0, "ein gelungener Login setzt den Zaehler zurueck");
    } finally {
      await aufraeumen(ids);
      await app.close();
    }
  },
);

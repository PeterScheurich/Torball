import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Sensible Aktionen am eigenen Konto verlangen eine erneute Bestaetigung (Sicherheitskarte, OWASP-
 * Durchgang 2026-10-31): Eine gestohlene oder offen gelassene Sitzung darf den zweiten Faktor weder
 * austauschen noch abschalten und kein dauerhaftes Instanz-Token erzeugen koennen. Falsche Eingaben
 * zaehlen auf den Login-Zaehler. Laeuft gegen die echte CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const PASSWORT = "Halle-Dienstag-Test-77";

async function neuesKonto(zweiFa: string | undefined): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    passwortHash: await hashePasswort(PASSWORT),
    name: "Bestaetigungs-Test",
    globaleRolle: "benutzer",
    sprache: "de",
    zweiFaAktiv: zweiFa !== undefined,
    ...(zweiFa !== undefined ? { zweiFaSecret: zweiFa } : {}),
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

async function nichtKurzVorFensterEnde() {
  const sekunden = (Date.now() / 1000) % 30;
  if (sekunden > 27) await new Promise((r) => setTimeout(r, (30 - sekunden + 0.5) * 1000));
}

test(
  "Sensible Konto-Aktionen: 2FA nicht ersetzbar, Deaktivieren und Kopplungscode nur mit Bestaetigung",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { benutzerRoutes } = await import("./benutzer");
    const { erstelleSession } = await import("../auth/session");
    const { erzeugeTotpSecret } = await import("../auth/totp");
    const { findById } = await import("../repository");
    const { generate } = await import("otplib");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(benutzerRoutes);

    const secret = erzeugeTotpSecret();
    const ids: string[] = [];
    const post = async (id: string, url: string, payload: object) =>
      app.inject({
        method: "POST",
        url,
        headers: { cookie: `torball_session=${(await erstelleSession(id)).token}` },
        payload,
      });
    const holeKonto = async (id: string) => (await findById<Benutzer>(id, "benutzer"))!;

    try {
      // --- 2FA aktiv: Neu-Einrichten ueberschreibt den Secret NICHT mehr
      const mit2fa = await neuesKontoMitCleanup(secret, ids);
      const einrichten = await post(mit2fa, "/benutzer/2fa/einrichten", {});
      assert.equal(einrichten.statusCode, 409, "bei aktiver 2FA wird nichts ueberschrieben");
      assert.equal((await holeKonto(mit2fa)).zweiFaSecret, secret, "der bisherige Secret bleibt unveraendert");

      // --- Deaktivieren: Passwort allein genuegt nicht mehr, ein falsches Passwort auch nicht
      const nurPasswort = await post(mit2fa, "/benutzer/2fa/deaktivieren", { passwort: PASSWORT });
      assert.equal(nurPasswort.statusCode, 401, "ohne Code bleibt 2FA aktiv");
      const falschesPasswort = await post(mit2fa, "/benutzer/2fa/deaktivieren", {
        passwort: "falsches-passwort-xyz",
        code: "000000",
      });
      assert.equal(falschesPasswort.statusCode, 401);
      const nachFehlern = await holeKonto(mit2fa);
      assert.equal(nachFehlern.zweiFaAktiv, true, "2FA ist weiter aktiv");
      assert.equal(nachFehlern.fehlgeschlageneLoginVersuche, 2, "beide Fehlversuche zaehlen auf den Login-Zaehler");

      // --- mit Passwort UND richtigem Code klappt es; der Code ist danach verbraucht
      await nichtKurzVorFensterEnde();
      const code = await generate({ secret });
      const ok = await post(mit2fa, "/benutzer/2fa/deaktivieren", { passwort: PASSWORT, code });
      assert.equal(ok.statusCode, 200);
      const danach = await holeKonto(mit2fa);
      assert.equal(danach.zweiFaAktiv, false);
      assert.equal(danach.zweiFaSecret, undefined, "der Secret ist weg");
      assert.ok(!ok.body.includes("zweiFaSecret") && !ok.body.includes("zweiFaLetzterZeitschritt"));
      // Jetzt (2FA aus) darf neu eingerichtet werden.
      assert.equal((await post(mit2fa, "/benutzer/2fa/einrichten", {})).statusCode, 200);

      // --- Kopplungscode: nur mit richtigem Passwort
      const ohne2fa = await neuesKontoMitCleanup(undefined, ids);
      assert.equal((await post(ohne2fa, "/benutzer/mich/instanz-kopplungscode", {})).statusCode, 400, "Passwort fehlt");
      assert.equal(
        (await post(ohne2fa, "/benutzer/mich/instanz-kopplungscode", { passwort: "falsch-falsch-falsch" })).statusCode,
        401,
      );
      assert.equal((await holeKonto(ohne2fa)).instanzKopplungscodeHash, undefined, "kein Code ohne Passwort");
      const kopplung = await post(ohne2fa, "/benutzer/mich/instanz-kopplungscode", { passwort: PASSWORT });
      assert.equal(kopplung.statusCode, 200);
      assert.ok((kopplung.json() as { kopplungscode: string }).kopplungscode, "mit Passwort gibt es den Code");
      assert.ok((await holeKonto(ohne2fa)).instanzKopplungscodeHash, "der Hash wurde gespeichert");

      // --- Ohne 2FA genuegt zum Deaktivieren (nichts aktiv) das Passwort; und der Zaehler sperrt irgendwann
      const raten = await neuesKontoMitCleanup(undefined, ids);
      for (let i = 0; i < 5; i++) {
        assert.equal(
          (await post(raten, "/benutzer/mich/instanz-kopplungscode", { passwort: "falsch-falsch-falsch" })).statusCode,
          401,
        );
      }
      const gesperrt = await post(raten, "/benutzer/mich/instanz-kopplungscode", { passwort: PASSWORT });
      assert.equal(gesperrt.statusCode, 429, "nach fuenf Fehlversuchen gilt die Abkuehlzeit - auch fuer das richtige Passwort");
    } finally {
      await aufraeumen(ids);
      await app.close();
    }
  },
);

async function neuesKontoMitCleanup(zweiFa: string | undefined, ids: string[]): Promise<string> {
  const id = await neuesKonto(zweiFa);
  ids.push(id);
  return id;
}

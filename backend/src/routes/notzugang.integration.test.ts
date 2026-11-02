import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Notzugang fuer Administratoren (Konsolenbefehl `admin:notzugang`, 02.11.2026): ein einmaliger Link, ueber den im Browser
 * ein neues Passwort gewaehlt wird. Geprueft wird der ganze Weg gegen die echte Datenbank: Link erzeugen, ueber die
 * ECHTE Passwort-Zuruecksetzen-Seite einloesen, danach anmelden. Laeuft gegen die CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

const ALT = "Halle-Dienstag-Alter-Zugang-11";
const NEU = "Strand-Montag-Neuer-Zugang-22";

test(
  "Notzugang: Link gilt einmal und nur kurz, beendet Sitzungen, hebt Sperre und (auf Wunsch) 2FA auf, meldet es am Konto",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authRoutes } = await import("./auth");
    const { benutzerRoutes } = await import("./benutzer");
    const { authPreHandler, SESSION_COOKIE_NAME } = await import("../auth/plugin");
    const { erstelleSession } = await import("../auth/session");
    const { erzeugeNotzugang, meldeNotzugang, NOTZUGANG_GUELTIG_MS } = await import("../auth/notzugang");
    const { findById, findByIdUngeprueft, insertDoc, deleteDoc, newId } = await import("../repository");
    const { hashePasswort } = await import("../auth/passwort");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    await app.register(authRoutes);
    await app.register(benutzerRoutes);

    const ids: string[] = [];
    async function neuesKonto(rolle: Benutzer["globaleRolle"], extra: Partial<Benutzer> = {}): Promise<Benutzer> {
      const id = newId("benutzer");
      ids.push(id);
      return insertDoc<Benutzer>({
        _id: id,
        docType: "benutzer",
        benutzerId: id,
        email: `${id}@example.invalid`,
        passwortHash: await hashePasswort(ALT),
        name: "Notzugang-Test",
        globaleRolle: rolle,
        sprache: "de",
        zweiFaAktiv: false,
        gesperrt: false,
        erstelltAm: new Date().toISOString(),
        ...extra,
      } as Benutzer);
    }
    const anmelden = (email: string, passwort: string) =>
      app.inject({ method: "POST", url: "/auth/login", payload: { email, passwort } });

    try {
      // Admin, der sich ausgesperrt hat: Abkuehlzeit nach Fehlversuchen, 2FA mit verlorenem Geraet, eine alte Sitzung
      const admin = await neuesKonto("admin", {
        zweiFaAktiv: true,
        zweiFaSecret: "JBSWY3DPEHPK3PXP",
        fehlgeschlageneLoginVersuche: 7,
        loginKontoGesperrtBis: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      });
      const { token: alteSitzung } = await erstelleSession(admin._id);
      const mitAlterSitzung = () =>
        app.inject({ method: "GET", url: "/auth/me", headers: { cookie: `${SESSION_COOKIE_NAME}=${alteSitzung}` } });
      assert.equal((await mitAlterSitzung()).statusCode, 200);

      // --- 1. Link erzeugen, mit 2FA-Zuruecksetzen
      const vorher = Date.now();
      const e = await erzeugeNotzugang({ email: admin.email, zweiFaZuruecksetzen: true });
      assert.ok(e.ok);
      assert.equal(e.zweiFaZurueckgesetzt, true);
      assert.ok(e.token.length >= 32, "langer Zufallstoken");
      const gueltigFuer = new Date(e.gueltigBis).getTime() - vorher;
      assert.ok(gueltigFuer <= NOTZUGANG_GUELTIG_MS + 5000 && gueltigFuer > NOTZUGANG_GUELTIG_MS - 5000, "60 Minuten, nicht 24 Stunden");
      await meldeNotzugang(e.konto, e.zweiFaZurueckgesetzt);

      // Klartext-Token wird nie gespeichert, nur sein Hash
      const gespeichert = (await findById<Benutzer>(admin._id, "benutzer"))!;
      assert.notEqual(gespeichert.resetTokenHash, e.token);
      assert.equal(gespeichert.zweiFaAktiv, false);
      assert.equal(gespeichert.zweiFaSecret, undefined);

      // --- 2. Den Link ueber die echte Seite einloesen
      assert.equal((await app.inject({ method: "GET", url: `/benutzer/passwort-reset/${e.token}` })).statusCode, 200);
      const zuSchwach = await app.inject({
        method: "POST",
        url: `/benutzer/passwort-reset/${e.token}`,
        payload: { neuesPasswort: "kurz" },
      });
      assert.equal(zuSchwach.statusCode, 400, "die Passwortregeln gelten auch hier");
      const eingeloest = await app.inject({
        method: "POST",
        url: `/benutzer/passwort-reset/${e.token}`,
        payload: { neuesPasswort: NEU },
      });
      assert.equal(eingeloest.statusCode, 200);

      // --- 3. Folgen: neue Anmeldung geht (ohne 2FA, trotz vorheriger Abkuehlzeit), alte Sitzung und alter Link sind tot
      const login = await anmelden(admin.email, NEU);
      assert.equal(login.statusCode, 200, "Anmeldung mit dem neuen Passwort");
      assert.equal((await anmelden(admin.email, ALT)).statusCode, 401, "das alte Passwort gilt nicht mehr");
      assert.equal((await mitAlterSitzung()).statusCode, 401, "alte Sitzungen beendet");
      assert.equal((await app.inject({ method: "GET", url: `/benutzer/passwort-reset/${e.token}` })).statusCode, 404, "Link ist verbraucht");
      assert.equal(
        (await app.inject({ method: "POST", url: `/benutzer/passwort-reset/${e.token}`, payload: { neuesPasswort: NEU + "x" } })).statusCode,
        404,
        "zweites Einloesen scheitert",
      );

      // --- 4. Das Konto bekommt den Hinweis (Banner), und zwar beide Arten
      const nachher = (await findById<Benutzer>(admin._id, "benutzer"))!;
      const arten = (nachher.kontoHinweise ?? []).map((h) => h.art);
      assert.ok(arten.includes("passwort-zuruecksetzen-ausgeloest"));
      assert.ok(arten.includes("zwei-fa-deaktiviert"));
      assert.ok((nachher.kontoHinweise ?? []).some((h) => h.durch?.includes("Notzugang")), "nennt den Notzugang als Ausloeser");

      // --- 5. Ohne --zwei-fa-zuruecksetzen bleibt die 2FA, wie sie ist
      const mitZweiFa = await neuesKonto("admin", { zweiFaAktiv: true, zweiFaSecret: "JBSWY3DPEHPK3PXP" });
      const ohneReset = await erzeugeNotzugang({ email: mitZweiFa.email });
      assert.ok(ohneReset.ok);
      assert.equal(ohneReset.zweiFaZurueckgesetzt, false);
      assert.equal((await findById<Benutzer>(mitZweiFa._id, "benutzer"))!.zweiFaAktiv, true);

      // --- 6. Abgelaufener Link funktioniert nicht mehr
      const abgelaufen = await erzeugeNotzugang({ email: mitZweiFa.email });
      assert.ok(abgelaufen.ok);
      const doc = (await findById<Benutzer>(mitZweiFa._id, "benutzer"))!;
      await insertDoc({ ...doc, resetAblauf: new Date(Date.now() - 1000).toISOString() });
      assert.equal((await app.inject({ method: "GET", url: `/benutzer/passwort-reset/${abgelaufen.token}` })).statusCode, 404);

      // --- 7. Kein Notzugang fuer Nicht-Administratoren, gesperrte Konten oder unbekannte Adressen
      const manager = await neuesKonto("manager");
      const keinAdmin = await erzeugeNotzugang({ email: manager.email });
      assert.equal(keinAdmin.ok, false);
      assert.equal((await findById<Benutzer>(manager._id, "benutzer"))!.resetTokenHash, undefined, "kein Token angelegt");

      const gesperrt = await neuesKonto("admin", { gesperrt: true, gesperrtGrund: "manuell" });
      assert.equal((await erzeugeNotzugang({ email: gesperrt.email })).ok, false);
      assert.equal((await findById<Benutzer>(gesperrt._id, "benutzer"))!.resetTokenHash, undefined);

      assert.equal((await erzeugeNotzugang({ email: "gibt-es-nicht@example.invalid" })).ok, false);
    } finally {
      await app.close();
      const { loescheAlleSessionenVonBenutzer } = await import("../auth/session");
      for (const id of ids) {
        await loescheAlleSessionenVonBenutzer(id);
        const d = await findByIdUngeprueft(id);
        if (d) await deleteDoc(id, (d as { _rev: string })._rev);
      }
    }
  },
);

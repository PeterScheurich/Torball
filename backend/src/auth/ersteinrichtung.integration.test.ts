import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";

/**
 * Die Ersteinrichtung darf bei gleichzeitigen Anfragen nur EIN Admin-Konto erzeugen (Sicherheitskarte,
 * OWASP-Durchgang 2026-10-31). Das Anlegen mit fester ID ist atomar - hier wird belegt, dass genau
 * eine von mehreren gleichzeitigen Anlagen durchkommt. Laeuft gegen die echte CouchDB-Dev-Instanz,
 * Skip-Guard wie die anderen. Die Testdatenbank darf dafuer das feste Erst-Konto noch nicht enthalten.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

test(
  "Ersteinrichtung: von mehreren gleichzeitigen Anlagen gelingt genau eine",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async (t) => {
    const { ERSTES_KONTO_ID, legeErstesKontoAn } = await import("./ersteinrichtung");
    const { findByIdUngeprueft, deleteDoc } = await import("../repository");

    if (await findByIdUngeprueft(ERSTES_KONTO_ID)) {
      t.skip("In dieser Datenbank gibt es das feste Erst-Konto bereits (echte Installation?) - nichts angefasst.");
      return;
    }

    const konto = (n: number): Benutzer => ({
      _id: "wird-ueberschrieben",
      docType: "benutzer",
      benutzerId: "wird-ueberschrieben",
      email: `erstkonto-${n}@example.invalid`,
      name: `Erstkonto ${n}`,
      globaleRolle: "admin",
      sprache: "de",
      zweiFaAktiv: false,
      gesperrt: false,
      erstelltAm: new Date().toISOString(),
    });

    try {
      const ergebnisse = await Promise.all([1, 2, 3, 4, 5].map((n) => legeErstesKontoAn(konto(n))));
      const gelungen = ergebnisse.filter((e) => e !== undefined);
      assert.equal(gelungen.length, 1, "genau eine gleichzeitige Anlage darf gelingen");
      assert.equal(gelungen[0]!._id, ERSTES_KONTO_ID);
      assert.equal(gelungen[0]!.benutzerId, ERSTES_KONTO_ID);
      // Auch ein spaeterer Versuch scheitert, statt das Konto zu ueberschreiben.
      assert.equal(await legeErstesKontoAn(konto(9)), undefined);
    } finally {
      const doc = await findByIdUngeprueft(ERSTES_KONTO_ID);
      if (doc) await deleteDoc(ERSTES_KONTO_ID, (doc as { _rev: string })._rev);
    }
  },
);

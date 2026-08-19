import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Test fuer turnierZugriffsstufe() (Abschnitt 21.2/21.3): drei Zugriffsstufen
 * (lesen/schreiben_spielbetrieb/schreiben_voll), sowohl ueber TurnierBerechtigung-Dokumente
 * (echtes Benutzerkonto) als auch ueber einen Turnier-Code (kein Konto), inklusive des Vorrangs
 * des Codes vor einer evtl. vorhandenen TurnierBerechtigung. Wie beim bestehenden
 * turnier-delete.integration.test.ts importiert diese Datei alles per Dynamic Import erst zur
 * Laufzeit und nur bei konfigurierter CouchDB-Dev-Instanz - schon der (transitive) Import von
 * turnierZugriff.ts zieht repository.ts -> db.ts nach sich, das ohne COUCHDB_*-Umgebungsvariablen
 * beim Modul-Load hart wirft (siehe CLAUDE.md, Tests).
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function testSetup() {
  const { insertDoc, deleteDoc, findById, newId } = await import("../repository");
  const { turnierZugriffsstufe } = await import("./turnierZugriff");

  const turnierId = newId("turnier");
  await insertDoc({
    _id: turnierId,
    docType: "turnier",
    turnierId,
    name: "Zugriffsstufen-Test-Turnier",
    datum: "2026-08-13",
    status: "entwurf",
    felder: [],
    protokollierungsart: "manuell",
    spielzeitMinuten: 5,
    anzahlHalbzeiten: 2,
    pauseMinuten: 2,
    pauseZwischenSpielenMinuten: 10,
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
    erstelltVon: "benutzer:fremd",
    erstelltAm: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const benutzerId = newId("benutzer");
  await insertDoc({
    _id: benutzerId,
    docType: "benutzer",
    benutzerId,
    email: `${benutzerId}@example.invalid`,
    name: "Test-Benutzer",
    globaleRolle: "benutzer",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const aufraeumen = async () => {
    for (const id of [turnierId, benutzerId]) {
      const doc = await findById(id);
      if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
    }
  };

  const turnier = await findById(turnierId);
  const benutzer = await findById(benutzerId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { turnierZugriffsstufe, turnier: turnier as any, benutzer: benutzer as any, aufraeumen, newId, insertDoc };
}

test(
  "Admin hat immer schreiben_voll, auch ohne eigene TurnierBerechtigung",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { turnierZugriffsstufe, turnier, benutzer, aufraeumen } = await testSetup();
    try {
      const admin = { ...benutzer, globaleRolle: "admin" };
      assert.equal(await turnierZugriffsstufe(turnier, { benutzer: admin }), "schreiben_voll");
    } finally {
      await aufraeumen();
    }
  },
);

test(
  "Manager hat schreiben_voll nur auf selbst erstellte Turniere, sonst keinen Zugriff ohne Berechtigung",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { turnierZugriffsstufe, turnier, benutzer, aufraeumen } = await testSetup();
    try {
      const managerEigenesTurnier = { ...benutzer, globaleRolle: "manager", _id: turnier.erstelltVon };
      assert.equal(
        await turnierZugriffsstufe(turnier, { benutzer: managerEigenesTurnier }),
        "schreiben_voll",
        "Manager sollte auf ein selbst erstelltes Turnier vollen Zugriff haben",
      );

      const managerFremdesTurnier = { ...benutzer, globaleRolle: "manager" };
      assert.equal(
        await turnierZugriffsstufe(turnier, { benutzer: managerFremdesTurnier }),
        undefined,
        "Manager sollte ohne TurnierBerechtigung keinen Zugriff auf ein fremdes Turnier haben",
      );
    } finally {
      await aufraeumen();
    }
  },
);

test(
  "TurnierBerechtigung liefert je Rolle die passende Zugriffsstufe (lesen/spielleitung/turnierleitung)",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { turnierZugriffsstufe, turnier, benutzer, aufraeumen, newId, insertDoc } = await testSetup();
    let berechtigungId: string | undefined;
    try {
      const faelle: { rolle: "lesen" | "spielleitung" | "turnierleitung"; erwartet: string }[] = [
        { rolle: "lesen", erwartet: "lesen" },
        { rolle: "spielleitung", erwartet: "schreiben_spielbetrieb" },
        { rolle: "turnierleitung", erwartet: "schreiben_voll" },
      ];

      for (const { rolle, erwartet } of faelle) {
        berechtigungId = newId("turnierBerechtigung");
        await insertDoc({
          _id: berechtigungId,
          docType: "turnierBerechtigung",
          berechtigungId,
          turnierId: turnier._id,
          benutzerId: benutzer._id,
          rolle,
          vergebenAm: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        assert.equal(await turnierZugriffsstufe(turnier, { benutzer }), erwartet, `Rolle "${rolle}"`);

        const { findById, deleteDoc } = await import("../repository");
        const gespeichert = await findById(berechtigungId);
        if (gespeichert) await deleteDoc(berechtigungId, (gespeichert as { _rev: string })._rev);
        berechtigungId = undefined;
      }
    } finally {
      if (berechtigungId) {
        const { findById, deleteDoc } = await import("../repository");
        const gespeichert = await findById(berechtigungId);
        if (gespeichert) await deleteDoc(berechtigungId, (gespeichert as { _rev: string })._rev);
      }
      await aufraeumen();
    }
  },
);

test(
  "Turnier-Code liefert je Rolle die passende Zugriffsstufe, unabhaengig von einem Benutzerkonto",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { turnierZugriffsstufe, turnier, aufraeumen } = await testSetup();
    try {
      assert.equal(
        await turnierZugriffsstufe(turnier, {
          turnierCode: { turnierId: turnier._id, rolle: "spielleitung" },
        }),
        "schreiben_spielbetrieb",
      );
      assert.equal(
        await turnierZugriffsstufe(turnier, {
          turnierCode: { turnierId: turnier._id, rolle: "turnierleitung" },
        }),
        "schreiben_voll",
      );
      // Code fuer ein ANDERES Turnier darf keinen Zugriff auf dieses hier geben.
      assert.equal(
        await turnierZugriffsstufe(turnier, {
          turnierCode: { turnierId: "turnier:ein-anderes", rolle: "turnierleitung" },
        }),
        undefined,
      );
    } finally {
      await aufraeumen();
    }
  },
);

test(
  "turnierAusgecheckt: true bei angefordertem/aktivem Checkout, false ohne bzw. nach Freigabe",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { turnier, aufraeumen, newId, insertDoc } = await testSetup();
    const { turnierAusgecheckt } = await import("./turnierZugriff");
    const { findById, deleteDoc } = await import("../repository");
    const checkoutId = newId("turnierCheckout");
    try {
      assert.equal(await turnierAusgecheckt(turnier._id), false, "ohne Checkout-Dokument");

      await insertDoc({
        _id: checkoutId,
        docType: "turnierCheckout",
        checkoutId,
        turnierId: turnier._id,
        instanzId: "verbundeneInstanz:irrelevant",
        status: "angefordert",
        stammdatenMitnehmen: false,
        angefordertAm: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      assert.equal(await turnierAusgecheckt(turnier._id), true, "Status 'angefordert' zaehlt bereits als ausgecheckt");

      const angefordert = await findById(checkoutId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await insertDoc({ ...(angefordert as object), status: "aktiv" } as any);
      assert.equal(await turnierAusgecheckt(turnier._id), true, "Status 'aktiv'");

      const aktiv = await findById(checkoutId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await insertDoc({ ...(aktiv as object), status: "freigegeben" } as any);
      assert.equal(await turnierAusgecheckt(turnier._id), false, "nach Freigabe nicht mehr gesperrt");
    } finally {
      const doc = await findById(checkoutId);
      if (doc) await deleteDoc(checkoutId, (doc as { _rev: string })._rev);
      await aufraeumen();
    }
  },
);

test(
  "Ein passender Turnier-Code hat Vorrang vor einer vorhandenen TurnierBerechtigung",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { turnierZugriffsstufe, turnier, benutzer, aufraeumen, newId, insertDoc } = await testSetup();
    const berechtigungId = newId("turnierBerechtigung");
    try {
      // Der Benutzer hat nur Lesezugriff per TurnierBerechtigung ...
      await insertDoc({
        _id: berechtigungId,
        docType: "turnierBerechtigung",
        berechtigungId,
        turnierId: turnier._id,
        benutzerId: benutzer._id,
        rolle: "lesen",
        vergebenAm: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // ... aber die Session traegt zusaetzlich einen Turnierleitung-Code fuer dasselbe Turnier -
      // der muss gewinnen (schreiben_voll), nicht die schwaechere TurnierBerechtigung.
      const stufe = await turnierZugriffsstufe(turnier, {
        benutzer,
        turnierCode: { turnierId: turnier._id, rolle: "turnierleitung" },
      });
      assert.equal(stufe, "schreiben_voll");
    } finally {
      const { findById, deleteDoc } = await import("../repository");
      const gespeichert = await findById(berechtigungId);
      if (gespeichert) await deleteDoc(berechtigungId, (gespeichert as { _rev: string })._rev);
      await aufraeumen();
    }
  },
);

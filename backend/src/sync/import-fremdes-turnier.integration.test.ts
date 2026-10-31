import { test } from "node:test";
import assert from "node:assert/strict";
import type { MannschaftImTurnier, Spieler, Turnier } from "@torball/shared";
import type { TurnierExportPaket } from "./export";

/**
 * Sync-Import darf kein Dokument eines ANDEREN Turniers ueberschreiben (OWASP-Durchgang A08,
 * 2026-10-31). `pruefeTurnierExportPaket` prueft nur das EINGEHENDE Dokument: `_id`-Praefix,
 * `docType` und das Feld `turnierId`. Geschrieben wird aber unter der mitgelieferten `_id`, und bei
 * `ersetzen: true` (jeder Check-in einer gekoppelten Instanz) holt sich der Import die `_rev` des
 * dort BEREITS VORHANDENEN Dokuments. Ein Paket fuer das eigene, ausgecheckte Turnier A konnte so
 * eine Mannschaft/ein Spiel/einen Spieler von Turnier B unter dessen `_id` ueberschreiben und in
 * Turnier A umhaengen. Die IDs fremder Mannschaften liefert die oeffentliche Turnierseite aus.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function aufraeumen(ids: string[]) {
  const { findByIdUngeprueft, deleteDoc } = await import("../repository");
  for (const id of ids) {
    const doc = await findByIdUngeprueft(id);
    if (doc) await deleteDoc(id, (doc as { _rev: string })._rev);
  }
}

const minimalesTurnier = (id: string, name: string) =>
  ({
    _id: id,
    docType: "turnier",
    turnierId: id,
    name,
    datum: "2026-10-31",
    startzeit: "09:00",
    status: "entwurf",
    felder: [],
    protokollierungsart: "manuell",
    spielplanModus: "einfach",
    erstelltVon: "benutzer:egal",
    erstelltVonName: "Test",
    erstelltAm: new Date().toISOString(),
  }) as unknown as Turnier;

test(
  "Import mit ersetzen:true lehnt ein Dokument ab, das unter dieser _id zu einem FREMDEN Turnier gehoert",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const { insertDoc, newId, findById } = await import("../repository");
    const { importiereTurnierExport } = await import("./import");

    const turnierA = newId("turnier");
    const turnierB = newId("turnier");
    const eigeneMannschaft = newId("mannschaftImTurnier");
    const fremdeMannschaft = newId("mannschaftImTurnier");
    const fremderSpieler = newId("spieler");
    const angelegt = [turnierA, turnierB, eigeneMannschaft, fremdeMannschaft, fremderSpieler];

    const mannschaft = (id: string, turnierId: string, name: string) =>
      ({ _id: id, docType: "mannschaftImTurnier", mannschaftId: id, turnierId, name, reihenfolge: 1 }) as unknown as MannschaftImTurnier;

    try {
      await insertDoc(minimalesTurnier(turnierA, "Turnier A (ausgecheckt)"));
      await insertDoc(minimalesTurnier(turnierB, "Turnier B (fremd)"));
      await insertDoc(mannschaft(eigeneMannschaft, turnierA, "Eigene Mannschaft"));
      await insertDoc(mannschaft(fremdeMannschaft, turnierB, "Fremde Mannschaft"));
      await insertDoc({
        _id: fremderSpieler,
        docType: "spieler",
        spielerId: fremderSpieler,
        mannschaftId: fremdeMannschaft,
        name: "Fremder Spieler",
      } as unknown as Spieler);

      const paketBasis = (): TurnierExportPaket => ({
        turnier: minimalesTurnier(turnierA, "Turnier A (ausgecheckt)"),
        mannschaften: [mannschaft(eigeneMannschaft, turnierA, "Eigene Mannschaft")],
        spieler: [],
        spiele: [],
        schiedsrichter: [],
        vereine: [],
        teams: [],
        wettbewerb: null,
      });

      // Angriff 1: fremde Mannschafts-_id, aber turnierId = eigenes Turnier (besteht die Paket-Pruefung).
      const angriffMannschaft = paketBasis();
      angriffMannschaft.mannschaften.push(mannschaft(fremdeMannschaft, turnierA, "UEBERNOMMEN"));
      await assert.rejects(
        importiereTurnierExport(angriffMannschaft, { ersetzen: true, erwarteteTurnierId: turnierA }),
        /anderen Turnier/,
      );

      // Angriff 2: fremder Spieler (haengt ueber die Mannschaft an Turnier B), im Paket einer EIGENEN Mannschaft.
      const angriffSpieler = paketBasis();
      angriffSpieler.spieler.push({
        _id: fremderSpieler,
        docType: "spieler",
        spielerId: fremderSpieler,
        mannschaftId: eigeneMannschaft,
        name: "UEBERNOMMEN",
      } as unknown as Spieler);
      await assert.rejects(
        importiereTurnierExport(angriffSpieler, { ersetzen: true, erwarteteTurnierId: turnierA }),
        /anderen Turnier/,
      );

      // Nichts darf geschrieben worden sein - auch nicht die harmlosen Teile des Pakets (kein Teilimport).
      const fremdeNachher = await findById<MannschaftImTurnier>(fremdeMannschaft, "mannschaftImTurnier");
      assert.equal(fremdeNachher?.turnierId, turnierB, "die fremde Mannschaft muss bei Turnier B geblieben sein");
      assert.equal(fremdeNachher?.name, "Fremde Mannschaft");
      const spielerNachher = await findById<Spieler>(fremderSpieler, "spieler");
      assert.equal(spielerNachher?.mannschaftId, fremdeMannschaft);
      assert.equal(spielerNachher?.name, "Fremder Spieler");

      // Regression: das eigene Paket (nur eigene Dokumente) wird weiter ersetzend importiert.
      const ok = paketBasis();
      ok.mannschaften[0] = mannschaft(eigeneMannschaft, turnierA, "Eigene Mannschaft (aktualisiert)");
      await importiereTurnierExport(ok, { ersetzen: true, erwarteteTurnierId: turnierA });
      const eigeneNachher = await findById<MannschaftImTurnier>(eigeneMannschaft, "mannschaftImTurnier");
      assert.equal(eigeneNachher?.name, "Eigene Mannschaft (aktualisiert)");
    } finally {
      await aufraeumen(angelegt);
    }
  },
);

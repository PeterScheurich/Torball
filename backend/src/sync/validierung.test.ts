import assert from "node:assert/strict";
import { test } from "node:test";
import type { TurnierExportPaket } from "./export";
import { pruefeTurnierExportPaket } from "./validierung";

// Baut ein minimales, gueltiges Exportpaket - genau die Struktur, die sammleTurnierExport erzeugt
// (turnierbezogene Dokumente mit passender turnierId/mannschaftId, korrektem _id-Praefix + docType).
// Bewusst als `any` konstruiert und am Ende gecastet: die Pruefung soll Laufzeit-Fremddaten
// abwehren, die dem TypeScript-Typ gar nicht entsprechen.
function gueltigesPaket(): TurnierExportPaket {
  const turnierId = "turnier:t1";
  const mannschaftId = "mannschaftImTurnier:m1";
  const paket = {
    turnier: { _id: turnierId, docType: "turnier", turnierId, name: "T", datum: "2026-08-20" },
    mannschaften: [{ _id: mannschaftId, docType: "mannschaftImTurnier", turnierId, name: "A" }],
    spieler: [{ _id: "spieler:s1", docType: "spieler", mannschaftId, name: "P" }],
    spiele: [{ _id: "spiel:g1", docType: "spiel", turnierId, runde: 1 }],
    schiedsrichter: [{ _id: "schiedsrichterImTurnier:r1", docType: "schiedsrichterImTurnier", turnierId, name: "S" }],
    vereine: [{ _id: "verein:v1", docType: "verein", name: "V" }],
    teams: [{ _id: "team:x1", docType: "team", vereinId: "verein:v1", name: "X" }],
    wettbewerb: null,
  };
  return paket as unknown as TurnierExportPaket;
}

test("ein gueltiges Paket wird akzeptiert", () => {
  assert.equal(pruefeTurnierExportPaket(gueltigesPaket()), null);
});

test("erwarteteTurnierId muss zum Paket passen", () => {
  assert.equal(pruefeTurnierExportPaket(gueltigesPaket(), "turnier:t1"), null);
  const fehler = pruefeTurnierExportPaket(gueltigesPaket(), "turnier:anderes");
  assert.ok(fehler && fehler.includes("ausgecheckt"));
});

test("ein Spiel mit fremdem _id-Praefix (z.B. benutzer:) wird abgewiesen", () => {
  const paket = gueltigesPaket();
  // Angriff: Dokument unter einer fremden _id einschleusen - genau das Ziel des Imports ist die _id.
  (paket as any).spiele[0]._id = "benutzer:opfer-admin";
  const fehler = pruefeTurnierExportPaket(paket);
  assert.ok(fehler && fehler.includes("Präfix"));
});

test("ein Dokument mit korrektem _id-Praefix, aber fremdem docType wird abgewiesen", () => {
  const paket = gueltigesPaket();
  // Angriff: _id "spiel:..." (Praefix ok), aber docType "benutzer" - wuerde bei findAllByType("benutzer")
  // als Benutzer gefunden. Deshalb muss auch das docType-Feld geprueft werden, nicht nur das Praefix.
  (paket as any).spiele[0].docType = "benutzer";
  const fehler = pruefeTurnierExportPaket(paket);
  assert.ok(fehler && fehler.includes("docType"));
});

test("ein Spiel eines FREMDEN Turniers wird abgewiesen", () => {
  const paket = gueltigesPaket();
  (paket as any).spiele[0].turnierId = "turnier:fremdes";
  const fehler = pruefeTurnierExportPaket(paket);
  assert.ok(fehler && fehler.includes("turnierId"));
});

test("ueber das create-only Vereins-Array laesst sich kein Fremd-Dokument anlegen", () => {
  const paket = gueltigesPaket();
  // Angriff: ein neues admin-Benutzerdokument als "Verein" tarnen (import.ts legt Stammdaten an,
  // wenn die ID noch nicht existiert).
  (paket as any).vereine[0] = { _id: "benutzer:neuer-admin", docType: "benutzer", globaleRolle: "admin" };
  const fehler = pruefeTurnierExportPaket(paket);
  assert.ok(fehler && fehler.includes("Präfix"));
});

test("ein Wettbewerb mit falschem Typ wird abgewiesen", () => {
  const paket = gueltigesPaket();
  (paket as any).wettbewerb = { _id: "systemeinstellungen:global", docType: "systemeinstellungen" };
  const fehler = pruefeTurnierExportPaket(paket);
  assert.ok(fehler);
});

test("ein Spieler an einer nicht mitgelieferten Mannschaft wird abgewiesen", () => {
  const paket = gueltigesPaket();
  (paket as any).spieler[0].mannschaftId = "mannschaftImTurnier:fremd";
  const fehler = pruefeTurnierExportPaket(paket);
  assert.ok(fehler && fehler.includes("mannschaftId"));
});

test("ein nicht-Array an Stelle einer Liste wird abgewiesen", () => {
  const paket = gueltigesPaket();
  (paket as any).spiele = "kein-array";
  const fehler = pruefeTurnierExportPaket(paket);
  assert.ok(fehler && fehler.includes("Array"));
});

test("ein fehlendes/kaputtes Turnier-Dokument wird abgewiesen", () => {
  assert.ok(pruefeTurnierExportPaket({} as TurnierExportPaket));
  const paket = gueltigesPaket();
  (paket as any).turnier.docType = "verein";
  assert.ok(pruefeTurnierExportPaket(paket));
});

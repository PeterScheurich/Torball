import assert from "node:assert/strict";
import { test } from "node:test";
import type { Benutzer } from "@torball/shared";
import { oeffentlichesProfil } from "./benutzerProfil";
import { managerSiehtKonto, profilFuerManager } from "./benutzerSicht";

const konto = (id: string, extra: Partial<Benutzer> = {}): Benutzer =>
  ({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    name: id,
    globaleRolle: "benutzer",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: "2026-10-31T10:00:00.000Z",
    ...extra,
  }) as Benutzer;

test("Manager sieht sich selbst, die selbst eingeladenen und die Konten seines Vereins - sonst niemanden", () => {
  const manager = konto("benutzer:m1", { globaleRolle: "manager", vereinId: "verein:a" });
  assert.equal(managerSiehtKonto(manager, manager), true, "sich selbst");
  assert.equal(managerSiehtKonto(manager, konto("benutzer:eingeladen", { erstelltVon: manager._id })), true);
  assert.equal(managerSiehtKonto(manager, konto("benutzer:kollege", { vereinId: "verein:a" })), true);
  assert.equal(managerSiehtKonto(manager, konto("benutzer:fremd", { vereinId: "verein:b" })), false);
  assert.equal(managerSiehtKonto(manager, konto("benutzer:ohne")), false);
  assert.equal(managerSiehtKonto(manager, konto("benutzer:andereEinladung", { erstelltVon: "benutzer:m2" })), false);
});

test("Ein Manager OHNE Verein sieht nicht 'alle Konten ohne Verein'", () => {
  const manager = konto("benutzer:m2", { globaleRolle: "manager" });
  // Beide haben keinen Verein - das ist keine Gemeinsamkeit.
  assert.equal(managerSiehtKonto(manager, konto("benutzer:auchOhne")), false);
  assert.equal(managerSiehtKonto(manager, konto("benutzer:meinGast", { erstelltVon: manager._id })), true);
});

test("Die Manager-Sicht enthaelt keine Kontaktdaten und keine Voreinstellungen", () => {
  const voll = oeffentlichesProfil(
    konto("benutzer:x", {
      telefon: "0123 4567",
      adresse: "Musterweg 1",
      vereinVerband: "Beispielverein",
      lizenzVorhanden: true,
      vorname: "Eva",
      vereinId: "verein:a",
      passwortHash: "$2b$12$abcdefghijklmnopqrstuv",
    }),
  );
  const sicht = profilFuerManager(voll) as Record<string, unknown>;
  for (const verboten of ["telefon", "adresse", "vereinVerband", "lizenzVorhanden", "passwortHash", "sprache"]) {
    assert.ok(!(verboten in sicht), `${verboten} darf nicht in der Manager-Sicht stehen`);
  }
  assert.equal(sicht.vorname, "Eva");
  assert.equal(sicht.vereinId, "verein:a");
  assert.equal(sicht.email, "benutzer:x@example.invalid");
  assert.equal(sicht.hatPasswort, true);
});

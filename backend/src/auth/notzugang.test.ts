import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer } from "@torball/shared";
import { waehleNotzugangKonto } from "./notzugangWahl";

function konto(email: string, rolle: Benutzer["globaleRolle"], extra: Partial<Benutzer> = {}): Benutzer {
  return {
    _id: `benutzer:${email}`,
    docType: "benutzer",
    benutzerId: `benutzer:${email}`,
    email,
    name: email.split("@")[0],
    globaleRolle: rolle,
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: "2026-01-01T00:00:00.000Z",
    ...extra,
  } as Benutzer;
}

test("Notzugang: ohne E-Mail genau dann, wenn es nur EIN nutzbares Administrator-Konto gibt", () => {
  const admin = konto("admin@example.invalid", "admin");
  const manager = konto("manager@example.invalid", "manager");
  const benutzer = konto("benutzer@example.invalid", "benutzer");

  const einzeln = waehleNotzugangKonto([manager, admin, benutzer], undefined);
  assert.equal(einzeln.art, "konto");
  assert.equal(einzeln.art === "konto" && einzeln.konto.email, "admin@example.invalid");

  // Ein zweiter Admin, aber gesperrt: nutzbar bleibt nur der eine
  const gesperrt = konto("alt@example.invalid", "admin", { gesperrt: true });
  const nutzbar = waehleNotzugangKonto([admin, gesperrt], undefined);
  assert.equal(nutzbar.art, "konto");
  assert.equal(nutzbar.art === "konto" && nutzbar.konto.email, "admin@example.invalid");

  // Zwei nutzbare Admins: Auswahl verlangen und beide nennen (ohne etwas zu raten)
  const zwei = waehleNotzugangKonto([admin, konto("zweiter@example.invalid", "admin")], undefined);
  assert.equal(zwei.art, "fehler");
  assert.ok(zwei.art === "fehler" && zwei.meldung.includes("admin@example.invalid") && zwei.meldung.includes("zweiter@example.invalid"));
  assert.ok(zwei.art === "fehler" && !zwei.meldung.includes("manager@example.invalid"), "nur Administratoren werden genannt");

  // Gar kein Admin
  const keiner = waehleNotzugangKonto([manager], undefined);
  assert.equal(keiner.art, "fehler");
});

test("Notzugang: mit E-Mail (Gross-/Kleinschreibung egal) nur fuer Administratoren, nie fuer gesperrte oder fremde Konten", () => {
  const admin = konto("Admin@Example.invalid", "admin");
  const manager = konto("manager@example.invalid", "manager");
  const gesperrt = konto("gesperrt@example.invalid", "admin", { gesperrt: true, gesperrtGrund: "manuell" });

  const ok = waehleNotzugangKonto([admin, manager, gesperrt], " admin@example.INVALID ");
  assert.equal(ok.art, "konto");

  const keinAdmin = waehleNotzugangKonto([admin, manager], "manager@example.invalid");
  assert.equal(keinAdmin.art, "fehler");
  assert.ok(keinAdmin.art === "fehler" && keinAdmin.meldung.includes("kein Administrator"));

  const unbekannt = waehleNotzugangKonto([admin], "niemand@example.invalid");
  assert.equal(unbekannt.art, "fehler");

  const gesperrtErgebnis = waehleNotzugangKonto([admin, gesperrt], "gesperrt@example.invalid");
  assert.equal(gesperrtErgebnis.art, "fehler");
  assert.ok(gesperrtErgebnis.art === "fehler" && gesperrtErgebnis.meldung.includes("benutzer:entsperren"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baueModusPlan,
  EINGEBAUTE_TURNIERMODI,
  erzeugbarePlanSpiele,
  findeEingebautenTurniermodus,
  loeseQuelleAuf,
  planeZeiten,
  pruefeModusEinstellungen,
  quelleText,
  siegerVerlierer,
  standardModusEinstellungen,
  type ModusEinstellungen,
  type PlanSpiel,
  type TurniermodusVorlage,
} from "@torball/shared";

const gruppen = findeEingebautenTurniermodus("gruppen-endrunde")!;
const eineGruppe = findeEingebautenTurniermodus("jeder-gegen-jeden-endrunde")!;
const nurPlatzierung = findeEingebautenTurniermodus("gruppen-platzierung")!;

const einst = (endrundeGroesse: number, platz3 = true, platzierungsspiele = true): ModusEinstellungen => ({
  endrundeGroesse,
  platz3,
  platzierungsspiele,
});

/** "HF1: 1.A–2.B"-Kurzform fuer lesbare Vergleiche. */
function paarungen(spiele: PlanSpiel[]): string[] {
  return spiele.map((s) => `${s.planId}: ${quelleText(s.quelleA, spiele)} – ${quelleText(s.quelleB, spiele)}`);
}

test("eingebaute Vorlagen: eindeutige Kennungen, Standardwerte sind selbst gueltig", () => {
  const ids = new Set(EINGEBAUTE_TURNIERMODI.map((v) => v.id));
  assert.equal(ids.size, EINGEBAUTE_TURNIERMODI.length);
  for (const v of EINGEBAUTE_TURNIERMODI) {
    assert.equal(pruefeModusEinstellungen(v, standardModusEinstellungen(v)), undefined, v.id);
    assert.ok(v.endrundeGroessen.every((g) => g % 2 === 0), `${v.id}: nur gerade Endrundengroessen`);
  }
});

test("Einstellungen: ungerade Endrunde, unbekannte Groesse und fremde Schluessel werden abgewiesen", () => {
  assert.match(pruefeModusEinstellungen(gruppen, einst(5)) ?? "", /nur|gerade/);
  assert.match(pruefeModusEinstellungen(gruppen, einst(10)) ?? "", /nur/);
  assert.match(pruefeModusEinstellungen(gruppen, { ...einst(4), werbung: true }) ?? "", /Unbekannte/);
  assert.ok(pruefeModusEinstellungen(gruppen, null));
  assert.ok(pruefeModusEinstellungen(gruppen, { endrundeGroesse: 4, platz3: "ja", platzierungsspiele: true }));
  // Die Gerade-Regel ist eine Einstellung der Vorlage und laesst sich spaeter lockern.
  const locker: TurniermodusVorlage = { ...gruppen, endrundeGroessen: [0, 3], endrundeTeilnehmerGerade: false };
  assert.equal(pruefeModusEinstellungen(locker, einst(3)), undefined);
});

test("zwei Gruppen, Endrunde mit 4: Halbfinale ueber Kreuz, Finale, Platz 3, Platzierungsspiele", () => {
  const plan = baueModusPlan(gruppen, einst(4), [5, 6]);
  assert.deepEqual(paarungen(plan.spiele), [
    "PL9: 5. Gruppe A – 5. Gruppe B",
    "PL7: 4. Gruppe A – 4. Gruppe B",
    "PL5: 3. Gruppe A – 3. Gruppe B",
    "HF1: 1. Gruppe A – 2. Gruppe B",
    "HF2: 1. Gruppe B – 2. Gruppe A",
    "P3: Verlierer Halbfinale 1 – Verlierer Halbfinale 2",
    "F: Sieger Halbfinale 1 – Sieger Halbfinale 2",
  ]);
  // Der Ueberhang der groesseren Gruppe spielt nicht mit und belegt Platz 11 (Auftraggeber 31.10.2026).
  const texte = plan.hinweise.map((h) => h.text).join("\n");
  assert.match(texte, /Platz 11/);
  assert.match(texte, /Gruppe A hat 5, Gruppe B hat 6/);
  assert.ok(plan.hinweise.every((h) => h.stufe === "hinweis"), "ungleiche Gruppen sind nur ein Hinweis");
});

test("zwei Gruppen, Endrunde mit 6: Gruppensieger im Halbfinale gesetzt (Platz des fehlenden vierten Teams)", () => {
  const plan = baueModusPlan(gruppen, einst(6), [5, 6]);
  const ko = plan.spiele.filter((s) => s.phase !== "platzierung");
  assert.deepEqual(paarungen(ko), [
    "VF1: 2. Gruppe A – 3. Gruppe B",
    "VF2: 2. Gruppe B – 3. Gruppe A",
    "HF1: 1. Gruppe A – Sieger Viertelfinale 1",
    "HF2: 1. Gruppe B – Sieger Viertelfinale 2",
    "P3: Verlierer Halbfinale 1 – Verlierer Halbfinale 2",
    "F: Sieger Halbfinale 1 – Sieger Halbfinale 2",
  ]);
  // Platzierungsspiele beginnen hinter den 3 Aufsteigern je Gruppe: 4.A–4.B (Platz 7), 5.A–5.B (Platz 9).
  assert.deepEqual(
    plan.spiele.filter((s) => s.phase === "platzierung").map((s) => s.bezeichnung),
    ["Spiel um Platz 9", "Spiel um Platz 7"],
  );
});

test("zwei Gruppen, Endrunde mit 8: Kreuzvergleich, Halbfinale nach der Gruppenlogik", () => {
  const plan = baueModusPlan(gruppen, einst(8, true, false), [4, 4]);
  assert.deepEqual(paarungen(plan.spiele), [
    "VF1: 1. Gruppe A – 4. Gruppe B",
    "VF2: 2. Gruppe A – 3. Gruppe B",
    "VF3: 1. Gruppe B – 4. Gruppe A",
    "VF4: 2. Gruppe B – 3. Gruppe A",
    "HF1: Sieger Viertelfinale 1 – Sieger Viertelfinale 2",
    "HF2: Sieger Viertelfinale 3 – Sieger Viertelfinale 4",
    "P3: Verlierer Halbfinale 1 – Verlierer Halbfinale 2",
    "F: Sieger Halbfinale 1 – Sieger Halbfinale 2",
  ]);
  assert.equal(plan.hinweise.length, 0, "gleich grosse Gruppen, alles passt");
});

test("eine Gruppe: Endrunde mit 4 und 6 nach Tabellenplaetzen", () => {
  assert.deepEqual(paarungen(baueModusPlan(eineGruppe, einst(4, false, false), [6]).spiele), [
    "HF1: 1. der Tabelle – 4. der Tabelle",
    "HF2: 2. der Tabelle – 3. der Tabelle",
    "F: Sieger Halbfinale 1 – Sieger Halbfinale 2",
  ]);
  assert.deepEqual(paarungen(baueModusPlan(eineGruppe, einst(6, false, false), [8]).spiele), [
    "VF1: 3. der Tabelle – 6. der Tabelle",
    "VF2: 4. der Tabelle – 5. der Tabelle",
    "HF1: 1. der Tabelle – Sieger Viertelfinale 2",
    "HF2: 2. der Tabelle – Sieger Viertelfinale 1",
    "F: Sieger Halbfinale 1 – Sieger Halbfinale 2",
  ]);
});

test("nur Finale (2) und keine Endrunde (0)", () => {
  assert.deepEqual(paarungen(baueModusPlan(gruppen, einst(2, false, false), [4, 4]).spiele), [
    "F: 1. Gruppe A – 1. Gruppe B",
  ]);
  assert.deepEqual(baueModusPlan(gruppen, einst(0, false, false), [4, 4]).spiele, []);
});

test("nur Platzierungsspiele: gleiche Plaetze spielen gegeneinander, 1.A-1.B ums Finale", () => {
  const plan = baueModusPlan(nurPlatzierung, einst(0, false, true), [4, 4]);
  assert.deepEqual(
    plan.spiele.map((s) => s.bezeichnung),
    ["Spiel um Platz 7", "Spiel um Platz 5", "Spiel um Platz 3", "Spiel um Platz 1"],
  );
  assert.equal(paarungen(plan.spiele).at(-1), "PL1: 1. Gruppe A – 1. Gruppe B");
});

test("eine Gruppe mit Platzierungsspielen: nur vollstaendige Paare, Rest wird nach der Tabelle eingeordnet", () => {
  const plan = baueModusPlan(eineGruppe, einst(4, false, true), [7]);
  assert.deepEqual(
    plan.spiele.filter((s) => s.phase === "platzierung").map((s) => s.planId),
    ["PL5"],
    "Plaetze 5 und 6 spielen, Platz 7 bleibt ohne Spiel",
  );
  assert.ok(plan.hinweise.some((h) => /Platz 7/.test(h.text)));
  // Ohne Endrunde gibt es bei einer Gruppe keine Platzierungsspiele - nur ein Hinweis.
  const ohneEndrunde = baueModusPlan(eineGruppe, einst(0, false, true), [6]);
  assert.equal(ohneEndrunde.spiele.length, 0);
  assert.ok(ohneEndrunde.hinweise.length > 0);
});

test("Warnung, wenn die Zahlen nicht zur Endrunde passen - es bleibt trotzdem ein Plan", () => {
  const zuKlein = baueModusPlan(gruppen, einst(8), [3, 5]);
  assert.ok(zuKlein.hinweise.some((h) => h.stufe === "warnung" && /mindestens 4/.test(h.text)));
  assert.ok(zuKlein.spiele.length > 0);
  const leer = baueModusPlan(gruppen, einst(4), [4, 0]);
  assert.ok(leer.hinweise.some((h) => h.stufe === "warnung" && /Gruppe B hat keine/.test(h.text)));
  const einzel = baueModusPlan(eineGruppe, einst(8), [5]);
  assert.ok(einzel.hinweise.some((h) => h.stufe === "warnung"));
});

test("Schichten: Vorrunden-Abhaengige zuerst, Finale und Platz 3 zuletzt", () => {
  const plan = baueModusPlan(gruppen, einst(8), [5, 5]); // 4 steigen je Gruppe auf, der 5. spielt Platz 9
  const schicht = Object.fromEntries(plan.spiele.map((s) => [s.planId, s.schicht]));
  assert.deepEqual(
    [schicht.VF1, schicht.HF1, schicht.F, schicht.P3, schicht.PL9],
    [0, 1, 2, 2, 0],
  );
  assert.equal(plan.spiele.at(-1)!.planId, "F", "das Finale ist das letzte Spiel");
});

test("Zeitplanung: Spielzeit bestimmt die Uebersicht, ein Feld = nacheinander, zwei Felder = parallel", () => {
  const plan = baueModusPlan(gruppen, einst(4, true, false), [4, 4]).spiele; // HF1, HF2, P3, F
  const ende = new Date("2026-11-01T14:00:00.000Z");
  const einFeld = planeZeiten(plan, [{ feldId: "f1", name: "1" }], ende, 25);
  const zeit = (liste: PlanSpiel[], id: string) => liste.find((s) => s.planId === id)!.startzeitGeplant;
  assert.equal(zeit(einFeld, "HF1"), "2026-11-01T14:00:00.000Z");
  assert.equal(zeit(einFeld, "HF2"), "2026-11-01T14:25:00.000Z");
  assert.equal(zeit(einFeld, "P3"), "2026-11-01T14:50:00.000Z");
  assert.equal(zeit(einFeld, "F"), "2026-11-01T15:15:00.000Z");

  const zweiFelder = planeZeiten(plan, [{ feldId: "f1", name: "1" }, { feldId: "f2", name: "2" }], ende, 25);
  assert.equal(zeit(zweiFelder, "HF1"), zeit(zweiFelder, "HF2"), "beide Halbfinale laufen parallel");
  assert.notEqual(
    zweiFelder.find((s) => s.planId === "HF1")!.feldId,
    zweiFelder.find((s) => s.planId === "HF2")!.feldId,
  );
  assert.equal(zeit(zweiFelder, "F"), "2026-11-01T14:25:00.000Z", "Finale erst nach den Halbfinalen");
});

test("Verschiebung wirkt auf abhaengige Spiele und das eigene Feld, nicht auf parallele Spiele", () => {
  const plan = baueModusPlan(gruppen, einst(4, true, false), [4, 4]).spiele;
  const felder = [{ feldId: "f1", name: "1" }, { feldId: "f2", name: "2" }];
  const ende = new Date("2026-11-01T14:00:00.000Z");
  const normal = planeZeiten(plan, felder, ende, 25);
  const verschoben = planeZeiten(
    plan.map((s) => (s.planId === "HF1" ? { ...s, versatzMinuten: 10 } : s)),
    felder,
    ende,
    25,
  );
  const zeit = (liste: PlanSpiel[], id: string) => liste.find((s) => s.planId === id)!.startzeitGeplant;
  assert.equal(zeit(verschoben, "HF1"), "2026-11-01T14:10:00.000Z");
  assert.equal(zeit(verschoben, "HF2"), zeit(normal, "HF2"), "das parallele Halbfinale bleibt unberuehrt");
  assert.notEqual(zeit(verschoben, "F"), zeit(normal, "F"), "das abhaengige Finale rueckt mit");
});

test("Aufloesung: Tabellenplaetze sofort, Sieger erst nach dem Ergebnis; Unentschieden braucht eine Entscheidung", () => {
  const plan = baueModusPlan(gruppen, einst(6, false, false), [4, 4]).spiele;
  const ctx = {
    rangfolge: { A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] },
    ergebnisse: {} as Record<string, { sieger: string; verlierer: string } | undefined>,
  };
  const zuerst = erzeugbarePlanSpiele(plan, ctx).map((s) => s.planId).sort();
  assert.deepEqual(zuerst, ["VF1", "VF2"], "die Halbfinale warten auf die Viertelfinal-Ergebnisse");
  assert.equal(loeseQuelleAuf(plan.find((s) => s.planId === "VF1")!.quelleA, ctx), "a2");

  ctx.ergebnisse.VF1 = siegerVerlierer("a2", "b3", 3, 1);
  ctx.ergebnisse.VF2 = siegerVerlierer("b2", "a3", 0, 2);
  const danach = erzeugbarePlanSpiele(
    plan.map((s) => (s.planId.startsWith("VF") ? { ...s, spielId: "x" } : s)),
    ctx,
  );
  assert.deepEqual(danach.map((s) => s.planId).sort(), ["HF1", "HF2"]);
  assert.equal(loeseQuelleAuf({ typ: "sieger", planId: "VF2" }, ctx), "a3");

  assert.equal(siegerVerlierer("x", "y", 2, 2), undefined, "Unentschieden ohne Entscheidung bleibt offen");
  assert.deepEqual(siegerVerlierer("x", "y", 2, 2, "y"), { sieger: "y", verlierer: "x" });
  assert.equal(siegerVerlierer("x", "y", undefined, undefined), undefined);
  // Zu kleine Gruppe: der Tabellenplatz fehlt - die Paarung bleibt offen statt zu raten.
  assert.equal(
    loeseQuelleAuf({ typ: "gruppenplatz", gruppe: "A", platz: 5 }, ctx),
    undefined,
  );
});

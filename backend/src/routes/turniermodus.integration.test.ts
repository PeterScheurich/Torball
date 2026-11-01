import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, MannschaftImTurnier, SchiedsrichterImTurnier, Spiel, Turnier } from "@torball/shared";
import type { ModusAnsicht } from "../spielplan/modus";

/**
 * Turniermodus mit zwei Gruppen und Endrunde (Auftraggeber-Konzept 31.10.2026): Modus waehlen, Mannschaften
 * auf Gruppen verteilen, Vorrunde je Gruppe erzeugen, Endrunde erst nach den Ergebnissen erzeugen
 * (Paarungen ueber Kreuz), Gleichstand/Unentschieden entscheiden die Turnierleitung. Laeuft gegen die echte
 * CouchDB-Dev-Instanz, Skip-Guard wie die anderen.
 */
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL &&
  !!process.env.COUCHDB_DB &&
  !!process.env.COUCHDB_USER &&
  !!process.env.COUCHDB_PASSWORD;

async function neuerAdmin(): Promise<string> {
  const { insertDoc, newId } = await import("../repository");
  const { hashePasswort } = await import("../auth/passwort");
  const id = newId("benutzer");
  await insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: `${id}@example.invalid`,
    passwortHash: await hashePasswort("Halle-Dienstag-Test-77"),
    name: "Modus-Admin",
    globaleRolle: "admin",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
  return id;
}

test(
  "Turniermodus: zwei Gruppen mit Endrunde von der Vorrunde bis zum Finale",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    const Fastify = (await import("fastify")).default;
    const fastifyCookie = (await import("@fastify/cookie")).default;
    const { authPreHandler } = await import("../auth/plugin");
    const { turnierRoutes } = await import("./turnier");
    const { mannschaftRoutes } = await import("./mannschaft");
    const { spielplanRoutes } = await import("./spielplan");
    const { turniermodusRoutes } = await import("./turniermodus");
    const { ergebnisRoutes } = await import("./ergebnis");
    const { oeffentlichRoutes } = await import("./oeffentlich");
    const { erstelleSession } = await import("../auth/session");
    const { findAllBySelector, findByIdUngeprueft, deleteDoc, insertDoc } = await import("../repository");

    const app = Fastify();
    await app.register(fastifyCookie);
    app.addHook("preHandler", authPreHandler);
    for (const r of [turnierRoutes, mannschaftRoutes, spielplanRoutes, turniermodusRoutes, ergebnisRoutes, oeffentlichRoutes]) {
      await app.register(r);
    }

    const adminId = await neuerAdmin();
    const cookie = `torball_session=${(await erstelleSession(adminId)).token}`;
    const anfrage = (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    let turnierId: string | undefined;

    try {
      // --- Turnier mit einem Feld und sechs Mannschaften
      const angelegt = await anfrage("POST", "/turniere", { name: "Modus-Test", datum: "2026-11-01", startzeit: "09:00" });
      assert.equal(angelegt.statusCode, 201);
      turnierId = (angelegt.json() as Turnier)._id;
      await anfrage("PUT", `/turniere/${turnierId}`, { felder: [{ feldId: "feld:1", name: "Feld 1" }] });
      const namen = ["M1", "M2", "M3", "M4", "M5", "M6"];
      const ids: string[] = [];
      for (const name of namen) {
        const r = await anfrage("POST", "/mannschaften", { turnierId, name });
        assert.equal(r.statusCode, 201);
        ids.push((r.json() as MannschaftImTurnier)._id);
      }

      // --- Modus waehlen: der Server prueft gegen die Vorlage
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}/modus`, { turniermodusId: "gibt-es-nicht" })).statusCode, 400);
      assert.equal(
        (await anfrage("PUT", `/turniere/${turnierId}/modus`, {
          turniermodusId: "gruppen-endrunde",
          einstellungen: { endrundeGroesse: 5, platz3: true, platzierungsspiele: true },
        })).statusCode,
        400,
        "ungerade Endrunde wird abgewiesen",
      );
      const gewaehlt = await anfrage("PUT", `/turniere/${turnierId}/modus`, {
        turniermodusId: "gruppen-endrunde",
        einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: true },
      });
      assert.equal(gewaehlt.statusCode, 200);
      // Das Turnier laesst den Modus nicht ueber das normale PUT setzen (nur ueber die Modus-Routen).
      await anfrage("PUT", `/turniere/${turnierId}`, { modus: { vorlage: { gruppen: 1 } } });
      assert.equal((await findByIdUngeprueft(turnierId) as Turnier).modus?.vorlage.id, "gruppen-endrunde");

      // --- Vorrunde braucht Gruppen
      assert.equal((await anfrage("GET", `/turniere/${turnierId}/spielplan-vorschlag`)).statusCode, 400, "ohne Gruppen kein Vorschlag");
      assert.equal((await anfrage("POST", `/turniere/${turnierId}/gruppen-verteilen`)).statusCode, 200);
      const gruppen = Object.fromEntries(
        (await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId })).map((m) => [m.name, m.gruppe]),
      );
      assert.deepEqual(gruppen, { M1: "A", M2: "B", M3: "B", M4: "A", M5: "A", M6: "B" }, "Schlangenverfahren");

      const vorschlag = (await anfrage("GET", `/turniere/${turnierId}/spielplan-vorschlag`)).json() as {
        spiele: { mannschaftAId: string; mannschaftBId: string; gruppe?: string }[];
      };
      assert.equal(vorschlag.spiele.length, 6, "je Gruppe drei Spiele");
      const gruppeVon = new Map(ids.map((id, i) => [id, gruppen[namen[i]]]));
      for (const s of vorschlag.spiele) {
        assert.equal(gruppeVon.get(s.mannschaftAId), s.gruppe);
        assert.equal(gruppeVon.get(s.mannschaftBId), s.gruppe, "Vorrundenspiele nur innerhalb einer Gruppe");
      }
      // Schon vor der Vorrunde nennt die Vorschau eine (geschaetzte) Zeit - Grundlage: Anzahl Spiele und Felder.
      const vorVorrunde = (await anfrage("GET", `/turniere/${turnierId}/modus-plan`)).json() as ModusAnsicht;
      assert.equal(vorVorrunde.zeitenGeschaetzt, true);
      assert.ok(vorVorrunde.plan.every((p) => p.startzeitGeplant), "jedes geplante Spiel hat eine geschaetzte Zeit");
      // Die Oberflaeche schickt die (ggf. umsortierte) Vorschau zurueck. Frueher fiel dabei die Gruppe weg und
      // der Spielplan wurde mit einer unverstaendlichen Meldung abgelehnt - der Server leitet sie jetzt ab.
      const ohneGruppe = vorschlag.spiele.map(({ mannschaftAId, mannschaftBId }, i) => ({
        mannschaftAId,
        mannschaftBId,
        feldId: "feld:1",
        slot: i,
      }));
      // Ein Spiel ueber die Gruppen hinweg ist und bleibt abgewiesen - mit einer verstaendlichen Meldung.
      const ueberKreuz = ohneGruppe.map((e, i) =>
        i === 0 ? { ...e, mannschaftAId: ids[0], mannschaftBId: ids[1] } : e,
      );
      const abgelehnt = await anfrage("POST", `/turniere/${turnierId}/spielplan`, { eintraege: ueberKreuz });
      assert.equal(abgelehnt.statusCode, 400);
      assert.match((abgelehnt.json() as { error: string }).error, /Gruppe A oder Gruppe B/);
      assert.equal(
        (await anfrage("POST", `/turniere/${turnierId}/spielplan`, { eintraege: ohneGruppe })).statusCode,
        201,
        "Eintraege ohne Gruppenangabe werden akzeptiert",
      );
      const gespeicherteSpiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId });
      assert.ok(gespeicherteSpiele.every((s) => s.gruppe === "A" || s.gruppe === "B"), "die Gruppe steht am Spiel");
      // Derselbe Plan noch einmal vom Server berechnet: inhaltlich gleich -> keine neue Version (200 statt 201).
      assert.ok([200, 201].includes((await anfrage("POST", `/turniere/${turnierId}/spielplan`)).statusCode));
      assert.equal(
        ((await anfrage("GET", `/turniere/${turnierId}/modus-plan`)).json() as ModusAnsicht).zeitenGeschaetzt,
        false,
        "mit erzeugter Vorrunde gelten die echten Zeiten",
      );

      // --- Vor den Ergebnissen: der Plan steht mit Platzhaltern, nichts ist erzeugbar
      let plan = (await anfrage("GET", `/turniere/${turnierId}/modus-plan`)).json() as ModusAnsicht;
      assert.deepEqual(plan.plan.map((p) => p.planId).sort(), ["F", "HF1", "HF2", "P3", "PL5"]);
      assert.equal(plan.plan.find((p) => p.planId === "HF1")!.textA, "1. Gruppe A");
      assert.ok(plan.plan.every((p) => !p.erzeugbar));
      assert.equal((await anfrage("POST", `/turniere/${turnierId}/modus/erzeugen`, {})).statusCode, 409);

      // --- Vorrunde spielen: in jeder Gruppe gewinnt immer die zuerst gelistete Mannschaft
      const rang = (id: string) => ids.indexOf(id);
      for (const s of await findAllBySelector<Spiel>({ docType: "spiel", turnierId })) {
        const aGewinnt = rang(s.mannschaftAId) < rang(s.mannschaftBId);
        await insertDoc<Spiel>({
          ...s,
          ergebnisA: aGewinnt ? 2 : 0,
          ergebnisB: aGewinnt ? 0 : 2,
          ergebnisAbgeschlossen: true,
          status: "abgeschlossen",
        });
      }
      plan = (await anfrage("GET", `/turniere/${turnierId}/modus-plan`)).json() as ModusAnsicht;
      assert.deepEqual(plan.vorrundeFertig, { A: true, B: true });
      assert.deepEqual(plan.rangfolge.A, [ids[0], ids[3], ids[4]], "Gruppe A: M1 vor M4 vor M5");
      assert.deepEqual(plan.rangfolge.B, [ids[1], ids[2], ids[5]]);
      assert.deepEqual(plan.plan.filter((p) => p.erzeugbar).map((p) => p.planId).sort(), ["HF1", "HF2", "PL5"]);
      const hf1 = plan.plan.find((p) => p.planId === "HF1")!;
      assert.deepEqual([hf1.textA, hf1.textB], ["M1", "M3"], "Halbfinale 1: 1.A gegen 2.B");
      assert.ok(hf1.startzeitGeplant, "die Zeit richtet sich nach der Spielzeit");

      // --- Tabellen je Gruppe
      const tabelle = (await anfrage("GET", `/turniere/${turnierId}/tabelle`)).json() as { mannschaftId: string; gruppe?: string }[];
      assert.deepEqual(tabelle.map((z) => z.gruppe), ["A", "A", "A", "B", "B", "B"]);

      // --- Oeffentliche Seite: weiterer Ablauf mit Platzhaltern; Namen erst, wenn die Ergebnisse freigegeben sind
      await anfrage("PUT", `/turniere/${turnierId}`, { oeffentlichSpielplan: true });
      type Oeffentlich = {
        modus: { gruppen: number } | null;
        spielplan: { ablauf: { planId: string; textA: string; textB: string }[] } | null;
      };
      let oeffentlich = (await anfrage("GET", `/oeffentlich/turniere/${turnierId}`)).json() as Oeffentlich;
      assert.equal(oeffentlich.modus?.gruppen, 2);
      const ohneNamen = oeffentlich.spielplan!.ablauf.find((a) => a.planId === "HF1")!;
      assert.deepEqual([ohneNamen.textA, ohneNamen.textB], ["1. Gruppe A", "2. Gruppe B"], "ohne freigegebene Ergebnisse nur Platzhalter");
      await anfrage("PUT", `/turniere/${turnierId}`, { oeffentlichErgebnisse: true });
      oeffentlich = (await anfrage("GET", `/oeffentlich/turniere/${turnierId}`)).json() as Oeffentlich;
      assert.deepEqual(
        [oeffentlich.spielplan!.ablauf.find((a) => a.planId === "HF1")!.textA],
        ["M1"],
        "mit freigegebenen Ergebnissen die aufgeloesten Namen",
      );

      // --- Erzeugen: das Halbfinale 1 mit anderer Paarung von Hand, die uebrigen automatisch
      const fremd = await anfrage("POST", `/turniere/${turnierId}/modus/erzeugen`, {
        overrides: { HF1: { mannschaftAId: ids[0], mannschaftBId: "mannschaftImTurnier:fremd" } },
      });
      assert.equal(fremd.statusCode, 400);
      const erzeugt = await anfrage("POST", `/turniere/${turnierId}/modus/erzeugen`, {});
      assert.equal(erzeugt.statusCode, 201);
      assert.equal((erzeugt.json() as { erzeugt: unknown[] }).erzeugt.length, 3);
      const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId });
      const hf = spiele.find((s) => s.planId === "HF1")!;
      assert.deepEqual([hf.mannschaftAId, hf.mannschaftBId], [ids[0], ids[2]]);
      const letzteVorrunde = Math.max(...spiele.filter((s) => !s.planId).map((s) => Number(s.runde)));
      assert.ok(Number(hf.runde) > letzteVorrunde, "die Endrunde folgt hinter dem letzten Vorrunden-Slot (runde ist eine Zahl)");
      assert.equal(hf.bezeichnung, "Halbfinale 1");
      assert.equal(hf.gruppe, undefined, "Endrundenspiele gehoeren zu keiner Gruppe");

      // --- Ab jetzt sind Modus, Gruppen und Spielplan fest
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}/modus`, { turniermodusId: "jeder-gegen-jeden" })).statusCode, 409);
      assert.equal((await anfrage("POST", `/turniere/${turnierId}/gruppen-verteilen`)).statusCode, 409);
      assert.equal((await anfrage("POST", `/turniere/${turnierId}/spielplan`)).statusCode, 409, "kein Neuerzeugen, das die Endrunde loescht");
      assert.equal((await anfrage("PUT", `/mannschaften/${ids[0]}`, { name: "M1", gruppe: "B" })).statusCode, 409);
      assert.equal((await anfrage("POST", `/turniere/${turnierId}/modus/erzeugen`, {})).statusCode, 409, "nichts mehr zu erzeugen");

      // --- Halbfinale 1 entschieden, Halbfinale 2 unentschieden: Finale wartet auf die Turnierleitung
      for (const s of spiele.filter((x) => x.planId === "HF1" || x.planId === "HF2")) {
        const unentschieden = s.planId === "HF2";
        await insertDoc<Spiel>({
          ...s,
          ergebnisA: unentschieden ? 1 : 3,
          ergebnisB: 1,
          ergebnisAbgeschlossen: true,
          status: "abgeschlossen",
        });
      }
      plan = (await anfrage("GET", `/turniere/${turnierId}/modus-plan`)).json() as ModusAnsicht;
      assert.ok(plan.plan.every((p) => !p.erzeugbar || p.planId === "PL5"), "ohne Sieger von HF2 steht das Finale noch nicht fest");
      const hf2 = plan.plan.find((p) => p.planId === "HF2")!;
      assert.equal(hf2.unentschieden, true, "das unentschiedene Halbfinale wird gekennzeichnet");
      assert.ok(!plan.plan.find((p) => p.planId === "HF1")!.unentschieden);
      const nichtImSpiel = await anfrage("PUT", `/turniere/${turnierId}/modus/plan/HF2`, { entscheidung: ids[5] });
      assert.equal(nichtImSpiel.statusCode, 400, "der Sieger muss eine der beiden Mannschaften sein");
      const entschieden = await anfrage("PUT", `/turniere/${turnierId}/modus/plan/HF2`, { entscheidung: hf2.mannschaftBId });
      assert.equal(entschieden.statusCode, 200);
      plan = entschieden.json() as ModusAnsicht;
      assert.ok(!plan.plan.find((p) => p.planId === "HF2")!.unentschieden, "nach der Entscheidung nicht mehr");
      assert.deepEqual(plan.plan.filter((p) => p.erzeugbar).map((p) => p.planId).sort(), ["F", "P3"]);
      const finale = plan.plan.find((p) => p.planId === "F")!;
      assert.equal(finale.textB, hf2.textB, "Sieger Halbfinale 2 laut Entscheidung der Turnierleitung");

      // --- Verschiebung nur fuer noch nicht erzeugte Spiele
      assert.equal((await anfrage("PUT", `/turniere/${turnierId}/modus/plan/HF1`, { versatzMinuten: 5 })).statusCode, 409);
      const verschoben = (await anfrage("PUT", `/turniere/${turnierId}/modus/plan/F`, { versatzMinuten: 15 })).json() as ModusAnsicht;
      assert.ok(
        new Date(verschoben.plan.find((p) => p.planId === "F")!.startzeitGeplant!).getTime() >
          new Date(finale.startzeitGeplant!).getTime(),
        "das Finale rueckt um die eingetragene Zeit nach hinten",
      );

      // --- Abschliessen erst, wenn alle Spiele der Endrunde erzeugt sind
      assert.equal((await anfrage("POST", `/turniere/${turnierId}/abschliessen`)).statusCode, 409);
      assert.equal((await anfrage("POST", `/turniere/${turnierId}/modus/erzeugen`, {})).statusCode, 201);
      const hinweis = (await anfrage("POST", `/turniere/${turnierId}/abschliessen`)).json() as { error?: string };
      assert.ok(!/Endrunde wurden noch nicht erzeugt/.test(hinweis.error ?? ""), "die Endrunde ist vollstaendig erzeugt");
    } finally {
      if (turnierId) {
        for (const d of [
          ...(await findAllBySelector<Spiel>({ docType: "spiel", turnierId })),
          ...(await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId })),
          ...(await findAllBySelector<SchiedsrichterImTurnier>({ docType: "schiedsrichterImTurnier", turnierId })),
        ]) {
          await deleteDoc(d._id, d._rev!);
        }
        const t = await findByIdUngeprueft(turnierId);
        if (t) await deleteDoc(turnierId, (t as { _rev: string })._rev);
      }
      const a = await findByIdUngeprueft(adminId);
      if (a) await deleteDoc(adminId, (a as { _rev: string })._rev);
      await app.close();
    }
  },
);

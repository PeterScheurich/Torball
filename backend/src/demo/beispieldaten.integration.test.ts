import { test } from "node:test";
import assert from "node:assert/strict";
import type { Benutzer, MannschaftImTurnier, Spiel, Spieler, Turnier } from "@torball/shared";

/**
 * Der Demo-Datenstand wird ueber die ECHTEN Routen aufgebaut (Modus, Gruppen, Spielplan, Ergebnisse, Endrunde).
 * Dieser Test faengt ab, dass eine Aenderung an diesen Routen das Seed-Skript still bricht - sonst faellt das
 * erst auf der Demo-Instanz auf. Laeuft gegen die CouchDB-Testdatenbank; raeumt nur auf, was er selbst angelegt hat.
 */
type Doc = { _id: string; _rev?: string };
const hatCouchDbKonfiguration =
  !!process.env.COUCHDB_URL && !!process.env.COUCHDB_DB && !!process.env.COUCHDB_USER && !!process.env.COUCHDB_PASSWORD;

test(
  "Demo-Beispieldaten: sieben Turniere in den vorgesehenen Zustaenden",
  { skip: !hatCouchDbKonfiguration && "COUCHDB_* Umgebungsvariablen nicht gesetzt" },
  async () => {
    process.env.DEMO_SNAPSHOT_ERLAUBT = "true";
    const { erzeugeBeispieldaten } = await import("./beispieldaten");
    const { baueModusAnsicht } = await import("../spielplan/modus");
    const { findAllByType, findAllBySelector, deleteDoc } = await import("../repository");

    const DEMO_NAMEN = new Set([
      "Torball-Cup Musterstadt", "Stadtpokal Musterstadt", "Internationaler Pokal Musterstadt", "Sommerturnier Musterstadt",
      "Winterpokal", "Europa-Pokal", "Frühjahrsturnier",
    ]);
    const kontoVorher = (await findAllByType<Benutzer>("benutzer")).find((b) => b.email === "demo-datenpflege@blindentorball.de");
    const stammdaten = async (): Promise<Doc[]> =>
      (await Promise.all((["verein", "team", "schiedsrichter"] as const).map((typ) => findAllByType(typ)))).flat() as unknown as Doc[];
    const vorhandeneStammdaten = new Set((await stammdaten()).map((d) => d._id));
    const bisherigeTurniere = new Set((await findAllByType<Turnier>("turnier")).map((t) => t._id));

    try {
      await erzeugeBeispieldaten();
      const neu = (await findAllByType<Turnier>("turnier")).filter((t) => !bisherigeTurniere.has(t._id));
      assert.deepEqual(new Set(neu.map((t) => t.name)), DEMO_NAMEN);

      const ansicht = async (t: Turnier) => {
        const [mm, sp] = await Promise.all([
          findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: t._id }),
          findAllBySelector<Spiel>({ docType: "spiel", turnierId: t._id }),
        ]);
        return { mm, sp, modus: baueModusAnsicht(t, mm, sp) };
      };
      const nach = (name: string) => neu.find((t) => t.name === name)!;

      // Alle sind fuer die oeffentliche Anzeige freigegeben und fuer angemeldete Benutzer bearbeitbar.
      for (const t of neu) {
        assert.ok(t.oeffentlichSpielplan && t.oeffentlichErgebnisse && t.oeffentlichTurnierinfos, `${t.name}: freigegeben`);
        assert.equal(t.zugriffFuerAlleBenutzer, "schreiben");
      }

      const abgeschlossen = ["Torball-Cup Musterstadt", "Stadtpokal Musterstadt", "Internationaler Pokal Musterstadt"];
      for (const name of abgeschlossen) {
        const t = nach(name);
        const { sp, modus } = await ansicht(t);
        assert.equal(t.status, "abgeschlossen", name);
        assert.ok(sp.every((s) => s.ergebnisAbgeschlossen), `${name}: alle Ergebnisse abgeschlossen`);
        assert.ok(modus?.plan.every((p) => p.spielId) ?? true, `${name}: Endrunde vollstaendig`);
      }

      // International: Land statt Bundesland, Nichtantreten 5:0, Mannschaften aus mehreren Laendern.
      const international = nach("Internationaler Pokal Musterstadt");
      assert.equal(international.turnierart, "international");
      assert.equal(international.forfaitErgebnis, "5:0");
      const laender = new Set((await ansicht(international)).mm.map((m) => m.bundesland));
      assert.ok(laender.has("Frankreich") && laender.has("Deutschland"), "Mannschaften aus mehreren Laendern");

      // Stadtpokal: Endrunde (ohne Platzierungsspiele) in Halle A
      const stadt = await ansicht(nach("Stadtpokal Musterstadt"));
      const halleA = nach("Stadtpokal Musterstadt").felder[0].feldId;
      assert.ok(stadt.sp.filter((s) => s.planId && !/^PL/.test(s.planId)).every((s) => s.feldId === halleA));

      // Sommerturnier: erste Stufe der Endrunde gespielt, Platz 3 und Finale koennen erzeugt werden
      const sommer = await ansicht(nach("Sommerturnier Musterstadt"));
      assert.deepEqual(sommer.modus!.plan.filter((p) => !p.spielId && p.erzeugbar).map((p) => p.planId).sort(), ["F", "P3"]);

      // Winterpokal: Vorrunde nur zum Teil gespielt
      const winter = await ansicht(nach("Winterpokal"));
      const gespielt = winter.sp.filter((s) => s.ergebnisA != null).length;
      assert.ok(gespielt > 0 && gespielt < winter.sp.length, "Vorrunde teilweise gespielt");
      assert.equal(nach("Winterpokal").modus?.einstellungen.endrundeAutomatisch, true, "Winterpokal: Endrunde automatisch");
      assert.ok(!nach("Sommerturnier Musterstadt").modus?.einstellungen.endrundeAutomatisch, "Sommerturnier: Knopf statt Automatik");
      assert.ok(!nach("Europa-Pokal").modus?.einstellungen.endrundeAutomatisch, "Europa-Pokal: Knopf statt Automatik");

      // Europa-Pokal: Vorrunde fertig, Halbfinale koennen erzeugt werden
      const europa = await ansicht(nach("Europa-Pokal"));
      assert.deepEqual(europa.modus!.plan.filter((p) => p.erzeugbar).map((p) => p.planId).sort(), ["HF1", "HF2"]);
      assert.ok(europa.sp.every((s) => s.ergebnisA != null));

      // Fruehjahrsturnier: Spielplan ohne Ergebnisse
      const fruehjahr = await ansicht(nach("Frühjahrsturnier"));
      assert.ok(fruehjahr.sp.length > 0 && fruehjahr.sp.every((s) => s.ergebnisA == null));

      // Kader
      const spieler = await findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: (await ansicht(nach("Torball-Cup Musterstadt"))).mm[0]._id });
      assert.ok(spieler.length >= 3);
    } finally {
      // Nur aufraeumen, was dieser Lauf angelegt hat.
      for (const t of (await findAllByType<Turnier>("turnier")).filter((x) => !bisherigeTurniere.has(x._id))) {
        const mm = await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: t._id });
        for (const m of mm) {
          for (const s of await findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: m._id })) await deleteDoc(s._id, s._rev!);
          await deleteDoc(m._id, m._rev!);
        }
        for (const typ of ["spiel", "schiedsrichterImTurnier"] as const) {
          for (const d of (await findAllBySelector({ docType: typ, turnierId: t._id } as never)) as unknown as Doc[]) await deleteDoc(d._id, d._rev!);
        }
        await deleteDoc(t._id, t._rev!);
      }
      for (const d of await stammdaten()) {
        if (!vorhandeneStammdaten.has(d._id)) await deleteDoc(d._id, d._rev!);
      }
      if (!kontoVorher) {
        const konto = (await findAllByType<Benutzer>("benutzer")).find((b) => b.email === "demo-datenpflege@blindentorball.de");
        if (konto) {
          for (const sess of (await findAllBySelector({ docType: "session", benutzerId: konto._id } as never)) as unknown as Doc[]) await deleteDoc(sess._id, sess._rev!);
          await deleteDoc(konto._id, konto._rev!);
        }
      }
    }
  },
);

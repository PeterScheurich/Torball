import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MannschaftImTurnier, ModusEinstellungen, PlanSpielZustand, Spiel, Turnier } from "@torball/shared";
import {
  EINGEBAUTE_TURNIERMODI,
  findeEingebautenTurniermodus,
  pruefeModusEinstellungen,
  standardModusEinstellungen,
} from "@torball/shared";
import { findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireZugriff } from "../auth/plugin";
import {
  hatMindestens,
  turnierAusgecheckt,
  TURNIER_AUSGECHECKT_FEHLER,
  TURNIER_GESPERRT_FEHLER,
  turnierGesperrt,
  type Zugriffsstufe,
} from "../auth/turnierZugriff";
import { markiereTurnierBearbeitet } from "../turnier/bearbeitet";
import { aendereTurnierAtomar } from "../turnier/aenderung";
import { baueModusAnsicht, mannschaftenDerGruppe, type ModusAnsicht } from "../spielplan/modus";

/**
 * Turniermodi (Gruppen, Endrunde, Platzierungsspiele) - Konzept: Kanban-Karte "Turniermodi als
 * Vorlagen". Die Vorlagen sind in Stufe 1 eingebaut (shared/src/logik/turniermodus.ts); das Turnier
 * traegt eine KOPIE seiner Vorlage, damit ein lokal geplantes Turnier auch auf dem Server laeuft, der
 * die Vorlage nicht kennt. Spiele spaeterer Runden entstehen erst, wenn die Mannschaften feststehen
 * (`POST .../modus/erzeugen`) - bis dahin steht der Plan mit Platzhaltern am Turnier.
 */

const MODUS_GESPERRT_FEHLER =
  "Es wurden bereits Spiele der Endrunde erzeugt - Modus, Gruppen und Reihenfolge lassen sich nicht mehr ändern.";

async function ladeAnsicht(turnier: Turnier): Promise<ModusAnsicht | undefined> {
  const [mannschaften, spiele] = await Promise.all([
    findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id }),
    findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id }),
  ]);
  return baueModusAnsicht(turnier, mannschaften, spiele);
}

function endrundeErzeugt(turnier: Turnier): boolean {
  return Object.values(turnier.modus?.planZustand ?? {}).some((z) => Boolean(z.spielId));
}

export async function turniermodusRoutes(app: FastifyInstance): Promise<void> {
  /** Laedt das Turnier und prueft den Zugriff; bei Schreibzugriff zusaetzlich die Sperren (Abschluss, Checkout). */
  async function laden(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
    stufe: Zugriffsstufe,
    schreibend: boolean,
  ): Promise<Turnier | undefined> {
    if (!requireZugriff(req, reply)) return undefined;
    const turnier = await findById<Turnier>(req.params.id, "turnier");
    if (!turnier) {
      reply.code(404).send({ error: "Turnier nicht gefunden" });
      return undefined;
    }
    if (!(await hatMindestens(turnier, req, stufe))) {
      reply.code(403).send({ error: stufe === "lesen" ? "Kein Zugriff auf dieses Turnier" : "Kein Schreibzugriff auf dieses Turnier" });
      return undefined;
    }
    if (schreibend) {
      if (turnierGesperrt(turnier)) {
        reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
        return undefined;
      }
      if (await turnierAusgecheckt(turnier._id)) {
        reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
        return undefined;
      }
    }
    return turnier;
  }

  /** Die eingebauten Vorlagen (Stufe 1). Jede Anmeldung bzw. jeder Turnier-Code darf sie sehen. */
  app.get("/turniermodi", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    return EINGEBAUTE_TURNIERMODI;
  });

  /** Ablauf mit Platzhaltern, Zeiten und Rueckmeldungen - leer, wenn das Turnier keinen Modus hat. */
  app.get<{ Params: { id: string } }>("/turniere/:id/modus-plan", async (req, reply) => {
    const turnier = await laden(req, reply, "lesen", false);
    if (!turnier) return;
    return (await ladeAnsicht(turnier)) ?? { vorlage: null };
  });

  /** Modus waehlen/aendern. Bei einer anderen Vorlage werden die Einstellungen auf deren Standard gesetzt. */
  app.put<{ Params: { id: string }; Body: { turniermodusId: string; einstellungen?: ModusEinstellungen } }>(
    "/turniere/:id/modus",
    {
      schema: {
        body: {
          type: "object",
          required: ["turniermodusId"],
          properties: { turniermodusId: { type: "string", minLength: 1 }, einstellungen: { type: "object" } },
        },
      },
    },
    async (req, reply) => {
      const turnier = await laden(req, reply, "schreiben_voll", true);
      if (!turnier) return;
      if (endrundeErzeugt(turnier)) return reply.code(409).send({ error: MODUS_GESPERRT_FEHLER });
      const vorlage = findeEingebautenTurniermodus(req.body.turniermodusId);
      if (!vorlage) return reply.code(400).send({ error: "Diesen Turniermodus gibt es nicht." });
      const einstellungen =
        req.body.einstellungen ??
        (turnier.modus?.vorlage.id === vorlage.id ? turnier.modus.einstellungen : standardModusEinstellungen(vorlage));
      const fehler = pruefeModusEinstellungen(vorlage, einstellungen);
      if (fehler) return reply.code(400).send({ error: fehler });

      const aktualisiert = await aendereTurnierAtomar(turnier._id, (t) => ({
        ...t,
        modus: {
          vorlage,
          einstellungen,
          planZustand: {},
          // Eine manuelle Rangentscheidung gilt nur fuer die Vorrunde dieses Turniers - sie bleibt beim
          // Wechsel der Einstellungen erhalten, bei einer anderen Vorlage (andere Gruppen) nicht.
          vorrang: t.modus?.vorlage.id === vorlage.id ? t.modus.vorrang : undefined,
        },
      }));
      if (!aktualisiert) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      return (await ladeAnsicht(aktualisiert)) ?? { vorlage: null };
    },
  );

  /** Mannschaften nach der aktuellen Reihenfolge auf die Gruppen A und B verteilen (Schlangenverfahren). */
  app.post<{ Params: { id: string } }>("/turniere/:id/gruppen-verteilen", async (req, reply) => {
    const turnier = await laden(req, reply, "schreiben_voll", true);
    if (!turnier) return;
    if (turnier.modus?.vorlage.gruppen !== 2) {
      return reply.code(400).send({ error: "Der gewählte Turniermodus hat keine Gruppen." });
    }
    if (endrundeErzeugt(turnier)) return reply.code(409).send({ error: MODUS_GESPERRT_FEHLER });
    const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
    if (spiele.some((s) => s.status !== "geplant" || s.ergebnisAbgeschlossen)) {
      return reply.code(409).send({ error: "Es gibt bereits begonnene Spiele - die Gruppen lassen sich nicht mehr ändern." });
    }
    const mannschaften = (
      await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id })
    ).sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));
    // Schlange: A, B, B, A, A, B, B, A ... - gleichmaessig verteilt, die Staerksten treffen nicht zuerst aufeinander.
    const muster = ["A", "B", "B", "A"] as const;
    for (const [i, m] of mannschaften.entries()) {
      const gruppe = muster[i % 4];
      if (m.gruppe !== gruppe) await insertDoc<MannschaftImTurnier>({ ...m, gruppe });
    }
    await markiereTurnierBearbeitet(turnier._id, req.benutzer);
    return (await ladeAnsicht(turnier)) ?? { vorlage: null };
  });

  /**
   * Spiele erzeugen, deren Paarungen jetzt feststehen. `overrides` erlaubt der Turnierleitung, die
   * Mannschaften einer Paarung von Hand zu waehlen ("die Software warnt, entscheidet nie selbst") -
   * auch fuer eine noch offene Stelle. `planIds` begrenzt das Erzeugen auf einzelne Spiele.
   */
  app.post<{
    Params: { id: string };
    Body: { planIds?: string[]; overrides?: Record<string, { mannschaftAId: string; mannschaftBId: string }> };
  }>("/turniere/:id/modus/erzeugen", async (req, reply) => {
    const turnier = await laden(req, reply, "schreiben_spielbetrieb", true);
    if (!turnier) return;
    const ansicht = await ladeAnsicht(turnier);
    if (!ansicht) return reply.code(400).send({ error: "Dieses Turnier hat keinen Turniermodus." });

    const overrides = req.body?.overrides ?? {};
    const mannschaftIds = new Set(
      (await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id })).map((m) => m._id),
    );
    const bekannteIds = new Set(ansicht.plan.map((p) => p.planId));
    for (const [planId, o] of Object.entries(overrides)) {
      if (!bekannteIds.has(planId)) return reply.code(400).send({ error: `Unbekanntes Spiel im Plan: ${planId}.` });
      if (!mannschaftIds.has(o?.mannschaftAId) || !mannschaftIds.has(o?.mannschaftBId) || o.mannschaftAId === o.mannschaftBId) {
        return reply.code(400).send({ error: "Die gewählten Mannschaften gehören nicht zu diesem Turnier oder sind identisch." });
      }
    }
    const gewuenscht = req.body?.planIds ? new Set(req.body.planIds) : undefined;
    const ziele = ansicht.plan.filter(
      (p) => !p.spielId && (gewuenscht ? gewuenscht.has(p.planId) : true) && (p.erzeugbar || overrides[p.planId]),
    );
    if (ziele.length === 0) {
      return reply.code(409).send({ error: "Im Moment gibt es nichts zu erzeugen – die Paarungen stehen noch nicht fest." });
    }

    const neueSpiele: Spiel[] = [];
    for (const p of ziele) {
      const o = overrides[p.planId];
      const a = o?.mannschaftAId ?? p.mannschaftAId;
      const b = o?.mannschaftBId ?? p.mannschaftBId;
      if (!a || !b) return reply.code(409).send({ error: `Die Paarung „${p.bezeichnung}“ steht noch nicht fest.` });
      const id = newId("spiel");
      neueSpiele.push({
        _id: id,
        docType: "spiel",
        spielId: id,
        turnierId: turnier._id,
        // `runde` darf laut Typ auch ein Name sein ("Finale", "Platz 3").
        runde: p.bezeichnung,
        bezeichnung: p.bezeichnung,
        planId: p.planId,
        feldId: p.feldId,
        startzeitGeplant: p.startzeitGeplant,
        mannschaftAId: a,
        mannschaftBId: b,
        status: "geplant",
        istForfait: false,
        ergebnisAbgeschlossen: false,
      });
    }
    for (const s of neueSpiele) await insertDoc(s);

    const aktualisiert = await aendereTurnierAtomar(turnier._id, (t) => {
      if (!t.modus) return undefined;
      const zustand: Record<string, PlanSpielZustand> = { ...t.modus.planZustand };
      for (const s of neueSpiele) zustand[s.planId!] = { ...zustand[s.planId!], spielId: s._id };
      return { ...t, modus: { ...t.modus, planZustand: zustand } };
    });
    await markiereTurnierBearbeitet(turnier._id, req.benutzer);
    return reply.code(201).send({
      erzeugt: neueSpiele.map((s) => ({ spielId: s._id, bezeichnung: s.bezeichnung })),
      ansicht: aktualisiert ? await ladeAnsicht(aktualisiert) : undefined,
    });
  });

  /** Manuelle Rangentscheidung bei Gleichstand: Mannschafts-IDs in der gewuenschten Reihenfolge. */
  app.put<{ Params: { id: string }; Body: { gruppe: string; reihenfolge: string[] } }>(
    "/turniere/:id/modus/vorrang",
    {
      schema: {
        body: {
          type: "object",
          required: ["gruppe", "reihenfolge"],
          properties: {
            gruppe: { type: "string" },
            reihenfolge: { type: "array", items: { type: "string" }, maxItems: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      const turnier = await laden(req, reply, "schreiben_spielbetrieb", true);
      if (!turnier?.modus) {
        if (turnier) reply.code(400).send({ error: "Dieses Turnier hat keinen Turniermodus." });
        return;
      }
      if (endrundeErzeugt(turnier)) return reply.code(409).send({ error: MODUS_GESPERRT_FEHLER });
      const vorlage = turnier.modus.vorlage;
      const erlaubt = vorlage.gruppen === 2 ? ["A", "B"] : [""];
      if (!erlaubt.includes(req.body.gruppe)) return reply.code(400).send({ error: "Unbekannte Gruppe." });
      const mannschaften = await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id });
      const idsDerGruppe = new Set(mannschaftenDerGruppe(mannschaften, vorlage, req.body.gruppe).map((m) => m._id));
      const reihenfolge = req.body.reihenfolge;
      if (new Set(reihenfolge).size !== reihenfolge.length || reihenfolge.some((id) => !idsDerGruppe.has(id))) {
        return reply.code(400).send({ error: "Die Reihenfolge darf nur Mannschaften dieser Gruppe enthalten, jede höchstens einmal." });
      }
      const aktualisiert = await aendereTurnierAtomar(turnier._id, (t) =>
        t.modus ? { ...t, modus: { ...t.modus, vorrang: { ...t.modus.vorrang, [req.body.gruppe]: reihenfolge } } } : undefined,
      );
      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      return aktualisiert ? ((await ladeAnsicht(aktualisiert)) ?? { vorlage: null }) : { vorlage: null };
    },
  );

  /** Verschiebung (Minuten) und - bei Unentschieden - die Siegerentscheidung fuer ein Plan-Spiel. */
  app.put<{
    Params: { id: string; planId: string };
    Body: { versatzMinuten?: number | null; entscheidung?: string | null };
  }>(
    "/turniere/:id/modus/plan/:planId",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            versatzMinuten: { type: ["integer", "null"], minimum: -600, maximum: 600 },
            entscheidung: { type: ["string", "null"] },
          },
        },
      },
    },
    async (req, reply) => {
      const turnier = await laden(req, reply, "schreiben_spielbetrieb", true);
      if (!turnier?.modus) {
        if (turnier) reply.code(400).send({ error: "Dieses Turnier hat keinen Turniermodus." });
        return;
      }
      const ansicht = await ladeAnsicht(turnier);
      const eintrag = ansicht?.plan.find((p) => p.planId === req.params.planId);
      if (!eintrag) return reply.code(404).send({ error: "Spiel im Plan nicht gefunden" });

      const neu: PlanSpielZustand = { ...turnier.modus.planZustand[eintrag.planId] };
      if ("versatzMinuten" in req.body) {
        if (eintrag.spielId) {
          return reply.code(409).send({ error: "Das Spiel gibt es schon – die Startzeit bitte direkt am Spiel ändern." });
        }
        if (req.body.versatzMinuten) neu.versatzMinuten = req.body.versatzMinuten;
        else delete neu.versatzMinuten;
      }
      if ("entscheidung" in req.body) {
        if (req.body.entscheidung) {
          if (req.body.entscheidung !== eintrag.mannschaftAId && req.body.entscheidung !== eintrag.mannschaftBId) {
            return reply.code(400).send({ error: "Die Siegermannschaft muss eine der beiden Mannschaften dieses Spiels sein." });
          }
          neu.entscheidung = req.body.entscheidung;
        } else {
          delete neu.entscheidung;
        }
      }
      const aktualisiert = await aendereTurnierAtomar(turnier._id, (t) =>
        t.modus ? { ...t, modus: { ...t.modus, planZustand: { ...t.modus.planZustand, [eintrag.planId]: neu } } } : undefined,
      );
      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      return aktualisiert ? ((await ladeAnsicht(aktualisiert)) ?? { vorlage: null }) : { vorlage: null };
    },
  );
}

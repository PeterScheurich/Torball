import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  MannschaftImTurnier,
  ModusEinstellungen,
  PlanSpielZustand,
  Spiel,
  Turnier,
  TurniermodusDokument,
  TurniermodusVorlage,
} from "@torball/shared";
import {
  EINGEBAUTE_TURNIERMODI,
  findeEingebautenTurniermodus,
  pruefeModusEinstellungen,
  pruefeVorlagenAenderung,
  standardModusEinstellungen,
} from "@torball/shared";
import { deleteDoc, findAllByType, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireRolle, requireZugriff } from "../auth/plugin";
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
import { erzeugePlanSpiele, pruefeAutomatischeErzeugung } from "../spielplan/modusErzeugen";

/**
 * Turniermodi (Gruppen, Endrunde, Platzierungsspiele) - Konzept: Kanban-Karte "Turniermodi als
 * Vorlagen". Die Vorlagen sind in Stufe 1 eingebaut (shared/src/logik/turniermodus.ts); das Turnier
 * traegt eine KOPIE seiner Vorlage, damit ein lokal geplantes Turnier auch auf dem Server laeuft, der
 * die Vorlage nicht kennt. Spiele spaeterer Runden entstehen erst, wenn die Mannschaften feststehen
 * (`POST .../modus/erzeugen`) - bis dahin steht der Plan mit Platzhaltern am Turnier.
 */

const MODUS_GESPERRT_FEHLER =
  "Es wurden bereits Spiele der Endrunde erzeugt - Modus, Gruppen und Reihenfolge lassen sich nicht mehr ändern.";

/** Eine eigene Vorlage in der Form, in der Oberflaeche und Turnier sie kennen (`id` = Dokument-ID, nie schreibgeschuetzt). */
function alsVorlage(d: TurniermodusDokument): TurniermodusVorlage {
  return {
    id: d._id,
    name: d.name,
    beschreibung: d.beschreibung,
    version: d.version,
    eingebaut: false,
    gruppen: d.gruppen,
    doppeltWaehlbar: d.doppeltWaehlbar,
    endrundeGroessen: d.endrundeGroessen,
    standardEndrunde: d.standardEndrunde,
    platz3Standard: d.platz3Standard,
    platzierungsspieleStandard: d.platzierungsspieleStandard,
    endrundeTeilnehmerGerade: d.endrundeTeilnehmerGerade,
  };
}

/** Mitgelieferte ODER eigene Vorlage zu einer Kennung. */
async function ladeVorlage(id: string): Promise<TurniermodusVorlage | undefined> {
  const eingebaut = findeEingebautenTurniermodus(id);
  if (eingebaut) return eingebaut;
  const eigene = await findById<TurniermodusDokument>(id, "turniermodus");
  return eigene ? alsVorlage(eigene) : undefined;
}

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

  /** Mitgelieferte und eigene Vorlagen. Jede Anmeldung bzw. jeder Turnier-Code darf sie sehen. */
  app.get("/turniermodi", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const eigene = (await findAllByType<TurniermodusDokument>("turniermodus"))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map(alsVorlage);
    return [...EINGEBAUTE_TURNIERMODI, ...eigene];
  });

  /** Kopie einer Vorlage anlegen (Administration). Die Kopie ist eine eigene Vorlage und frei anpassbar. */
  app.post<{ Params: { id: string }; Body: { name?: string } | undefined }>("/turniermodi/:id/kopie", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    const quelle = await ladeVorlage(req.params.id);
    if (!quelle) return reply.code(404).send({ error: "Diesen Turniermodus gibt es nicht." });
    const wunsch = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const name = (wunsch || `${quelle.name} (Kopie)`).slice(0, 80);
    const id = newId("turniermodus");
    const kopie = await insertDoc<TurniermodusDokument>({
      ...quelle,
      _id: id,
      docType: "turniermodus",
      id,
      name,
      version: 1,
      eingebaut: false,
      kopieVon: quelle.id,
      erstelltAm: new Date().toISOString(),
      erstelltVonName: req.benutzer?.name,
    });
    return reply.code(201).send(alsVorlage(kopie));
  });

  /** Eine EIGENE Vorlage aendern. Mitgelieferte sind schreibgeschuetzt; Gruppenzahl und Gerade-Regel bleiben fest. */
  app.put<{ Params: { id: string }; Body: unknown }>("/turniermodi/:id", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    if (findeEingebautenTurniermodus(req.params.id)) {
      return reply.code(400).send({ error: "Mitgelieferte Vorlagen sind schreibgeschützt – bitte zuerst eine Kopie anlegen." });
    }
    const bestehend = await findById<TurniermodusDokument>(req.params.id, "turniermodus");
    if (!bestehend) return reply.code(404).send({ error: "Diesen Turniermodus gibt es nicht." });
    const geprueft = pruefeVorlagenAenderung(req.body);
    if ("fehler" in geprueft) return reply.code(400).send({ error: geprueft.fehler });
    // Nur die geprueften Felder uebernehmen (kein Spread des Bodys: Identitaet und Bausteine bleiben, wie sie sind).
    const gespeichert = await insertDoc<TurniermodusDokument>({ ...bestehend, ...geprueft.werte, version: bestehend.version + 1 });
    return alsVorlage(gespeichert);
  });

  /** Eine eigene Vorlage loeschen. Turniere tragen eine Kopie und laufen unveraendert weiter. */
  app.delete<{ Params: { id: string } }>("/turniermodi/:id", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    if (findeEingebautenTurniermodus(req.params.id)) {
      return reply.code(400).send({ error: "Mitgelieferte Vorlagen lassen sich nicht löschen." });
    }
    const bestehend = await findById<TurniermodusDokument>(req.params.id, "turniermodus");
    if (!bestehend) return reply.code(404).send({ error: "Diesen Turniermodus gibt es nicht." });
    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
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
      const vorlage = await ladeVorlage(req.body.turniermodusId);
      if (!vorlage) return reply.code(400).send({ error: "Diesen Turniermodus gibt es nicht." });
      const einstellungen =
        req.body.einstellungen ??
        (turnier.modus?.vorlage.id === vorlage.id ? turnier.modus.einstellungen : standardModusEinstellungen(vorlage));
      const fehler = pruefeModusEinstellungen(vorlage, einstellungen);
      if (fehler) return reply.code(400).send({ error: fehler });
      // Sind schon Spiele der Endrunde erzeugt, ist alles fest - bis auf die Automatik: sie betrifft nur die noch
      // nicht erzeugten Spiele (die naechste Stufe) und muss sich deshalb weiter ein- und ausschalten lassen.
      if (endrundeErzeugt(turnier)) {
        const bisher = turnier.modus?.einstellungen;
        const nurAutomatik =
          turnier.modus?.vorlage.id === vorlage.id &&
          bisher !== undefined &&
          bisher.endrundeGroesse === einstellungen.endrundeGroesse && bisher.platz3 === einstellungen.platz3 && bisher.platzierungsspiele === einstellungen.platzierungsspiele;
        if (!nurAutomatik) return reply.code(409).send({ error: MODUS_GESPERRT_FEHLER });
      }
      // Ein anderer Modus (andere Gruppen) passt nicht mehr zu bereits begonnenen Vorrundenspielen.
      if ((turnier.modus?.vorlage.id ?? "jeder-gegen-jeden") !== vorlage.id) {
        const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
        if (spiele.some((s) => s.status !== "geplant" || s.ergebnisAbgeschlossen)) {
          return reply.code(409).send({ error: "Es gibt bereits begonnene Spiele – der Turniermodus lässt sich nicht mehr wechseln." });
        }
      }

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
      await pruefeAutomatischeErzeugung(turnier._id, req.log);
      return (await ladeAnsicht((await findById<Turnier>(turnier._id, "turnier")) ?? aktualisiert)) ?? { vorlage: null };
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

    const ergebnis = await erzeugePlanSpiele(turnier, ansicht, ziele, overrides);
    if (ergebnis.art === "offen") {
      return reply.code(409).send({ error: `Die Paarung „${ergebnis.bezeichnung}“ steht noch nicht fest.` });
    }
    if (ergebnis.art === "bereits-erzeugt") {
      return reply.code(409).send({ error: "Diese Spiele wurden gerade schon erzeugt – bitte die Seite neu laden." });
    }
    await markiereTurnierBearbeitet(turnier._id, req.benutzer);
    const aktuell = await findById<Turnier>(turnier._id, "turnier");
    return reply.code(201).send({
      erzeugt: ergebnis.spiele.map((s) => ({ spielId: s._id, bezeichnung: s.bezeichnung })),
      ansicht: aktuell ? await ladeAnsicht(aktuell) : undefined,
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
        t.modus
          ? {
              ...t,
              modus: {
                ...t.modus,
                // Mehrere Gleichstaende einer Gruppe (z. B. Plaetze 2-3 und 5-6) laufen in EINER Liste: die neue
                // Entscheidung ersetzt nur die genannten Mannschaften, fruehere bleiben davor stehen.
                vorrang: {
                  ...t.modus.vorrang,
                  [req.body.gruppe]: [
                    ...(t.modus.vorrang?.[req.body.gruppe] ?? []).filter((id) => !reihenfolge.includes(id)),
                    ...reihenfolge,
                  ],
                },
              },
            }
          : undefined,
      );
      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      await pruefeAutomatischeErzeugung(turnier._id, req.log);
      const frisch = await findById<Turnier>(turnier._id, "turnier");
      return frisch ? ((await ladeAnsicht(frisch)) ?? { vorlage: null }) : { vorlage: null };
    },
  );

  /**
   * Halle, Startzeit (als Verschiebung gegenueber der automatischen Zeit), Verschiebung in Minuten und - bei
   * Unentschieden - die Siegerentscheidung fuer ein Plan-Spiel. `feldId: null` und `versatzMinuten: null` stellen
   * die Automatik wieder her.
   */
  app.put<{
    Params: { id: string; planId: string };
    Body: { versatzMinuten?: number | null; entscheidung?: string | null; feldId?: string | null; startzeitGeplant?: string };
  }>(
    "/turniere/:id/modus/plan/:planId",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            versatzMinuten: { type: ["integer", "null"], minimum: -600, maximum: 600 },
            entscheidung: { type: ["string", "null"] },
            feldId: { type: ["string", "null"] },
            startzeitGeplant: { type: "string", format: "date-time" },
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
      if ("feldId" in req.body) {
        if (eintrag.spielId) {
          return reply.code(409).send({ error: "Das Spiel gibt es schon – die Halle bitte direkt am Spiel ändern." });
        }
        if (req.body.feldId) {
          if (!turnier.felder.some((f) => f.feldId === req.body.feldId)) {
            return reply.code(400).send({ error: "Diese Halle gehört nicht zu diesem Turnier." });
          }
          neu.feldManuell = req.body.feldId;
        } else {
          delete neu.feldManuell;
        }
      }
      if (req.body.startzeitGeplant) {
        if (eintrag.spielId) {
          return reply.code(409).send({ error: "Das Spiel gibt es schon – die Startzeit bitte direkt am Spiel ändern." });
        }
        // Die Startzeit wird als Verschiebung gegenueber der AUTOMATISCHEN Zeit gespeichert (mit der gerade
        // gewaehlten Halle): So rueckt das Spiel mit, wenn sich davor etwas aendert, und abhaengige Spiele
        // folgen wie bei jeder Verschiebung.
        const ohneVersatz: PlanSpielZustand = { ...neu };
        delete ohneVersatz.versatzMinuten;
        const basis = await ladeAnsicht({
          ...turnier,
          modus: { ...turnier.modus, planZustand: { ...turnier.modus.planZustand, [eintrag.planId]: ohneVersatz } },
        });
        const basisStart = basis?.plan.find((p) => p.planId === eintrag.planId)?.startzeitGeplant;
        if (!basisStart) return reply.code(409).send({ error: "Die Startzeit lässt sich erst ändern, wenn die Zeiten berechnet sind." });
        const versatz = Math.round((new Date(req.body.startzeitGeplant).getTime() - new Date(basisStart).getTime()) / 60_000);
        if (Math.abs(versatz) > 600) {
          return reply.code(400).send({ error: "Die Startzeit liegt mehr als zehn Stunden neben der berechneten Zeit." });
        }
        if (versatz) neu.versatzMinuten = versatz;
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
      if ("entscheidung" in req.body) await pruefeAutomatischeErzeugung(turnier._id, req.log);
      const frisch = await findById<Turnier>(turnier._id, "turnier");
      return aktualisiert && frisch ? ((await ladeAnsicht(frisch)) ?? { vorlage: null }) : { vorlage: null };
    },
  );
}

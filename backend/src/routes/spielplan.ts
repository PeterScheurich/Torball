import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MannschaftImTurnier, Spiel, SpielplanBasis, Turnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { erzeugePaarungen } from "../spielplan/paarungen";
import { erstelleSpielplanVorschlag, type SpielplanEintrag } from "../spielplan/planung";
import { berechneStartzeit } from "../spielplan/zeitplanung";
import { requireZugriff } from "../auth/plugin";
import {
  hatMindestens,
  TURNIER_GESPERRT_FEHLER,
  turnierGesperrt,
  zuschreibung,
  type Zugriffsstufe,
} from "../auth/turnierZugriff";

interface SpielplanQuery {
  /** 1 = einfaches Turnier (Jeder-gegen-Jeden), 2 = doppeltes Turnier. Default 1. */
  wiederholungen?: string;
}

interface SpielplanPersistierenBody {
  /**
   * Optional: die im Frontend ggf. manuell umsortierte Vorschau (aus
   * GET .../spielplan-vorschlag). Wenn gesetzt, wird GENAU diese Reihenfolge
   * gespeichert statt den Vorschlag neu zu berechnen - sonst wuerde eine
   * manuelle Umsortierung beim Uebernehmen verworfen.
   */
  eintraege?: SpielplanEintrag[];
}

/** Ordnungs-/feld-unabhaengiger Vergleichsschluessel: gleiche Paarung im gleichen Slot auf demselben Feld. */
function kanonischerSchluessel(s: {
  runde?: string;
  feldId?: string;
  mannschaftAId: string;
  mannschaftBId: string;
}): string {
  const teams = [s.mannschaftAId, s.mannschaftBId].sort().join("|");
  return `${s.runde ?? ""}#${s.feldId ?? ""}#${teams}`;
}

/** Vergleicht als Multiset (Reihenfolge egal), damit z.B. zwei zeitgleiche Spiele auf verschiedenen Feldern nicht faelschlich als "unterschiedlich" gelten. */
function inhaltlichGleich(
  bestehende: Spiel[],
  neu: { runde?: string; feldId?: string; mannschaftAId: string; mannschaftBId: string }[],
): boolean {
  if (bestehende.length !== neu.length) return false;
  const bestehendeSchluessel = bestehende.map(kanonischerSchluessel).sort();
  const neueSchluessel = neu.map(kanonischerSchluessel).sort();
  return bestehendeSchluessel.every((k, i) => k === neueSchluessel[i]);
}

interface VorschlagErgebnis {
  turnier: Turnier;
  vorschlag: SpielplanEintrag[];
  wiederholungen: 1 | 2;
}

/** Laedt Turnier + Mannschaften und berechnet den Spielplan-Vorschlag; gemeinsame Basis fuer GET (Vorschau) und POST (Persistierung). */
async function ladeUndBerechneVorschlag(
  turnierId: string,
  query: SpielplanQuery,
  req: FastifyRequest,
  reply: FastifyReply,
  mindestens: Zugriffsstufe,
): Promise<VorschlagErgebnis | undefined> {
  const turnier = await findById<Turnier>(turnierId);
  if (!turnier) {
    reply.code(404).send({ error: "Turnier nicht gefunden" });
    return undefined;
  }
  if (!(await hatMindestens(turnier, req, mindestens))) {
    reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    return undefined;
  }

  if (turnier.felder.length === 0) {
    reply.code(400).send({ error: "Turnier hat noch keine Spielfelder definiert" });
    return undefined;
  }

  // "Spielplan neu generieren" (Abschnitt 8) ist vorgesehen, darf aber keine bereits
  // laufenden/abgeschlossenen Spiele verwerfen - diese Sperre gilt bereits fuer den
  // Vorschlag (GET), nicht erst beim Persistieren: sonst kann eine Vorschau angezeigt
  // werden, die beim Uebernehmen ohnehin abgelehnt wuerde.
  const bestehendeSpiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
  const gesperrt = bestehendeSpiele.some((spiel) => spiel.status !== "geplant" || spiel.ergebnisAbgeschlossen);
  if (gesperrt) {
    reply.code(409).send({
      error: "Spielplan kann nicht neu erzeugt werden: es gibt bereits laufende oder abgeschlossene Spiele",
    });
    return undefined;
  }

  const wiederholungen = query.wiederholungen === "2" ? 2 : 1;

  const mannschaften = (
    await findAllBySelector<MannschaftImTurnier>({
      docType: "mannschaftImTurnier",
      turnierId: turnier._id,
    })
  ).sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));

  if (mannschaften.length < 2) {
    reply.code(400).send({ error: "Mindestens zwei Mannschaften erforderlich, um einen Spielplan zu erstellen" });
    return undefined;
  }

  const paarungen = erzeugePaarungen(mannschaften, wiederholungen);
  const vorschlag = erstelleSpielplanVorschlag(paarungen, turnier.felder);

  return { turnier, vorschlag, wiederholungen };
}

export async function spielplanRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: SpielplanQuery }>(
    "/turniere/:id/spielplan-vorschlag",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const ergebnis = await ladeUndBerechneVorschlag(req.params.id, req.query, req, reply, "lesen");
      if (!ergebnis) return;
      const { turnier, vorschlag, wiederholungen } = ergebnis;
      const spiele = vorschlag.map((eintrag) => ({
        ...eintrag,
        startzeitGeplant: berechneStartzeit(turnier, eintrag.slot),
      }));
      return { turnierId: turnier._id, wiederholungen, spiele };
    },
  );

  app.post<{ Params: { id: string }; Querystring: SpielplanQuery; Body: SpielplanPersistierenBody }>(
    "/turniere/:id/spielplan",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      let turnier: Turnier;
      let vorschlag: SpielplanEintrag[];

      if (req.body?.eintraege) {
        // Frontend hat bereits eine (ggf. manuell umsortierte) Vorschau gezeigt - genau
        // diese wird gespeichert, statt sie hier blind neu zu berechnen und die
        // Umsortierung des Nutzers zu verwerfen.
        const geladenesTurnier = await findById<Turnier>(req.params.id);
        if (!geladenesTurnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
        if (!(await hatMindestens(geladenesTurnier, req, "schreiben_voll"))) {
          return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
        }
        turnier = geladenesTurnier;
        vorschlag = req.body.eintraege;
      } else {
        const ergebnis = await ladeUndBerechneVorschlag(req.params.id, req.query, req, reply, "schreiben_voll");
        if (!ergebnis) return;
        turnier = ergebnis.turnier;
        vorschlag = ergebnis.vorschlag;
      }

      // Bei abgeschlossenem Turnier kein Spielplan-Speichern mehr (erst wieder oeffnen).
      if (turnierGesperrt(turnier)) {
        return reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
      }

      // "Spielplan neu generieren" (Abschnitt 8) ist vorgesehen, darf aber keine bereits
      // laufenden/abgeschlossenen Spiele verwerfen.
      const bestehende = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
      const gesperrt = bestehende.some((spiel) => spiel.status !== "geplant" || spiel.ergebnisAbgeschlossen);
      if (gesperrt) {
        return reply.code(409).send({
          error: "Spielplan kann nicht neu erzeugt werden: es gibt bereits laufende oder abgeschlossene Spiele",
        });
      }

      // Keine neue Version anlegen, wenn sich inhaltlich nichts geaendert hat (z.B. mehrfaches
      // Klicken auf "Spielplan neu erzeugen" ohne zwischenzeitliche Aenderung an Mannschaften
      // oder Reihenfolge) - sonst waechst die Versionsnummer ohne echten Grund.
      if (bestehende.length > 0 && inhaltlichGleich(bestehende, vorschlag.map((e) => ({ ...e, runde: String(e.slot + 1) })))) {
        return reply.code(200).send({
          turnierId: turnier._id,
          spielplanVersion: turnier.spielplanVersion,
          anzahlSpiele: bestehende.length,
          spiele: bestehende,
          unveraendert: true,
        });
      }

      for (const alt of bestehende) {
        await deleteDoc(alt._id, alt._rev!);
      }

      const spiele: Spiel[] = vorschlag.map((eintrag) => {
        const id = newId("spiel");
        return {
          _id: id,
          docType: "spiel",
          spielId: id,
          turnierId: turnier._id,
          runde: String(eintrag.slot + 1),
          feldId: eintrag.feldId,
          startzeitGeplant: berechneStartzeit(turnier, eintrag.slot),
          mannschaftAId: eintrag.mannschaftAId,
          mannschaftBId: eintrag.mannschaftBId,
          status: "geplant",
          istForfait: false,
          ergebnisAbgeschlossen: false,
        };
      });

      for (const spiel of spiele) {
        await insertDoc(spiel);
      }

      // Schnappschuss der spielplan-relevanten Basiskonfiguration festhalten, damit spaeter
      // konkret angezeigt werden kann, was sich seit dieser Erzeugung geaendert hat.
      const mannschaftenBasis = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: turnier._id,
      });
      const spielplanBasis: SpielplanBasis = {
        spielplanModus: turnier.spielplanModus,
        felder: turnier.felder,
        mannschaften: mannschaftenBasis
          .sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0))
          .map((m) => ({ id: m._id, name: m.name })),
        spielzeitMinuten: turnier.spielzeitMinuten,
        pauseMinuten: turnier.pauseMinuten,
        anzahlHalbzeiten: turnier.anzahlHalbzeiten,
        startzeit: turnier.startzeit,
      };

      const zuschreiber = zuschreibung(req);
      const aktualisiertesTurnier: Turnier = {
        ...turnier,
        spielplanVersion: turnier.spielplanVersion + 1,
        spielplanGeaendertAm: new Date().toISOString(),
        spielplanBasis,
        zuletztBearbeitetVon: zuschreiber.benutzerId,
        zuletztBearbeitetVonName: zuschreiber.name,
      };
      await insertDoc(aktualisiertesTurnier);

      return reply.code(201).send({
        turnierId: turnier._id,
        spielplanVersion: aktualisiertesTurnier.spielplanVersion,
        anzahlSpiele: spiele.length,
        spiele,
      });
    },
  );
}

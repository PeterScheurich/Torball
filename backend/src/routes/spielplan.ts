import type { FastifyInstance, FastifyReply } from "fastify";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { erzeugePaarungen } from "../spielplan/paarungen";
import { erstelleSpielplanVorschlag, type SpielplanEintrag } from "../spielplan/planung";
import { berechneStartzeit } from "../spielplan/zeitplanung";

interface SpielplanQuery {
  /** 1 = einfaches Turnier (Jeder-gegen-Jeden), 2 = doppeltes Turnier. Default 1. */
  wiederholungen?: string;
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
  reply: FastifyReply,
): Promise<VorschlagErgebnis | undefined> {
  const turnier = await findById<Turnier>(turnierId);
  if (!turnier) {
    reply.code(404).send({ error: "Turnier nicht gefunden" });
    return undefined;
  }

  if (turnier.felder.length === 0) {
    reply.code(400).send({ error: "Turnier hat noch keine Spielfelder definiert" });
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
      const ergebnis = await ladeUndBerechneVorschlag(req.params.id, req.query, reply);
      if (!ergebnis) return;
      const { turnier, vorschlag, wiederholungen } = ergebnis;
      const spiele = vorschlag.map((eintrag) => ({
        ...eintrag,
        startzeitGeplant: berechneStartzeit(turnier, eintrag.slot),
      }));
      return { turnierId: turnier._id, wiederholungen, spiele };
    },
  );

  app.post<{ Params: { id: string }; Querystring: SpielplanQuery }>(
    "/turniere/:id/spielplan",
    async (req, reply) => {
      const ergebnis = await ladeUndBerechneVorschlag(req.params.id, req.query, reply);
      if (!ergebnis) return;
      const { turnier, vorschlag } = ergebnis;

      // "Spielplan neu generieren" (Abschnitt 8) ist vorgesehen, darf aber keine bereits
      // laufenden/abgeschlossenen Spiele verwerfen.
      const bestehende = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
      const gesperrt = bestehende.some((spiel) => spiel.status !== "geplant" || spiel.ergebnisAbgeschlossen);
      if (gesperrt) {
        return reply.code(409).send({
          error: "Spielplan kann nicht neu erzeugt werden: es gibt bereits laufende oder abgeschlossene Spiele",
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

      const aktualisiertesTurnier: Turnier = {
        ...turnier,
        spielplanVersion: turnier.spielplanVersion + 1,
        spielplanGeaendertAm: new Date().toISOString(),
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

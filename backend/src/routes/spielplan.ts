import type { FastifyInstance } from "fastify";
import type { MannschaftImTurnier, Turnier } from "@torball/shared";
import { findAllBySelector, findById } from "../repository";
import { erzeugePaarungen } from "../spielplan/paarungen";
import { erstelleSpielplanVorschlag } from "../spielplan/planung";

interface SpielplanQuery {
  /** 1 = einfaches Turnier (Jeder-gegen-Jeden), 2 = doppeltes Turnier. Default 1. */
  wiederholungen?: string;
}

export async function spielplanRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: SpielplanQuery }>(
    "/turniere/:id/spielplan-vorschlag",
    async (req, reply) => {
      const turnier = await findById<Turnier>(req.params.id);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

      if (turnier.felder.length === 0) {
        return reply.code(400).send({ error: "Turnier hat noch keine Spielfelder definiert" });
      }

      const wiederholungen = req.query.wiederholungen === "2" ? 2 : 1;

      const mannschaften = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: turnier._id,
      });

      if (mannschaften.length < 2) {
        return reply
          .code(400)
          .send({ error: "Mindestens zwei Mannschaften erforderlich, um einen Spielplan zu erstellen" });
      }

      const paarungen = erzeugePaarungen(mannschaften, wiederholungen);
      const vorschlag = erstelleSpielplanVorschlag(paarungen, turnier.felder);

      return { turnierId: turnier._id, wiederholungen, spiele: vorschlag };
    },
  );
}

import type { FastifyInstance } from "fastify";
import type { Spiel } from "@torball/shared";
import { findAllBySelector, findById, insertDoc } from "../repository";

/** Nur diese Felder darf die Turnierleitung nachtraeglich anpassen (Abschnitt 8: "Reihenfolge, Spielfeld und Startzeiten"). */
interface SpielAnpassungBody {
  runde?: string;
  feldId?: string;
  startzeitGeplant?: string;
}

const spielAnpassungSchema = {
  type: "object",
  properties: {
    runde: { type: "string" },
    feldId: { type: "string" },
    startzeitGeplant: { type: "string" },
  },
} as const;

export async function spielRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { turnierId: string } }>("/turniere/:turnierId/spiele", async (req) => {
    return findAllBySelector<Spiel>({ docType: "spiel", turnierId: req.params.turnierId });
  });

  app.get<{ Params: { id: string } }>("/spiele/:id", async (req, reply) => {
    const spiel = await findById<Spiel>(req.params.id);
    if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
    return spiel;
  });

  app.put<{ Params: { id: string }; Body: SpielAnpassungBody }>(
    "/spiele/:id",
    { schema: { body: spielAnpassungSchema } },
    async (req, reply) => {
      const bestehend = await findById<Spiel>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Spiel nicht gefunden" });
      const aktualisiert: Spiel = { ...bestehend, ...req.body };
      return insertDoc(aktualisiert);
    },
  );
}

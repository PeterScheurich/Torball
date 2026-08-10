import type { FastifyInstance } from "fastify";
import type { Team, Verein } from "@torball/shared";
import { deleteDoc, findAllByType, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireAuth } from "../auth/plugin";

interface VereinBody {
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
}

const vereinBodySchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    logo: { type: "string" },
    bundesland: { type: "string" },
    ansprechpartnerName: { type: "string" },
    ansprechpartnerTelefon: { type: "string" },
    ansprechpartnerEmail: { type: "string" },
  },
} as const;

export async function vereinRoutes(app: FastifyInstance): Promise<void> {
  app.get("/vereine", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return findAllByType<Verein>("verein");
  });

  app.get<{ Params: { id: string } }>("/vereine/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const verein = await findById<Verein>(req.params.id);
    if (!verein) return reply.code(404).send({ error: "Verein nicht gefunden" });
    return verein;
  });

  app.post<{ Body: VereinBody }>(
    "/vereine",
    { schema: { body: vereinBodySchema } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const id = newId("verein");
      const verein: Verein = {
        _id: id,
        docType: "verein",
        vereinId: id,
        ...req.body,
      };
      const gespeichert = await insertDoc(verein);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: VereinBody }>(
    "/vereine/:id",
    { schema: { body: vereinBodySchema } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const bestehend = await findById<Verein>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Verein nicht gefunden" });
      const aktualisiert: Verein = { ...bestehend, ...req.body };
      return insertDoc(aktualisiert);
    },
  );

  app.delete<{ Params: { id: string } }>("/vereine/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const bestehend = await findById<Verein>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Verein nicht gefunden" });

    // Referenzielle Integritaet wie im Datenmodell vorgesehen (fk_team_verein: ON DELETE RESTRICT).
    const teams = await findAllBySelector<Team>({ docType: "team", vereinId: bestehend._id });
    if (teams.length > 0) {
      return reply
        .code(409)
        .send({ error: "Verein hat noch zugeordnete Teams und kann nicht geloescht werden" });
    }

    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

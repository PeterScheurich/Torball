import type { FastifyInstance } from "fastify";
import type { Team } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";

interface TeamBody {
  vereinId: string;
  name: string;
  logoOverride?: string;
}

const teamBodySchema = {
  type: "object",
  required: ["vereinId", "name"],
  properties: {
    vereinId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    logoOverride: { type: "string" },
  },
} as const;

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.get("/teams", async () => {
    return findAllByType<Team>("team");
  });

  app.get<{ Params: { id: string } }>("/teams/:id", async (req, reply) => {
    const team = await findById<Team>(req.params.id);
    if (!team) return reply.code(404).send({ error: "Team nicht gefunden" });
    return team;
  });

  app.post<{ Body: TeamBody }>(
    "/teams",
    { schema: { body: teamBodySchema } },
    async (req, reply) => {
      const vereinExistiert = await findById(req.body.vereinId);
      if (!vereinExistiert) {
        return reply.code(400).send({ error: "Referenzierter Verein existiert nicht" });
      }

      const id = newId("team");
      const team: Team = {
        _id: id,
        docType: "team",
        teamId: id,
        ...req.body,
      };
      const gespeichert = await insertDoc(team);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: TeamBody }>(
    "/teams/:id",
    { schema: { body: teamBodySchema } },
    async (req, reply) => {
      const bestehend = await findById<Team>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Team nicht gefunden" });
      const aktualisiert: Team = { ...bestehend, ...req.body };
      return insertDoc(aktualisiert);
    },
  );

  app.delete<{ Params: { id: string } }>("/teams/:id", async (req, reply) => {
    const bestehend = await findById<Team>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Team nicht gefunden" });
    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

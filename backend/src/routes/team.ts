import type { FastifyInstance } from "fastify";
import type { Team } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";
import { requireAuth, requireRolle } from "../auth/plugin";

// CRUD fuer Teams (Stammdaten: ein Team gehoert immer zu einem Verein). Lesen verlangt nur eine
// Anmeldung, Schreiben (Anlegen/Aendern/Loeschen) ist auf Admin/Manager beschraenkt - siehe
// verein.ts (analoge Begruendung) bzw. CLAUDE.md, Berechtigungsmodell.

/** Vom Client setzbare Felder eines Teams. */
interface TeamBody {
  vereinId: string;
  name: string;
  logoOverride?: string;
}

/** Fastify-Body-Schema: erzwingt Verein-Referenz und Name serverseitig (400 bei Verstoss). */
const teamBodySchema = {
  type: "object",
  required: ["vereinId", "name"],
  properties: {
    vereinId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    logoOverride: { type: "string" },
  },
} as const;

/** Registriert die Team-Routen (GET-Liste, GET-einzeln, POST, PUT, DELETE) an der App-Instanz. */
export async function teamRoutes(app: FastifyInstance): Promise<void> {
  // Alle Teams (turnieruebergreifende Stammdaten).
  app.get("/teams", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return findAllByType<Team>("team");
  });

  // Einzelnes Team per ID.
  app.get<{ Params: { id: string } }>("/teams/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const team = await findById<Team>(req.params.id);
    if (!team) return reply.code(404).send({ error: "Team nicht gefunden" });
    return team;
  });

  // Neues Team anlegen. Der referenzierte Verein muss existieren (sonst 400), damit keine
  // verwaisten Team->Verein-Referenzen entstehen.
  app.post<{ Body: TeamBody }>(
    "/teams",
    { schema: { body: teamBodySchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
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

  // Team aktualisieren (ersetzt Name/Verein/Logo aus dem Body, uebrige Felder bleiben).
  app.put<{ Params: { id: string }; Body: TeamBody }>(
    "/teams/:id",
    { schema: { body: teamBodySchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const bestehend = await findById<Team>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Team nicht gefunden" });
      const aktualisiert: Team = { ...bestehend, ...req.body };
      return insertDoc(aktualisiert);
    },
  );

  // Team loeschen.
  app.delete<{ Params: { id: string } }>("/teams/:id", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin", "manager"])) return;
    const bestehend = await findById<Team>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Team nicht gefunden" });
    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

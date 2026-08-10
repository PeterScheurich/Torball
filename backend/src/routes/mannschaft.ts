import type { FastifyInstance } from "fastify";
import type { MannschaftImTurnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";

interface MannschaftBody {
  turnierId: string;
  teamId?: string;
  vereinId?: string;
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
}

const mannschaftBodySchema = {
  type: "object",
  required: ["turnierId", "name"],
  properties: {
    turnierId: { type: "string", minLength: 1 },
    teamId: { type: "string" },
    vereinId: { type: "string" },
    name: { type: "string", minLength: 1 },
    logo: { type: "string" },
    bundesland: { type: "string" },
    ansprechpartnerName: { type: "string" },
    ansprechpartnerTelefon: { type: "string" },
    ansprechpartnerEmail: { type: "string" },
  },
} as const;

interface MannschaftAktualisierungBody {
  teamId?: string;
  vereinId?: string;
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
}

const mannschaftAktualisierungSchema = {
  type: "object",
  required: ["name"],
  properties: {
    teamId: { type: "string" },
    vereinId: { type: "string" },
    name: { type: "string", minLength: 1 },
    logo: { type: "string" },
    bundesland: { type: "string" },
    ansprechpartnerName: { type: "string" },
    ansprechpartnerTelefon: { type: "string" },
    ansprechpartnerEmail: { type: "string" },
  },
} as const;

interface ReihenfolgeBody {
  mannschaftIds: string[];
}

const reihenfolgeSchema = {
  type: "object",
  required: ["mannschaftIds"],
  properties: {
    mannschaftIds: { type: "array", items: { type: "string" }, minItems: 1 },
  },
} as const;

export async function mannschaftRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { turnierId: string } }>("/turniere/:turnierId/mannschaften", async (req) => {
    return findAllBySelector<MannschaftImTurnier>({
      docType: "mannschaftImTurnier",
      turnierId: req.params.turnierId,
    });
  });

  app.get<{ Params: { id: string } }>("/mannschaften/:id", async (req, reply) => {
    const mannschaft = await findById<MannschaftImTurnier>(req.params.id);
    if (!mannschaft) return reply.code(404).send({ error: "Mannschaft nicht gefunden" });
    return mannschaft;
  });

  app.post<{ Body: MannschaftBody }>(
    "/mannschaften",
    { schema: { body: mannschaftBodySchema } },
    async (req, reply) => {
      const turnier = await findById(req.body.turnierId);
      if (!turnier) {
        return reply.code(400).send({ error: "Referenziertes Turnier existiert nicht" });
      }

      // Neue Mannschaft wird immer ans Ende der bisherigen Reihenfolge angehaengt.
      const bestehende = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: req.body.turnierId,
      });
      const naechsteReihenfolge = bestehende.reduce((max, m) => Math.max(max, m.reihenfolge ?? 0), -1) + 1;

      const id = newId("mannschaftImTurnier");
      const mannschaft: MannschaftImTurnier = {
        _id: id,
        docType: "mannschaftImTurnier",
        mannschaftId: id,
        reihenfolge: naechsteReihenfolge,
        ...req.body,
      };
      const gespeichert = await insertDoc(mannschaft);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: MannschaftAktualisierungBody }>(
    "/mannschaften/:id",
    { schema: { body: mannschaftAktualisierungSchema } },
    async (req, reply) => {
      const bestehend = await findById<MannschaftImTurnier>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Mannschaft nicht gefunden" });
      const aktualisiert: MannschaftImTurnier = { ...bestehend, ...req.body };
      return insertDoc(aktualisiert);
    },
  );

  /** Reihenfolge der Mannschaften aendern - wirkt sich auf kuenftig erzeugte Spielplan-Vorschlaege aus. */
  app.put<{ Params: { turnierId: string }; Body: ReihenfolgeBody }>(
    "/turniere/:turnierId/mannschaften/reihenfolge",
    { schema: { body: reihenfolgeSchema } },
    async (req, reply) => {
      const bestehende = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: req.params.turnierId,
      });

      const bestehendeIds = new Set(bestehende.map((m) => m._id));
      const { mannschaftIds } = req.body;
      const passtZusammen =
        mannschaftIds.length === bestehende.length && mannschaftIds.every((id) => bestehendeIds.has(id));
      if (!passtZusammen) {
        return reply
          .code(400)
          .send({ error: "mannschaftIds muss exakt alle Mannschaften dieses Turniers enthalten, je einmal" });
      }

      const mannschaftenNachId = new Map(bestehende.map((m) => [m._id, m]));
      const aktualisiert: MannschaftImTurnier[] = [];
      for (const [index, id] of mannschaftIds.entries()) {
        const mannschaft = mannschaftenNachId.get(id)!;
        aktualisiert.push(await insertDoc({ ...mannschaft, reihenfolge: index }));
      }

      return aktualisiert;
    },
  );

  app.delete<{ Params: { id: string } }>("/mannschaften/:id", async (req, reply) => {
    const bestehend = await findById<MannschaftImTurnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Mannschaft nicht gefunden" });
    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

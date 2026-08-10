import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Klassifizierung, MannschaftImTurnier, Spieler, SpielerStatus, Turnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireAuth } from "../auth/plugin";
import { hatMindestens } from "../auth/turnierZugriff";

const KLASSIFIZIERUNGEN: Klassifizierung[] = ["B1", "B2", "B3", "sehend", "AB"];
const STATUS: SpielerStatus[] = ["aktiv", "gesperrt"];

// vorname bewusst als string (nicht string|null) typisiert: das Schema erlaubt zur Laufzeit
// null zum Leeren, aber der Merge {...bestehend, ...req.body} soll null nach Spieler.vorname
// (string|undefined) schreiben duerfen, ohne dass TS es ablehnt - gleiches Muster wie bei
// turnier.ts/verein.ts.
interface SpielerBody {
  mannschaftId: string;
  name: string;
  vorname?: string;
  trikotnummer: string;
  klassifizierung: Klassifizierung;
  status?: SpielerStatus;
}

const spielerBodySchema = {
  type: "object",
  required: ["mannschaftId", "name", "trikotnummer", "klassifizierung"],
  properties: {
    mannschaftId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    // Optionaler Vorname darf null sein, um ihn gezielt zu leeren (siehe CLAUDE.md).
    vorname: { type: ["string", "null"] },
    trikotnummer: { type: "string", minLength: 1 },
    klassifizierung: { type: "string", enum: KLASSIFIZIERUNGEN },
    status: { type: "string", enum: STATUS },
  },
} as const;

interface SpielerAktualisierungBody {
  name: string;
  vorname?: string;
  trikotnummer: string;
  klassifizierung: Klassifizierung;
  status: SpielerStatus;
}

const spielerAktualisierungSchema = {
  type: "object",
  required: ["name", "trikotnummer", "klassifizierung", "status"],
  properties: {
    name: { type: "string", minLength: 1 },
    vorname: { type: ["string", "null"] },
    trikotnummer: { type: "string", minLength: 1 },
    klassifizierung: { type: "string", enum: KLASSIFIZIERUNGEN },
    status: { type: "string", enum: STATUS },
  },
} as const;

/** Mannschaft laden und pruefen, ob req.benutzer die geforderte Zugriffsstufe auf deren Turnier hat. */
async function ladeMannschaftMitZugriff(
  mannschaftId: string,
  stufe: "lesen" | "schreiben",
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<MannschaftImTurnier | undefined> {
  const mannschaft = await findById<MannschaftImTurnier>(mannschaftId);
  if (!mannschaft) {
    reply.code(404).send({ error: "Mannschaft nicht gefunden" });
    return undefined;
  }
  const turnier = await findById<Turnier>(mannschaft.turnierId);
  if (!turnier || !(await hatMindestens(turnier, req.benutzer, stufe))) {
    reply.code(403).send({ error: "Kein Zugriff auf das zugehörige Turnier" });
    return undefined;
  }
  return mannschaft;
}

/** Spieler laden und Zugriff ueber dessen Mannschaft/Turnier pruefen. */
async function ladeSpielerMitZugriff(
  id: string,
  stufe: "lesen" | "schreiben",
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<Spieler | undefined> {
  const spieler = await findById<Spieler>(id);
  if (!spieler) {
    reply.code(404).send({ error: "Spieler nicht gefunden" });
    return undefined;
  }
  const mannschaft = await ladeMannschaftMitZugriff(spieler.mannschaftId, stufe, req, reply);
  if (!mannschaft) return undefined;
  return spieler;
}

export async function spielerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { mannschaftId: string } }>(
    "/mannschaften/:mannschaftId/spieler",
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const mannschaft = await ladeMannschaftMitZugriff(req.params.mannschaftId, "lesen", req, reply);
      if (!mannschaft) return;
      return findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: mannschaft._id });
    },
  );

  app.post<{ Body: SpielerBody }>(
    "/spieler",
    { schema: { body: spielerBodySchema } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const mannschaft = await ladeMannschaftMitZugriff(req.body.mannschaftId, "schreiben", req, reply);
      if (!mannschaft) return;

      const id = newId("spieler");
      const spieler: Spieler = {
        _id: id,
        docType: "spieler",
        spielerId: id,
        mannschaftId: mannschaft._id,
        name: req.body.name,
        vorname: req.body.vorname ?? undefined,
        trikotnummer: req.body.trikotnummer,
        klassifizierung: req.body.klassifizierung,
        status: req.body.status ?? "aktiv",
      };
      const gespeichert = await insertDoc(spieler);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: SpielerAktualisierungBody }>(
    "/spieler/:id",
    { schema: { body: spielerAktualisierungSchema } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const bestehend = await ladeSpielerMitZugriff(req.params.id, "schreiben", req, reply);
      if (!bestehend) return;

      const aktualisiert: Spieler = { ...bestehend, ...req.body };
      return insertDoc(aktualisiert);
    },
  );

  app.delete<{ Params: { id: string } }>("/spieler/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const bestehend = await ladeSpielerMitZugriff(req.params.id, "schreiben", req, reply);
    if (!bestehend) return;
    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

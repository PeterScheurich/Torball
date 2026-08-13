import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Klassifizierung, MannschaftImTurnier, Spieler, SpielerStatus, Turnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireZugriff } from "../auth/plugin";
import { hatMindestens, TURNIER_GESPERRT_FEHLER, turnierGesperrt, type Zugriffsstufe } from "../auth/turnierZugriff";
import { markiereTurnierBearbeitet } from "../turnier/bearbeitet";

/** Turnier eines Spielers ueber seine Mannschaft ermitteln (fuer die Bearbeitet-Markierung). */
async function turnierIdVonMannschaft(mannschaftId: string): Promise<string | undefined> {
  return (await findById<MannschaftImTurnier>(mannschaftId))?.turnierId;
}

// CRUD fuer Spieler/Kader. Spieler haengen an der MANNSCHAFT (mannschaftId), nicht direkt am
// Turnier; der Zugriff wird deshalb ueber Mannschaft -> Turnier geprueft. Beim Loeschen einer
// Mannschaft bzw. eines Turniers werden die Spieler kaskadierend mitgeloescht (siehe CLAUDE.md).

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
  stufe: Zugriffsstufe,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<MannschaftImTurnier | undefined> {
  const mannschaft = await findById<MannschaftImTurnier>(mannschaftId);
  if (!mannschaft) {
    reply.code(404).send({ error: "Mannschaft nicht gefunden" });
    return undefined;
  }
  const turnier = await findById<Turnier>(mannschaft.turnierId);
  if (!turnier || !(await hatMindestens(turnier, req, stufe))) {
    reply.code(403).send({ error: "Kein Zugriff auf das zugehörige Turnier" });
    return undefined;
  }
  // Kaderaenderungen sind bei abgeschlossenem Turnier gesperrt.
  if (stufe !== "lesen" && turnierGesperrt(turnier)) {
    reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
    return undefined;
  }
  return mannschaft;
}

/** Spieler laden und Zugriff ueber dessen Mannschaft/Turnier pruefen. */
async function ladeSpielerMitZugriff(
  id: string,
  stufe: Zugriffsstufe,
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
  // Kader einer Mannschaft (Leserecht auf das Turnier genuegt).
  app.get<{ Params: { mannschaftId: string } }>(
    "/mannschaften/:mannschaftId/spieler",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const mannschaft = await ladeMannschaftMitZugriff(req.params.mannschaftId, "lesen", req, reply);
      if (!mannschaft) return;
      return findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: mannschaft._id });
    },
  );

  // Spieler zum Kader hinzufuegen (Schreibrecht noetig); Status ohne Angabe "aktiv".
  app.post<{ Body: SpielerBody }>(
    "/spieler",
    { schema: { body: spielerBodySchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const mannschaft = await ladeMannschaftMitZugriff(req.body.mannschaftId, "schreiben_voll", req, reply);
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
      await markiereTurnierBearbeitet(mannschaft.turnierId, req.benutzer);
      return reply.code(201).send(gespeichert);
    },
  );

  // Spieler aktualisieren (Merge; Vorname per null leerbar).
  app.put<{ Params: { id: string }; Body: SpielerAktualisierungBody }>(
    "/spieler/:id",
    { schema: { body: spielerAktualisierungSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const bestehend = await ladeSpielerMitZugriff(req.params.id, "schreiben_voll", req, reply);
      if (!bestehend) return;

      const aktualisiert: Spieler = { ...bestehend, ...req.body };
      const gespeichert = await insertDoc(aktualisiert);
      const turnierId = await turnierIdVonMannschaft(bestehend.mannschaftId);
      if (turnierId) await markiereTurnierBearbeitet(turnierId, req.benutzer);
      return gespeichert;
    },
  );

  // Einzelnen Spieler loeschen.
  app.delete<{ Params: { id: string } }>("/spieler/:id", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const bestehend = await ladeSpielerMitZugriff(req.params.id, "schreiben_voll", req, reply);
    if (!bestehend) return;
    await deleteDoc(bestehend._id, bestehend._rev!);
    const turnierId = await turnierIdVonMannschaft(bestehend.mannschaftId);
    if (turnierId) await markiereTurnierBearbeitet(turnierId, req.benutzer);
    return reply.code(204).send();
  });
}

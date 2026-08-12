import type { FastifyInstance } from "fastify";
import type { Team, Verein } from "@torball/shared";
import { deleteDoc, findAllByType, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireAuth, requireRolle } from "../auth/plugin";

// CRUD fuer Vereine (turnieruebergreifende Stammdaten; ein Team gehoert immer zu einem Verein).
// Lesen verlangt nur eine Anmeldung (jede Rolle braucht das z.B. bei der Mannschaftserfassung,
// um aus den Stammdaten auszuwaehlen); Schreiben (Anlegen/Aendern/Loeschen) ist auf Admin/Manager
// beschraenkt - systemweite Stammdaten sollen nicht von jeder "Benutzer"-Rolle aenderbar sein.

/** Vom Client setzbare Vereinsfelder (alle ausser Name optional). */
interface VereinBody {
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
}

// Optionale Freitextfelder akzeptieren bewusst auch null: so kann der Client ein bereits
// gesetztes Feld gezielt leeren (PUT). Wuerde er stattdessen undefined senden, fiele der
// Schluessel via JSON.stringify komplett aus dem Body und der {...bestehend, ...req.body}-
// Merge liesse den alten Wert faelschlich stehen (gleiches Muster wie beim Turnier-Update).
const vereinBodySchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    logo: { type: ["string", "null"] },
    bundesland: { type: ["string", "null"] },
    ansprechpartnerName: { type: ["string", "null"] },
    ansprechpartnerTelefon: { type: ["string", "null"] },
    ansprechpartnerEmail: { type: ["string", "null"] },
  },
} as const;

/** Registriert die Vereins-Routen an der App-Instanz. */
export async function vereinRoutes(app: FastifyInstance): Promise<void> {
  // Alle Vereine.
  app.get("/vereine", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return findAllByType<Verein>("verein");
  });

  // Einzelner Verein per ID.
  app.get<{ Params: { id: string } }>("/vereine/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const verein = await findById<Verein>(req.params.id);
    if (!verein) return reply.code(404).send({ error: "Verein nicht gefunden" });
    return verein;
  });

  // Neuen Verein anlegen.
  app.post<{ Body: VereinBody }>(
    "/vereine",
    { schema: { body: vereinBodySchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
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

  // Verein aktualisieren (Merge mit bestehendem Dokument; optionale Felder per null leerbar).
  app.put<{ Params: { id: string }; Body: VereinBody }>(
    "/vereine/:id",
    { schema: { body: vereinBodySchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const bestehend = await findById<Verein>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Verein nicht gefunden" });
      const aktualisiert: Verein = { ...bestehend, ...req.body };
      return insertDoc(aktualisiert);
    },
  );

  // Verein loeschen - nur, wenn kein Team mehr auf ihn verweist (sonst 409).
  app.delete<{ Params: { id: string } }>("/vereine/:id", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin", "manager"])) return;
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

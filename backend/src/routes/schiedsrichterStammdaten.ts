import type { FastifyInstance } from "fastify";
import type { Schiedsrichter } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";
import { requireAuth, requireRolle } from "../auth/plugin";

// CRUD fuer Schiedsrichter-Stammdaten (turnieruebergreifend, analog verein.ts/team.ts). Lesen
// verlangt nur eine Anmeldung (fuer die Auswahl in der turnierbezogenen Schiedsrichter-Erfassung);
// Schreiben ist auf Admin/Manager beschraenkt. Bewusst KEINE Referenz-Pruefung beim Loeschen (anders
// als Verein/Team): eine Uebernahme in ein Turnier kopiert die Werte (siehe SchiedsrichterImTurnier
// importiertAusStammdatenSchiedsrichterId), es gibt keine Live-Verknuepfung, die verwaisen koennte.

interface SchiedsrichterStammdatenBody {
  name: string;
  vorname?: string;
  telefon?: string;
  email?: string;
  lizenzVorhanden?: boolean;
  vereinId?: string;
}

// Optionale Felder akzeptieren bewusst auch null, damit ein bereits gesetztes Feld gezielt
// geleert werden kann (gleiches Muster wie bei Verein/Team, siehe CLAUDE.md).
const schiedsrichterStammdatenSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    vorname: { type: ["string", "null"] },
    telefon: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    lizenzVorhanden: { type: "boolean" },
    vereinId: { type: ["string", "null"] },
  },
} as const;

export async function schiedsrichterStammdatenRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schiedsrichter-stammdaten", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return findAllByType<Schiedsrichter>("schiedsrichter");
  });

  app.post<{ Body: SchiedsrichterStammdatenBody }>(
    "/schiedsrichter-stammdaten",
    { schema: { body: schiedsrichterStammdatenSchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const id = newId("schiedsrichter");
      const schiedsrichter: Schiedsrichter = {
        _id: id,
        docType: "schiedsrichter",
        schiedsrichterId: id,
        name: req.body.name,
        vorname: req.body.vorname ?? undefined,
        telefon: req.body.telefon ?? undefined,
        email: req.body.email ?? undefined,
        lizenzVorhanden: req.body.lizenzVorhanden ?? false,
        vereinId: req.body.vereinId ?? undefined,
      };
      const gespeichert = await insertDoc(schiedsrichter);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: SchiedsrichterStammdatenBody }>(
    "/schiedsrichter-stammdaten/:id",
    { schema: { body: schiedsrichterStammdatenSchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const bestehend = await findById<Schiedsrichter>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Schiedsrichter nicht gefunden" });
      const aktualisiert: Schiedsrichter = {
        ...bestehend,
        name: req.body.name,
        vorname: req.body.vorname ?? undefined,
        telefon: req.body.telefon ?? undefined,
        email: req.body.email ?? undefined,
        lizenzVorhanden: req.body.lizenzVorhanden ?? false,
        vereinId: req.body.vereinId ?? undefined,
      };
      return insertDoc(aktualisiert);
    },
  );

  app.delete<{ Params: { id: string } }>("/schiedsrichter-stammdaten/:id", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin", "manager"])) return;
    const bestehend = await findById<Schiedsrichter>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Schiedsrichter nicht gefunden" });
    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

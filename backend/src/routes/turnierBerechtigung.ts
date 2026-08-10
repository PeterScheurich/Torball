import type { FastifyInstance } from "fastify";
import type { Turnier, TurnierBerechtigung, TurnierRolle } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireAuth } from "../auth/plugin";
import { hatMindestens, turnierZugriffsstufe } from "../auth/turnierZugriff";

interface BerechtigungVergebenBody {
  benutzerId: string;
  rolle: TurnierRolle;
}

const berechtigungVergebenSchema = {
  type: "object",
  required: ["benutzerId", "rolle"],
  properties: {
    benutzerId: { type: "string", minLength: 1 },
    rolle: { type: "string", enum: ["turnierleitung", "spielleitung", "lesen"] },
  },
} as const;

export async function turnierBerechtigungRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { turnierId: string } }>("/turniere/:turnierId/berechtigungen", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.turnierId);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req.benutzer, "schreiben"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    return findAllBySelector<TurnierBerechtigung>({ docType: "turnierBerechtigung", turnierId: turnier._id });
  });

  /**
   * Abschnitt 21.2: Wer Schreibrecht hat, kann Schreib- oder Leserecht vergeben; wer nur
   * Leserecht hat, kann nur Leserecht weitergeben. Eine bestehende Berechtigung desselben
   * Benutzers fuer dieses Turnier wird ersetzt statt dupliziert.
   */
  app.post<{ Params: { turnierId: string }; Body: BerechtigungVergebenBody }>(
    "/turniere/:turnierId/berechtigungen",
    { schema: { body: berechtigungVergebenSchema } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

      const eigeneStufe = await turnierZugriffsstufe(turnier, req.benutzer);
      if (!eigeneStufe) return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
      if (eigeneStufe === "lesen" && req.body.rolle !== "lesen") {
        return reply.code(403).send({ error: "Mit Leserecht kann nur Leserecht vergeben werden." });
      }

      const zielBenutzer = await findById(req.body.benutzerId);
      if (!zielBenutzer) return reply.code(400).send({ error: "Referenzierter Benutzer existiert nicht" });

      const bestehende = await findAllBySelector<TurnierBerechtigung>({
        docType: "turnierBerechtigung",
        turnierId: turnier._id,
        benutzerId: req.body.benutzerId,
      });
      for (const alt of bestehende) {
        await deleteDoc(alt._id, alt._rev!);
      }

      const id = newId("turnierBerechtigung");
      const berechtigung: TurnierBerechtigung = {
        _id: id,
        docType: "turnierBerechtigung",
        berechtigungId: id,
        turnierId: turnier._id,
        benutzerId: req.body.benutzerId,
        rolle: req.body.rolle,
        vergebenVon: req.benutzer!._id,
        vergebenAm: new Date().toISOString(),
      };
      const gespeichert = await insertDoc(berechtigung);
      return reply.code(201).send(gespeichert);
    },
  );

  /** Abschnitt 21.2: "Schreibrechte koennen von jedem mit Schreibrecht entzogen werden." */
  app.delete<{ Params: { id: string } }>("/berechtigungen/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const bestehend = await findById<TurnierBerechtigung>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Berechtigung nicht gefunden" });

    const turnier = await findById<Turnier>(bestehend.turnierId);
    if (!turnier || !(await hatMindestens(turnier, req.benutzer, "schreiben"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }

    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

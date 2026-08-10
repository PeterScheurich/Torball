import type { FastifyInstance } from "fastify";
import type { Spiel, Turnier } from "@torball/shared";
import { findAllBySelector, findById, insertDoc } from "../repository";
import { berechneStartzeit } from "../spielplan/zeitplanung";

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

interface StartzeitBody {
  startzeitGeplant: string;
}

const startzeitSchema = {
  type: "object",
  required: ["startzeitGeplant"],
  properties: {
    startzeitGeplant: { type: "string" },
  },
} as const;

interface ReihenfolgeBody {
  /** Alle Spiel-IDs des Turniers, in der gewuenschten neuen Reihenfolge. */
  spielIds: string[];
}

const reihenfolgeSchema = {
  type: "object",
  required: ["spielIds"],
  properties: {
    spielIds: { type: "array", items: { type: "string" }, minItems: 1 },
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

  /**
   * Startzeit eines Spiels manuell verschieben - alle NACHFOLGENDEN, noch geplanten
   * Spiele wandern um dieselbe Zeitspanne mit (Abschnitt 8: "Die Turnierleitung darf...
   * Startzeiten nachtraeglich anpassen"). Verschiebung per Delta statt Neuberechnung
   * aus der Spieldauer-Formel, damit bereits bestehende, ggf. abweichende Abstaende
   * zwischen spaeteren Spielen erhalten bleiben.
   */
  app.put<{ Params: { id: string }; Body: StartzeitBody }>(
    "/spiele/:id/startzeit",
    { schema: { body: startzeitSchema } },
    async (req, reply) => {
      const spiel = await findById<Spiel>(req.params.id);
      if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
      if (!spiel.startzeitGeplant) {
        return reply.code(400).send({ error: "Spiel hat noch keine geplante Startzeit, die verschoben werden koennte" });
      }

      const alteZeit = new Date(spiel.startzeitGeplant).getTime();
      const neueZeit = new Date(req.body.startzeitGeplant).getTime();
      if (Number.isNaN(neueZeit)) {
        return reply.code(400).send({ error: "Ungueltige Startzeit" });
      }
      const deltaMs = neueZeit - alteZeit;

      const alleSpiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: spiel.turnierId });
      const eigeneRunde = Number(spiel.runde);
      const zuVerschieben = alleSpiele.filter(
        (s) => s.status === "geplant" && s.startzeitGeplant && Number(s.runde) >= eigeneRunde,
      );

      const aktualisiert: Spiel[] = [];
      for (const s of zuVerschieben) {
        const neueStartzeit = new Date(new Date(s.startzeitGeplant!).getTime() + deltaMs).toISOString();
        aktualisiert.push(await insertDoc({ ...s, startzeitGeplant: neueStartzeit }));
      }

      return aktualisiert;
    },
  );

  /**
   * Reihenfolge der Spiele aendern (Abschnitt 8: "Die Turnierleitung darf Reihenfolge...
   * nachtraeglich anpassen"). Weist jedem Spiel an seiner neuen Position eine neue
   * Spielnummer (runde) und die daraus berechnete Startzeit zu. Vereinfachung: Jedes
   * Spiel bekommt eine eigene Zeitposition, unabhaengig vom Feld - im Normalfall (1 Feld)
   * ist das exakt richtig; bei 2 Feldern kann das die urspruengliche Parallelitaet zweier
   * Spiele aufheben, was ueber die bestehende Feld-Zuordnung (PUT /spiele/:id) von Hand
   * nachjustierbar bleibt.
   */
  app.put<{ Params: { turnierId: string }; Body: ReihenfolgeBody }>(
    "/turniere/:turnierId/spiele/reihenfolge",
    { schema: { body: reihenfolgeSchema } },
    async (req, reply) => {
      const turnier = await findById<Turnier>(req.params.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

      const bestehende = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
      const gesperrt = bestehende.some((spiel) => spiel.status !== "geplant" || spiel.ergebnisAbgeschlossen);
      if (gesperrt) {
        return reply.code(409).send({
          error: "Reihenfolge kann nicht geaendert werden: es gibt bereits laufende oder abgeschlossene Spiele",
        });
      }

      const bestehendeIds = new Set(bestehende.map((s) => s._id));
      const { spielIds } = req.body;
      const passtZusammen =
        spielIds.length === bestehende.length && spielIds.every((id) => bestehendeIds.has(id));
      if (!passtZusammen) {
        return reply
          .code(400)
          .send({ error: "spielIds muss exakt alle Spiele dieses Turniers enthalten, je einmal" });
      }

      const spieleNachId = new Map(bestehende.map((s) => [s._id, s]));
      const aktualisiert: Spiel[] = [];
      for (const [index, id] of spielIds.entries()) {
        const spiel = spieleNachId.get(id)!;
        aktualisiert.push(
          await insertDoc({
            ...spiel,
            runde: String(index + 1),
            startzeitGeplant: berechneStartzeit(turnier, index),
          }),
        );
      }

      return aktualisiert;
    },
  );
}

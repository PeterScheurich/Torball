import type { FastifyInstance } from "fastify";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import { findAllBySelector, findById, insertDoc } from "../repository";
import { requireZugriff } from "../auth/plugin";
import { hatMindestens, TURNIER_GESPERRT_FEHLER, turnierGesperrt } from "../auth/turnierZugriff";
import { berechneGesamttabelle, berechneTabelle } from "../ergebnisse/tabelle";
import { pruefeSpielZugriff } from "./spiel";

interface ErgebnisBody {
  ergebnisA: number;
  ergebnisB: number;
  istForfait?: boolean;
}

const ergebnisSchema = {
  type: "object",
  required: ["ergebnisA", "ergebnisB"],
  properties: {
    ergebnisA: { type: "number", minimum: 0 },
    ergebnisB: { type: "number", minimum: 0 },
    istForfait: { type: "boolean" },
  },
} as const;

export async function ergebnisRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Ergebnis eintragen/aendern (Abschnitt 14). Anders als beim oeffentlichen
   * Token-Zugriff (routes/ergebnisToken.ts) bleibt das hier auch nach
   * `ergebnisAbgeschlossen` moeglich - "Nach Abschluss aendert nur noch die
   * Turnierleitung" heisst laut Abschnitt 14 nicht "niemand mehr", sondern nur
   * "nicht mehr per Token".
   */
  app.put<{ Params: { id: string }; Body: ErgebnisBody }>(
    "/spiele/:id/ergebnis",
    { schema: { body: ergebnisSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const spiel = await findById<Spiel>(req.params.id);
      if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
      if (!(await pruefeSpielZugriff(spiel, req, reply, "schreiben_spielbetrieb"))) return;

      const aktualisiert: Spiel = {
        ...spiel,
        ergebnisA: req.body.ergebnisA,
        ergebnisB: req.body.ergebnisB,
        istForfait: req.body.istForfait ?? spiel.istForfait,
        status: spiel.status === "geplant" ? "beendet" : spiel.status,
      };
      return insertDoc(aktualisiert);
    },
  );

  /** Einzelnes Spiel abschliessen (Abschnitt 14: "einzeln ... abschliessen"). */
  app.put<{ Params: { id: string } }>("/spiele/:id/abschliessen", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const spiel = await findById<Spiel>(req.params.id);
    if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
    if (!(await pruefeSpielZugriff(spiel, req, reply, "schreiben_spielbetrieb"))) return;
    if (spiel.ergebnisA == null || spiel.ergebnisB == null) {
      return reply.code(400).send({ error: "Spiel hat noch kein erfasstes Ergebnis." });
    }
    return insertDoc({ ...spiel, ergebnisAbgeschlossen: true, status: "abgeschlossen" });
  });

  /** Alle Spiele mit erfasstem Ergebnis auf einmal abschliessen (Abschnitt 14: "... oder gesammelt (Turnier)"). */
  app.put<{ Params: { turnierId: string } }>("/turniere/:turnierId/spiele/abschliessen", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.turnierId);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "schreiben_spielbetrieb"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    if (turnierGesperrt(turnier)) {
      return reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
    }

    const alle = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
    const abzuschliessen = alle.filter((s) => s.ergebnisA != null && s.ergebnisB != null && !s.ergebnisAbgeschlossen);

    const aktualisiert: Spiel[] = [];
    for (const s of abzuschliessen) {
      aktualisiert.push(await insertDoc({ ...s, ergebnisAbgeschlossen: true, status: "abgeschlossen" }));
    }
    return aktualisiert;
  });

  app.get<{ Params: { id: string } }>("/turniere/:id/tabelle", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "lesen"))) {
      return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    }

    const mannschaften = await findAllBySelector<MannschaftImTurnier>({
      docType: "mannschaftImTurnier",
      turnierId: turnier._id,
    });

    // Gehoert das Turnier zu einem Wettbewerb (mehrere Spieltage), wird die SUMMENtabelle ueber
    // alle Spieltage berechnet (Datenimport-Spec: intern reicht der summierte Tabellenstand).
    if (turnier.wettbewerbId) {
      const wettbewerbTurniere = await findAllBySelector<Turnier>({
        docType: "turnier",
        wettbewerbId: turnier.wettbewerbId,
      });
      const alleMannschaften = (
        await Promise.all(
          wettbewerbTurniere.map((t) =>
            findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: t._id }),
          ),
        )
      ).flat();
      const alleSpiele = (
        await Promise.all(
          wettbewerbTurniere.map((t) => findAllBySelector<Spiel>({ docType: "spiel", turnierId: t._id })),
        )
      ).flat();
      return berechneGesamttabelle(turnier, mannschaften, alleMannschaften, alleSpiele);
    }

    const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
    return berechneTabelle(turnier, mannschaften, spiele);
  });
}

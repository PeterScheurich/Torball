import type { FastifyInstance } from "fastify";
import type { Systemkonfiguration, Turnierregeln } from "@torball/shared";
import { findAllBySelector, insertDoc, newId } from "../repository";
import { requireAuth, requireRolle } from "../auth/plugin";
import { aktuelleSystemkonfiguration, nurRegeln, STANDARD_TURNIERREGELN } from "../konfiguration";

const STANDARD_FORFAIT = "3:0";
const STANDARD_PASSWORTLAENGE = 8;

type SystemkonfigBody = Turnierregeln & {
  forfaitErgebnis?: string;
  passwortMindestlaenge?: number;
  aenderungskommentar?: string;
};

export async function systemkonfigurationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Aktuelle Systemkonfiguration (die kopierten Standardwerte fuer neue Turniere). Existiert noch
   * keine (frische Installation), wird ein nicht-persistierter Default zurueckgegeben (version 0),
   * damit die Oberflaeche etwas zum Anzeigen/Bearbeiten hat - der erste PUT legt dann Version 1 an.
   * Lesen darf jede angemeldete Person (die Werte sind nicht sensibel).
   */
  app.get("/systemkonfiguration", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const konfig = await aktuelleSystemkonfiguration();
    if (konfig) return konfig;
    return {
      docType: "systemkonfiguration",
      version: 0,
      istAktuell: true,
      gueltigAb: new Date().toISOString(),
      ...STANDARD_TURNIERREGELN,
      forfaitErgebnis: STANDARD_FORFAIT,
      passwortMindestlaenge: STANDARD_PASSWORTLAENGE,
    };
  });

  /**
   * Aendert die Standardregeln (nur Admin). Legt gemaess Abschnitt 20.2 immer einen NEUEN Datensatz
   * an (nie Update) und setzt den bisherigen auf istAktuell=false - so bleibt die Historie erhalten
   * und bestehende Turniere (die ihre Werte kopiert haben) aendern sich nicht mit.
   */
  app.put<{ Body: SystemkonfigBody }>(
    "/systemkonfiguration",
    { schema: { body: { type: "object", additionalProperties: true } } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin"])) return;

      const bisherige = await findAllBySelector<Systemkonfiguration>({
        docType: "systemkonfiguration",
        istAktuell: true,
      });
      const vorherige = bisherige[0];
      const naechsteVersion = (vorherige?.version ?? 0) + 1;

      for (const alt of bisherige) {
        await insertDoc({ ...alt, istAktuell: false });
      }

      const id = newId("systemkonfiguration");
      const neu: Systemkonfiguration = {
        _id: id,
        docType: "systemkonfiguration",
        konfigId: id,
        version: naechsteVersion,
        istAktuell: true,
        gueltigAb: new Date().toISOString(),
        ...nurRegeln(req.body),
        forfaitErgebnis: req.body.forfaitErgebnis ?? vorherige?.forfaitErgebnis ?? STANDARD_FORFAIT,
        passwortMindestlaenge:
          req.body.passwortMindestlaenge ?? vorherige?.passwortMindestlaenge ?? STANDARD_PASSWORTLAENGE,
        geaendertVon: req.benutzer!._id,
        geaendertAm: new Date().toISOString(),
        aenderungskommentar: req.body.aenderungskommentar,
      };
      const gespeichert = await insertDoc(neu);
      return reply.code(201).send(gespeichert);
    },
  );
}

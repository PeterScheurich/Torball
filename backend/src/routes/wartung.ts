import type { FastifyInstance } from "fastify";
import type { Wartung } from "@torball/shared";
import { insertDoc } from "../repository";
import { requireRolle } from "../auth/plugin";
import { aktuelleWartung, wartungStatus, WARTUNG_ID } from "../wartung";

interface WartungBody {
  aktiv: boolean;
  angekuendigtAb?: string | null;
  angekuendigtBis?: string | null;
}

const wartungSchema = {
  type: "object",
  required: ["aktiv"],
  properties: {
    aktiv: { type: "boolean" },
    angekuendigtAb: { type: ["string", "null"] },
    angekuendigtBis: { type: ["string", "null"] },
  },
} as const;

export async function wartungRoutes(app: FastifyInstance): Promise<void> {
  // Oeffentlich (kein Login) - die Startseite und der Kurzfristhinweis muessen das auch fuer nicht
  // angemeldete Besucher abrufen koennen. Bewusst dieselbe Sicht (WartungStatus) fuer Anzeige UND
  // das Bearbeiten-Formular - keine Geheimwerte enthalten, ein zweiter admin-only Endpunkt waere
  // hier unnoetig.
  app.get("/wartung/status", async () => {
    return wartungStatus(await aktuelleWartung());
  });

  app.put<{ Body: WartungBody }>("/wartung", { schema: { body: wartungSchema } }, async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;

    const bisherige = await aktuelleWartung();
    const neu: Wartung = {
      ...bisherige,
      _id: WARTUNG_ID,
      docType: "wartung",
      aktiv: req.body.aktiv,
      angekuendigtAb: req.body.angekuendigtAb ?? undefined,
      angekuendigtBis: req.body.angekuendigtBis ?? undefined,
      geaendertVon: req.benutzer!._id,
      geaendertAm: new Date().toISOString(),
    };
    const gespeichert = await insertDoc(neu);
    return wartungStatus(gespeichert);
  });
}

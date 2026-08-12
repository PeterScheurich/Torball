import type { FastifyInstance } from "fastify";
import type { Systemeinstellungen } from "@torball/shared";
import { insertDoc } from "../repository";
import { requireRolle } from "../auth/plugin";
import { aktuelleSystemeinstellungen, SYSTEMEINSTELLUNGEN_ID } from "../systemeinstellungen";

interface SystemeinstellungenBody {
  selbstregistrierungErlaubt: boolean;
  selbstregistrierungStandardRolle: "benutzer" | "manager";
}

const systemeinstellungenSchema = {
  type: "object",
  required: ["selbstregistrierungErlaubt", "selbstregistrierungStandardRolle"],
  properties: {
    selbstregistrierungErlaubt: { type: "boolean" },
    // "admin" bewusst nicht im enum: eine Selbstregistrierung darf nie automatisch
    // Admin-Rechte vergeben (siehe SelbstregistrierungsRolle in shared).
    selbstregistrierungStandardRolle: { type: "string", enum: ["benutzer", "manager"] },
  },
} as const;

/** Systemweite App-Einstellungen (aktuell: Selbstregistrierung), nur fuer Admins - lesend wie
 *  schreibend, anders als die (allen angemeldeten Personen lesbaren) Standardregeln, weil es
 *  hier keinen Grund gibt, dass normale Benutzer diese Werte einsehen muessen. */
export async function systemeinstellungenRoutes(app: FastifyInstance): Promise<void> {
  app.get("/systemeinstellungen", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    return aktuelleSystemeinstellungen();
  });

  app.put<{ Body: SystemeinstellungenBody }>(
    "/systemeinstellungen",
    { schema: { body: systemeinstellungenSchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin"])) return;

      const bisherige = await aktuelleSystemeinstellungen();
      const neu: Systemeinstellungen = {
        ...bisherige,
        _id: SYSTEMEINSTELLUNGEN_ID,
        docType: "systemeinstellungen",
        selbstregistrierungErlaubt: req.body.selbstregistrierungErlaubt,
        selbstregistrierungStandardRolle: req.body.selbstregistrierungStandardRolle,
        geaendertVon: req.benutzer!._id,
        geaendertAm: new Date().toISOString(),
      };
      const gespeichert = await insertDoc(neu);
      return gespeichert;
    },
  );
}

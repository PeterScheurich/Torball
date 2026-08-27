import type { FastifyInstance } from "fastify";
import { requireRolle } from "../auth/plugin";
import { erstelleSicherung, vorgeschlagenerDateiname } from "../sicherung/datei";

/**
 * Sicherung des gesamten Datenbestands als Download.
 *
 * Bewusst nur der Weg NACH AUSSEN ueber die Oberflaeche: Eine Sicherung anzulegen ist
 * ungefaehrlich und soll ohne Konsole moeglich sein (Zielgruppe!). Das Zurueckspielen bleibt
 * dagegen dem Konsolen-Befehl `torball sicherung:einspielen` vorbehalten - es ueberschreibt im
 * Zweifel einen laufenden Datenbestand und soll ein bewusster, nicht versehentlich anklickbarer
 * Schritt sein.
 *
 * Admin-only, weil die Datei ALLES enthaelt: Passwort-Hashes, 2FA-Geheimnisse, SMTP-Zugangsdaten,
 * Instanz-Tokens.
 */
export async function sicherungRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sicherung", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;

    const paket = await erstelleSicherung();
    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${vorgeschlagenerDateiname()}"`)
      // Eine Sicherung ist ein Momentaufnahme-Download - nichts davon darf zwischengespeichert
      // werden, weder im Browser noch in einem Proxy davor.
      .header("Cache-Control", "no-store")
      .send(JSON.stringify(paket, null, 2));
  });
}

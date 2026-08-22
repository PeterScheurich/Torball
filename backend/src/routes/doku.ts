import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin";

/**
 * Ausliefern von Dokumentations-Dateien aus `docs/`, die NICHT oeffentlich sein sollen.
 *
 * Bewusst ueber das Backend statt aus `frontend/public/`: eine Datei dort waere fuer jeden
 * abrufbar, der die Adresse kennt - hier prueft `requireAuth` die Anmeldung serverseitig.
 * `requireAuth` (nicht `requireZugriff`) heisst: ein echtes Benutzerkonto ist noetig, eine
 * Turnier-Code-Sitzung genuegt nicht. Das entspricht der Behandlung der uebrigen internen
 * Seiten (z.B. /ueber, Gesamtspezifikation in der Hilfe) - diese Inhalte richten sich an
 * Betreiber und Entwicklung, nicht an Helfer, die nur einen geteilten Code haben.
 *
 * Die Datei wird bei jeder Anfrage frisch gelesen (kein Cache): sie aendert sich nur bei einem
 * Deployment, und der Aufruf ist selten genug, dass sich Zwischenspeichern nicht lohnt.
 */

/** Freigegebene Dokumente: Schluessel in der URL -> Dateiname unterhalb von `docs/`.
 *  Bewusst eine feste Zuordnung statt eines Parameters aus der URL - so kann ueber diese
 *  Route grundsaetzlich keine andere Datei angefragt werden (kein Pfad-Ausbruch moeglich). */
const DOKUMENTE: Record<string, string> = {
  "architektur-bauplan": "architektur-bauplan.html",
};

/** Projektwurzel: von `backend/dist/routes` (bzw. `backend/src/routes` im Dev-Betrieb)
 *  drei Ebenen hoch - in beiden Faellen dieselbe Tiefe. */
const DOKU_ORDNER = path.join(__dirname, "../../../docs");

export async function dokuRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { name: string } }>("/doku/:name", async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const datei = DOKUMENTE[req.params.name];
    if (!datei) return reply.code(404).send({ error: "Dokument nicht gefunden" });

    try {
      const inhalt = await readFile(path.join(DOKU_ORDNER, datei), "utf8");
      return reply.type("text/html; charset=utf-8").send(inhalt);
    } catch {
      // Fehlt der docs-Ordner (z.B. unvollstaendige Installation), soll das nur diese eine
      // Seite betreffen - nicht als Serverfehler durchschlagen.
      app.log.warn({ datei }, "Dokumentations-Datei nicht lesbar");
      return reply.code(404).send({ error: "Dokument ist auf dieser Installation nicht verfügbar" });
    }
  });
}

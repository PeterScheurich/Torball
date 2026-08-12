import path from "node:path";
import type { IncomingMessage } from "node:http";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { authPreHandler } from "./auth/plugin";
import { ensureIndexes } from "./db";
import { authRoutes } from "./routes/auth";
import { benutzerRoutes } from "./routes/benutzer";
import { vereinRoutes } from "./routes/verein";
import { teamRoutes } from "./routes/team";
import { turnierRoutes } from "./routes/turnier";
import { turnierBerechtigungRoutes } from "./routes/turnierBerechtigung";
import { mannschaftRoutes } from "./routes/mannschaft";
import { spielerRoutes } from "./routes/spieler";
import { schiedsrichterRoutes } from "./routes/schiedsrichter";
import { spielplanRoutes } from "./routes/spielplan";
import { spielRoutes } from "./routes/spiel";
import { ergebnisRoutes } from "./routes/ergebnis";
import { ergebnisTokenRoutes } from "./routes/ergebnisToken";
import { oeffentlichRoutes } from "./routes/oeffentlich";
import { systemkonfigurationRoutes } from "./routes/systemkonfiguration";
import { kanbanRoutes } from "./routes/kanban";

// Einstiegspunkt des Backends: baut die Fastify-Instanz, registriert Cookie-Plugin, den
// Auth-Hook und alle Routen-Module und startet den Server. Port/Host kommen aus der Umgebung
// (Default 3000/0.0.0.0) - in der Entwicklung bleibt es damit bei 3000 (der Vite-Dev-Proxy
// zielt dorthin, siehe CLAUDE.md); in Produktion bekommt jede Instanz ihren eigenen PORT
// (mehrere Instanzen auf einem Host, siehe docs/Protokolle/…-produktiv-installation.md).
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
// Einzelprozess-Modus (z.B. Windows-Lokalinstallation, siehe deploy/installieren-windows.ps1):
// das Backend liefert das gebaute Frontend gleich mit aus, kein separater nginx/Vite-Proxy
// noetig. Das Frontend ruft die API weiterhin unter /api/* auf (siehe frontend/src/api.ts) -
// rewriteUrl streift das Praefix vor dem Routing ab, genau das, was in den anderen Betriebs-
// arten der Vite-Dev-Proxy bzw. die nginx-Site uebernehmen (siehe CLAUDE.md).
const serveFrontend = process.env.SERVE_FRONTEND === "true";
const server = Fastify({
  logger: true,
  ...(serveFrontend
    ? { rewriteUrl: (req: IncomingMessage) => (req.url?.startsWith("/api/") ? req.url.slice(4) : (req.url ?? "/")) }
    : {}),
});

// Schlanker Health-Check (z.B. fuer Monitoring/Reverse-Proxy), ohne Anmeldung.
server.get("/health", async () => {
  return { status: "ok" };
});

// Registriert alles in der richtigen Reihenfolge und startet den Listener.
const start = async () => {
  try {
    // Cookie-Plugin und der Auth-Hook muessen VOR den Routen-Plugins auf der
    // Root-Instanz registriert werden, damit Fastifys Verkapselung sie an
    // alle nachfolgend registrierten Routen-Dateien vererbt (siehe Kommentar
    // in auth/plugin.ts).
    await server.register(fastifyCookie);
    server.addHook("preHandler", authPreHandler);

    server.register(authRoutes);
    server.register(benutzerRoutes);
    server.register(vereinRoutes);
    server.register(teamRoutes);
    server.register(turnierRoutes);
    server.register(turnierBerechtigungRoutes);
    server.register(mannschaftRoutes);
    server.register(spielerRoutes);
    server.register(schiedsrichterRoutes);
    server.register(spielplanRoutes);
    server.register(spielRoutes);
    server.register(ergebnisRoutes);
    server.register(ergebnisTokenRoutes);
    server.register(oeffentlichRoutes);
    server.register(systemkonfigurationRoutes);
    server.register(kanbanRoutes);

    if (serveFrontend) {
      // Registrierungsreihenfolge egal: find-my-way (Fastifys Router) bevorzugt exakte
      // Routen-Treffer ohnehin vor dem Static-Plugin-Wildcard. Fallback fuer clientseitiges
      // Routing (React Router) im notFoundHandler unten - identisch zu nginx' "try_files
      // $uri /index.html" in deploy/deploy-instanz.sh.
      await server.register(fastifyStatic, { root: path.join(__dirname, "../../frontend/dist") });
      server.setNotFoundHandler((request, reply) => {
        if (request.method === "GET") {
          reply.sendFile("index.html");
          return;
        }
        reply.code(404).send({ error: "Nicht gefunden" });
      });
    }

    await ensureIndexes();
    await server.listen({ port: PORT, host: HOST });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
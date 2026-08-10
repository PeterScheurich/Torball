import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
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

const server = Fastify({ logger: true });

server.get("/health", async () => {
  return { status: "ok" };
});

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

    await ensureIndexes();
    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
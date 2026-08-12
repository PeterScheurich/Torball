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
import { systemkonfigurationRoutes } from "./routes/systemkonfiguration";
import { kanbanRoutes } from "./routes/kanban";

// Einstiegspunkt des Backends: baut die Fastify-Instanz, registriert Cookie-Plugin, den
// Auth-Hook und alle Routen-Module und startet den Server. Port/Host kommen aus der Umgebung
// (Default 3000/0.0.0.0) - in der Entwicklung bleibt es damit bei 3000 (der Vite-Dev-Proxy
// zielt dorthin, siehe CLAUDE.md); in Produktion bekommt jede Instanz ihren eigenen PORT
// (mehrere Instanzen auf einem Host, siehe docs/Protokolle/…-produktiv-installation.md).
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const server = Fastify({ logger: true });

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

    await ensureIndexes();
    await server.listen({ port: PORT, host: HOST });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
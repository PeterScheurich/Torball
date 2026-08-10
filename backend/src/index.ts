import Fastify from "fastify";
import { ensureIndexes } from "./db";
import { vereinRoutes } from "./routes/verein";
import { teamRoutes } from "./routes/team";
import { turnierRoutes } from "./routes/turnier";

const server = Fastify({ logger: true });

server.get("/health", async () => {
  return { status: "ok" };
});

server.register(vereinRoutes);
server.register(teamRoutes);
server.register(turnierRoutes);

const start = async () => {
  try {
    await ensureIndexes();
    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
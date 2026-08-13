import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
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
import { turnierCodeRoutes } from "./routes/turnierCode";
import { mannschaftRoutes } from "./routes/mannschaft";
import { spielerRoutes } from "./routes/spieler";
import { schiedsrichterRoutes } from "./routes/schiedsrichter";
import { spielplanRoutes } from "./routes/spielplan";
import { spielRoutes } from "./routes/spiel";
import { ergebnisRoutes } from "./routes/ergebnis";
import { ergebnisTokenRoutes } from "./routes/ergebnisToken";
import { oeffentlichRoutes } from "./routes/oeffentlich";
import { systemkonfigurationRoutes } from "./routes/systemkonfiguration";
import { systemeinstellungenRoutes } from "./routes/systemeinstellungen";
import { kanbanRoutes } from "./routes/kanban";
import { instanzSyncRoutes } from "./routes/instanzSync";
import { turnierSyncRoutes } from "./routes/turnierSync";
import { syncRoutes } from "./routes/sync";
import { mailPostfachRoutes } from "./routes/mailPostfach";
import { starteCheckinTimer } from "./sync/checkin";
import { starteMailBerichtTimer } from "./mail/scheduler";

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
// in diesem Modus werden die API-Routen deshalb unten tatsaechlich unter dem Praefix /api
// registriert (statt es nur per rewriteUrl vor dem Routing abzustreifen). Ein rewriteUrl-
// Ansatz strippt das Praefix nur bei Anfragen, die es auch tragen (dem Frontend-Fetch-
// Wrapper) - eine volle Browser-Navigation/Reload auf einen SPA-Pfad ohne /api-Praefix, der
// zufaellig mit einem registrierten Backend-GET-Pfad kollidiert (z.B. /turniere/:id), traf
// dann direkt die API-Route statt des SPA-Fallbacks unten und lieferte rohes JSON statt der
// App aus (live reproduziert, siehe docs/Protokolle/2026-08-13-turnier-sync-grundlage.md).
// In den anderen Betriebsarten (Vite-Dev-Proxy, nginx-Site) bleiben die Routen unpraefigiert
// an der Wurzel, weil Proxy/nginx das /api-Praefix bereits vor der Weiterleitung abstreifen
// (siehe CLAUDE.md) - das aendert sich hier bewusst nicht mit.
const serveFrontend = process.env.SERVE_FRONTEND === "true";
const server = Fastify({ logger: true });

// Uebersetzt einen unbehandelten CouchDB-Versionskonflikt (409 - tritt auf, wenn zwei Anfragen
// nahezu gleichzeitig dasselbe Dokument aendern, z.B. eine Ergebniserfassung intern UND parallel
// ueber den externen Erfassungslink) in eine verstaendliche deutsche Meldung, statt die rohe
// CouchDB-Antwort ("Conflict"/"Document update conflict.") an den Client durchzureichen - fiel
// beim Systemtest 2026-08-14 auf der Token-Erfassungsseite auf, die dieses Wort unuebersetzt
// angezeigt haette. Alle anderen Fehler unveraendert weiterreichen (Fastifys eigenes Verhalten).
server.setErrorHandler((error, _req, reply) => {
  if ((error as { statusCode?: number }).statusCode === 409) {
    return reply.code(409).send({
      error: "Das wurde soeben von anderer Stelle geändert. Bitte neu laden und erneut versuchen.",
    });
  }
  reply.send(error);
});

// Schlanker Health-Check (z.B. fuer Monitoring/Reverse-Proxy), ohne Anmeldung.
server.get("/health", async () => {
  return { status: "ok" };
});

// Buendelt alle API-Routen-Plugins, damit sie sowohl direkt auf der Root-Instanz (normale
// Betriebsarten, siehe Kommentar oben) als auch unter einem /api-Praefix (Einzelprozess-
// Modus) registriert werden koennen, ohne die Liste zu duplizieren.
const registerApiRoutes = async (instance: FastifyInstance): Promise<void> => {
  instance.register(authRoutes);
  instance.register(benutzerRoutes);
  instance.register(vereinRoutes);
  instance.register(teamRoutes);
  instance.register(turnierRoutes);
  instance.register(turnierBerechtigungRoutes);
  instance.register(turnierCodeRoutes);
  instance.register(mannschaftRoutes);
  instance.register(spielerRoutes);
  instance.register(schiedsrichterRoutes);
  instance.register(spielplanRoutes);
  instance.register(spielRoutes);
  instance.register(ergebnisRoutes);
  instance.register(ergebnisTokenRoutes);
  instance.register(oeffentlichRoutes);
  instance.register(systemkonfigurationRoutes);
  instance.register(systemeinstellungenRoutes);
  instance.register(kanbanRoutes);
  instance.register(instanzSyncRoutes);
  instance.register(turnierSyncRoutes);
  instance.register(syncRoutes);
  instance.register(mailPostfachRoutes);
};

// Registriert alles in der richtigen Reihenfolge und startet den Listener.
const start = async () => {
  try {
    // Cookie-Plugin und der Auth-Hook muessen VOR den Routen-Plugins auf der
    // Root-Instanz registriert werden, damit Fastifys Verkapselung sie an
    // alle nachfolgend registrierten Routen-Dateien vererbt (siehe Kommentar
    // in auth/plugin.ts).
    await server.register(fastifyCookie);
    server.addHook("preHandler", authPreHandler);

    if (serveFrontend) {
      // API-Routen laufen hier tatsaechlich unter /api (siehe Kommentar oben), damit sie nie
      // mit einem SPA-Pfad kollidieren koennen. Registrierungsreihenfolge zu fastifyStatic
      // egal: find-my-way (Fastifys Router) bevorzugt exakte Routen-Treffer ohnehin vor dem
      // Static-Plugin-Wildcard. Fallback fuer clientseitiges Routing (React Router) im
      // notFoundHandler unten - identisch zu nginx' "try_files $uri /index.html" in
      // deploy/deploy-instanz.sh.
      await server.register(registerApiRoutes, { prefix: "/api" });
      await server.register(fastifyStatic, { root: path.join(__dirname, "../../frontend/dist") });
      server.setNotFoundHandler((request, reply) => {
        if (request.method === "GET") {
          reply.sendFile("index.html");
          return;
        }
        reply.code(404).send({ error: "Nicht gefunden" });
      });
    } else {
      await registerApiRoutes(server);
    }

    await ensureIndexes();
    starteCheckinTimer(server.log);
    starteMailBerichtTimer(server.log);
    await server.listen({ port: PORT, host: HOST });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
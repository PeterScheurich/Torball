import os from "node:os";
import type { FastifyInstance } from "fastify";
import type { LokaleSyncKonfiguration } from "@torball/shared";
import { deleteDoc, findById, insertDoc } from "../repository";
import { requireRolle } from "../auth/plugin";
import { LOKALE_SYNC_KONFIGURATION_ID, aktuelleLokaleSyncKonfiguration } from "../lokaleSyncKonfiguration";

/**
 * Rein lokale Sync-Konfiguration DIESER Installation (Turnier-Sync, Abschnitt 21.3/23) - die
 * eigentliche Kopplungslogik (Kopplungscode einloesen) liegt serverseitig in
 * routes/instanzSync.ts; diese Datei ruft sie beim Verbinden per fetch() auf und speichert das
 * Ergebnis lokal. Admin-only (EinstellungenPage), weil eine Kopplung eine so weitreichende
 * Instanz-Eigenschaft ist.
 */

interface VerbindenBody {
  serverUrl: string;
  kopplungscode: string;
  bezeichnung?: string;
}

const verbindenSchema = {
  type: "object",
  required: ["serverUrl", "kopplungscode"],
  properties: {
    serverUrl: { type: "string", minLength: 1 },
    kopplungscode: { type: "string", minLength: 1 },
    bezeichnung: { type: "string" },
  },
} as const;

/** IPv4-Adressen dieses Rechners im lokalen Netzwerk (ohne Loopback) - fuer den Hinweis in der
 *  Oberflaeche, unter welcher Adresse andere Geraete (Helfer-Tablets etc.) die lokale
 *  Installation erreichen. */
function lanAdressen(): string[] {
  const adressen: string[] = [];
  for (const schnittstellen of Object.values(os.networkInterfaces())) {
    for (const eintrag of schnittstellen ?? []) {
      if (eintrag.family === "IPv4" && !eintrag.internal) adressen.push(eintrag.address);
    }
  }
  return adressen;
}

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sync/status", async () => {
    // istLokaleInstallation spiegelt SERVE_FRONTEND (siehe index.ts) - nur im Einzelprozess-
    // Modus der Windows-Installation ergibt "dieses Geraet mit einem Server verbinden" ueberhaupt
    // einen Sinn. Ohne dieses Signal zeigte EinstellungenPage.tsx das Kopplungsformular bisher auf
    // JEDER Instanz (auch Dev/Prod/Demo im Browser) - live beim Nutzer aufgefallen.
    const istLokaleInstallation = process.env.SERVE_FRONTEND === "true";
    // Netzwerk-Infos BEWUSST nur fuer die lokale Installation mitliefern (die Route ist
    // oeffentlich - eine Server-Instanz soll ihre internen Schnittstellen-Adressen nicht
    // preisgeben). lanErreichbar: lauscht das Backend auch fuer andere Geraete im Netz oder nur
    // auf diesem Rechner (HOST=127.0.0.1, der Installer-Default ohne aktivierten Netzwerkzugriff)?
    // Grundlage fuer den Hinweis bei den Turnier-Codes (TurnierFreigabe.tsx), ohne den der
    // Betriebsmodus "Lokales Netzwerk" an einer unsichtbaren Huerde scheitert (Nutzer-Fund).
    const host = process.env.HOST ?? "0.0.0.0";
    const netzwerk = istLokaleInstallation
      ? {
          lanErreichbar: host !== "127.0.0.1" && host !== "localhost" && host !== "::1",
          netzwerkAdressen: lanAdressen(),
        }
      : {};
    const konfiguration = await aktuelleLokaleSyncKonfiguration();
    if (!konfiguration) return { verbunden: false, istLokaleInstallation, ...netzwerk };
    return {
      verbunden: true,
      serverUrl: konfiguration.serverUrl,
      gekoppeltAm: konfiguration.gekoppeltAm,
      istLokaleInstallation,
      ...netzwerk,
    };
  });

  app.post<{ Body: VerbindenBody }>(
    "/sync/verbinden",
    { schema: { body: verbindenSchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin"])) return;

      const serverUrl = req.body.serverUrl.replace(/\/+$/, "");
      let antwort: Response;
      try {
        // Der Zentrale-Plattform-Server laeuft im Regelfall hinter nginx, das die Backend-Routen
        // nur unter "/api" durchreicht (siehe deploy-instanz.sh, location /api/) - dessen Backend
        // selbst registriert sie intern an der Wurzel. Ohne dieses Praefix landet die Anfrage bei
        // nginx' SPA-Auslieferung (200 OK mit HTML statt der erwarteten JSON-Antwort) und scheitert
        // hier scheinbar grundlos mit "Kopplung fehlgeschlagen." - live erlebt (2026-08-19), per
        // curl gegen die echte Prod-Domain verifiziert. Gleicher Fix noetig in sync/checkin.ts.
        antwort = await fetch(`${serverUrl}/api/instanzen/kopplung-einloesen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kopplungscode: req.body.kopplungscode, bezeichnung: req.body.bezeichnung }),
        });
      } catch {
        return reply.code(502).send({ error: "Server ist unter dieser Adresse nicht erreichbar." });
      }
      const koerper = (await antwort.json().catch(() => ({}))) as { instanzToken?: string; error?: string };
      if (!antwort.ok || !koerper.instanzToken) {
        return reply.code(antwort.status || 400).send({ error: koerper.error ?? "Kopplung fehlgeschlagen." });
      }

      const konfiguration: LokaleSyncKonfiguration = {
        _id: LOKALE_SYNC_KONFIGURATION_ID,
        docType: "lokaleSyncKonfiguration",
        serverUrl,
        instanzToken: koerper.instanzToken,
        gekoppeltAm: new Date().toISOString(),
      };
      await insertDoc(konfiguration);
      return reply.send({ verbunden: true, serverUrl });
    },
  );

  app.post("/sync/trennen", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    const bestehend = await findById(LOKALE_SYNC_KONFIGURATION_ID);
    if (bestehend) await deleteDoc(bestehend._id, (bestehend as { _rev: string })._rev);
    return reply.code(204).send();
  });
}

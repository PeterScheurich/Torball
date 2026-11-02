import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { requireRolle } from "../auth/plugin";
import { neuestesRelease, vergleicheVersionen, type GitHubRelease } from "../versionsvergleich";

/**
 * Update-Hinweis fuer eine lokale Installation aus dem Windows-Paket (Stufe 1/2, 2026-11-02). Die Anwendung
 * fragt selbst bei den GitHub-Releases nach der neuesten Version (nicht der Browser: kein CORS-/Rate-Limit-
 * Problem je Geraet, und die Quelle steht in paket.json). Sie aktualisiert sich NICHT selbst - das tut
 * "Aktualisieren-Torball.cmd" (deploy/aktualisieren-windows.ps1); hier gibt es nur den Hinweis.
 *
 * Ohne paket.json (Server, Entwicklung, Quellcode-Installation) gibt es nichts zu pruefen: `paket: false`.
 */
interface PaketInfo {
  version: string;
  updateQuelle?: { github?: string };
}

/** backend/dist/routes -> Programmordner (dort liegt paket.json). */
const PAKET_DATEI = path.join(__dirname, "../../../paket.json");

function liesPaketInfo(): PaketInfo | undefined {
  try {
    return JSON.parse(fs.readFileSync(PAKET_DATEI, "utf8")) as PaketInfo;
  } catch {
    return undefined;
  }
}

interface UpdateAntwort {
  paket: boolean;
  installiert?: string;
  /** Neuere Version, falls es eine gibt. */
  verfuegbar?: { version: string; name?: string; seite?: string; hinweise?: string };
  /** Wann zuletzt erfolgreich nachgesehen wurde. */
  geprueftAm?: string;
  /** Lesbare Meldung, wenn das Nachsehen nicht geklappt hat (z. B. kein Internet). */
  fehler?: string;
}

const ERFOLG_GUELTIG_MS = 6 * 60 * 60 * 1000;
const FEHLER_GUELTIG_MS = 15 * 60 * 1000;
let zwischenspeicher: { bis: number; antwort: UpdateAntwort } | undefined;

export async function pruefeAufUpdate(erzwingen = false): Promise<UpdateAntwort> {
  const info = liesPaketInfo();
  if (!info) return { paket: false };
  const basis: UpdateAntwort = { paket: true, installiert: info.version };
  const repo = info.updateQuelle?.github?.trim();
  if (!repo) return basis;
  if (!erzwingen && zwischenspeicher && zwischenspeicher.bis > Date.now()) return zwischenspeicher.antwort;

  try {
    const antwort = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=15`, {
      headers: { "User-Agent": "Torball-Turniere", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!antwort.ok) throw new Error(`GitHub antwortet mit ${antwort.status}`);
    const neuestes = neuestesRelease((await antwort.json()) as GitHubRelease[], info.version);
    const ergebnis: UpdateAntwort = { ...basis, geprueftAm: new Date().toISOString() };
    if (neuestes && vergleicheVersionen(neuestes.tag_name, info.version) > 0) {
      ergebnis.verfuegbar = {
        version: neuestes.tag_name.replace(/^v/, ""),
        name: neuestes.name,
        seite: neuestes.html_url,
        hinweise: neuestes.body?.split(/\r?\n/).slice(0, 15).join("\n"),
      };
    }
    zwischenspeicher = { bis: Date.now() + ERFOLG_GUELTIG_MS, antwort: ergebnis };
    return ergebnis;
  } catch (err) {
    const ergebnis: UpdateAntwort = {
      ...basis,
      fehler: `Nachsehen nicht möglich (${err instanceof Error ? err.message : "unbekannter Fehler"}).`,
    };
    zwischenspeicher = { bis: Date.now() + FEHLER_GUELTIG_MS, antwort: ergebnis };
    return ergebnis;
  }
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  // Nur fuer Administratoren: wer aktualisieren darf, soll es auch sehen.
  app.get<{ Querystring: { neu?: string } }>("/system/update", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    return pruefeAufUpdate(req.query.neu === "1");
  });
}

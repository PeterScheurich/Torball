import type { FastifyReply, FastifyRequest } from "fastify";
import type { Wartung, WartungStatus } from "@torball/shared";
import { findById } from "./repository";

/** Singleton-Dokument, immer dieselbe feste ID (kein newId()/UUID noetig, es gibt nur eines). */
export const WARTUNG_ID = "wartung:global";

/** Ausgangswerte, solange noch kein Wartungsstatus gespeichert wurde. */
export const STANDARD_WARTUNG: Wartung = {
  _id: WARTUNG_ID,
  docType: "wartung",
  aktiv: false,
};

export async function aktuelleWartung(): Promise<Wartung> {
  const doc = await findById<Wartung>(WARTUNG_ID);
  return doc ?? STANDARD_WARTUNG;
}

export function wartungStatus(wartung: Wartung): WartungStatus {
  return {
    aktiv: wartung.aktiv,
    angekuendigtAb: wartung.angekuendigtAb,
    angekuendigtBis: wartung.angekuendigtBis,
  };
}

/** Pfade, die auch waehrend aktiver Wartung fuer alle erreichbar bleiben muessen: der Status-
 *  Check selbst (das Frontend muss ihn abrufen koennen, um ueberhaupt zu wissen, dass Wartung
 *  aktiv ist), sowie Login/Logout/"wer bin ich" - sonst koennte sich niemand mehr als Admin
 *  anmelden, um die Wartung wieder zu beenden. Ein fuehrendes "/api" (Einzelprozess-Modus, siehe
 *  backend/src/index.ts) wird vor dem Vergleich abgeschnitten. */
const WARTUNG_AUSGENOMMENE_PFADE = ["/wartung/status", "/auth/login", "/auth/logout", "/auth/me"];

function bereinigterPfad(url: string): string {
  const pfad = url.split("?")[0];
  return pfad.startsWith("/api/") ? pfad.slice(4) : pfad;
}

/**
 * Blockiert waehrend aktiver Wartung alle Anfragen von Nicht-Admins (auch ohne Benutzerkonto,
 * z.B. Turnier-Code-Sitzungen) - konsistenter Schutz auch bei einem Frontend-Bug oder einem
 * direkten API-Aufruf, nicht nur eine Oberflaechen-Sperre (Nutzer-Vorgabe). Bewusst 403 statt
 * 503: frontend/src/api.ts behandelt 502/503/504 als "Backend nicht erreichbar" und verwirft dort
 * jede eigene Fehlermeldung - 403 durchlaeuft stattdessen den normalen body.error-Pfad. Muss NACH
 * authPreHandler laufen (braucht req.benutzer) - wird deshalb in registerApiRoutes() in index.ts
 * registriert, nicht hier direkt, damit die Registrierungsreihenfolge an einer Stelle sichtbar
 * bleibt.
 */
export async function wartungPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (WARTUNG_AUSGENOMMENE_PFADE.includes(bereinigterPfad(req.url))) return;
  if (req.benutzer?.globaleRolle === "admin") return;

  const wartung = await aktuelleWartung();
  if (!wartung.aktiv) return;

  reply.code(403).send({ error: "Torball-Turniere ist aktuell wegen Wartungsarbeiten nicht verfügbar." });
}

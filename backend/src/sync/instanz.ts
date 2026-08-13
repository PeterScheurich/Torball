import type { FastifyRequest } from "fastify";
import type { TurnierCheckout, VerbundeneInstanz } from "@torball/shared";
import { hashe } from "../auth/token";
import { findAllBySelector } from "../repository";

/** Findet die verbundene Instanz zu einem Klartext-Token (Check-in/Sync-Import-Auth). Nie
 *  widerrufene Instanzen. */
export async function findeInstanzPerToken(tokenWert: string): Promise<VerbundeneInstanz | null> {
  const treffer = await findAllBySelector<VerbundeneInstanz>({
    docType: "verbundeneInstanz",
    instanzTokenHash: hashe(tokenWert),
    widerrufen: false,
  });
  return treffer[0] ?? null;
}

/** Liest das Bearer-Token aus dem Authorization-Header (Instanz-zu-Instanz-Auth - kein
 *  Cookie/Session, laeuft zwischen zwei Backend-Prozessen). */
export function liesInstanzToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/** Aktives (nicht "freigegeben") Checkout eines Turniers, falls vorhanden - Turnier gilt genau
 *  dann als ausgecheckt (siehe shared/src/types/sync.ts). */
export async function findeAktivesCheckout(turnierId: string): Promise<TurnierCheckout | null> {
  const treffer = await findAllBySelector<TurnierCheckout>({
    docType: "turnierCheckout",
    turnierId,
    status: { $in: ["angefordert", "aktiv"] },
  });
  return treffer[0] ?? null;
}

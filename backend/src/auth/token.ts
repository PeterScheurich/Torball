import { createHash, randomBytes } from "node:crypto";

/** Fuer Einladungs- und Passwort-Reset-Links: Klartext-Token geht an den Nutzer, nur der Hash wird persistiert. */
export function erzeugeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashe(token) };
}

/** SHA-256-Hash eines Tokens - zum Vergleich eines eingehenden Klartext-Tokens mit dem
 *  gespeicherten Hash (der Klartext wird nie persistiert). */
export function hashe(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

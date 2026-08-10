import { createHash, randomBytes } from "node:crypto";

/** Fuer Einladungs- und Passwort-Reset-Links: Klartext-Token geht an den Nutzer, nur der Hash wird persistiert. */
export function erzeugeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashe(token) };
}

export function hashe(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

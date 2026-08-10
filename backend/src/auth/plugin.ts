import type { FastifyReply, FastifyRequest } from "fastify";
import "@fastify/cookie";
import type { Benutzer, GlobaleRolle } from "@torball/shared";
import { findById } from "../repository";
import { beruehreSession, findeSessionPerToken } from "./session";

declare module "fastify" {
  interface FastifyRequest {
    benutzer?: Benutzer;
  }
}

export const SESSION_COOKIE_NAME = "torball_session";

/**
 * Wird in index.ts direkt per `server.addHook("preHandler", authPreHandler)`
 * auf der Root-Instanz registriert (nicht ueber einen verschachtelten Plugin-
 * Scope) - sonst wuerden Fastifys Verkapselungsregeln dazu fuehren, dass die
 * `req.benutzer`-Zuweisung nur innerhalb dieses einen Plugin-Scopes sichtbar
 * waere, nicht in den Routen-Dateien (verein.ts, turnier.ts, ...), die als
 * eigene Geschwister-Plugins registriert werden.
 */
export async function authPreHandler(req: FastifyRequest): Promise<void> {
  const token = req.cookies[SESSION_COOKIE_NAME];
  if (!token) return;

  const session = await findeSessionPerToken(token);
  if (!session) return;

  const benutzer = await findById<Benutzer>(session.benutzerId);
  if (!benutzer || benutzer.gesperrt) return;

  req.benutzer = benutzer;
  await beruehreSession(session);
}

export function setzeSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false, // TODO: auf true stellen, sobald das Backend hinter HTTPS laeuft
    maxAge: 60 * 60 * 12,
  });
}

export function loescheSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.benutzer) {
    reply.code(401).send({ error: "Anmeldung erforderlich" });
    return false;
  }
  return true;
}

export function requireRolle(req: FastifyRequest, reply: FastifyReply, erlaubt: GlobaleRolle[]): boolean {
  if (!requireAuth(req, reply)) return false;
  if (!erlaubt.includes(req.benutzer!.globaleRolle)) {
    reply.code(403).send({ error: "Keine Berechtigung fuer diese Aktion" });
    return false;
  }
  return true;
}

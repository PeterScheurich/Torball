import type { FastifyReply, FastifyRequest } from "fastify";
import "@fastify/cookie";
import type { Benutzer, GlobaleRolle, TurnierCodeRolle, TurnierId } from "@torball/shared";
import { findById } from "../repository";
import { beruehreSession, findeSessionPerToken, SESSION_INAKTIVITAETS_FENSTER_MS } from "./session";

declare module "fastify" {
  interface FastifyRequest {
    benutzer?: Benutzer;
    /** ID der aktuellen Session - z.B. damit eine Passwortaenderung alle ANDEREN Sessions beenden kann, ohne die gerade benutzte zu killen. */
    sessionId?: string;
    /** Turnier-Code-Session (Abschnitt 21.3, "Lokales Netzwerk") - Zugriff auf GENAU dieses eine
     *  Turnier, ohne Benutzerkonto. Nie gleichzeitig mit `benutzer` gesetzt (eine Session ist
     *  entweder das eine oder das andere, siehe shared/src/types/session.ts). Wird NICHT von
     *  requireAuth/requireRolle akzeptiert (die bedeuten weiterhin strikt "echtes Benutzerkonto") -
     *  nur die turnierbezogenen Routen pruefen das gezielt ueber requireZugriff/turnierZugriff.ts. */
    turnierCode?: { turnierId: TurnierId; rolle: TurnierCodeRolle };
  }
}

export const SESSION_COOKIE_NAME = "torball_session";

/**
 * Steuert das `Secure`-Flag des Session-Cookies. In Produktion (hinter HTTPS)
 * MUSS `COOKIE_SECURE=true` gesetzt sein, sonst wird das Cookie auch ueber
 * unverschluesseltes HTTP mitgeschickt. Lokal (Vite/HTTP) bleibt es aus, sonst
 * wuerde der Browser das Cookie gar nicht erst setzen und der Login schluege
 * ohne erkennbaren Grund fehl. Default bewusst `false` (lokale Entwicklung).
 */
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

/**
 * Wird in index.ts direkt per `server.addHook("preHandler", authPreHandler)`
 * auf der Root-Instanz registriert (nicht ueber einen verschachtelten Plugin-
 * Scope) - sonst wuerden Fastifys Verkapselungsregeln dazu fuehren, dass die
 * `req.benutzer`-Zuweisung nur innerhalb dieses einen Plugin-Scopes sichtbar
 * waere, nicht in den Routen-Dateien (verein.ts, turnier.ts, ...), die als
 * eigene Geschwister-Plugins registriert werden.
 */
export async function authPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE_NAME];
  if (!token) return;

  const session = await findeSessionPerToken(token);
  if (!session) return;

  if (session.sessionArt === "code") {
    req.turnierCode = { turnierId: session.turnierId, rolle: session.rolle };
    req.sessionId = session._id;
    await beruehreSession(session);
    erneuereDauerhaftesCookie(req, reply, token, session.dauerhaft);
    return;
  }

  const benutzer = await findById<Benutzer>(session.benutzerId, "benutzer");
  if (!benutzer || benutzer.gesperrt) return;

  req.benutzer = benutzer;
  req.sessionId = session._id;
  await beruehreSession(session);
  erneuereDauerhaftesCookie(req, reply, token, session.dauerhaft);
}

/**
 * "Angemeldet bleiben" gilt, solange gearbeitet wird: Das Cookie bekommt bei jeder Anfrage ein neues Ablaufdatum
 * (gleitend, wie das Inaktivitaets-Fenster auf dem Server). Ohne das ginge es 12 Stunden nach dem Anmelden aus,
 * egal wie aktiv die Person ist - mitten in der digitalen Protokollierung. Nicht an Login/Logout: Dort setzt oder
 * loescht die Route das Cookie selbst, und ein davor gesetztes altes duerfte nicht dazwischenfunken.
 */
function erneuereDauerhaftesCookie(
  req: FastifyRequest,
  reply: FastifyReply,
  token: string,
  dauerhaft: boolean | undefined,
): void {
  if (!dauerhaft) return;
  const route = req.routeOptions?.url ?? "";
  if (route.endsWith("/auth/login") || route.endsWith("/auth/logout")) return;
  setzeSessionCookie(reply, token, true);
}

/**
 * `dauerhaft` = "Angemeldet bleiben": Das Cookie hat dann ein Ablaufdatum (das Inaktivitaets-Fenster der Session,
 * bei jeder Anfrage erneuert) und ueberlebt das Schliessen des Browsers. Ohne bekommt es keins - der Browser wirft es
 * beim Schliessen weg. Die Session selbst laeuft in beiden Faellen nur nach Inaktivitaet ab (siehe
 * SESSION_INAKTIVITAETS_FENSTER_MS). Alle anderen Cookie-Eigenschaften (httpOnly, sameSite, secure) sind in beiden
 * Faellen gleich.
 */
export function setzeSessionCookie(reply: FastifyReply, token: string, dauerhaft: boolean): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    ...(dauerhaft ? { maxAge: SESSION_INAKTIVITAETS_FENSTER_MS / 1000 } : {}),
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

/**
 * Wie requireAuth, akzeptiert zusaetzlich eine Turnier-Code-Session (Abschnitt 21.3). Bewusst NUR
 * in den turnierbezogenen Routen-Dateien verwendet (mannschaft.ts, spieler.ts, schiedsrichter.ts,
 * spielplan.ts, spiel.ts, ergebnis.ts, ergebnisToken.ts, turnier.ts, turnierBerechtigung.ts,
 * turnierCode.ts) - NICHT in benutzer.ts/kanban.ts/systemeinstellungen.ts/systemkonfiguration.ts/
 * verein.ts/team.ts, die weiterhin ein echtes Benutzerkonto voraussetzen (requireAuth/requireRolle
 * bleiben dort unveraendert). Die eigentliche turnierbezogene Zugriffspruefung (welche Stufe genau,
 * stimmt die turnierId ueberhaupt) passiert danach immer noch separat ueber
 * turnierZugriff.ts/hatMindestens - diese Funktion prueft nur "ueberhaupt irgendwie angemeldet".
 */
export function requireZugriff(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.benutzer && !req.turnierCode) {
    reply.code(401).send({ error: "Anmeldung oder Turnier-Code erforderlich" });
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

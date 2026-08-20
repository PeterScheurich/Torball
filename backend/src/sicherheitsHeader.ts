import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Sicherheits-Response-Header (Sicherheitsdurchsicht #3, 2026-08-20). Bewusst ein konservativer,
 * SPA-vertraeglicher Satz - KEINE restriktive Content-Security-Policy fuer Skripte/Styles/Bilder
 * (die wuerde die Vite-SPA + Google-Fonts + YouTube-Embed leicht brechen). Die CSP hier beschraenkt
 * nur das Einbetten (Clickjacking), die `<base>`-URL und Plugins - alles ohne Einfluss auf das Laden
 * der eigentlichen App-Ressourcen.
 *
 * Wird als onSend-Hook auf der Root-Instanz registriert und deckt damit ALLE Antworten ab: die
 * API-Routen (auch unter dem /api-Praefix im SERVE_FRONTEND-Modus) UND die statisch ausgelieferten
 * Frontend-Dateien in eben diesem Modus. Auf dem Debian-Prod liefert nginx die Frontend-Dateien
 * selbst aus (Fastify sieht sie nicht) - dort setzt die nginx-Site dieselben Header zusaetzlich
 * (siehe deploy/deploy-instanz.sh). Fuer /api-Antworten hinter nginx genuegt dieser Hook, da nginx
 * Upstream-Header durchreicht.
 */
export function setzeSicherheitsHeader(reply: FastifyReply): void {
  // Verhindert MIME-Sniffing (Browser respektiert den deklarierten Content-Type).
  reply.header("X-Content-Type-Options", "nosniff");
  // Clickjacking-Schutz (aeltere Browser); die CSP frame-ancestors unten ist das moderne Pendant.
  reply.header("X-Frame-Options", "DENY");
  // Bei Klick auf einen externen Link nur die Origin (nicht den Pfad) als Referer senden - schuetzt
  // u.a. die token-tragenden oeffentlichen URLs (Ergebnis-Erfassung), deren Pfad so nicht abfliesst.
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  // Ungenutzte Browser-Funktionen abschalten (die App braucht sie nicht; QR-Codes werden erzeugt,
  // nicht per Kamera gescannt).
  reply.header("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  // HSTS nur, wenn diese Instanz hinter HTTPS laeuft (dasselbe Signal wie das Secure-Cookie). Ueber
  // reines HTTP/eine IP ignorieren Browser den Header ohnehin. Bewusst OHNE `includeSubDomains`: die
  // Instanzen teilen sich eine Parent-Domain (turniere / turniere-demo .blindentorball.de) mit evtl.
  // weiteren Diensten - includeSubDomains wuerde HTTPS geschwisterweit erzwingen. Ein Jahr waere
  // aggressiv fuer eine Beta, daher 180 Tage. Die robusteste Stelle fuer HSTS bleibt der externe
  // TLS-Endpunkt (Nginx Proxy Manager); dieser Header ist die Absicherung darunter.
  if (process.env.COOKIE_SECURE === "true") {
    reply.header("Strict-Transport-Security", "max-age=15552000");
  }
}

/** onSend-Hook-Wrapper (setzt die Header, reicht den Payload unveraendert weiter). */
export async function sicherheitsHeaderHook(
  _req: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): Promise<unknown> {
  setzeSicherheitsHeader(reply);
  return payload;
}

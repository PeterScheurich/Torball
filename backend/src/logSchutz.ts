/**
 * Schwaerzt Zugangs-Tokens in Log-Text. Fastify protokolliert standardmaessig die VOLLE Anfrage-URL,
 * und mehrere URLs tragen ein Klartext-Token im Pfad: `/benutzer/passwort-reset/<token>`,
 * `/benutzer/einladung/<token>`, `/ergebnis-erfassung/<token>/...` (OWASP-Durchgang 2026-10-31).
 * Wer ein Log oder einen Diagnose-Bericht lesen kann, koennte damit Konten uebernehmen (Reset-/
 * Einladungslink) oder Ergebnisse schreiben (Ergebnis-Token = Dauerzugang). nginx-Accesslogs
 * enthalten dieselben Pfade - dort muss das separat geschehen, das kann dieser Code nicht.
 *
 * Erkannt wird nach dem Pfadsegment, nicht nach der Laenge des Tokens: Die Tokens sind Hex- bzw.
 * URL-sichere Base64-Zeichenketten.
 */
const TOKEN_PFAD = /(\/(?:passwort-reset|einladung|ergebnis-erfassung)\/)[A-Za-z0-9_-]{8,}/g;

export function schwaerzeTokens(text: string): string {
  return text.replace(TOKEN_PFAD, "$1***");
}

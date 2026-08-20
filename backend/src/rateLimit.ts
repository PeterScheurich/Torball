import type { FastifyServerOptions } from "fastify";

/**
 * Zentrale Konfiguration fuer Rate-Limiting (@fastify/rate-limit) und die zugehoerige
 * Proxy-Vertrauensstellung. Gebuendelt hier, damit die Limits nicht ueber mehrere Routen-Dateien
 * verstreut und uneinheitlich sind.
 *
 * Hintergrund: Die Zentrale Plattform ist oeffentlich erreichbar, hatte bisher aber KEIN
 * Rate-Limiting - Login/Registrierung/Passwort-vergessen usw. waren ungebremst (Sicherheitsbefund
 * 20.08.2026). Ergaenzung: ein grosszuegiges globales Limit als Flut-Schutz plus strengere Limits
 * fuer sicherheitssensible, nie in Massen legitim aufgerufene Endpunkte.
 */

/**
 * Grosszuegiges globales Limit je Client-IP - reine Flut-Absicherung, soll den Normalbetrieb NICHT
 * stoeren. Wichtig: an einem Spielort teilen sich oft viele Geraete hinter NAT eine oeffentliche IP
 * (dann zaehlt das Limit fuer den ganzen Ort gemeinsam) UND das Frontend pollt bewusst alle 10-30 s
 * (Ergebnisse/Wartung). Der Wert ist deshalb bewusst hoch angesetzt.
 */
export const GLOBAL_RATE_LIMIT = { max: 1000, timeWindow: "1 minute" } as const;

/**
 * Strikteres Limit je Client-IP fuer sicherheitssensible Endpunkte (Login-nahe Aktionen,
 * Registrierung, Ersteinrichtung, Passwort-vergessen, Instanz-Kopplung) - solche Aufrufe kommen nie
 * in Massen legitim von einem Ort. Wird ueber `config.rateLimit` an der jeweiligen Route gesetzt.
 */
export const SENSIBEL_RATE_LIMIT = { max: 20, timeWindow: "10 minutes" } as const;

/**
 * Etwas grosszuegiger als SENSIBEL: die Turnier-Code-Anmeldung ist zwar ein Brute-Force-Ziel
 * (menschlich gesetzte, evtl. kurze Codes), wird aber an einem Spielort legitim von vielen Geraeten
 * kurz nacheinander benutzt. Drosselt automatisierte Rate-Angriffe, ohne den Spielort-Start zu
 * blockieren.
 */
export const CODE_ANMELDUNG_RATE_LIMIT = { max: 60, timeWindow: "10 minutes" } as const;

/**
 * Damit das Rate-Limit die ECHTE Client-IP kennt (statt der IP des davorliegenden Reverse-Proxys),
 * muss Fastify wissen, welchen Proxys es die `X-Forwarded-For`-Angabe glauben darf. Steuerbar ueber
 * die Env-Variable `TRUST_PROXY`:
 *
 *   - nicht gesetzt (Default): Loopback + private Netzbereiche vertrauen. Das deckt beide
 *     Betriebsarten robust ab (externer Nginx Proxy Manager -> Instanz-nginx -> Backend, sowie
 *     reiner LAN-Zugriff) und ist NICHT von aussen faelschbar: da alle vertrauten Proxys auf
 *     privaten/Loopback-Adressen sitzen, endet die Kette bei der ersten oeffentlichen (= echten)
 *     Client-IP; eine vom Client injizierte `X-Forwarded-For`-Angabe steht links davon und wird
 *     ignoriert.
 *   - "false": keinem Proxy vertrauen (req.ip = direkte Verbindung; hinter einem Proxy wuerden dann
 *     alle Clients als eine IP gezaehlt - nur fuer Direktbetrieb ohne Proxy sinnvoll).
 *   - "true": allen vertrauen (nur in einer vollstaendig kontrollierten Umgebung, sonst faelschbar).
 *   - Zahl: Anzahl der vertrauten Proxy-Hops.
 *   - Kommaliste: konkrete IPs/CIDR-Bereiche (z.B. "127.0.0.1,10.0.0.0/8").
 */
export function ermittleTrustProxy(): FastifyServerOptions["trustProxy"] {
  const roh = process.env.TRUST_PROXY?.trim();
  if (!roh) {
    return ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "fc00::/7", "fe80::/10"];
  }
  if (roh === "false") return false;
  if (roh === "true") return true;
  if (/^\d+$/.test(roh)) return Number(roh);
  return roh.split(",").map((eintrag) => eintrag.trim()).filter(Boolean);
}

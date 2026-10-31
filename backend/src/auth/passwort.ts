import bcrypt from "bcryptjs";

// Passwort-Hashing (bcrypt) und die serverseitige Durchsetzung der Passwortregeln.
const SALT_ROUNDS = 12;

/** Erzeugt den bcrypt-Hash eines Klartext-Passworts (zum Speichern). */
export async function hashePasswort(passwort: string): Promise<string> {
  return bcrypt.hash(passwort, SALT_ROUNDS);
}

/** Prueft ein Klartext-Passwort gegen einen gespeicherten bcrypt-Hash (beim Login). */
export async function passwortStimmt(passwort: string, hash: string): Promise<boolean> {
  return bcrypt.compare(passwort, hash);
}

/**
 * Fester, gueltiger bcrypt-Hash (Cost 12) OHNE Geheimwert - nur dazu da, beim Login gegen einen
 * NICHT existierenden Account genauso viel Zeit zu verbrennen wie gegen einen existierenden
 * (bcrypt.compare). Verhindert eine User-Enumeration ueber die Antwortzeit ("existiert diese
 * E-Mail?"). Statisch hinterlegt, damit auch der allererste Login gegen einen unbekannten Account
 * schon die volle Zeit braucht (kein Lazy-Init-Leak beim ersten Aufruf).
 */
const DUMMY_HASH = "$2b$12$jeUrJQTCEYsiJsK9ngDJMuA43xNf0WKEeO2PJfaON0O95JPKXaVcW";

/** Fuehrt einen bcrypt-Vergleich gegen den Dummy-Hash aus (Ergebnis irrelevant, immer false) -
 *  aufzurufen an den Login-Pfaden, die sonst ohne bcrypt sofort zurueckkehren wuerden. */
export async function verbrenneLoginZeit(passwort: string): Promise<void> {
  await bcrypt.compare(passwort, DUMMY_HASH);
}

// Die Passwortregeln selbst liegen seit 2026-10 in @torball/shared (shared/src/logik/passwortRegeln.ts),
// damit das Frontend dieselben Regeln anzeigt, die der Server durchsetzt. Hier nur weitergeleitet.
export { PASSWORT_MINDESTLAENGE, passwortRegelVerstoss } from "@torball/shared";

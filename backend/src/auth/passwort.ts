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

/** Abschnitt 21.4: Mindestlaenge 8 (aktuell hartkodiert statt aus der Systemkonfiguration - die hat noch keine CRUD-Routen), je mind. 1 Grossbuchstabe, 1 Zahl, 1 Sonderzeichen. */
export function passwortRegelVerstoss(passwort: string): string | undefined {
  if (passwort.length < 8) return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  if (!/[A-Z]/.test(passwort)) return "Das Passwort muss mindestens einen Großbuchstaben enthalten.";
  if (!/[0-9]/.test(passwort)) return "Das Passwort muss mindestens eine Zahl enthalten.";
  if (!/[^A-Za-z0-9]/.test(passwort)) return "Das Passwort muss mindestens ein Sonderzeichen enthalten.";
  return undefined;
}

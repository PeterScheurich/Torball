import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashePasswort(passwort: string): Promise<string> {
  return bcrypt.hash(passwort, SALT_ROUNDS);
}

export async function passwortStimmt(passwort: string, hash: string): Promise<boolean> {
  return bcrypt.compare(passwort, hash);
}

/** Abschnitt 21.4: Mindestlaenge 8 (aktuell hartkodiert statt aus der Systemkonfiguration - die hat noch keine CRUD-Routen), je mind. 1 Grossbuchstabe, 1 Zahl, 1 Sonderzeichen. */
export function passwortRegelVerstoss(passwort: string): string | undefined {
  if (passwort.length < 8) return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  if (!/[A-Z]/.test(passwort)) return "Das Passwort muss mindestens einen Großbuchstaben enthalten.";
  if (!/[0-9]/.test(passwort)) return "Das Passwort muss mindestens eine Zahl enthalten.";
  if (!/[^A-Za-z0-9]/.test(passwort)) return "Das Passwort muss mindestens ein Sonderzeichen enthalten.";
  return undefined;
}

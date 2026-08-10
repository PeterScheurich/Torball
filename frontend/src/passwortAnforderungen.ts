/**
 * Passwort-Anforderungen. Bewusst eine Kopie der Backend-Pruefung
 * (`backend/src/auth/passwort.ts`, `passwortRegelVerstoss`) - `shared` ist CommonJS, das
 * Frontend kann daraus keine Laufzeit-Funktionen importieren (siehe CLAUDE.md). Aendern sich
 * die Regeln, hier UND dort anpassen.
 */
export interface PasswortRegel {
  label: string;
  erfuellt: (passwort: string) => boolean;
}

export const PASSWORT_REGELN: PasswortRegel[] = [
  { label: "Mindestens 8 Zeichen", erfuellt: (p) => p.length >= 8 },
  { label: "Mindestens 1 Großbuchstabe", erfuellt: (p) => /[A-Z]/.test(p) },
  { label: "Mindestens 1 Zahl", erfuellt: (p) => /[0-9]/.test(p) },
  { label: "Mindestens 1 Sonderzeichen", erfuellt: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function passwortAlleRegelnErfuellt(passwort: string): boolean {
  return PASSWORT_REGELN.every((regel) => regel.erfuellt(passwort));
}

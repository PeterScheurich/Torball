/**
 * Passwort-Anforderungen. Bewusst eine Kopie der Backend-Pruefung
 * (`backend/src/auth/passwort.ts`, `passwortRegelVerstoss`) - `shared` ist CommonJS, das
 * Frontend kann daraus keine Laufzeit-Funktionen importieren (siehe CLAUDE.md). Aendern sich
 * die Regeln, hier UND dort anpassen.
 *
 * Seit 2026-08-30 zaehlt die LAENGE statt der Zusammensetzung: Die frueheren Pflichten (je ein
 * Grossbuchstabe, eine Zahl, ein Sonderzeichen) erzeugten vorhersehbare Passwoerter, ohne die
 * Sicherheit nennenswert zu erhoehen. Fuer diese Anwendung kommt hinzu, dass Sonderzeichen mit
 * einem Screenreader muehsam einzugeben und zu kontrollieren sind - eine Passphrase aus Woertern
 * ist fuer die Zielgruppe die deutlich bessere Wahl.
 */
export const PASSWORT_MINDESTLAENGE = 12;

/** Muss inhaltlich mit HAEUFIGE_FOLGEN im Backend uebereinstimmen. */
const HAEUFIGE_FOLGEN = [
  "passwort",
  "password",
  "geheim",
  "qwertz",
  "qwerty",
  "asdfgh",
  "123456",
  "letmein",
  "willkommen",
  "welcome",
  "admin",
];

export interface PasswortRegel {
  label: string;
  erfuellt: (passwort: string) => boolean;
}

export const PASSWORT_REGELN: PasswortRegel[] = [
  { label: `Mindestens ${PASSWORT_MINDESTLAENGE} Zeichen`, erfuellt: (p) => p.length >= PASSWORT_MINDESTLAENGE },
  {
    label: "Keine sehr häufige Zeichenfolge",
    // Bei leerer Eingabe als erfuellt zeigen - sonst stuende der Haken schon vor dem Tippen auf Rot.
    erfuellt: (p) => p === "" || !HAEUFIGE_FOLGEN.some((folge) => p.toLowerCase().includes(folge)),
  },
];

export function passwortAlleRegelnErfuellt(passwort: string): boolean {
  return PASSWORT_REGELN.every((regel) => regel.erfuellt(passwort));
}

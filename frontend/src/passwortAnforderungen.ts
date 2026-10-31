/**
 * Anzeige der Passwort-Anforderungen beim Tippen. Die Regeln selbst (Mindestlaenge, Sperrliste
 * haeufiger Folgen, Pruefung auf den eigenen Namen) liegen seit 2026-10 in
 * `@torball/shared` (shared/src/logik/passwortRegeln.ts) - der Server setzt dieselben durch, eine
 * Aenderung braucht nur noch eine Stelle. Hier bleibt nur die Aufbereitung als Haken-Liste.
 *
 * Seit 2026-08-30 zaehlt die LAENGE statt der Zusammensetzung: Die frueheren Pflichten (je ein
 * Grossbuchstabe, eine Zahl, ein Sonderzeichen) erzeugten vorhersehbare Passwoerter, ohne die
 * Sicherheit nennenswert zu erhoehen. Fuer diese Anwendung kommt hinzu, dass Sonderzeichen mit
 * einem Screenreader muehsam einzugeben und zu kontrollieren sind - eine Passphrase aus Woertern
 * ist fuer die Zielgruppe die deutlich bessere Wahl.
 */
import { HAEUFIGE_FOLGEN, PASSWORT_MINDESTLAENGE } from "@torball/shared";

export { PASSWORT_MINDESTLAENGE };

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

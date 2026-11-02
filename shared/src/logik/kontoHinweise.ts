import type { KontoHinweis, KontoHinweisArt } from "../types";

/** So viele Hinweise bleiben am Konto stehen; aeltere fallen heraus. */
export const MAX_KONTO_HINWEISE = 20;

const TEXTE: Record<KontoHinweisArt, string> = {
  "passwort-zuruecksetzen-ausgeloest": "Es wurde ein Zurücksetzen deines Passworts ausgelöst.",
  "passwort-geaendert": "Dein Passwort wurde geändert.",
  "email-geaendert": "Die E-Mail-Adresse deines Kontos wurde geändert.",
  "zwei-fa-aktiviert": "Die Zwei-Faktor-Anmeldung wurde eingeschaltet.",
  "zwei-fa-deaktiviert": "Die Zwei-Faktor-Anmeldung wurde ausgeschaltet.",
  "rolle-geaendert": "Die Rolle deines Kontos wurde geändert.",
};

/** Satz fuer Mail und Oberflaeche, ohne Zeitangabe: "Dein Passwort wurde geändert (über …). Durch: …". */
export function kontoHinweisText(hinweis: Pick<KontoHinweis, "art" | "durch" | "detail">): string {
  let text = TEXTE[hinweis.art];
  if (hinweis.detail) text += ` ${hinweis.detail}`;
  if (hinweis.durch) text += ` Ausgelöst durch: ${hinweis.durch}.`;
  return text;
}

/** Haengt einen Hinweis an die Liste und kappt sie auf `MAX_KONTO_HINWEISE` (die neuesten bleiben). */
export function fuegeKontoHinweisHinzu(liste: KontoHinweis[] | undefined, neu: KontoHinweis): KontoHinweis[] {
  return [...(liste ?? []), neu].slice(-MAX_KONTO_HINWEISE);
}

export function ungeleseneKontoHinweise(liste: KontoHinweis[] | undefined): KontoHinweis[] {
  return (liste ?? []).filter((h) => !h.gelesen);
}

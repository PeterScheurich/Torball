export type Breite = "standard" | "breit";

const SPEICHER_SCHLUESSEL = "torball-breite";

/** Siehe THEME_GEAENDERT_EVENT in theme.ts - gleiches Muster fuer die Inhaltsbreite. */
export const BREITE_GEAENDERT_EVENT = "torball:breite-geaendert";

export function geladeneBreite(): Breite {
  return localStorage.getItem(SPEICHER_SCHLUESSEL) === "breit" ? "breit" : "standard";
}

/** Wendet die gespeicherte Breite auf [data-breite] an, OHNE localStorage zu beschreiben oder das
 *  Aenderungs-Event zu feuern (App-Start auf JEDER Seite - siehe themeInitialisieren in theme.ts). */
export function breiteInitialisieren(): void {
  document.documentElement.setAttribute("data-breite", geladeneBreite());
}

/** Setzt [data-breite] auf <html> und merkt sich die Wahl lokal in diesem Browser (steuert die
 *  max-width des Inhalts, siehe index.css). Ein gesetzter Konto-Standard ueberschreibt sie beim
 *  naechsten Sitzungsstart wieder (siehe uebernimmKontoStandards() in auth.tsx). */
export function breiteAnwenden(breite: Breite): void {
  document.documentElement.setAttribute("data-breite", breite);
  localStorage.setItem(SPEICHER_SCHLUESSEL, breite);
  window.dispatchEvent(new Event(BREITE_GEAENDERT_EVENT));
}

export type Dichte = "standard" | "schmal";

const SPEICHER_SCHLUESSEL = "torball-dichte";

/** Siehe THEME_GEAENDERT_EVENT in theme.ts - gleiches Muster fuer die Dichte. */
export const DICHTE_GEAENDERT_EVENT = "torball:dichte-geaendert";

export function geladeneDichte(): Dichte {
  return localStorage.getItem(SPEICHER_SCHLUESSEL) === "schmal" ? "schmal" : "standard";
}

/** Wendet die gespeicherte Dichte auf [data-dichte] an, OHNE localStorage zu beschreiben oder
 * das Aenderungs-Event zu feuern - siehe themeInitialisieren() in theme.ts fuer die Begruendung
 * (App-Start auf JEDER Seite, rein lesend). */
export function dichteInitialisieren(): void {
  document.documentElement.setAttribute("data-dichte", geladeneDichte());
}

/** Setzt [data-dichte] auf <html> und merkt sich die Wahl lokal in diesem Browser -
 * wirkt auf Zeilenhoehe von Tabellen UND normale Eingabefelder (siehe index.css).
 * Ein gesetzter Konto-Standard ueberschreibt sie beim naechsten Sitzungsstart wieder
 * (siehe uebernimmKontoStandards() in auth.tsx). */
export function dichteAnwenden(dichte: Dichte): void {
  document.documentElement.setAttribute("data-dichte", dichte);
  localStorage.setItem(SPEICHER_SCHLUESSEL, dichte);
  window.dispatchEvent(new Event(DICHTE_GEAENDERT_EVENT));
}

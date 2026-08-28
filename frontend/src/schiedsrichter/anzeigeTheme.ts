export type AnzeigeTheme = "dunkel" | "hell";

const SPEICHER_SCHLUESSEL = "torball-schiedsrichter-theme";

/**
 * Hell/Dunkel NUR fuer die Schiedsrichter-Anzeige - bewusst getrennt vom App-weiten Theme
 * (`theme.ts`) und vom Konto-Standard (Nutzer-Vorgabe 28.08.2026).
 *
 * Zwei Gruende fuer die Trennung: Die Anzeige haengt an einem festen Rechner in einer festen
 * Halle, waehrend das App-Theme der Person folgt - und die Beleuchtung am Spielort entscheidet
 * hier ueber die Lesbarkeit aus mehreren Metern, nicht der Geschmack. Deshalb greift der
 * Konto-Standard hier ausdruecklich NICHT durch (anders als bei Theme/Dichte/Breite, wo "der
 * Konto-Standard hat immer Recht" gilt).
 *
 * Standard ist dunkel: helle Zahlen auf dunklem Grund blenden nicht und tragen weiter.
 */
export function geladenesAnzeigeTheme(): AnzeigeTheme {
  try {
    return localStorage.getItem(SPEICHER_SCHLUESSEL) === "hell" ? "hell" : "dunkel";
  } catch {
    // Privater Modus / gesperrte Website-Daten: dann eben der Standard.
    return "dunkel";
  }
}

export function merkeAnzeigeTheme(theme: AnzeigeTheme): void {
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, theme);
  } catch {
    // Nicht speichern zu koennen darf das Umschalten nicht verhindern.
  }
}

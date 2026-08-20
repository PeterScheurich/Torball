export type Theme = "system" | "light" | "dark";

const SPEICHER_SCHLUESSEL = "torball-theme";

/** Feuert, wenn sich das Theme aendert - damit mehrere gleichzeitig sichtbare
 * ThemeUmschalter-Instanzen (z.B. Kopfzeile + Einstellungen-Seite) synchron bleiben. */
export const THEME_GEAENDERT_EVENT = "torball:theme-geaendert";

export function geladenesTheme(): Theme {
  const wert = localStorage.getItem(SPEICHER_SCHLUESSEL);
  return wert === "light" || wert === "dark" ? wert : "system";
}

/** Wendet das gespeicherte Theme auf [data-theme] an, OHNE localStorage zu beschreiben oder
 * das Aenderungs-Event zu feuern - fuer den App-Start (main.tsx) auf JEDER Seite, nicht nur
 * dort, wo ThemeUmschalter gerade gemountet ist. Rein lesend: der Start stellt nur den
 * gespeicherten Zustand her, er legt keinen neuen an. */
export function themeInitialisieren(): void {
  const theme = geladenesTheme();
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

/** Setzt [data-theme] auf <html> (bzw. entfernt es fuer "system") und merkt sich die Wahl in
 * diesem Browser. Ein gesetzter Konto-Standard ueberschreibt sie beim naechsten Sitzungsstart
 * wieder (siehe uebernimmKontoStandards() in auth.tsx - "der Konto-Standard hat immer Recht"). */
export function themeAnwenden(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem(SPEICHER_SCHLUESSEL);
  } else {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(SPEICHER_SCHLUESSEL, theme);
  }
  window.dispatchEvent(new Event(THEME_GEAENDERT_EVENT));
}

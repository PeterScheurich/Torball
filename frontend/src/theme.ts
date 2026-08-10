export type Theme = "system" | "light" | "dark";

const SPEICHER_SCHLUESSEL = "torball-theme";

export function geladenesTheme(): Theme {
  const wert = localStorage.getItem(SPEICHER_SCHLUESSEL);
  return wert === "light" || wert === "dark" ? wert : "system";
}

/** Setzt [data-theme] auf <html> (bzw. entfernt es fuer "system") und merkt sich die Wahl. */
export function themeAnwenden(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem(SPEICHER_SCHLUESSEL);
  } else {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(SPEICHER_SCHLUESSEL, theme);
  }
}

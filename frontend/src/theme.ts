export type Theme = "system" | "light" | "dark";

const SPEICHER_SCHLUESSEL = "torball-theme";

/** Feuert, wenn sich das Theme aendert - damit mehrere gleichzeitig sichtbare
 * ThemeUmschalter-Instanzen (z.B. Kopfzeile + Einstellungen-Seite) synchron bleiben. */
export const THEME_GEAENDERT_EVENT = "torball:theme-geaendert";

export function geladenesTheme(): Theme {
  const wert = localStorage.getItem(SPEICHER_SCHLUESSEL);
  return wert === "light" || wert === "dark" ? wert : "system";
}

export function themeLokalUeberschrieben(): boolean {
  return localStorage.getItem(SPEICHER_SCHLUESSEL) !== null;
}

/** Wendet das gespeicherte Theme auf [data-theme] an, OHNE localStorage zu beschreiben oder
 * das Aenderungs-Event zu feuern - fuer den App-Start (main.tsx) auf JEDER Seite, nicht nur
 * dort, wo ThemeUmschalter gerade gemountet ist. Ein "echtes" themeAnwenden() wuerde hier bei
 * unveraendertem Standard "system" faelschlich einen lokalen Override anlegen und damit den
 * vom Benutzerkonto geerbten Standardwert (siehe seedeVoreinstellungen in auth.tsx) blockieren. */
export function themeInitialisieren(): void {
  const theme = geladenesTheme();
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
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
  window.dispatchEvent(new Event(THEME_GEAENDERT_EVENT));
}

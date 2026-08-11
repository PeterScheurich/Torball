import { useEffect, useState } from "react";
import { geladenesTheme, themeAnwenden, THEME_GEAENDERT_EVENT, type Theme } from "../theme";

const OPTIONEN: { wert: "light" | "dark"; icon: string; label: string }[] = [
  { wert: "light", icon: "☀", label: "Hell" },
  { wert: "dark", icon: "🌙", label: "Dunkel" },
];

/** Umschalter Hell/Dunkel fuer das Farbschema (geraetelokale Wahl, siehe theme.ts). */
export function ThemeUmschalter() {
  const [theme, setTheme] = useState<Theme>(geladenesTheme);

  useEffect(() => {
    themeAnwenden(theme);
  }, [theme]);

  // Andere gleichzeitig sichtbare Instanzen (Kopfzeile + Einstellungen-Seite) auf dem
  // Laufenden halten, wenn dort geklickt wurde - sonst zeigt diese Instanz nach einem
  // Klick in der anderen weiterhin den alten aktiven Zustand an.
  useEffect(() => {
    const aktualisieren = () => setTheme(geladenesTheme());
    window.addEventListener(THEME_GEAENDERT_EVENT, aktualisieren);
    return () => window.removeEventListener(THEME_GEAENDERT_EVENT, aktualisieren);
  }, []);

  return (
    <div className="theme-umschalter" role="group" aria-label="Farbschema">
      {OPTIONEN.map((option) => (
        <button
          key={option.wert}
          type="button"
          className={theme === option.wert ? "theme-button theme-button-aktiv" : "theme-button"}
          aria-pressed={theme === option.wert}
          aria-label={option.label}
          title={theme === option.wert ? `${option.label} (erneut klicken: Systemeinstellung folgen)` : option.label}
          // Erneutes Klicken der bereits aktiven Option hebt die manuelle Wahl wieder auf
          // (zurueck zu "system") - ersetzt den frueheren dritten "System"-Button.
          onClick={() => setTheme(theme === option.wert ? "system" : option.wert)}
        >
          <span aria-hidden="true">{option.icon}</span>
        </button>
      ))}
    </div>
  );
}

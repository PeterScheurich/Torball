import { useEffect, useState } from "react";
import { geladenesTheme, themeAnwenden, type Theme } from "../theme";

const OPTIONEN: { wert: Theme; label: string }[] = [
  { wert: "light", label: "☀ Hell" },
  { wert: "dark", label: "🌙 Dunkel" },
  { wert: "system", label: "🖥 System" },
];

export function ThemeUmschalter() {
  const [theme, setTheme] = useState<Theme>(geladenesTheme);

  useEffect(() => {
    themeAnwenden(theme);
  }, [theme]);

  return (
    <div className="theme-umschalter" role="group" aria-label="Farbschema">
      {OPTIONEN.map((option) => (
        <button
          key={option.wert}
          type="button"
          className={theme === option.wert ? "theme-button theme-button-aktiv" : "theme-button"}
          aria-pressed={theme === option.wert}
          onClick={() => setTheme(option.wert)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

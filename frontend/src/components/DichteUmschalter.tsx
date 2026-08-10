import { useEffect, useState } from "react";
import { geladeneDichte, dichteAnwenden, DICHTE_GEAENDERT_EVENT, type Dichte } from "../dichte";

const OPTIONEN: { wert: Dichte; label: string }[] = [
  { wert: "standard", label: "Standard" },
  { wert: "schmal", label: "Schmal" },
];

export function DichteUmschalter() {
  const [dichte, setDichte] = useState<Dichte>(geladeneDichte);

  useEffect(() => {
    dichteAnwenden(dichte);
  }, [dichte]);

  // Haelt mehrere gleichzeitig sichtbare Instanzen synchron (z.B. Profil-Seite) und
  // uebernimmt einen vom Benutzerkonto geerbten Standardwert (siehe seedeVoreinstellungen
  // in auth.tsx), sobald der irgendwo im Baum per dichteAnwenden() angewendet wurde.
  useEffect(() => {
    const aktualisieren = () => setDichte(geladeneDichte());
    window.addEventListener(DICHTE_GEAENDERT_EVENT, aktualisieren);
    return () => window.removeEventListener(DICHTE_GEAENDERT_EVENT, aktualisieren);
  }, []);

  return (
    <div className="theme-umschalter" role="group" aria-label="Zeilenabstand">
      {OPTIONEN.map((option) => (
        <button
          key={option.wert}
          type="button"
          className={dichte === option.wert ? "theme-button theme-button-aktiv" : "theme-button"}
          aria-pressed={dichte === option.wert}
          onClick={() => setDichte(option.wert)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

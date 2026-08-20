import { useEffect, useState } from "react";
import { geladeneBreite, breiteAnwenden, BREITE_GEAENDERT_EVENT, type Breite } from "../breite";

const OPTIONEN: { wert: Breite; label: string }[] = [
  { wert: "standard", label: "Standard" },
  { wert: "breit", label: "Breit" },
];

/** Umschalter Standard/Breit fuer die Inhaltsbreite (geraetelokale Wahl, siehe breite.ts). */
export function BreiteUmschalter() {
  const [breite, setBreite] = useState<Breite>(geladeneBreite);

  useEffect(() => {
    breiteAnwenden(breite);
  }, [breite]);

  // Haelt mehrere gleichzeitig sichtbare Instanzen synchron und uebernimmt einen beim
  // Sitzungsstart angewendeten Konto-Standard (siehe uebernimmKontoStandards in auth.tsx),
  // sobald er per breiteAnwenden() angewendet wurde.
  useEffect(() => {
    const aktualisieren = () => setBreite(geladeneBreite());
    window.addEventListener(BREITE_GEAENDERT_EVENT, aktualisieren);
    return () => window.removeEventListener(BREITE_GEAENDERT_EVENT, aktualisieren);
  }, []);

  return (
    <div className="theme-umschalter" role="group" aria-label="Inhaltsbreite">
      {OPTIONEN.map((option) => (
        <button
          key={option.wert}
          type="button"
          className={breite === option.wert ? "theme-button theme-button-aktiv" : "theme-button"}
          aria-pressed={breite === option.wert}
          onClick={() => setBreite(option.wert)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { getLaender } from "./api";

/**
 * Die Vorschlagsliste der Laender (Admin -> Laender). Ist sie nicht erreichbar, bleibt die Liste leer:
 * die Eingabefelder sind Freitext mit Vorschlaegen und funktionieren auch ohne.
 */
export function useLaender(): string[] {
  const [laender, setLaender] = useState<string[]>([]);
  useEffect(() => {
    getLaender()
      .then(setLaender)
      .catch(() => {});
  }, []);
  return laender;
}

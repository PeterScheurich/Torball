import type { Turnier } from "@torball/shared";

/**
 * Eigene, kleine Kopie der Backend-Logik (backend/src/spielplan/zeitplanung.ts):
 * @torball/shared wird als CommonJS kompiliert, Vite kann daraus im Browser
 * nur Typen (die beim Kompilieren wegfallen), aber keine echten Funktions-
 * exporte laden, ohne die Build-Konfiguration des ganzen Monorepos umzustellen.
 * Fuer diese zwei simplen, stabilen Funktionen ist die kleine Duplizierung der
 * einfachere Weg. Muss inhaltlich mit dem Backend-Pendant synchron bleiben.
 */
export function spieldauerMinuten(turnier: Turnier): number {
  return (
    turnier.spielzeitMinuten * turnier.anzahlHalbzeiten +
    turnier.pauseMinuten +
    (turnier.pauseZwischenSpielenMinuten ?? 0)
  );
}

export function berechneStartzeit(turnier: Turnier, slot: number): string | undefined {
  if (!turnier.startzeit) return undefined;

  const start = new Date(`${turnier.datum}T${turnier.startzeit}:00`);
  if (Number.isNaN(start.getTime())) return undefined;

  start.setMinutes(start.getMinutes() + slot * spieldauerMinuten(turnier));
  return start.toISOString();
}

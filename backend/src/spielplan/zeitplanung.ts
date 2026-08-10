import type { Turnier } from "@torball/shared";

/**
 * Grobe Schaetzung der Gesamtdauer eines Spiels inkl. Halbzeitpause. Enthaelt
 * bewusst keinen zusaetzlichen Wechselpuffer zwischen zwei Spielen auf
 * demselben Feld - dafuer sieht Abschnitt 8 eine "konfigurierbare Toleranz"
 * vor, die hier noch nicht modelliert ist; die Turnierleitung darf
 * Startzeiten laut Spezifikation ohnehin jederzeit manuell nachjustieren.
 */
export function spieldauerMinuten(turnier: Turnier): number {
  return turnier.spielzeitMinuten * turnier.anzahlHalbzeiten + turnier.pauseMinuten;
}

/** Berechnet die geplante Startzeit eines Slots aus Turnier-Startzeit + Slot-Index * Spieldauer. */
export function berechneStartzeit(turnier: Turnier, slot: number): string | undefined {
  if (!turnier.startzeit) return undefined;

  const start = new Date(`${turnier.datum}T${turnier.startzeit}:00`);
  if (Number.isNaN(start.getTime())) return undefined;

  start.setMinutes(start.getMinutes() + slot * spieldauerMinuten(turnier));
  return start.toISOString();
}

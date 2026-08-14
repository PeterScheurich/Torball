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

/**
 * Umkehrung von berechneStartzeit(): zerlegt einen ISO-Zeitstempel wieder in lokale
 * Turnier-Felder (Datum/Startzeit). Nutzt bewusst die lokalen Date-Getter (nicht die
 * UTC-Varianten), da berechneStartzeit() den Zeitstempel ebenfalls lokal interpretiert
 * (`new Date("<datum>T<startzeit>:00")` ohne Zeitzonen-Suffix).
 */
export function datumUndStartzeitAus(iso: string): { datum: string; startzeit: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    datum: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    startzeit: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

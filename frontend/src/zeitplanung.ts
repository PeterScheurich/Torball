// Die Logik liegt seit 2026-10 in @torball/shared (shared/src/logik/zeitplanung.ts) und wird dort
// einmal gepflegt - Frontend und Backend benutzen dieselbe Funktion (Vite bindet den Quelltext von
// shared direkt ein, siehe vite.config.ts). Diese Datei leitet nur weiter, damit die bestehenden
// Importe im Frontend unveraendert bleiben.
export { spieldauerMinuten, berechneStartzeit } from "@torball/shared";

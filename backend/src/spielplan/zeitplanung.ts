// Die Logik liegt seit 2026-10 in @torball/shared (shared/src/logik/zeitplanung.ts) und wird dort
// einmal gepflegt - Frontend und Backend benutzen dieselbe Funktion. Diese Datei leitet nur weiter,
// damit die bestehenden Importe im Backend unveraendert bleiben.
export { spieldauerMinuten, berechneStartzeit, datumUndStartzeitAus } from "@torball/shared";

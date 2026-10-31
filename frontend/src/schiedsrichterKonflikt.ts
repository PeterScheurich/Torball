// Die Logik liegt seit 2026-10 in @torball/shared (shared/src/logik/schiedsrichterKonflikt.ts) und
// wird dort einmal gepflegt - das Backend bewertet damit auch seine Vorschlaege. Diese Datei leitet
// nur weiter, damit die bestehenden Importe im Frontend unveraendert bleiben.
export { schiedsrichterKonflikt, type SchiedsrichterKonflikt } from "@torball/shared";

// Die Logik liegt seit 2026-10 in @torball/shared (shared/src/logik/ereignisse.ts) und wird dort
// einmal gepflegt - Frontend (Live-Zustand) und Backend (Ergebnis) benutzen dieselben Funktionen.
// Diese Datei leitet nur weiter, damit die bestehenden Importe im Backend unveraendert bleiben.
export {
  annullierteIds,
  ergebnisAusEvents,
  gegenseite,
  sortiertNachSequenz,
  wirksameEvents,
} from "@torball/shared";

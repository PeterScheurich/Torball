// Oeffentlicher Einstiegspunkt des @torball/shared-Pakets: re-exportiert alle geteilten Typen
// UND die Logik, die Frontend und Backend gemeinsam brauchen (src/logik/).
// Das Backend nutzt das kompilierte CommonJS aus dist/. Das Frontend bindet den QUELLTEXT direkt
// ein (Alias in frontend/vite.config.ts) - dadurch muss die Logik nicht mehr doppelt gepflegt
// werden. Dafuer gilt in src/logik/: nur reine, plattformneutrale Funktionen (kein Node, kein DOM).
export * from "./types";
export * from "./logik/zeitplanung";
export * from "./logik/ereignisse";
export * from "./logik/schiedsrichterKonflikt";
export * from "./logik/passwortRegeln";

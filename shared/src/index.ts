// Oeffentlicher Einstiegspunkt des @torball/shared-Pakets: re-exportiert alle geteilten Typen.
// Achtung (siehe CLAUDE.md): shared ist CommonJS - Frontend/Vite darf hieraus nur TYPEN
// importieren, keine Laufzeit-Funktionen (die kaemen im Frontend als undefined an).
export * from "./types";
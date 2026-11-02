// "Angemeldet bleiben" (2026-11-02): Ohne den Haken endet die Anmeldung, sobald der Browser geschlossen wird;
// mit Haken gilt sie bis zu 12 Stunden (serverseitige Hoechstdauer, siehe backend/src/auth/session.ts).
// Die letzte Wahl wird in DIESEM Browser gemerkt und beim naechsten Anmelden vorbelegt. Bewusst pro Geraet
// und nicht pro Konto: Beim Anmelden ist noch nicht bekannt, wer sich anmeldet. Standard ist AUS.

const SPEICHER_SCHLUESSEL = "torball-angemeldet-bleiben";

export function gemerktesAngemeldetBleiben(): boolean {
  try {
    return localStorage.getItem(SPEICHER_SCHLUESSEL) === "true";
  } catch {
    return false;
  }
}

export function merkeAngemeldetBleiben(wert: boolean): void {
  try {
    if (wert) localStorage.setItem(SPEICHER_SCHLUESSEL, "true");
    else localStorage.removeItem(SPEICHER_SCHLUESSEL);
  } catch {
    // Ohne nutzbaren Speicher (z. B. privates Fenster) gilt beim naechsten Mal wieder der Standard.
  }
}

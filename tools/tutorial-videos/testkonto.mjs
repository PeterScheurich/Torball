import { readFileSync } from "node:fs";

/**
 * Liest die Zugangsdaten des TESTKONTOS fuer die lokale Dev-Instanz aus einer Datei ausserhalb des Projekts. Pfad ueber die
 * Umgebungsvariable TORBALL_TESTKONTO_DATEI; erwartet Zeilen der Form  - E-Mail: `...`  und  - Passwort: `...`.
 * Gibt die Werte nie aus. Nur fuer Aufnahmen gegen Testdaten (Dev/Demo), nie gegen eine produktive Instanz.
 */
export function holeTestkonto() {
  const pfad = process.env.TORBALL_TESTKONTO_DATEI;
  if (!pfad) throw new Error("TORBALL_TESTKONTO_DATEI ist nicht gesetzt.");
  const text = readFileSync(pfad, "utf8");
  const email = text.match(/E-Mail:\s*`([^`]+)`/)?.[1];
  const passwort = text.match(/Passwort:\s*`([^`]+)`/)?.[1];
  if (!email || !passwort) throw new Error("In der Testkonto-Datei fehlen E-Mail oder Passwort.");
  return { email, passwort };
}

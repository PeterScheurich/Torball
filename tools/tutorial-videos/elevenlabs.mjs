import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Kleiner Zugang zur ElevenLabs-Schnittstelle. Der Schluessel liegt NUR in einer Datei ausserhalb des Projekts
 * (%USERPROFILE%\.elevenlabs\schluessel.txt) und wird weder ausgegeben noch protokolliert noch in Fehlermeldungen gezeigt.
 */
const SCHLUESSEL_DATEI = join(homedir(), ".elevenlabs", "schluessel.txt");
const BASIS = "https://api.elevenlabs.io";

export function leseSchluessel() {
  const wert = readFileSync(SCHLUESSEL_DATEI, "utf8").trim();
  if (!wert) throw new Error(`Die Schluesseldatei ist leer: ${SCHLUESSEL_DATEI}`);
  return wert;
}

/** GET/POST gegen die Schnittstelle. Wirft bei einem Fehler nur Statuscode und die Meldung des Servers, nie den Schluessel. */
export async function api(pfad, { methode = "GET", body, roh = false } = {}) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: { "xi-api-key": leseSchluessel(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    const fehler = new Error(`ElevenLabs ${methode} ${pfad}: HTTP ${antwort.status} ${text.slice(0, 200)}`);
    fehler.status = antwort.status;
    throw fehler;
  }
  return roh ? antwort : antwort.json();
}

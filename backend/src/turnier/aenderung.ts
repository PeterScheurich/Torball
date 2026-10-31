import type { Turnier } from "@torball/shared";
import { findById, insertDoc } from "../repository";

/**
 * Aendert ein Turnier-Dokument konfliktfest: frisch lesen, Aenderung ableiten, bei einem
 * Revisionskonflikt (409) wiederholen. Gleiches Muster wie `aendereBenutzerAtomar`. Gedacht fuer
 * Schreibvorgaenge, die einen Teil des Turniers (z. B. den Turniermodus) aendern, waehrend gleichzeitig
 * andere Anfragen andere Felder desselben Dokuments schreiben koennten. Liefert `aenderung` `undefined`,
 * wird nichts geschrieben.
 */
export async function aendereTurnierAtomar(
  turnierId: string,
  aenderung: (aktuell: Turnier) => Turnier | undefined,
  maxVersuche = 10,
): Promise<Turnier | undefined> {
  for (let i = 0; i < maxVersuche; i++) {
    const frisch = await findById<Turnier>(turnierId, "turnier");
    if (!frisch) return undefined;
    const neu = aenderung(frisch);
    if (!neu) return undefined;
    try {
      return await insertDoc<Turnier>(neu);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 409) continue;
      throw err;
    }
  }
  throw new Error("Das Turnier konnte wegen gleichzeitiger Änderungen nicht gespeichert werden.");
}

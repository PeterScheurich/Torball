import type { Benutzer, Turnier } from "@torball/shared";
import { findById, insertDoc } from "../repository";

/**
 * Markiert ein Turnier als zuletzt inhaltlich bearbeitet (fuer die Anzeige „zuletzt bearbeitet von …"
 * in der Turnierliste). Wird von allen Schreib-Routen aufgerufen, die Turnierdaten aendern - AUSSER
 * der Ergebnis-Erfassung (Nutzer-Vorgabe: Ergebnisse zaehlen hier nicht mit).
 *
 * Bewusst **best-effort**: Metadaten sind nicht kritisch; ein Fehler (z.B. ein seltener CouchDB-
 * Conflict durch parallele Aenderung) darf die eigentliche, bereits erfolgreiche Operation nicht
 * scheitern lassen und wird deshalb nur geloggt.
 */
export async function markiereTurnierBearbeitet(turnierId: string, benutzer: Benutzer | undefined): Promise<void> {
  try {
    const turnier = await findById<Turnier>(turnierId);
    if (!turnier) return;
    await insertDoc<Turnier>({
      ...turnier,
      zuletztBearbeitetVon: benutzer?._id,
      zuletztBearbeitetVonName: benutzer?.name,
      geaendertAm: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("markiereTurnierBearbeitet fehlgeschlagen (ignoriert):", err);
  }
}

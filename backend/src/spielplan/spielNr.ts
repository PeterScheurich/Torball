import type { Spiel, Spielfeld } from "@torball/shared";
import { spielNummern } from "@torball/shared";

/** Haengt jedem Spiel die turnierweit eindeutige, fortlaufende Nummer an (nur Antwort, nie gespeichert). */
export function mitSpielNr<T extends Spiel>(spiele: T[], felder: Spielfeld[]): T[] {
  const nummern = spielNummern(
    spiele.map((s) => ({ id: s._id, slot: Number(s.runde), feldId: s.feldId })),
    felder,
  );
  return spiele.map((s) => ({ ...s, spielNr: nummern.get(s._id) }));
}

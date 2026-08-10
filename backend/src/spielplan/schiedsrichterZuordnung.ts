import type { SchiedsrichterImTurnier, Spiel } from "@torball/shared";

/**
 * Schiedsrichter-Zuordnung als *Vorschlag* (Abschnitt 5.4). Bewusst kein Automatismus bei der
 * Spielplan-Erzeugung, sondern nur auf ausdrueckliche Anforderung; das Ergebnis ist von der
 * Turnierleitung frei aenderbar.
 *
 * Gewichtung der Konflikte (Nutzer-Vorgabe):
 *  - P1 (hoechste Prioritaet): ein Schiedsrichter pfeift NICHT das Spiel seiner eigenen
 *    Mannschaft. Ein Kandidat, fuer den das gilt, wird nicht vorgeschlagen.
 *  - Zusaetzlich physisch unmoeglich: nicht zwei gleichzeitige Spiele (selber Slot) pfeifen.
 *  - P2 (nachrangig): moeglichst nicht pfeifen, waehrend eine eigene Mannschaft gleichzeitig
 *    (in einem anderen Spiel desselben Slots) spielt. Wird als Vorschlag zugelassen, aber
 *    vermieden - im UI zusaetzlich als Hinweis markiert.
 */
const STRAFE_EIGENE_MANNSCHAFT = 10000;
const STRAFE_DOPPELBELEGUNG = 1000;
const STRAFE_GLEICHZEITIG = 100;
/** Ab dieser Strafe wird bewusst KEIN Vorschlag gemacht (Feld bleibt leer, manuell zu fuellen). */
const NICHT_ZUMUTBAR = STRAFE_DOPPELBELEGUNG;

/** Mannschaften, die im selben Zeit-Slot (runde) spielen - je Slot ueber alle Felder. */
function teamsProSlot(spiele: Spiel[]): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const s of spiele) {
    const slot = Number(s.runde);
    const set = map.get(slot) ?? new Set<string>();
    set.add(s.mannschaftAId);
    set.add(s.mannschaftBId);
    map.set(slot, set);
  }
  return map;
}

function eigeneMannschaftImSpiel(sr: SchiedsrichterImTurnier, spiel: Spiel): boolean {
  return !!sr.mannschaftId && (sr.mannschaftId === spiel.mannschaftAId || sr.mannschaftId === spiel.mannschaftBId);
}

/**
 * Ordnet jedem Spiel einen vorgeschlagenen Schiedsrichter zu (oder `undefined`, wenn kein
 * zumutbarer Kandidat existiert). Greedy je Spiel in Spielnummern-Reihenfolge, mit
 * Lastausgleich als Feinsortierung, damit sich die Einsaetze verteilen.
 */
export function schlageSchiedsrichterVor(
  spiele: Spiel[],
  schiedsrichter: SchiedsrichterImTurnier[],
): Map<string, string | undefined> {
  const sortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));
  const slotTeams = teamsProSlot(sortiert);
  const zuordnung = new Map<string, string | undefined>();
  const einsaetze = new Map<string, number>();
  const belegtProSlot = new Map<number, Set<string>>();

  for (const spiel of sortiert) {
    const slot = Number(spiel.runde);
    const teamsImSlot = slotTeams.get(slot) ?? new Set<string>();

    let bester: string | undefined;
    let besteStrafe = Infinity;
    for (const sr of schiedsrichter) {
      let strafe = einsaetze.get(sr._id) ?? 0; // Lastausgleich (Feinsortierung)
      const imEigenen = eigeneMannschaftImSpiel(sr, spiel);
      if (imEigenen) strafe += STRAFE_EIGENE_MANNSCHAFT;
      if (belegtProSlot.get(slot)?.has(sr._id)) strafe += STRAFE_DOPPELBELEGUNG;
      if (sr.mannschaftId && !imEigenen && teamsImSlot.has(sr.mannschaftId)) strafe += STRAFE_GLEICHZEITIG;
      if (strafe < besteStrafe) {
        besteStrafe = strafe;
        bester = sr._id;
      }
    }

    const gewaehlt = bester !== undefined && besteStrafe < NICHT_ZUMUTBAR ? bester : undefined;
    zuordnung.set(spiel._id, gewaehlt);
    if (gewaehlt) {
      einsaetze.set(gewaehlt, (einsaetze.get(gewaehlt) ?? 0) + 1);
      const set = belegtProSlot.get(slot) ?? new Set<string>();
      set.add(gewaehlt);
      belegtProSlot.set(slot, set);
    }
  }

  return zuordnung;
}

import type { MannschaftImTurnier, SchiedsrichterImTurnier, Spiel } from "@torball/shared";

/**
 * Schiedsrichter-Zuordnung als *Vorschlag* (Abschnitt 5.4). Bewusst kein Automatismus bei der
 * Spielplan-Erzeugung, sondern nur auf ausdrueckliche Anforderung; das Ergebnis ist von der
 * Turnierleitung frei aenderbar.
 *
 * Gewichtung der Konflikte (Nutzer-Vorgabe):
 *  - P1 (hoechste Prioritaet): ein Schiedsrichter pfeift NICHT das Spiel einer Mannschaft
 *    seines eigenen Vereins. Ein Kandidat, fuer den das gilt, wird nicht vorgeschlagen.
 *  - Zusaetzlich physisch unmoeglich: nicht zwei gleichzeitige Spiele (selber Slot) pfeifen.
 *  - P2 (nachrangig): moeglichst nicht pfeifen, waehrend eine Mannschaft des eigenen Vereins
 *    gleichzeitig (in einem anderen Spiel desselben Slots) spielt. Wird als Vorschlag
 *    zugelassen, aber vermieden - im UI zusaetzlich als Hinweis markiert.
 *
 * Vereins- statt Mannschafts-Bezug (2026-08-14 umgestellt): SchiedsrichterImTurnier.vereinId
 * wird ueber die Mannschaften des Turniers aufgeloest (vereinProMannschaftId), nicht direkt mit
 * einer Mannschafts-ID verglichen - erfasst dadurch automatisch auch mehrere Mannschaften
 * desselben Vereins im selben Turnier (z.B. I- und II-Mannschaft).
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

/** mannschaftId -> vereinId, nur fuer Mannschaften mit gesetztem Verein (Ad-hoc-Mannschaften
 *  ohne Stammdaten-Bezug bleiben unberuecksichtigt - fuer sie ist kein Konflikt erkennbar). */
function vereinProMannschaft(mannschaften: MannschaftImTurnier[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of mannschaften) {
    if (m.vereinId) map.set(m._id, m.vereinId);
  }
  return map;
}

function eigenerVereinImSpiel(
  sr: SchiedsrichterImTurnier,
  spiel: Spiel,
  vereinProMannschaftId: Map<string, string>,
): boolean {
  if (!sr.vereinId) return false;
  return (
    vereinProMannschaftId.get(spiel.mannschaftAId) === sr.vereinId ||
    vereinProMannschaftId.get(spiel.mannschaftBId) === sr.vereinId
  );
}

/**
 * Ordnet jedem Spiel einen vorgeschlagenen Schiedsrichter zu (oder `undefined`, wenn kein
 * zumutbarer Kandidat existiert). Greedy je Spiel in Spielnummern-Reihenfolge, mit
 * Lastausgleich als Feinsortierung, damit sich die Einsaetze verteilen.
 */
export function schlageSchiedsrichterVor(
  spiele: Spiel[],
  schiedsrichter: SchiedsrichterImTurnier[],
  mannschaften: MannschaftImTurnier[],
): Map<string, string | undefined> {
  const sortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));
  const slotTeams = teamsProSlot(sortiert);
  const vereinProMannschaftId = vereinProMannschaft(mannschaften);
  const zuordnung = new Map<string, string | undefined>();
  const einsaetze = new Map<string, number>();
  const belegtProSlot = new Map<number, Set<string>>();

  // "Nur Turnierleitung"-Personen pfeifen nicht und werden nie als Kandidat vorgeschlagen.
  const kandidaten = schiedsrichter.filter((sr) => !sr.nurTurnierleitung);

  for (const spiel of sortiert) {
    const slot = Number(spiel.runde);
    const teamsImSlot = slotTeams.get(slot) ?? new Set<string>();

    let bester: string | undefined;
    let besteStrafe = Infinity;
    for (const sr of kandidaten) {
      let strafe = einsaetze.get(sr._id) ?? 0; // Lastausgleich (Feinsortierung)
      const imEigenen = eigenerVereinImSpiel(sr, spiel, vereinProMannschaftId);
      if (imEigenen) strafe += STRAFE_EIGENE_MANNSCHAFT;
      if (belegtProSlot.get(slot)?.has(sr._id)) strafe += STRAFE_DOPPELBELEGUNG;
      if (
        sr.vereinId &&
        !imEigenen &&
        [...teamsImSlot].some((mid) => vereinProMannschaftId.get(mid) === sr.vereinId)
      ) {
        strafe += STRAFE_GLEICHZEITIG;
      }
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

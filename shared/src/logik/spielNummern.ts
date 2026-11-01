/**
 * Fortlaufende Spielnummer ueber das GANZE Turnier (Auftraggeber 01.11.2026). Bisher zaehlte jede Halle
 * fuer sich, und `Spiel.runde` ist nur der Zeit-Slot, der bei zwei Feldern doppelt vorkommt - eine Nummer
 * fuer "das Spiel" gab es nicht. Die Nummer ergibt sich aus der Reihenfolge: zuerst der Zeit-Slot, bei
 * gleichem Slot die Reihenfolge der Spielfelder. Sie wird nie gespeichert, sondern bei Bedarf berechnet
 * und folgt damit einer Umsortierung von selbst (wie bisher die Spielnummer im Plan).
 */
export interface NummerEintrag {
  id: string;
  /** Zeit-Slot (bei gespeicherten Spielen `Number(runde)`). */
  slot: number;
  feldId?: string;
}

export function spielNummern(eintraege: NummerEintrag[], felder: { feldId: string }[]): Map<string, number> {
  const feldPosition = new Map(felder.map((f, i) => [f.feldId, i]));
  const sortiert = [...eintraege].sort(
    (a, b) =>
      (Number.isFinite(a.slot) ? a.slot : Infinity) - (Number.isFinite(b.slot) ? b.slot : Infinity) ||
      (feldPosition.get(a.feldId ?? "") ?? Infinity) - (feldPosition.get(b.feldId ?? "") ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  return new Map(sortiert.map((e, i) => [e.id, i + 1]));
}

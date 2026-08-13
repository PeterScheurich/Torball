import type { MannschaftImTurnier, Spiel } from "@torball/shared";

export interface SchiedsrichterKonflikt {
  /** P1 (hoechste Prioritaet): Schiedsrichter pfeift ein Spiel einer Mannschaft seines eigenen Vereins. */
  eigeneMannschaft: boolean;
  /** P2 (nachrangig): eine Mannschaft des eigenen Vereins spielt gleichzeitig in einem anderen Spiel desselben Slots. */
  gleichzeitig: boolean;
}

/**
 * Erkennt Schiedsrichter-Konflikte fuer die Warnhinweise im Spielplan. Bewusst dupliziert zur
 * Backend-Vorschlagslogik (`backend/src/spielplan/schiedsrichterZuordnung.ts`), weil `shared`
 * CommonJS ist und das Frontend daraus keine Laufzeit-Funktionen importieren kann (siehe CLAUDE.md).
 *
 * Vereins- statt Mannschafts-Bezug (2026-08-14 umgestellt): `schiedsrichterVereinId` wird ueber
 * die Mannschaften des Turniers aufgeloest (`mannschaften`), nicht direkt mit einer Mannschafts-ID
 * verglichen - erfasst dadurch automatisch auch mehrere Mannschaften desselben Vereins im selben
 * Turnier. Mannschaften ohne vereinId (Ad-hoc-Erfassung ohne Stammdaten-Bezug) koennen dabei nie
 * als "eigener Verein" erkannt werden.
 */
export function schiedsrichterKonflikt(
  spiel: Spiel,
  schiedsrichterVereinId: string | undefined,
  alleSpiele: Spiel[],
  mannschaften: Pick<MannschaftImTurnier, "_id" | "vereinId">[],
): SchiedsrichterKonflikt {
  if (!schiedsrichterVereinId) return { eigeneMannschaft: false, gleichzeitig: false };

  const vereinVonMannschaft = (mannschaftId: string) => mannschaften.find((m) => m._id === mannschaftId)?.vereinId;

  const eigeneMannschaft =
    vereinVonMannschaft(spiel.mannschaftAId) === schiedsrichterVereinId ||
    vereinVonMannschaft(spiel.mannschaftBId) === schiedsrichterVereinId;

  const slot = Number(spiel.runde);
  const gleichzeitig =
    !eigeneMannschaft &&
    alleSpiele.some(
      (s) =>
        s._id !== spiel._id &&
        Number(s.runde) === slot &&
        (vereinVonMannschaft(s.mannschaftAId) === schiedsrichterVereinId ||
          vereinVonMannschaft(s.mannschaftBId) === schiedsrichterVereinId),
    );

  return { eigeneMannschaft, gleichzeitig };
}

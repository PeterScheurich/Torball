import type { Spiel } from "@torball/shared";

export interface SchiedsrichterKonflikt {
  /** P1 (hoechste Prioritaet): Schiedsrichter pfeift ein Spiel seiner eigenen Mannschaft. */
  eigeneMannschaft: boolean;
  /** P2 (nachrangig): eigene Mannschaft spielt gleichzeitig in einem anderen Spiel desselben Slots. */
  gleichzeitig: boolean;
}

/**
 * Erkennt Schiedsrichter-Konflikte fuer die Warnhinweise im Spielplan. Bewusst dupliziert zur
 * Backend-Vorschlagslogik (`backend/src/spielplan/schiedsrichterZuordnung.ts`), weil `shared`
 * CommonJS ist und das Frontend daraus keine Laufzeit-Funktionen importieren kann (siehe CLAUDE.md).
 */
export function schiedsrichterKonflikt(
  spiel: Spiel,
  schiedsrichterMannschaftId: string | undefined,
  alleSpiele: Spiel[],
): SchiedsrichterKonflikt {
  if (!schiedsrichterMannschaftId) return { eigeneMannschaft: false, gleichzeitig: false };

  const eigeneMannschaft =
    schiedsrichterMannschaftId === spiel.mannschaftAId || schiedsrichterMannschaftId === spiel.mannschaftBId;

  const slot = Number(spiel.runde);
  const gleichzeitig =
    !eigeneMannschaft &&
    alleSpiele.some(
      (s) =>
        s._id !== spiel._id &&
        Number(s.runde) === slot &&
        (s.mannschaftAId === schiedsrichterMannschaftId || s.mannschaftBId === schiedsrichterMannschaftId),
    );

  return { eigeneMannschaft, gleichzeitig };
}

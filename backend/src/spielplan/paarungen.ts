import type { MannschaftImTurnier } from "@torball/shared";

/**
 * Vereins-Duelle zuerst, dann Bundesland-Derbys, dann der Rest
 * (Gesamtspezifikation Abschnitt 8, "Bevorzugte Reihenfolge").
 */
export type PaarungsPrioritaet = "verein" | "bundesland" | "neutral";

export interface Paarung {
  mannschaftAId: string;
  mannschaftBId: string;
  prioritaet: PaarungsPrioritaet;
  /** Bei doppeltem Turnier (wiederholungen=2): 1 = erstes, 2 = zweites Aufeinandertreffen. */
  durchgang: number;
}

/**
 * Erzeugt alle Paarungen für "Jeder gegen Jeden" (wiederholungen=1) bzw.
 * "Jeder zweimal gegen Jeden" (wiederholungen=2). Deckt damit Abschnitt 4's
 * "Einfaches Turnier"/"Doppeltes Turnier" ab; bei der Bundesliga (2 Spieltage)
 * wird diese Funktion einmal je Spieltag (= je Turnier-Dokument) aufgerufen,
 * die Verknüpfung der Spieltage läuft über den Wettbewerb (Abschnitt 20.3),
 * nicht über diesen Algorithmus.
 *
 * `bundeslandBeruecksichtigen` steuert die Bundesland-Stufe der Prioritaet (Turnierregel, siehe
 * `Turnierregeln.bundeslandBeruecksichtigen` - Standard „nein", eine Eigenheit fuer Wettbewerbe mit
 * festem Regionalbezug wie Bundesliga/Deutsche Meisterschaft). Ist sie deaktiviert, faellt eine
 * Paarung ohne gemeinsamen Verein direkt auf "neutral" - die Vereins-Prioritaet gilt unabhaengig
 * davon immer.
 */
export function erzeugePaarungen(
  mannschaften: MannschaftImTurnier[],
  wiederholungen: 1 | 2,
  bundeslandBeruecksichtigen: boolean,
): Paarung[] {
  const paarungen: Paarung[] = [];

  for (let durchgang = 1; durchgang <= wiederholungen; durchgang++) {
    for (let i = 0; i < mannschaften.length; i++) {
      for (let j = i + 1; j < mannschaften.length; j++) {
        paarungen.push({
          mannschaftAId: mannschaften[i].mannschaftId,
          mannschaftBId: mannschaften[j].mannschaftId,
          prioritaet: prioritaetVon(mannschaften[i], mannschaften[j], bundeslandBeruecksichtigen),
          durchgang,
        });
      }
    }
  }

  return paarungen;
}

function prioritaetVon(
  a: MannschaftImTurnier,
  b: MannschaftImTurnier,
  bundeslandBeruecksichtigen: boolean,
): PaarungsPrioritaet {
  if (a.vereinId && a.vereinId === b.vereinId) return "verein";
  if (bundeslandBeruecksichtigen && a.bundesland && normalisiert(a.bundesland) === normalisiert(b.bundesland)) {
    return "bundesland";
  }
  return "neutral";
}

/**
 * Toleriert Groß-/Kleinschreibung und überflüssige Leerzeichen beim
 * Bundesland-Abgleich, damit ein Tippfehler die Bundesland-Regel
 * (Gesamtspezifikation Abschnitt 5.2) nicht stillschweigend aushebelt.
 * Ersetzt keine Validierung beim Erfassen (siehe Datalist im Frontend) -
 * nur ein zweites, robusteres Sicherheitsnetz an der Stelle, wo es zaehlt.
 */
function normalisiert(bundesland: string | undefined): string {
  return (bundesland ?? "").trim().toLowerCase();
}

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
  /** Gruppe der Vorrunde (Turniermodus mit zwei Gruppen); fehlt sonst. */
  gruppe?: string;
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
    // Im zweiten Durchgang eines doppelten Turniers Heim/Auswaerts tauschen (wie beim echten
    // Doppel-Rundenturnier / Rueckspiel). Fuer Torball fachlich nicht entscheidend, aber gewuenscht
    // (Nutzer-Vorgabe 2026-08-20). Die Prioritaet ist symmetrisch, haengt also nicht von der
    // Reihenfolge ab. Der spielplanModus "doppelt" ruft diese Funktion mit wiederholungen=2 auf.
    const tausche = durchgang % 2 === 0;
    for (let i = 0; i < mannschaften.length; i++) {
      for (let j = i + 1; j < mannschaften.length; j++) {
        const heim = tausche ? mannschaften[j] : mannschaften[i];
        const auswaerts = tausche ? mannschaften[i] : mannschaften[j];
        paarungen.push({
          mannschaftAId: heim.mannschaftId,
          mannschaftBId: auswaerts.mannschaftId,
          prioritaet: prioritaetVon(mannschaften[i], mannschaften[j], bundeslandBeruecksichtigen),
          durchgang,
        });
      }
    }
  }

  return paarungen;
}

/**
 * Vorrunde mit Gruppen: jeder gegen jeden INNERHALB jeder Gruppe (Turniermodus mit zwei Gruppen).
 * Die Paarungen der Gruppen werden abwechselnd gemischt (A, B, A, B ...), damit bei nur einem Feld nicht
 * erst die ganze Gruppe A und dann die ganze Gruppe B spielt - die Planung greift sonst in dieser Reihenfolge zu.
 * Mannschaften ohne Gruppe duerfen nicht uebergeben werden (das prueft der Aufrufer).
 */
export function erzeugeGruppenPaarungen(
  mannschaften: MannschaftImTurnier[],
  wiederholungen: 1 | 2,
  bundeslandBeruecksichtigen: boolean,
): Paarung[] {
  const nachGruppe = ["A", "B"].map((g) =>
    erzeugePaarungen(
      mannschaften.filter((m) => m.gruppe === g),
      wiederholungen,
      bundeslandBeruecksichtigen,
    ).map((p) => ({ ...p, gruppe: g })),
  );
  const ergebnis: Paarung[] = [];
  const laenge = Math.max(nachGruppe[0].length, nachGruppe[1].length);
  for (let i = 0; i < laenge; i++) {
    for (const liste of nachGruppe) if (i < liste.length) ergebnis.push(liste[i]);
  }
  return ergebnis;
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

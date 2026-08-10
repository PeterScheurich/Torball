import type { Spielfeld } from "@torball/shared";
import type { Paarung, PaarungsPrioritaet } from "./paarungen";

export interface SpielplanEintrag {
  mannschaftAId: string;
  mannschaftBId: string;
  feldId: string;
  /** Fortlaufender Zeit-Slot; alle Eintraege desselben Slots laufen parallel auf verschiedenen Feldern. */
  slot: number;
  /** Nur gesetzt, wenn die Back-to-Back-Regel fuer diese Paarung nicht einhaltbar war (siehe Modul-Kommentar unten). */
  warnung?: string;
}

const PRIORITAETS_RANG: Record<PaarungsPrioritaet, number> = {
  verein: 0,
  bundesland: 1,
  neutral: 2,
};

/** Wie oft mit zufaellig unterschiedlicher Reihenfolge innerhalb gleicher Prioritaet neu versucht wird. */
const MAX_VERSUCHE = 60;

/**
 * Erstellt einen Spielplan-Vorschlag aus einer Paarungsliste (Gesamtspezifikation
 * Abschnitt 8). Modell: Zeit ist in fortlaufende Slots eingeteilt, pro Slot laeuft
 * hoechstens ein Spiel je Feld parallel; ein neuer Slot beginnt erst, wenn der
 * vorige auf allen Feldern beendet ist (siehe "Mehrere Spielfelder": Verzoegerungen
 * werden ueber Pausenanpassung synchronisiert).
 *
 * Harte Regeln werden als Eignungsfilter umgesetzt (Team im aktuellen Slot schon
 * verplant? Team hat im unmittelbar vorigen Slot gespielt?), die bevorzugte
 * Reihenfolge (Verein- vor Bundesland- vor sonstigen Paarungen) nur als Sortierung
 * unter den jeweils zulaessigen Paarungen - genau die in Abschnitt 8/5.2 verlangte
 * Prioritaet ("Vermeidung von Back-to-Back hat Vorrang vor frueher Derby-Platzierung").
 *
 * Wichtige Einschraenkung (empirisch beim Testen entdeckt, siehe Protokoll):
 * "Kein direktes Folgespiel" und "moeglichst viele Felder parallel nutzen" stehen
 * in echtem Widerspruch, sobald genug Felder vorhanden sind, dass ohnehin ALLE
 * Mannschaften in jeder Runde spielen (Felder >= Mannschaften/2) - dann gibt es
 * schlicht keine ausgeruhte Mannschaft, die als Alternative einspringen koennte.
 * Laut Nutzer ist das Normalfeld-Setup ohnehin 1 Feld, in Ausnahmefaellen 2.
 *
 * Bei 1 Feld ist vollstaendige Vermeidung ("Hamiltonpfad" durch alle Paarungen ohne
 * gemeinsames Team zwischen aufeinanderfolgenden Paarungen) graphentheoretisch fuer
 * ab 5 Mannschaften IMMER moeglich (Kneser-Graph K(n,2) ist fuer n>=5 hamiltonsch),
 * fuer genau 3 oder 4 Mannschaften dagegen mathematisch UNMOEGLICH: bei 3 Mannschaften
 * teilen sich alle Paarungen zwangslaeufig ein Team, bei 4 Mannschaften bildet die
 * einzige "kollisionsfreie" Alternativpaarung zu jeder Paarung stets eine bereits
 * verplante Paarung (perfektes Matching ohne Restpfad). Ein einzelner Greedy-Durchlauf
 * findet nicht zuverlaessig eine der (fuer n>=5) existierenden kollisionsfreien
 * Reihenfolgen, deshalb mehrere Versuche mit unterschiedlicher Zufalls-Reihenfolge
 * innerhalb gleicher Prioritaetsstufe; das beste Ergebnis (wenigste Warnungen, im
 * Idealfall keine) wird verwendet.
 *
 * Wenn Back-to-Back trotz aller Versuche nicht vermeidbar ist (kleine Ligen, 2 Felder,
 * oder mathematisch unmoeglicher Fall), laesst der Algorithmus es als letztes Mittel
 * zu und markiert den betroffenen Eintrag ueber `warnung` - analog zum Grundprinzip
 * "die Software warnt, entscheidet nie selbst".
 */
export function erstelleSpielplanVorschlag(
  paarungen: Paarung[],
  felder: Spielfeld[],
): SpielplanEintrag[] {
  if (felder.length === 0) {
    throw new Error("Mindestens ein Spielfeld ist erforderlich, um einen Spielplan zu erstellen.");
  }

  let bestesErgebnis: SpielplanEintrag[] | undefined;
  let wenigsteWarnungen = Infinity;

  for (let versuch = 0; versuch < MAX_VERSUCHE; versuch++) {
    const ergebnis = einZuteilungsversuch(paarungen, felder, versuch > 0);
    const warnungen = ergebnis.filter((e) => e.warnung).length;

    if (warnungen === 0) return ergebnis;

    if (warnungen < wenigsteWarnungen) {
      wenigsteWarnungen = warnungen;
      bestesErgebnis = ergebnis;
    }
  }

  return bestesErgebnis!;
}

function einZuteilungsversuch(
  paarungen: Paarung[],
  felder: Spielfeld[],
  mischen: boolean,
): SpielplanEintrag[] {
  const nachPrioritaet = new Map<PaarungsPrioritaet, Paarung[]>([
    ["verein", []],
    ["bundesland", []],
    ["neutral", []],
  ]);
  for (const paarung of paarungen) {
    nachPrioritaet.get(paarung.prioritaet)!.push(paarung);
  }

  const offen = (["verein", "bundesland", "neutral"] as PaarungsPrioritaet[]).flatMap((prioritaet) => {
    const gruppe = [...nachPrioritaet.get(prioritaet)!];
    return mischen ? gemischt(gruppe) : gruppe;
  });

  const ergebnis: SpielplanEintrag[] = [];
  const letzterSlotVonMannschaft = new Map<string, number>();
  let slot = 0;

  while (offen.length > 0) {
    const belegtInSlot = new Set<string>();
    let feldIndex = 0;

    // 1. Durchlauf: nur Paarungen, bei denen beide Mannschaften im Vorslot pausiert haben.
    feldIndex = fuelleSlot(offen, felder, slot, feldIndex, belegtInSlot, letzterSlotVonMannschaft, ergebnis, {
      erlaubeBackToBack: false,
    });

    // 2. Durchlauf nur, wenn der 1. Durchlauf GAR KEIN Spiel platzieren konnte: Ansonsten bleibt
    // ungenutzte Feldkapazitaet lieber leer (etwas geringere Feldauslastung), statt vermeidbares
    // Back-to-Back zu erzeugen - genau die in Abschnitt 5.2 verlangte Prioritaet. Nur wenn wir
    // sonst gar nicht vorankommen wuerden, wird Back-to-Back als letztes Mittel zugelassen.
    if (feldIndex === 0) {
      feldIndex = fuelleSlot(offen, felder, slot, feldIndex, belegtInSlot, letzterSlotVonMannschaft, ergebnis, {
        erlaubeBackToBack: true,
      });
    }

    if (feldIndex === 0) {
      // Sicherheitsnetz gegen Endlosschleife; sollte bei korrekter Paarungsliste nie eintreten,
      // da der 2. Durchlauf jede verbleibende Paarung in einen frischen (leeren) Slot passt.
      throw new Error("Spielplan konnte nicht weiter aufgebaut werden - inkonsistente Paarungsliste.");
    }

    slot++;
  }

  return ergebnis;
}

function gemischt<T>(liste: T[]): T[] {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

function fuelleSlot(
  offen: Paarung[],
  felder: Spielfeld[],
  slot: number,
  feldIndexStart: number,
  belegtInSlot: Set<string>,
  letzterSlotVonMannschaft: Map<string, number>,
  ergebnis: SpielplanEintrag[],
  optionen: { erlaubeBackToBack: boolean },
): number {
  let feldIndex = feldIndexStart;
  let fortschritt = true;

  while (feldIndex < felder.length && offen.length > 0 && fortschritt) {
    fortschritt = false;

    for (let i = 0; i < offen.length; i++) {
      const paarung = offen[i];
      if (belegtInSlot.has(paarung.mannschaftAId) || belegtInSlot.has(paarung.mannschaftBId)) {
        continue;
      }

      if (!optionen.erlaubeBackToBack) {
        const pausiertA = hatPausiert(letzterSlotVonMannschaft, paarung.mannschaftAId, slot);
        const pausiertB = hatPausiert(letzterSlotVonMannschaft, paarung.mannschaftBId, slot);
        if (!pausiertA || !pausiertB) continue;
      }

      ergebnis.push({
        mannschaftAId: paarung.mannschaftAId,
        mannschaftBId: paarung.mannschaftBId,
        feldId: felder[feldIndex].feldId,
        slot,
        ...(optionen.erlaubeBackToBack
          ? { warnung: "Direktes Folgespiel (Back-to-Back) konnte nicht vermieden werden" }
          : {}),
      });

      belegtInSlot.add(paarung.mannschaftAId);
      belegtInSlot.add(paarung.mannschaftBId);
      letzterSlotVonMannschaft.set(paarung.mannschaftAId, slot);
      letzterSlotVonMannschaft.set(paarung.mannschaftBId, slot);
      offen.splice(i, 1);
      feldIndex++;
      fortschritt = true;
      break;
    }
  }

  return feldIndex;
}

function hatPausiert(letzterSlotVonMannschaft: Map<string, number>, mannschaftId: string, slot: number): boolean {
  const letzterSlot = letzterSlotVonMannschaft.get(mannschaftId);
  return letzterSlot === undefined || letzterSlot < slot - 1;
}

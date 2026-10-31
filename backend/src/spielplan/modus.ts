import type {
  AufloesungsKontext,
  MannschaftImTurnier,
  ModusEinstellungen,
  PlanHinweis,
  PlanSpiel,
  Spiel,
  Turnier,
  TurniermodusVorlage,
} from "@torball/shared";
import {
  baueModusPlan,
  erzeugbarePlanSpiele,
  loeseQuelleAuf,
  planeZeiten,
  quelleText,
  siegerVerlierer,
  spieldauerMinuten,
} from "@torball/shared";
import { berechneRangfolge, type Gleichstand } from "../ergebnisse/tabelle";

/**
 * Ansicht auf den Ablauf eines Turniers mit Turniermodus: der Plan der Runden NACH der Vorrunde mit
 * Platzhaltern, aufgeloesten Paarungen (sobald sie feststehen), Zeiten nach Spielzeit und den
 * Rueckmeldungen. Die Struktur des Plans wird bei jedem Abruf aus Vorlage, Einstellungen und den
 * AKTUELLEN Gruppengroessen neu berechnet - am Turnier steht nur der Zustand je Plan-Spiel
 * (siehe `TurnierModus.planZustand`). Reine Funktion ohne Datenbank, deshalb gut testbar.
 */

export interface PlanSpielAnsicht extends PlanSpiel {
  /** Aufgeloeste Mannschaften, sobald die Quellen feststehen. */
  mannschaftAId?: string;
  mannschaftBId?: string;
  /** Anzeige: der Name der Mannschaft oder der Platzhalter ("Sieger Halbfinale 1"). */
  textA: string;
  textB: string;
  /** Kann jetzt erzeugt werden (beide Quellen aufgeloest, noch kein Spiel). */
  erzeugbar: boolean;
}

export interface GleichstandAnsicht {
  gruppe: string;
  vonPlatz: number;
  bisPlatz: number;
  mannschaften: { id: string; name: string }[];
}

export interface ModusAnsicht {
  vorlage: TurniermodusVorlage;
  einstellungen: ModusEinstellungen;
  gruppenGroessen: number[];
  plan: PlanSpielAnsicht[];
  hinweise: PlanHinweis[];
  gleichstaende: GleichstandAnsicht[];
  /** Je Gruppe ("A"/"B", bei einer Gruppe ""): ist die Vorrunde vollstaendig abgeschlossen? */
  vorrundeFertig: Record<string, boolean>;
  /** Rangfolge je Gruppe (Mannschafts-IDs), sobald die Vorrunde fertig und der Gleichstand entschieden ist. */
  rangfolge: Record<string, string[]>;
}

const gruppenSchluessel = (vorlage: TurniermodusVorlage): string[] => (vorlage.gruppen === 2 ? ["A", "B"] : [""]);

export function mannschaftenDerGruppe(
  mannschaften: MannschaftImTurnier[],
  vorlage: TurniermodusVorlage,
  schluessel: string,
): MannschaftImTurnier[] {
  return vorlage.gruppen === 2 ? mannschaften.filter((m) => m.gruppe === schluessel) : mannschaften;
}

export function gruppenGroessen(mannschaften: MannschaftImTurnier[], vorlage: TurniermodusVorlage): number[] {
  return gruppenSchluessel(vorlage).map((k) => mannschaftenDerGruppe(mannschaften, vorlage, k).length);
}

/** Die Vorrundenspiele einer Gruppe: Spiele ohne `planId`, bei denen beide Mannschaften zur Gruppe gehoeren. */
function vorrundeSpiele(spiele: Spiel[], gruppe: MannschaftImTurnier[]): Spiel[] {
  const ids = new Set(gruppe.map((m) => m._id));
  return spiele.filter((s) => !s.planId && ids.has(s.mannschaftAId) && ids.has(s.mannschaftBId));
}

export function baueModusAnsicht(
  turnier: Turnier,
  mannschaften: MannschaftImTurnier[],
  spiele: Spiel[],
): ModusAnsicht | undefined {
  const modus = turnier.modus;
  if (!modus) return undefined;
  const { vorlage, einstellungen } = modus;
  const namen = new Map(mannschaften.map((m) => [m._id, m.name]));
  const groessen = gruppenGroessen(mannschaften, vorlage);
  const basis = baueModusPlan(vorlage, einstellungen, groessen);
  const hinweise: PlanHinweis[] = [...basis.hinweise];

  if (vorlage.gruppen === 2) {
    const ohneGruppe = mannschaften.filter((m) => m.gruppe !== "A" && m.gruppe !== "B").length;
    if (ohneGruppe > 0) {
      hinweise.unshift({
        stufe: "warnung",
        text: `${ohneGruppe} Mannschaft${ohneGruppe === 1 ? " ist" : "en sind"} noch keiner Gruppe zugeordnet (Reiter „Mannschaften“).`,
      });
    }
  }

  // Zustand (erzeugtes Spiel, Verschiebung, Entscheidung) in den frisch berechneten Plan uebernehmen.
  const mitZustand: PlanSpiel[] = basis.spiele.map((s) => ({ ...s, ...(modus.planZustand[s.planId] ?? {}) }));

  // Vorrunde: je Gruppe fertig? Rangfolge und Gleichstaende.
  const vorrundeFertig: Record<string, boolean> = {};
  const rangfolge: Record<string, string[]> = {};
  const gleichstaende: GleichstandAnsicht[] = [];
  const kontextRang: Record<string, string[]> = {};
  const verwendeteRaenge = einstellungen.platzierungsspiele
    ? Infinity
    : vorlage.gruppen === 2
      ? einstellungen.endrundeGroesse / 2
      : einstellungen.endrundeGroesse;

  for (const k of gruppenSchluessel(vorlage)) {
    const gruppe = mannschaftenDerGruppe(mannschaften, vorlage, k);
    const gruppenSpiele = vorrundeSpiele(spiele, gruppe);
    const fertig = gruppenSpiele.length > 0 && gruppenSpiele.every((s) => s.ergebnisAbgeschlossen);
    vorrundeFertig[k] = fertig;
    if (!fertig) continue;
    const r = berechneRangfolge(turnier, gruppe, gruppenSpiele, modus.vorrang?.[k]);
    rangfolge[k] = r.zeilen.map((z) => z.mannschaftId);
    const relevant: Gleichstand[] = r.gleichstaende.filter((g) => g.vonPlatz <= verwendeteRaenge);
    for (const g of relevant) {
      gleichstaende.push({
        gruppe: k,
        vonPlatz: g.vonPlatz,
        bisPlatz: g.bisPlatz,
        mannschaften: g.mannschaftIds.map((id) => ({ id, name: namen.get(id) ?? id })),
      });
    }
    // Ein offener, relevanter Gleichstand haelt die Gruppe zurueck: lieber nichts ableiten als raten.
    if (relevant.length === 0) kontextRang[k] = rangfolge[k];
  }

  // Ergebnisse bereits erzeugter Plan-Spiele (Sieger/Verlierer fuer die naechsten Runden).
  const ergebnisse: AufloesungsKontext["ergebnisse"] = {};
  for (const s of mitZustand) {
    if (!s.spielId) continue;
    const spiel = spiele.find((x) => x._id === s.spielId);
    if (spiel?.ergebnisAbgeschlossen) {
      ergebnisse[s.planId] = siegerVerlierer(spiel.mannschaftAId, spiel.mannschaftBId, spiel.ergebnisA, spiel.ergebnisB, s.entscheidung);
    }
  }
  const ctx: AufloesungsKontext = { rangfolge: kontextRang, ergebnisse };
  const erzeugbar = new Set(erzeugbarePlanSpiele(mitZustand, ctx).map((s) => s.planId));

  // Zeiten: Grundlage ist die Spielzeit, Anfang ist das Ende der Vorrunde (Ende des letzten Vorrundenspiels).
  const dauer = spieldauerMinuten(turnier);
  const vorrundeAlle = spiele.filter((s) => !s.planId);
  const letzteStarts = vorrundeAlle
    .map((s) => s.startzeitVoraussichtlich ?? s.startzeitGeplant)
    .filter((z): z is string => Boolean(z))
    .map((z) => new Date(z).getTime());
  const vorrundeEnde = letzteStarts.length > 0 ? new Date(Math.max(...letzteStarts) + dauer * 60_000) : undefined;
  const mitZeiten = planeZeiten(mitZustand, turnier.felder, vorrundeEnde, dauer);

  const plan: PlanSpielAnsicht[] = mitZeiten.map((s) => {
    const a = loeseQuelleAuf(s.quelleA, ctx);
    const b = loeseQuelleAuf(s.quelleB, ctx);
    const spiel = s.spielId ? spiele.find((x) => x._id === s.spielId) : undefined;
    // Ein bereits erzeugtes Spiel ist massgeblich - seine Mannschaften, Zeit und sein Feld zaehlen.
    const mannschaftAId = spiel?.mannschaftAId ?? a;
    const mannschaftBId = spiel?.mannschaftBId ?? b;
    return {
      ...s,
      feldId: spiel?.feldId ?? s.feldId,
      startzeitGeplant: spiel?.startzeitGeplant ?? s.startzeitGeplant,
      mannschaftAId,
      mannschaftBId,
      textA: mannschaftAId ? (namen.get(mannschaftAId) ?? mannschaftAId) : quelleText(s.quelleA, mitZeiten),
      textB: mannschaftBId ? (namen.get(mannschaftBId) ?? mannschaftBId) : quelleText(s.quelleB, mitZeiten),
      erzeugbar: erzeugbar.has(s.planId),
    };
  });

  return { vorlage, einstellungen, gruppenGroessen: groessen, plan, hinweise, gleichstaende, vorrundeFertig, rangfolge };
}

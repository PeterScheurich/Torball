import type { FastifyBaseLogger } from "fastify";
import type { MannschaftImTurnier, PlanSpielZustand, Spiel, Turnier } from "@torball/shared";
import { findAllBySelector, findById, insertDoc, newId } from "../repository";
import { aendereTurnierAtomar } from "../turnier/aenderung";
import { turnierAusgecheckt, turnierGesperrt } from "../auth/turnierZugriff";
import { baueModusAnsicht, type ModusAnsicht, type PlanSpielAnsicht } from "./modus";

/**
 * Erzeugt die Spiele der Endrunde/Platzierungsspiele, deren Paarungen feststehen. Gemeinsame Grundlage fuer den
 * Knopf ("Spiele erzeugen", `POST .../modus/erzeugen`) und die Automatik (`Einstellungen.endrundeAutomatisch`).
 */

export type Ueberschreibungen = Record<string, { mannschaftAId: string; mannschaftBId: string }>;

export type ErzeugenErgebnis =
  | { art: "erzeugt"; spiele: Spiel[] }
  /** Eine Paarung steht noch nicht fest (nur beim Knopf mit Handwahl moeglich). */
  | { art: "offen"; bezeichnung: string }
  /** Ein anderer Aufruf war schneller und hat (mindestens eines) dieser Spiele schon erzeugt. */
  | { art: "bereits-erzeugt" };

export async function ladeModusAnsicht(turnier: Turnier): Promise<ModusAnsicht | undefined> {
  const [mannschaften, spiele] = await Promise.all([
    findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id }),
    findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id }),
  ]);
  return baueModusAnsicht(turnier, mannschaften, spiele);
}

/**
 * Legt die Spiele zu `ziele` an. `runde` ist die Nummer des Zeit-Slots (Sortierung, Verschieben und Pruefungen
 * rechnen damit) - bei Spielen der Endrunde die fortlaufende Nummer nach der Startzeit, hinter dem letzten
 * Vorrunden-Slot. Spiele mit gleicher Startzeit (zwei Felder) bekommen dieselbe Nummer. Der Name steht in
 * `bezeichnung`.
 *
 * Zuerst wird im Turnier vermerkt, welches Spiel zu welcher Plan-Nummer gehoert (atomar, nur wenn noch keines
 * erzeugt ist), erst danach werden die Spiele geschrieben: Zwei fast gleichzeitige Ergebnisse koennen sonst beide
 * dieselbe Endrunde anlegen, und es blieben doppelte Spiele zurueck.
 */
export async function erzeugePlanSpiele(
  turnier: Turnier,
  ansicht: ModusAnsicht,
  ziele: PlanSpielAnsicht[],
  overrides: Ueberschreibungen = {},
): Promise<ErzeugenErgebnis> {
  const paarung = (p: PlanSpielAnsicht) => {
    const o = overrides[p.planId];
    return { a: o?.mannschaftAId ?? p.mannschaftAId, b: o?.mannschaftBId ?? p.mannschaftBId };
  };
  for (const p of ziele) {
    const { a, b } = paarung(p);
    if (!a || !b) return { art: "offen", bezeichnung: p.bezeichnung };
  }

  const spielIds = new Map(ziele.map((p) => [p.planId, newId("spiel")]));
  let schonErzeugt = false;
  const vermerkt = await aendereTurnierAtomar(turnier._id, (t) => {
    if (!t.modus) return undefined;
    if (ziele.some((p) => t.modus!.planZustand[p.planId]?.spielId)) {
      schonErzeugt = true;
      return undefined;
    }
    const zustand: Record<string, PlanSpielZustand> = { ...t.modus.planZustand };
    for (const p of ziele) zustand[p.planId] = { ...zustand[p.planId], spielId: spielIds.get(p.planId) };
    return { ...t, modus: { ...t.modus, planZustand: zustand } };
  });
  if (schonErzeugt || !vermerkt) return { art: "bereits-erzeugt" };

  try {
    const vorhandene = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
    const letzterVorrundenSlot = Math.max(
      0,
      ...vorhandene.filter((s) => !s.planId).map((s) => Number(s.runde)).filter((n) => Number.isFinite(n)),
    );
    const startzeiten = [...new Set(ansicht.plan.map((p) => p.startzeitGeplant).filter((z): z is string => Boolean(z)))].sort();
    const slotVon = (p: PlanSpielAnsicht) =>
      letzterVorrundenSlot + 1 + (p.startzeitGeplant ? startzeiten.indexOf(p.startzeitGeplant) : ansicht.plan.indexOf(p));

    const neueSpiele: Spiel[] = ziele.map((p) => {
      const { a, b } = paarung(p);
      const id = spielIds.get(p.planId)!;
      return {
        _id: id,
        docType: "spiel",
        spielId: id,
        turnierId: turnier._id,
        runde: String(slotVon(p)),
        bezeichnung: p.bezeichnung,
        planId: p.planId,
        feldId: p.feldId,
        startzeitGeplant: p.startzeitGeplant,
        mannschaftAId: a!,
        mannschaftBId: b!,
        status: "geplant",
        istForfait: false,
        ergebnisAbgeschlossen: false,
      };
    });
    for (const s of neueSpiele) await insertDoc(s);
    return { art: "erzeugt", spiele: neueSpiele };
  } catch (err) {
    // Vermerk zuruecknehmen, sonst zeigte der Plan auf Spiele, die es nicht gibt.
    await aendereTurnierAtomar(turnier._id, (t) => {
      if (!t.modus) return undefined;
      const zustand = { ...t.modus.planZustand };
      for (const p of ziele) {
        if (zustand[p.planId]?.spielId === spielIds.get(p.planId)) zustand[p.planId] = { ...zustand[p.planId], spielId: undefined };
      }
      return { ...t, modus: { ...t.modus, planZustand: zustand } };
    }).catch(() => undefined);
    throw err;
  }
}

/**
 * Automatik: Hat das Turnier `endrundeAutomatisch` gesetzt, werden alle Spiele erzeugt, deren Paarung feststeht.
 * Wird nach jeder Aenderung aufgerufen, die eine Paarung klaeren kann (Ergebnis, Abschluss, Entscheidung bei
 * Unentschieden, Rangentscheidung, Einschalten der Option). Bestenfalls-Aufruf: ein Fehler wird nur protokolliert,
 * er darf das eigentliche Speichern des Ergebnisses nie scheitern lassen. Die Turnierleitung kann jederzeit von Hand
 * eingreifen (Halle/Zeit stehen vorher im Plan, ein erzeugtes Spiel aendert man am Spiel).
 */
export async function pruefeAutomatischeErzeugung(turnierId: string, log?: FastifyBaseLogger): Promise<number> {
  try {
    const turnier = await findById<Turnier>(turnierId, "turnier");
    if (!turnier?.modus?.einstellungen.endrundeAutomatisch) return 0;
    if (turnierGesperrt(turnier) || (await turnierAusgecheckt(turnier._id))) return 0;
    const ansicht = await ladeModusAnsicht(turnier);
    const ziele = ansicht?.plan.filter((p) => p.erzeugbar && !p.spielId) ?? [];
    if (!ansicht || ziele.length === 0) return 0;
    const ergebnis = await erzeugePlanSpiele(turnier, ansicht, ziele);
    return ergebnis.art === "erzeugt" ? ergebnis.spiele.length : 0;
  } catch (err) {
    log?.error({ err, turnierId }, "Automatisches Erzeugen der Endrunde fehlgeschlagen");
    return 0;
  }
}

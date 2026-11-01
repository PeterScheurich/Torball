import type {
  GruppenKennung,
  ModusEinstellungen,
  ModusPlan,
  PlanHinweis,
  PlanPhase,
  PlanQuelle,
  PlanSpiel,
  Spielfeld,
  TurniermodusVorlage,
} from "../types";

/**
 * Turniermodi: eingebaute Vorlagen und die reine Berechnung des Ablaufplans (Auftraggeber-Konzept
 * 31.10.2026, Kanban-Karte "Turniermodi als Vorlagen"). Alles hier ist plattformneutral und ohne
 * Datenbank - Backend UND Frontend rechnen mit denselben Funktionen, die Vorschau und das spaetere
 * Erzeugen der Spiele koennen deshalb nicht auseinanderlaufen.
 *
 * Eine Vorlage legt nur die STRUKTUR fest (Gruppen, erlaubte Endrundengroessen, Voreinstellungen). Die
 * Zahlen stellt die Turnierleitung je Turnier ein; die Paarungen der Endrunde werden aus der Groesse
 * abgeleitet, nicht fest eingetragen. Ein neuer Modus aus bekannten Bausteinen ist damit eine neue
 * Vorlage (Daten) - nur ein ganz neuer Baustein braucht Code.
 */

const ENDRUNDEN_GROESSEN = [0, 2, 4, 6, 8];

/** Mitgelieferte Vorlagen (Stufe 1: ansehen/kopieren; Stufe 2 ergaenzt einen Editor und eigene Vorlagen). */
export const EINGEBAUTE_TURNIERMODI: TurniermodusVorlage[] = [
  {
    id: "jeder-gegen-jeden",
    name: "Jeder gegen Jeden",
    beschreibung: "Alle Mannschaften spielen gegeneinander (einfach oder doppelt). Die Tabelle entscheidet.",
    version: 1,
    eingebaut: true,
    gruppen: 1,
    doppeltWaehlbar: true,
    endrundeGroessen: [0],
    standardEndrunde: 0,
    platz3Standard: false,
    platzierungsspieleStandard: false,
    endrundeTeilnehmerGerade: true,
  },
  {
    id: "jeder-gegen-jeden-endrunde",
    name: "Jeder gegen Jeden mit Endrunde",
    beschreibung:
      "Alle spielen gegeneinander, danach spielen die Besten eine Endrunde (Halbfinale 1.–4. und 2.–3., Finale, optional Spiel um Platz 3 und Platzierungsspiele).",
    version: 1,
    eingebaut: true,
    gruppen: 1,
    doppeltWaehlbar: true,
    endrundeGroessen: ENDRUNDEN_GROESSEN,
    standardEndrunde: 4,
    platz3Standard: true,
    platzierungsspieleStandard: false,
    endrundeTeilnehmerGerade: true,
  },
  {
    id: "gruppen-endrunde",
    name: "Zwei Gruppen mit Endrunde",
    beschreibung:
      "Vorrunde in Gruppe A und B, danach Endrunde über Kreuz (z. B. Halbfinale 1.A–2.B und 1.B–2.A), Finale, Spiel um Platz 3 und Platzierungsspiele (3.A–3.B …).",
    version: 1,
    eingebaut: true,
    gruppen: 2,
    doppeltWaehlbar: true,
    endrundeGroessen: ENDRUNDEN_GROESSEN,
    standardEndrunde: 4,
    platz3Standard: true,
    platzierungsspieleStandard: true,
    endrundeTeilnehmerGerade: true,
  },
  {
    id: "gruppen-kreuzvergleich",
    name: "Zwei Gruppen mit Viertelfinale (Kreuzvergleich)",
    beschreibung:
      "Vorrunde in zwei Gruppen, danach Viertelfinale über Kreuz: 1.A–4.B, 2.A–3.B, 1.B–4.A, 2.B–3.A, dann Halbfinale, Finale und Spiel um Platz 3.",
    version: 1,
    eingebaut: true,
    gruppen: 2,
    doppeltWaehlbar: true,
    endrundeGroessen: ENDRUNDEN_GROESSEN,
    standardEndrunde: 8,
    platz3Standard: true,
    platzierungsspieleStandard: true,
    endrundeTeilnehmerGerade: true,
  },
  {
    id: "gruppen-platzierung",
    name: "Zwei Gruppen, nur Platzierungsspiele",
    beschreibung:
      "Vorrunde in zwei Gruppen; danach spielen gleiche Plätze gegeneinander: 1.A–1.B ums Finale, 2.A–2.B um Platz 3, 3.A–3.B um Platz 5 …",
    version: 1,
    eingebaut: true,
    gruppen: 2,
    doppeltWaehlbar: true,
    endrundeGroessen: [0],
    standardEndrunde: 0,
    platz3Standard: false,
    platzierungsspieleStandard: true,
    endrundeTeilnehmerGerade: true,
  },
];

export function findeEingebautenTurniermodus(id: string): TurniermodusVorlage | undefined {
  return EINGEBAUTE_TURNIERMODI.find((v) => v.id === id);
}

export function standardModusEinstellungen(vorlage: TurniermodusVorlage): ModusEinstellungen {
  return {
    endrundeGroesse: vorlage.standardEndrunde,
    platz3: vorlage.platz3Standard,
    platzierungsspiele: vorlage.platzierungsspieleStandard,
  };
}

/** Prueft Einstellungen gegen die Vorlage. Liefert eine Fehlermeldung (fuer 400) oder `undefined`. */
export function pruefeModusEinstellungen(vorlage: TurniermodusVorlage, e: unknown): string | undefined {
  if (typeof e !== "object" || e === null || Array.isArray(e)) return "Die Modus-Einstellungen müssen ein Objekt sein.";
  const w = e as Record<string, unknown>;
  if (typeof w.endrundeGroesse !== "number" || !Number.isInteger(w.endrundeGroesse)) {
    return "Die Größe der Endrunde muss eine ganze Zahl sein.";
  }
  if (!vorlage.endrundeGroessen.includes(w.endrundeGroesse)) {
    return `Dieser Modus erlaubt als Endrunde nur: ${vorlage.endrundeGroessen.map((g) => (g === 0 ? "keine" : g)).join(", ")}.`;
  }
  // Zwischen- und Endrunden haben immer eine gerade Teilnehmerzahl (Auftraggeber 31.10.2026).
  if (vorlage.endrundeTeilnehmerGerade && w.endrundeGroesse % 2 !== 0) {
    return "Die Endrunde braucht eine gerade Zahl von Mannschaften.";
  }
  if (typeof w.platz3 !== "boolean" || typeof w.platzierungsspiele !== "boolean") {
    return "„Spiel um Platz 3“ und „Platzierungsspiele“ müssen Wahrheitswerte sein.";
  }
  const unbekannt = Object.keys(w).filter((k) => !["endrundeGroesse", "platz3", "platzierungsspiele"].includes(k));
  if (unbekannt.length > 0) return `Unbekannte Einstellung: ${unbekannt.join(", ")}.`;
  return undefined;
}

// ------------------------------------------------------------------------------------------ Plan

const gp = (gruppe: GruppenKennung | undefined, platz: number): PlanQuelle => ({ typ: "gruppenplatz", gruppe, platz });
const sieger = (planId: string): PlanQuelle => ({ typ: "sieger", planId });
const verlierer = (planId: string): PlanQuelle => ({ typ: "verlierer", planId });

type Roh = Omit<PlanSpiel, "schicht">;

function roh(planId: string, phase: PlanPhase, bezeichnung: string, a: PlanQuelle, b: PlanQuelle): Roh {
  return { planId, phase, bezeichnung, quelleA: a, quelleB: b };
}

/** Die K.-o.-Runden der Endrunde fuer `n` Teilnehmer (2, 4, 6, 8) - Paarungsschema siehe Kanban-Karte. */
function koSpiele(n: number, gruppen: 1 | 2, platz3: boolean): Roh[] {
  const s = (platz: number, g: GruppenKennung): PlanQuelle => gp(gruppen === 2 ? g : undefined, platz);
  const spiele: Roh[] = [];
  const vf = (nr: number, a: PlanQuelle, b: PlanQuelle) =>
    spiele.push(roh(`VF${nr}`, "viertelfinale", `Viertelfinale ${nr}`, a, b));
  const hf = (nr: number, a: PlanQuelle, b: PlanQuelle) =>
    spiele.push(roh(`HF${nr}`, "halbfinale", `Halbfinale ${nr}`, a, b));

  if (n === 2) {
    spiele.push(roh("F", "finale", "Finale", s(1, "A"), gruppen === 2 ? s(1, "B") : gp(undefined, 2)));
    return spiele;
  }
  if (n === 4) {
    if (gruppen === 2) {
      hf(1, s(1, "A"), s(2, "B"));
      hf(2, s(1, "B"), s(2, "A"));
    } else {
      hf(1, gp(undefined, 1), gp(undefined, 4));
      hf(2, gp(undefined, 2), gp(undefined, 3));
    }
  } else if (n === 6) {
    if (gruppen === 2) {
      vf(1, s(2, "A"), s(3, "B"));
      vf(2, s(2, "B"), s(3, "A"));
      // Der Gruppensieger nimmt den Platz des fehlenden vierten Teams ein (Auftraggeber 31.10.2026).
      hf(1, s(1, "A"), sieger("VF1"));
      hf(2, s(1, "B"), sieger("VF2"));
    } else {
      vf(1, gp(undefined, 3), gp(undefined, 6));
      vf(2, gp(undefined, 4), gp(undefined, 5));
      hf(1, gp(undefined, 1), sieger("VF2"));
      hf(2, gp(undefined, 2), sieger("VF1"));
    }
  } else if (n === 8) {
    if (gruppen === 2) {
      vf(1, s(1, "A"), s(4, "B"));
      vf(2, s(2, "A"), s(3, "B"));
      vf(3, s(1, "B"), s(4, "A"));
      vf(4, s(2, "B"), s(3, "A"));
    } else {
      vf(1, gp(undefined, 1), gp(undefined, 8));
      vf(2, gp(undefined, 4), gp(undefined, 5));
      vf(3, gp(undefined, 2), gp(undefined, 7));
      vf(4, gp(undefined, 3), gp(undefined, 6));
    }
    // Halbfinale nach dem Viertelfinale folgt der Gruppenlogik (Auftraggeber 31.10.2026, "aktuell so").
    hf(1, sieger("VF1"), sieger("VF2"));
    hf(2, sieger("VF3"), sieger("VF4"));
  }
  spiele.push(roh("F", "finale", "Finale", sieger("HF1"), sieger("HF2")));
  if (platz3) spiele.push(roh("P3", "platz3", "Spiel um Platz 3", verlierer("HF1"), verlierer("HF2")));
  return spiele;
}

/**
 * Berechnet den Ablaufplan der Runden NACH der Vorrunde samt Rueckmeldungen. `gruppenGroessen` hat einen
 * Eintrag je Gruppe (Index 0 = A, 1 = B; bei einer Gruppe nur einen). Die Zeiten setzt `planeZeiten`.
 */
export function baueModusPlan(
  vorlage: TurniermodusVorlage,
  einstellungen: ModusEinstellungen,
  gruppenGroessen: number[],
): ModusPlan {
  const hinweise: PlanHinweis[] = [];
  const n = einstellungen.endrundeGroesse;
  const gruppen = vorlage.gruppen;
  const kennung = (i: number): GruppenKennung => (i === 0 ? "A" : "B");

  // --- Rueckmeldungen zu den Zahlen (nichts davon blockiert - "warnen, nicht entscheiden")
  if (gruppen === 2) {
    for (let i = 0; i < 2; i++) {
      const g = gruppenGroessen[i] ?? 0;
      if (g < 2) {
        hinweise.push({
          stufe: "warnung",
          text: `Gruppe ${kennung(i)} hat ${g === 0 ? "keine" : "nur eine"} Mannschaft – für eine Vorrunde braucht jede Gruppe mindestens zwei.`,
        });
      }
    }
    const a = gruppenGroessen[0] ?? 0;
    const b = gruppenGroessen[1] ?? 0;
    if (a !== b && a >= 2 && b >= 2) {
      hinweise.push({
        stufe: "hinweis",
        text: `Gruppe A hat ${a}, Gruppe B hat ${b} Mannschaften. Das ist erlaubt; die Gruppen haben dann unterschiedlich viele Vorrundenspiele.`,
      });
    }
    const kleinste = Math.min(a, b);
    if (n > 0 && n / 2 > kleinste) {
      hinweise.push({
        stufe: "warnung",
        text: `Die Endrunde mit ${n} Mannschaften braucht aus jeder Gruppe mindestens ${n / 2}; die kleinere Gruppe hat nur ${kleinste}. Die betroffenen Paarungen bleiben offen und müssen von Hand gewählt werden.`,
      });
    }
  } else if (n > (gruppenGroessen[0] ?? 0)) {
    hinweise.push({
      stufe: "warnung",
      text: `Die Endrunde mit ${n} Mannschaften braucht mindestens ${n} Mannschaften in der Vorrunde (vorhanden: ${gruppenGroessen[0] ?? 0}).`,
    });
  }

  const rohSpiele: Roh[] = n >= 2 ? koSpiele(n, gruppen, einstellungen.platz3) : [];
  if (einstellungen.platz3 && n > 0 && n < 4) {
    hinweise.push({ stufe: "hinweis", text: "Ein Spiel um Platz 3 gibt es erst ab einer Endrunde mit Halbfinale (4 Mannschaften)." });
  }

  // --- Platzierungsspiele fuer alle ausserhalb der Endrunde: nur VOLLSTAENDIGE Paare (Auftraggeber 31.10.2026)
  const platzierung: Roh[] = [];
  if (einstellungen.platzierungsspiele) {
    if (gruppen === 2) {
      const a = gruppenGroessen[0] ?? 0;
      const b = gruppenGroessen[1] ?? 0;
      const aufsteiger = n / 2;
      const paare = Math.min(a, b);
      for (let r = aufsteiger + 1; r <= paare; r++) {
        const platz = 2 * (r - 1) + 1;
        platzierung.push(roh(`PL${platz}`, "platzierung", `Spiel um Platz ${platz}`, gp("A", r), gp("B", r)));
      }
      // Der Ueberhang der groesseren Gruppe hat kein Gegenueber: kein Spiel, Einordnung nach der Vorrunde.
      const groessere = a > b ? "A" : "B";
      for (let r = paare + 1; r <= Math.max(a, b); r++) {
        if (r > aufsteiger) {
          const platz = 2 * paare + (r - paare);
          hinweise.push({
            stufe: "hinweis",
            text: `${r}. Gruppe ${groessere} hat in der Platzierungsrunde keinen Gegner und spielt nicht mit; ${r}. Gruppe ${groessere} belegt nach dem Vorrundenergebnis Platz ${platz}.`,
          });
        }
      }
    } else {
      const g = gruppenGroessen[0] ?? 0;
      if (n === 0) {
        hinweise.push({
          stufe: "hinweis",
          text: "Ohne Endrunde gibt es bei einer einzelnen Gruppe keine Platzierungsspiele – die Tabelle entscheidet.",
        });
      } else {
        for (let r = n + 1; r + 1 <= g; r += 2) {
          platzierung.push(
            roh(`PL${r}`, "platzierung", `Spiel um Platz ${r}`, gp(undefined, r), gp(undefined, r + 1)),
          );
        }
        if ((g - n) % 2 === 1) {
          hinweise.push({
            stufe: "hinweis",
            text: `Platz ${g} der Tabelle hat in der Platzierungsrunde keinen Gegner und spielt nicht mit; er belegt nach dem Vorrundenergebnis Platz ${g}.`,
          });
        }
      }
    }
  }

  // Schichten: Abhaengigkeitstiefe (0 = haengt nur von der Vorrunde ab).
  const alle = [...platzierung, ...rohSpiele];
  const schichtVon = new Map<string, number>();
  const tiefe = (s: Roh): number => {
    const bekannt = schichtVon.get(s.planId);
    if (bekannt !== undefined) return bekannt;
    let t = 0;
    for (const q of [s.quelleA, s.quelleB]) {
      if (q.typ !== "gruppenplatz") {
        const quelle = alle.find((x) => x.planId === q.planId);
        if (quelle) t = Math.max(t, tiefe(quelle) + 1);
      }
    }
    schichtVon.set(s.planId, t);
    return t;
  };

  const spiele: PlanSpiel[] = alle.map((s) => ({ ...s, schicht: tiefe(s) }));
  return { spiele: sortiereNachAblauf(spiele), hinweise };
}

const PHASEN_RANG: Record<PlanPhase, number> = {
  platzierung: 0,
  viertelfinale: 1,
  halbfinale: 2,
  platz3: 3,
  finale: 4,
};

/** Reihenfolge im Ablauf: nach Schicht, darin Platzierungsspiele (tiefste Plaetze zuerst), dann K.-o.-Runden, Finale zuletzt. */
function sortiereNachAblauf(spiele: PlanSpiel[]): PlanSpiel[] {
  const platzNummer = (s: PlanSpiel) => (s.phase === "platzierung" ? Number(s.planId.slice(2)) : 0);
  return [...spiele].sort(
    (x, y) =>
      x.schicht - y.schicht ||
      PHASEN_RANG[x.phase] - PHASEN_RANG[y.phase] ||
      platzNummer(y) - platzNummer(x) ||
      x.planId.localeCompare(y.planId),
  );
}

/** "1. Gruppe A", "Sieger Halbfinale 1" ... - die Platzhalter der Vorschau. */
export function quelleText(q: PlanQuelle, plan: PlanSpiel[]): string {
  if (q.typ === "gruppenplatz") return q.gruppe ? `${q.platz}. Gruppe ${q.gruppe}` : `${q.platz}. der Tabelle`;
  const bezeichnung = plan.find((s) => s.planId === q.planId)?.bezeichnung ?? q.planId;
  return `${q.typ === "sieger" ? "Sieger" : "Verlierer"} ${bezeichnung}`;
}

// ---------------------------------------------------------------------------------------- Zeiten

/**
 * Vergibt Startzeit und Feld an jedes Plan-Spiel. Grundlage ist die Spielzeit: `dauerMinuten` je Spiel
 * (Gesamtzeit inkl. Pause), `vorrundeEnde` ist der Zeitpunkt, ab dem die Ergebnisse der Vorrunde feststehen
 * (Ende des letzten Vorrundenspiels). Ein Spiel beginnt fruehestens, wenn (a) die Vorrunde zu Ende ist,
 * soweit es auf Tabellenplaetzen beruht, (b) die Spiele zu Ende sind, von denen es abhaengt, und (c) sein
 * Feld frei ist; dann kommt die von der Turnierleitung eingetragene Verschiebung dazu. Daraus folgt die
 * gewuenschte Wirkung einer Verschiebung: nur das Spiel selbst, davon abhaengige Spiele und spaetere Spiele
 * auf DEMSELBEN Feld ruecken mit - parallele Spiele auf anderen Feldern nicht.
 */
export function planeZeiten(
  plan: PlanSpiel[],
  felder: Spielfeld[],
  vorrundeEnde: Date | undefined,
  dauerMinuten: number,
): PlanSpiel[] {
  if (felder.length === 0 || !vorrundeEnde || Number.isNaN(vorrundeEnde.getTime())) return plan.map((s) => ({ ...s }));
  const dauerMs = dauerMinuten * 60_000;
  const feldFrei = new Map<string, number>(felder.map((f) => [f.feldId, vorrundeEnde.getTime()]));
  const ende = new Map<string, number>();
  const ergebnis: PlanSpiel[] = [];

  for (const spiel of sortiereNachAblauf(plan)) {
    let fruehestens = 0;
    for (const q of [spiel.quelleA, spiel.quelleB]) {
      if (q.typ === "gruppenplatz") fruehestens = Math.max(fruehestens, vorrundeEnde.getTime());
      else fruehestens = Math.max(fruehestens, ende.get(q.planId) ?? 0);
    }
    // Das Feld, auf dem das Spiel am fruehesten beginnen kann (bei Gleichstand das zuerst genannte) - es sei
    // denn, die Turnierleitung hat eine Halle gewaehlt: dann nur diese (spaetere Spiele dort ruecken nach).
    let bestesFeld = felder[0].feldId;
    let besterStart = Infinity;
    const gewaehlt = spiel.feldManuell && felder.some((f) => f.feldId === spiel.feldManuell) ? spiel.feldManuell : undefined;
    for (const f of gewaehlt ? felder.filter((x) => x.feldId === gewaehlt) : felder) {
      const start = Math.max(fruehestens, feldFrei.get(f.feldId) ?? 0);
      if (start < besterStart) {
        besterStart = start;
        bestesFeld = f.feldId;
      }
    }
    const start = besterStart + (spiel.versatzMinuten ?? 0) * 60_000;
    feldFrei.set(bestesFeld, start + dauerMs);
    ende.set(spiel.planId, start + dauerMs);
    ergebnis.push({ ...spiel, feldId: bestesFeld, startzeitGeplant: new Date(start).toISOString() });
  }
  return ergebnis;
}

// ----------------------------------------------------------------------------------- Aufloesung

export interface AufloesungsKontext {
  /** Rangfolge der Mannschafts-IDs je Gruppe ("A"/"B", bei einer Gruppe ""), Index 0 = Platz 1. */
  rangfolge: Record<string, string[]>;
  /** Ergebnis je Plan-Spiel, sobald es feststeht. */
  ergebnisse: Record<string, { sieger: string; verlierer: string } | undefined>;
}

/** Wer steht hinter der Quelle? `undefined`, solange es nicht feststeht (Plan-Spiel noch offen, Gruppe zu klein ...). */
export function loeseQuelleAuf(q: PlanQuelle, ctx: AufloesungsKontext): string | undefined {
  if (q.typ === "gruppenplatz") return ctx.rangfolge[q.gruppe ?? ""]?.[q.platz - 1];
  const e = ctx.ergebnisse[q.planId];
  if (!e) return undefined;
  return q.typ === "sieger" ? e.sieger : e.verlierer;
}

/** Plan-Spiele, die jetzt erzeugt werden koennen: noch nicht erzeugt und beide Quellen sind aufgeloest. */
export function erzeugbarePlanSpiele(plan: PlanSpiel[], ctx: AufloesungsKontext): PlanSpiel[] {
  return plan.filter(
    (s) => !s.spielId && loeseQuelleAuf(s.quelleA, ctx) !== undefined && loeseQuelleAuf(s.quelleB, ctx) !== undefined,
  );
}

/** Ergebnis eines Spiels als Sieger/Verlierer; bei Unentschieden nur mit Entscheidung der Turnierleitung. */
export function siegerVerlierer(
  mannschaftAId: string,
  mannschaftBId: string,
  ergebnisA: number | undefined,
  ergebnisB: number | undefined,
  entscheidung?: string,
): { sieger: string; verlierer: string } | undefined {
  if (ergebnisA == null || ergebnisB == null) return undefined;
  if (ergebnisA > ergebnisB) return { sieger: mannschaftAId, verlierer: mannschaftBId };
  if (ergebnisB > ergebnisA) return { sieger: mannschaftBId, verlierer: mannschaftAId };
  if (entscheidung === mannschaftAId) return { sieger: mannschaftAId, verlierer: mannschaftBId };
  if (entscheidung === mannschaftBId) return { sieger: mannschaftBId, verlierer: mannschaftAId };
  return undefined;
}

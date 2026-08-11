import type { KanbanKarte, KanbanKategorie, KanbanPrioritaet, KanbanSpalte } from "@torball/shared";

export const KANBAN_SPALTEN: KanbanSpalte[] = ["offen", "inArbeit", "testen", "erledigt"];
export const KANBAN_KATEGORIEN: KanbanKategorie[] = ["bug", "feature", "wunsch", "aufgabe", "sonstiges"];
export const KANBAN_PRIORITAETEN: KanbanPrioritaet[] = ["hoch", "mittel", "niedrig"];

/**
 * Validiert und normalisiert eine importierte Karte defensiv (fremde Datei, evtl. aeltere
 * Formatversion). Gibt null zurueck, wenn Pflichtangaben fehlen. Unbekannte Enum-Werte fallen
 * auf sichere Defaults zurueck, statt den ganzen Import zu verwerfen.
 */
export function normalisiereImportKarte(roh: unknown): KanbanKarte | null {
  if (typeof roh !== "object" || roh === null) return null;
  const k = roh as Record<string, unknown>;
  if (typeof k.kanbanId !== "string" || k.kanbanId.length === 0) return null;
  if (typeof k.titel !== "string" || k.titel.length === 0) return null;
  if (typeof k.aktualisiertAm !== "string") return null;

  const spalte = KANBAN_SPALTEN.includes(k.spalte as KanbanSpalte) ? (k.spalte as KanbanSpalte) : "offen";
  const kategorie = KANBAN_KATEGORIEN.includes(k.kategorie as KanbanKategorie)
    ? (k.kategorie as KanbanKategorie)
    : "sonstiges";
  const prioritaet = KANBAN_PRIORITAETEN.includes(k.prioritaet as KanbanPrioritaet)
    ? (k.prioritaet as KanbanPrioritaet)
    : "mittel";

  return {
    _id: k.kanbanId,
    docType: "kanbanKarte",
    kanbanId: k.kanbanId,
    titel: k.titel,
    beschreibung: typeof k.beschreibung === "string" ? k.beschreibung : undefined,
    spalte,
    kategorie,
    prioritaet,
    reihenfolge: typeof k.reihenfolge === "number" ? k.reihenfolge : 0,
    erstelltVon: typeof k.erstelltVon === "string" ? k.erstelltVon : undefined,
    erstelltVonName: typeof k.erstelltVonName === "string" ? k.erstelltVonName : undefined,
    erstelltVonEmail: typeof k.erstelltVonEmail === "string" ? k.erstelltVonEmail : undefined,
    erstelltAm: typeof k.erstelltAm === "string" ? k.erstelltAm : k.aktualisiertAm,
    aktualisiertAm: k.aktualisiertAm,
  };
}

/**
 * Inhaltlicher Vergleich zweier Karten. Bewusst nur die redaktionellen Felder (nicht
 * reihenfolge/Provenienz/_rev): stimmen diese überein, gilt die Karte als unverändert und
 * loest keinen Konflikt aus - insbesondere soll blosses Umsortieren auf einer Instanz nicht
 * als Konflikt erscheinen.
 */
export function inhaltGleich(a: KanbanKarte, b: KanbanKarte): boolean {
  return (
    a.titel === b.titel &&
    (a.beschreibung ?? "") === (b.beschreibung ?? "") &&
    a.spalte === b.spalte &&
    a.kategorie === b.kategorie &&
    a.prioritaet === b.prioritaet
  );
}

/** Eine Karte, die auf beiden Seiten existiert, sich aber inhaltlich unterscheidet. */
export interface KanbanKonflikt {
  kanbanId: string;
  lokal: KanbanKarte;
  eingehend: KanbanKarte;
}

export interface ImportPlan {
  /** Karten, die es lokal noch nicht gibt - werden eingefügt (_id an kanbanId, ohne fremden _rev). */
  neu: KanbanKarte[];
  /** Vorhanden und inhaltlich identisch - nichts zu tun. */
  identisch: number;
  /** Vorhanden, aber abweichend - die Turnierleitung/Admin muss je Karte entscheiden, wer gewinnt. */
  konflikte: KanbanKonflikt[];
  /** Unbrauchbare Einträge (fehlende Pflichtfelder). */
  uebersprungen: number;
}

/**
 * Ermittelt den Import-Plan OHNE etwas zu schreiben. Neu und identisch sind eindeutig; bei
 * Abweichung wird bewusst KEIN automatisches Last-Write-Wins gemacht, sondern ein Konflikt
 * gemeldet, der explizit aufgelöst werden muss (Nutzer-Vorgabe: bei Sync-Problemen fragen,
 * wer gewinnt).
 */
export function planeImport(bestehende: KanbanKarte[], eingehendRoh: unknown[]): ImportPlan {
  const nachId = new Map(bestehende.map((k) => [k.kanbanId, k]));
  const plan: ImportPlan = { neu: [], identisch: 0, konflikte: [], uebersprungen: 0 };

  for (const roh of eingehendRoh) {
    const karte = normalisiereImportKarte(roh);
    if (!karte) {
      plan.uebersprungen++;
      continue;
    }
    const lokal = nachId.get(karte.kanbanId);
    if (!lokal) {
      plan.neu.push({ ...karte, _id: karte.kanbanId, _rev: undefined });
    } else if (inhaltGleich(lokal, karte)) {
      plan.identisch++;
    } else {
      plan.konflikte.push({ kanbanId: karte.kanbanId, lokal, eingehend: karte });
    }
  }

  return plan;
}

export type KonfliktWahl = "lokal" | "eingehend";

export interface KonfliktAufloesung {
  /** Karten, die wegen Wahl "eingehend" überschrieben werden (mit lokalem _id/_rev). */
  upserts: KanbanKarte[];
  /** Konflikte, bei denen "lokal" gewinnt - nichts zu tun. */
  lokalBehalten: number;
  /** Konflikte ohne getroffene Wahl - werden übersprungen, nicht angewendet. */
  offen: number;
}

/**
 * Wendet die pro Konflikt getroffene Entscheidung an. "eingehend" überschreibt die lokale
 * Karte (behält aber deren _id/_rev, sonst 409); "lokal" oder keine Wahl lässt sie unberührt.
 */
export function loeseKonflikte(
  konflikte: KanbanKonflikt[],
  wahlen: Record<string, KonfliktWahl>,
): KonfliktAufloesung {
  const ergebnis: KonfliktAufloesung = { upserts: [], lokalBehalten: 0, offen: 0 };
  for (const k of konflikte) {
    const wahl = wahlen[k.kanbanId];
    if (wahl === "eingehend") {
      ergebnis.upserts.push({ ...k.eingehend, _id: k.lokal._id, _rev: k.lokal._rev });
    } else if (wahl === "lokal") {
      ergebnis.lokalBehalten++;
    } else {
      ergebnis.offen++;
    }
  }
  return ergebnis;
}

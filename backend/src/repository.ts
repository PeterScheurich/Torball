import { randomUUID } from "node:crypto";
import type { MangoSelector } from "nano";
import type { TorballDokument } from "@torball/shared";
import { db } from "./db";

// Generische CRUD-Helfer ueber der einen CouchDB-Datenbank. Alle Routen nutzen diese statt
// direkt db.find(...) aufzurufen - v.a. wegen der bookmark-Paginierung (siehe unten), die
// CouchDBs stilles 25-Treffer-Limit umgeht.

/** CouchDB-Dokument-ID im Format "<docType>:<uuid>", dient zugleich als fachliche ID. */
export function newId(docType: TorballDokument["docType"]): string {
  return `${docType}:${randomUUID()}`;
}

/** CouchDBs Mango-_find liefert ohne explizites limit nur die ersten 25 Treffer. */
const SEITENGROESSE = 200;

/**
 * Blaettert per bookmark durch ALLE Treffer, statt sich auf CouchDBs Default-Limit
 * von 25 zu verlassen (das hat bereits einmal dazu gefuehrt, dass beim Neu-Erzeugen
 * eines Spielplans nur ein Teil der alten Spiele geloescht wurde und sich mit den
 * neuen mischte). Terminiert erst bei einer leeren Seite, nicht nur bei "weniger als
 * Limit" - das ist laut CouchDB-Doku der einzig verlaessliche Endekennung.
 */
async function findeAlleSeiten<T extends TorballDokument>(selector: MangoSelector): Promise<T[]> {
  const ergebnisse: T[] = [];
  let bookmark: string | undefined;

  for (;;) {
    const antwort = await db.find({ selector, limit: SEITENGROESSE, bookmark });
    ergebnisse.push(...(antwort.docs as unknown as T[]));
    if (antwort.docs.length === 0) break;
    bookmark = antwort.bookmark;
  }

  return ergebnisse;
}

/** Alle Dokumente eines docType (vollstaendig paginiert). */
export async function findAllByType<T extends TorballDokument>(docType: T["docType"]): Promise<T[]> {
  return findeAlleSeiten<T>({ docType });
}

/** Alle Dokumente zu einem beliebigen Mango-Selector (vollstaendig paginiert). */
export async function findAllBySelector<T extends TorballDokument>(
  selector: MangoSelector,
): Promise<T[]> {
  return findeAlleSeiten<T>(selector);
}

/** Einzelnes Dokument per ID; null (statt Fehler), wenn es nicht existiert. */
export async function findById<T extends TorballDokument>(id: string): Promise<T | null> {
  try {
    const doc = await db.get(id);
    return doc as unknown as T;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Legt ein Dokument an oder aktualisiert es (CouchDB-Upsert) und gibt es mit neuer _rev zurueck. */
export async function insertDoc<T extends TorballDokument>(doc: T): Promise<T> {
  const response = await db.insert(doc);
  return { ...doc, _rev: response.rev };
}

/** Loescht ein Dokument (die aktuelle _rev ist fuer CouchDB Pflicht). */
export async function deleteDoc(id: string, rev: string): Promise<void> {
  await db.destroy(id, rev);
}

/** Erkennt einen CouchDB-404 (Dokument nicht vorhanden) an der statusCode-Eigenschaft. */
function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { statusCode?: number }).statusCode === 404;
}

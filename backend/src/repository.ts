import { randomUUID } from "node:crypto";
import type { MangoSelector } from "nano";
import type { TorballDokument } from "@torball/shared";
import { db } from "./db";

/** CouchDB-Dokument-ID im Format "<docType>:<uuid>", dient zugleich als fachliche ID. */
export function newId(docType: TorballDokument["docType"]): string {
  return `${docType}:${randomUUID()}`;
}

export async function findAllByType<T extends TorballDokument>(docType: T["docType"]): Promise<T[]> {
  const result = await db.find({ selector: { docType } });
  return result.docs as unknown as T[];
}

export async function findAllBySelector<T extends TorballDokument>(
  selector: MangoSelector,
): Promise<T[]> {
  const result = await db.find({ selector });
  return result.docs as unknown as T[];
}

export async function findById<T extends TorballDokument>(id: string): Promise<T | null> {
  try {
    const doc = await db.get(id);
    return doc as unknown as T;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function insertDoc<T extends TorballDokument>(doc: T): Promise<T> {
  const response = await db.insert(doc);
  return { ...doc, _rev: response.rev };
}

export async function deleteDoc(id: string, rev: string): Promise<void> {
  await db.destroy(id, rev);
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { statusCode?: number }).statusCode === 404;
}

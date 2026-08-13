import type { LokaleSyncKonfiguration } from "@torball/shared";
import { findById } from "./repository";

/** Singleton-Dokument (Vorbild `systemeinstellungen.ts`) - existiert nur, wenn diese Installation
 *  tatsaechlich mit einem Zentralen-Plattform-Server gekoppelt wurde. */
export const LOKALE_SYNC_KONFIGURATION_ID = "lokaleSyncKonfiguration:global";

export async function aktuelleLokaleSyncKonfiguration(): Promise<LokaleSyncKonfiguration | null> {
  return findById<LokaleSyncKonfiguration>(LOKALE_SYNC_KONFIGURATION_ID);
}

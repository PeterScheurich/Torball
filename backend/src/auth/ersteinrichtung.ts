import type { Benutzer } from "@torball/shared";
import { insertDoc } from "../repository";

/**
 * Feste ID des allerersten Administrator-Kontos. Die Ersteinrichtung prueft "gibt es schon einen
 * Benutzer?" und legt danach an - zwischen beiden Schritten liegt ein Zeitfenster, in dem zwei
 * gleichzeitige Anfragen beide "noch keiner" sahen und zwei Admins entstanden. CouchDB lehnt das
 * Anlegen eines Dokuments mit bereits vergebener ID (ohne Revision) atomar mit 409 ab; mit einer
 * festen ID gewinnt deshalb genau EINE Anfrage, ohne dass dafuer ein eigenes Sperr-Dokument noetig waere.
 */
export const ERSTES_KONTO_ID = "benutzer:ersteinrichtung";

/** Legt das erste Konto an. Liefert `undefined`, wenn es das erste Konto schon gibt (Konflikt). */
export async function legeErstesKontoAn(benutzer: Benutzer): Promise<Benutzer | undefined> {
  try {
    return await insertDoc<Benutzer>({ ...benutzer, _id: ERSTES_KONTO_ID, benutzerId: ERSTES_KONTO_ID });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) return undefined;
    throw err;
  }
}

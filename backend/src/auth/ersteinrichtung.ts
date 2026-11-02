import type { Benutzer } from "@torball/shared";
import { insertDoc } from "../repository";
import { hashePasswort } from "./passwort";

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

export interface ErsterAdminEingabe {
  name: string;
  vorname?: string;
  email: string;
  passwort: string;
}

/**
 * Baut und speichert das erste Admin-Konto - gemeinsamer Weg fuer die Ersteinrichtung im Browser
 * (`POST /auth/bootstrap-admin`) und fuer den Konsolenbefehl `erstes-konto:anlegen`, den die Installer
 * aufrufen. Prueft NICHT, ob es schon Konten gibt und ob das Passwort die Regeln erfuellt - das tun die
 * Aufrufer vorher (die feste ID faengt den Rest atomar ab). `undefined` = es gibt das erste Konto schon.
 */
export async function legeErstenAdminAn(eingabe: ErsterAdminEingabe): Promise<Benutzer | undefined> {
  const benutzer: Benutzer = {
    _id: ERSTES_KONTO_ID,
    docType: "benutzer",
    benutzerId: ERSTES_KONTO_ID,
    email: eingabe.email.trim().toLowerCase(),
    passwortHash: await hashePasswort(eingabe.passwort),
    name: eingabe.name,
    vorname: eingabe.vorname?.trim() || undefined,
    globaleRolle: "admin",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  };
  return legeErstesKontoAn(benutzer);
}

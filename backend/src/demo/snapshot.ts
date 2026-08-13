import Nano from "nano";
import type { TorballDokument } from "@torball/shared";
import { db } from "../db";
import { pruefeDemoErlaubt } from "./schutz";

/**
 * "Goldener" Datenbestand fuer die Demo-Instanz auf CouchDB-Ebene: eine zweite Datenbank
 * "<COUCHDB_DB>_golden" haelt den gewuenschten Ausgangszustand (angelegt/gefuellt einmalig ueber
 * `demo:beispieldaten` + `demo:snapshot:erstellen`, siehe deploy/demo-snapshot-einrichten.sh).
 * `demo:snapshot:wiederherstellen` gleicht die LIVE-Datenbank an diesen Stand an (taeglich per
 * systemd-Timer) - kein App-seitiges Loeschen/Neuaufbauen, sondern ein reiner Datenabgleich
 * zwischen zwei CouchDB-Datenbanken. Design-Dokumente (Mango-Indizes) bleiben in beiden
 * Datenbanken unangetastet, nur "echte" Inhalte werden abgeglichen.
 */

/**
 * docTypes, die NIE vom Snapshot/Restore angefasst werden - weder in die "_golden"-Datenbank
 * uebernommen noch beim Wiederherstellen ueberschrieben/geloescht. Das sind Instanz-Einstellungen,
 * kein "Turnier-Inhalt", der taeglich zurueckgesetzt werden soll. `benutzer` ist bewusst NICHT
 * hier drin - siehe istGeschuetzt() unten: nur Admin-Konten sind geschuetzt, alle anderen Konten
 * (das per demo:beispieldaten angelegte "Demo-Datenpflege"-Konto, jedes selbst-registrierte
 * Tester-Konto) werden taeglich mitzurueckgesetzt (Nutzer-Vorgabe: verhindert, dass sich liegen
 * gebliebene Spam-/Scam-Accounts aus einer offenen Selbstregistrierung dauerhaft ansammeln - ohne
 * eigens vorbereitete/veroeffentlichte Demo-Logins bleibt so kein Anreiz, den Login-Bereich fuer
 * Missbrauch zu nutzen). Bewusst eine AUSSCHLUSS-Liste (nicht Einschluss-Liste): ein kuenftig neuer
 * Inhalts-docType (z. B. fuer das noch nicht gebaute digitale Live-Protokoll) landet automatisch im
 * Reset, ohne diese Liste pflegen zu muessen - nur echte Instanz-Einstellungen muessen hier bewusst
 * ergaenzt werden.
 */
const NIE_ZURUECKSETZEN = new Set<TorballDokument["docType"]>([
  "session",
  "systemeinstellungen",
  "systemkonfiguration",
  "kanbanKarte",
  // Mail-Postfach (dev-only, siehe CLAUDE.md): Einstellungen sind laut eigenem Typ-Kommentar
  // "Singleton-Dokument ... analog Systemeinstellungen" - gehoerten also von Anfang an in
  // dieselbe Kategorie wie systemeinstellungen/systemkonfiguration oben, wurden bei der
  // Einfuehrung aber hier vergessen (beim Systemtest 2026-08-14 aufgefallen). Nachrichten/
  // Berichte sind ebenfalls Instanz-Zustand (ein einziges geteiltes Feedback-Postfach), kein
  // turnierbezogener Inhalt.
  "mailPostfachEinstellungen",
  "mailNachricht",
  "mailBericht",
  // Turnier-Sync: dauerhafte Kopplung einer lokalen Installation an diese Instanz - Instanz-,
  // nicht Turnier-Zustand; ein naechtlicher Reset wuerde eine gekoppelte Installation sonst
  // stillschweigend entkoppeln.
  "verbundeneInstanz",
]);

/** Ob ein Dokument vom Snapshot/Restore-Abgleich ausgenommen bleibt: Design-Dokumente, die
 *  Instanz-Einstellungs-docTypes aus NIE_ZURUECKSETZEN, und - als einzige Ausnahme innerhalb von
 *  "benutzer" - Konten mit globaleRolle "admin" (Nutzer-Vorgabe: NUR der Admin-Account soll jeden
 *  Reset ueberleben, jedes andere Konto gilt als normaler, taeglich zuruecksetzbarer Inhalt). */
function istGeschuetzt(doc: TorballDokument): boolean {
  if (doc._id.startsWith("_design/")) return true;
  if (NIE_ZURUECKSETZEN.has(doc.docType)) return true;
  if (doc.docType === "benutzer" && doc.globaleRolle === "admin") return true;
  return false;
}

function goldenDb(): Nano.DocumentScope<TorballDokument> {
  const { COUCHDB_URL, COUCHDB_DB, COUCHDB_USER, COUCHDB_PASSWORD } = process.env;
  const url = new URL(COUCHDB_URL!);
  url.username = encodeURIComponent(COUCHDB_USER!);
  url.password = encodeURIComponent(COUCHDB_PASSWORD!);
  const nano = Nano(url.toString());
  return nano.db.use<TorballDokument>(`${COUCHDB_DB}_golden`);
}

/** Alle "echten" Dokumente einer Datenbank, die vom Reset betroffen sein duerfen (siehe
 *  istGeschuetzt). Komplett paginiert ueber CouchDBs _all_docs (nicht ueber findAllBySelector -
 *  das laeuft nur gegen die eine, in db.ts fest verdrahtete Live-Datenbank, hier brauchen wir aber
 *  auch die "_golden"-Datenbank). */
async function alleDokumente(handle: Nano.DocumentScope<TorballDokument>): Promise<TorballDokument[]> {
  const antwort = await handle.list({ include_docs: true });
  return antwort.rows.map((row) => row.doc!).filter((doc) => !istGeschuetzt(doc));
}

/**
 * Gleicht den Inhalt von `ziel` an `quelle` an: jedes Quell-Dokument wird geschrieben (als Update
 * mit der aktuellen Ziel-_rev, falls die _id im Ziel schon existiert, sonst als Neuanlage), jedes
 * Ziel-Dokument ohne Entsprechung in der Quelle wird geloescht. Bewusst EIN einziger _bulk_docs-
 * Aufruf mit den jeweils korrekten _revs statt "erst alles loeschen, dann alles neu anlegen" - ein
 * zweiter Schreibvorgang auf dieselbe _id direkt nach einer Loeschung braucht sonst zwingend die
 * (dann muehsam einzusammelnde) Tombstone-_rev, sonst lehnt CouchDB die Neuanlage mit einem
 * Konflikt ab. */
async function ersetzeInhalt(ziel: Nano.DocumentScope<TorballDokument>, quelle: TorballDokument[]): Promise<void> {
  const bestehende = await alleDokumente(ziel);
  const bestehendeRevById = new Map(bestehende.map((doc) => [doc._id, doc._rev]));
  const quellIds = new Set(quelle.map((doc) => doc._id));

  const schreibvorgaenge: (TorballDokument | { _id: string; _rev: string; _deleted: true })[] = [];

  for (const doc of quelle) {
    const bestehendeRev = bestehendeRevById.get(doc._id);
    // _rev explizit auf undefined setzen, wenn es im Ziel noch nicht existiert - JSON.stringify
    // laesst den Schluessel dann komplett verschwinden (siehe CLAUDE.md, "JSON.stringify entfernt
    // Felder mit Wert undefined"), CouchDB legt das Dokument dadurch frisch an.
    schreibvorgaenge.push({ ...doc, _rev: bestehendeRev });
  }
  for (const [id, rev] of bestehendeRevById) {
    if (!quellIds.has(id)) schreibvorgaenge.push({ _id: id, _rev: rev!, _deleted: true });
  }

  if (schreibvorgaenge.length > 0) {
    await ziel.bulk({ docs: schreibvorgaenge });
  }
}

/** Uebernimmt den aktuellen Live-Datenbestand 1:1 in die "_golden"-Datenbank. Voraussetzung: die
 *  "_golden"-Datenbank existiert bereits mit passender _security (siehe
 *  deploy/demo-snapshot-einrichten.sh - CouchDB-Datenbanken lassen sich nicht mit den
 *  eingeschraenkten App-DB-Zugangsdaten neu anlegen, das braucht Server-Admin-Rechte). */
export async function erstelleSnapshot(): Promise<{ anzahlDokumente: number }> {
  pruefeDemoErlaubt();
  const golden = goldenDb();
  const aktuelle = await alleDokumente(db);
  await ersetzeInhalt(golden, aktuelle);
  return { anzahlDokumente: aktuelle.length };
}

/** Gleicht die Live-Datenbank an die "_golden"-Datenbank an (verwirft alle Aenderungen seit dem
 *  letzten Snapshot). Fuer den taeglichen Reset gedacht (systemd-Timer, siehe
 *  deploy/demo-snapshot-einrichten.sh). */
export async function stelleSnapshotWiederher(): Promise<{ anzahlDokumente: number }> {
  pruefeDemoErlaubt();
  const golden = goldenDb();
  const snapshot = await alleDokumente(golden);
  await ersetzeInhalt(db, snapshot);
  return { anzahlDokumente: snapshot.length };
}

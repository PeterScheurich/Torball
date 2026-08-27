import fs from "node:fs";
import path from "node:path";
import type { TorballDokument } from "@torball/shared";
import { db } from "../db";

/**
 * Sicherung und Wiederherstellung des GESAMTEN Datenbestands als eine einzelne Datei.
 *
 * Warum es das braucht (Nutzer-Vorgabe 26.08.2026): Am Turniertag liegen alle Daten in einer
 * CouchDB auf genau einem Rechner. Fiel der aus, war das laufende Turnier weg - es gab keinen
 * unterstuetzten Weg, eine Kopie zu ziehen. `demo:snapshot:*` ist ausdruecklich NICHT dafuer
 * gedacht (hinter DEMO_SNAPSHOT_ERLAUBT gesperrt, gleicht zwei Datenbanken ab statt eine Datei
 * zu erzeugen), und der Sync-Export deckt nur EIN Turnier im Rahmen der Instanz-Kopplung ab.
 *
 * Bewusst eine schlichte JSON-Datei statt eines Bandformats: sie laesst sich auf einen
 * USB-Stick kopieren, per Mail verschicken und notfalls von Hand ansehen.
 *
 * ACHTUNG - die Datei enthaelt ALLES, auch Passwort-Hashes, 2FA-Geheimnisse, SMTP-Zugangsdaten
 * und Instanz-Tokens. Sie gehoert an einen sicheren Ort, nicht in eine Cloud-Freigabe.
 */

/** Format-Version der Sicherungsdatei. Erhoehen, sobald sich der Aufbau aendert - beim
 *  Einspielen wird sie geprueft, damit eine kuenftige Datei nicht stillschweigend
 *  halb eingelesen wird. */
export const SICHERUNG_FORMAT_VERSION = 1;

export interface SicherungsPaket {
  formatVersion: number;
  /** Zeitpunkt der Erstellung (ISO), auch fuer den Dateinamen genutzt. */
  erstelltAm: string;
  /** Version der Anwendung, die die Sicherung geschrieben hat - hilft bei der Einordnung. */
  appVersion: string;
  /** Name der Quell-Datenbank, rein informativ. */
  datenbank: string;
  anzahlDokumente: number;
  dokumente: TorballDokument[];
}

/**
 * Dokumenttypen, die NICHT mitgesichert werden.
 *
 * `session` ist bewusst ausgenommen: Sitzungen sind fluechtig und enthalten die Pruefsummen der
 * Anmelde-Tokens. Nach einer Wiederherstellung sollen alle sich neu anmelden, statt dass alte
 * Sitzungen wieder aufleben.
 */
const NICHT_SICHERN = new Set<TorballDokument["docType"]>(["session"]);

/** Liest die Version aus backend/package.json - nur fuer die Einordnung der Datei, ein
 *  Fehlschlag darf die Sicherung nicht verhindern. */
function appVersion(): string {
  try {
    const roh = fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8");
    return (JSON.parse(roh) as { version?: string }).version ?? "unbekannt";
  } catch {
    return "unbekannt";
  }
}

/**
 * Liest alle Dokumente der Datenbank.
 *
 * `_design`-Dokumente (die Mango-Indizes) bleiben aussen vor: die legt `ensureIndexes()` beim
 * naechsten Start ohnehin neu an, und ihre Revisionen wuerden beim Einspielen nur Konflikte
 * erzeugen.
 */
async function alleDokumente(): Promise<TorballDokument[]> {
  const antwort = await db.list({ include_docs: true });
  const dokumente: TorballDokument[] = [];
  for (const row of antwort.rows) {
    if (row.id.startsWith("_design/")) continue;
    const doc = row.doc;
    if (!doc || NICHT_SICHERN.has(doc.docType)) continue;
    dokumente.push(doc);
  }
  return dokumente;
}

/** Erzeugt das Sicherungspaket. Die `_rev` wird bewusst entfernt: Beim Einspielen entscheidet
 *  der Zielbestand, ob ein Dokument neu angelegt oder ersetzt wird (siehe unten) - eine
 *  mitgeschleppte Revision aus der Quelle wuerde dort nur zu Konflikten fuehren. */
export async function erstelleSicherung(): Promise<SicherungsPaket> {
  const dokumente = (await alleDokumente()).map((doc) => {
    const { _rev: _weg, ...ohneRevision } = doc as TorballDokument & { _rev?: string };
    return ohneRevision as TorballDokument;
  });

  return {
    formatVersion: SICHERUNG_FORMAT_VERSION,
    erstelltAm: new Date().toISOString(),
    appVersion: appVersion(),
    datenbank: process.env.COUCHDB_DB ?? "unbekannt",
    anzahlDokumente: dokumente.length,
    dokumente,
  };
}

/** Dateiname mit Zeitstempel, sortierbar: torball-sicherung-2026-08-26_1435.json */
export function vorgeschlagenerDateiname(zeitpunkt = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  const d = zeitpunkt;
  return `torball-sicherung-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.json`;
}

export interface EinspielErgebnis {
  geschrieben: number;
  /** Bereits vorhandene Dokumente, die ohne `ueberschreiben` unangetastet blieben. */
  uebersprungen: number;
}

/**
 * Spielt ein Sicherungspaket ein.
 *
 * Standardverhalten ist bewusst vorsichtig: Vorhandene Dokumente bleiben unangetastet und
 * werden nur gezaehlt. Erst `ueberschreiben: true` ersetzt sie - der Hauptfall (frische
 * Installation nach einem Rechnerausfall) braucht das gar nicht, und ein versehentliches
 * Einspielen ueber einen laufenden Turnierbestand waere sonst nicht rueckgaengig zu machen.
 *
 * Geschrieben wird in Bloecken ueber `_bulk_docs`; vorhandene Dokumente bekommen ihre aktuelle
 * `_rev` mit, sonst lehnt CouchDB die Aenderung als Konflikt ab (gleiches Vorgehen wie in
 * demo/snapshot.ts und sync/import.ts).
 */
export async function spieleSicherungEin(
  paket: SicherungsPaket,
  optionen: { ueberschreiben?: boolean } = {},
): Promise<EinspielErgebnis> {
  if (paket.formatVersion !== SICHERUNG_FORMAT_VERSION) {
    throw new Error(
      `Diese Datei hat das Sicherungsformat ${paket.formatVersion}, diese Version erwartet ${SICHERUNG_FORMAT_VERSION}.`,
    );
  }
  if (!Array.isArray(paket.dokumente)) {
    throw new Error("Die Datei enthaelt keine Dokumentliste - vermutlich keine Sicherungsdatei.");
  }

  const bestehende = await db.list({ include_docs: false });
  const revById = new Map(bestehende.rows.filter((r) => !r.id.startsWith("_design/")).map((r) => [r.id, r.value.rev]));

  const zuSchreiben: TorballDokument[] = [];
  let uebersprungen = 0;

  for (const doc of paket.dokumente) {
    const vorhandeneRev = revById.get(doc._id);
    if (vorhandeneRev && !optionen.ueberschreiben) {
      uebersprungen += 1;
      continue;
    }
    // _rev nur setzen, wenn das Dokument im Ziel existiert - sonst faellt der Schluessel beim
    // Serialisieren weg und CouchDB legt es frisch an (siehe CLAUDE.md zu JSON.stringify).
    zuSchreiben.push({ ...doc, _rev: vorhandeneRev } as TorballDokument);
  }

  const BLOCK = 200;
  for (let i = 0; i < zuSchreiben.length; i += BLOCK) {
    await db.bulk({ docs: zuSchreiben.slice(i, i + BLOCK) });
  }

  return { geschrieben: zuSchreiben.length, uebersprungen };
}

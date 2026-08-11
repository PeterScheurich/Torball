import Nano from "nano";
import type { TorballDokument } from "@torball/shared";

// Zentrale CouchDB-Verbindung. Alle Entitaeten liegen in EINER Datenbank und werden ueber das
// docType-Feld unterschieden (siehe CLAUDE.md, Architektur). Die Zugangsdaten kommen aus der
// Umgebung (backend/.env); fehlen sie, faellt der Prozess beim Start bewusst hart aus.
const { COUCHDB_URL, COUCHDB_DB, COUCHDB_USER, COUCHDB_PASSWORD } = process.env;

if (!COUCHDB_URL || !COUCHDB_DB || !COUCHDB_USER || !COUCHDB_PASSWORD) {
  throw new Error(
    "CouchDB-Konfiguration fehlt. COUCHDB_URL, COUCHDB_DB, COUCHDB_USER und COUCHDB_PASSWORD " +
      "muessen gesetzt sein (siehe backend/.env.example).",
  );
}

const connectionUrl = new URL(COUCHDB_URL);
connectionUrl.username = encodeURIComponent(COUCHDB_USER);
connectionUrl.password = encodeURIComponent(COUCHDB_PASSWORD);

const nano = Nano(connectionUrl.toString());

/** Handle auf die genutzte CouchDB-Datenbank; Basis fuer alle Repository-Helfer. */
export const db = nano.db.use<TorballDokument>(COUCHDB_DB);

/** Mango-Index auf docType, damit findAllByType nicht auf einen Full-Scan zurueckfaellt. */
export async function ensureIndexes(): Promise<void> {
  await db.createIndex({
    index: { fields: ["docType"] },
    name: "docType-index",
  });
}

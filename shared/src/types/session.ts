import { BenutzerId, CouchMeta, SessionId, Zeitstempel } from "./common";

/**
 * Server-seitige Login-Session (Abschnitt 25.1: "Session-Management mit
 * sicheren Tokens"). `_id` ist bewusst der Hash des Tokens (nicht eine
 * zufaellige UUID) - das erlaubt einen direkten `findById`-Lookup beim
 * Request statt einer Selector-Abfrage ueber alle Sessions. Der Klartext-
 * Token selbst wird nie persistiert, nur sein Hash.
 */
export interface Session extends CouchMeta {
  docType: "session";
  sessionId: SessionId;
  benutzerId: BenutzerId;
  erstelltAm: Zeitstempel;
  laeuftAbAm: Zeitstempel;
  letzteAktivitaetAm: Zeitstempel;
}

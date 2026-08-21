import { BenutzerId, CouchMeta, SessionId, TurnierId, Zeitstempel } from "./common";

interface SessionBasis extends CouchMeta {
  docType: "session";
  sessionId: SessionId;
  erstelltAm: Zeitstempel;
  laeuftAbAm: Zeitstempel;
  letzteAktivitaetAm: Zeitstempel;
}

/**
 * Server-seitige Login-Session (Abschnitt 25.1: "Session-Management mit
 * sicheren Tokens"). `_id` ist bewusst der Hash des Tokens (nicht eine
 * zufaellige UUID) - das erlaubt einen direkten `findById`-Lookup beim
 * Request statt einer Selector-Abfrage ueber alle Sessions. Der Klartext-
 * Token selbst wird nie persistiert, nur sein Hash.
 */
export interface BenutzerSession extends SessionBasis {
  sessionArt: "benutzer";
  benutzerId: BenutzerId;
}

/**
 * Rollen, die ein Turnier-Code vergeben kann. Bewusst ein EIGENER Typ statt TurnierRolle
 * (berechtigung.ts): "protokollant" (digitale Protokollierung, Abschnitt 22) existiert nur als
 * Code-Rolle, nicht als per TurnierBerechtigung vergebbare Benutzer-Berechtigung - und "lesen"
 * kommt hier umgekehrt bewusst nicht vor (dafuer gibt es keinen eigenen Code).
 */
export type TurnierCodeRolle = "turnierleitung" | "spielleitung" | "protokollant";

/**
 * Turnier-Codes (Abschnitt 21.3, "Lokales Netzwerk"): eine Session ohne Benutzerkonto, gebunden an
 * genau ein Turnier + eine Code-Rolle. Nutzt dieselbe
 * Cookie-/Token-Infrastruktur wie BenutzerSession (ein Geraet ist entweder als Benutzer oder per
 * Code angemeldet, nie beides gleichzeitig - ein zweites Cookie waere unnoetige Komplexitaet).
 */
export interface TurnierCodeSession extends SessionBasis {
  sessionArt: "code";
  turnierId: TurnierId;
  rolle: TurnierCodeRolle;
}

export type Session = BenutzerSession | TurnierCodeSession;

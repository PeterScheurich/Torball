import { BenutzerId, CouchMeta, Zeitstempel } from "./common";

/** Siehe Gesamtspezifikation Abschnitt 21.1. */
export type GlobaleRolle = "admin" | "manager" | "benutzer";

export type Sprache = "de" | "en" | "fr" | "it";

/** Siehe Gesamtspezifikation Abschnitt 20.15. */
export interface Benutzer extends CouchMeta {
  docType: "benutzer";
  benutzerId: BenutzerId;
  /** Entspricht dem Benutzernamen. */
  email: string;
  passwortHash?: string;
  name: string;
  telefon?: string;
  globaleRolle: GlobaleRolle;
  sprache: Sprache;
  zweiFaAktiv: boolean;
  zweiFaSecret?: string;
  gesperrt: boolean;
  letzteAnmeldung?: Zeitstempel;
  erstelltVon?: BenutzerId;
  erstelltAm: Zeitstempel;
}

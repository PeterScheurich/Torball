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

  /**
   * Einladungs-Flow (Abschnitt 25.2): Admin/Manager legt Benutzer ohne
   * Passwort an, hier steht stattdessen der Hash eines Einmal-Tokens. Wird
   * beim Setzen des ersten Passworts geloescht. Solange kein E-Mail-Versand
   * angebunden ist, wird der Klartext-Link direkt in der API-Antwort an
   * die einladende Person zurueckgegeben (siehe Protokoll).
   */
  einladungTokenHash?: string;
  einladungAblauf?: Zeitstempel;

  /** Passwort-Reset (Abschnitt 21.4), gleiches Prinzip wie die Einladung. */
  resetTokenHash?: string;
  resetAblauf?: Zeitstempel;
}

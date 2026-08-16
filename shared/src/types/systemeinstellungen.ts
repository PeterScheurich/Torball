import { BenutzerId, CouchMeta, Zeitstempel } from "./common";
import type { GlobaleRolle } from "./benutzer";

/** Rollen, die eine Selbstregistrierung automatisch vergeben darf - bewusst ohne "admin": eine
 *  offene Selbstregistrierung darf nie automatisch Admin-Rechte verteilen. */
export type SelbstregistrierungsRolle = Exclude<GlobaleRolle, "admin">;

/** Eine konfigurierbare Video-URL, ueber einen festen `schluessel` vom Code referenziert (siehe
 *  frontend/src/pages/SystemeinstellungenPage.tsx, VIDEO_SLOTS) - neue Einbindungsstellen brauchen
 *  nur einen neuen Slot-Eintrag im Code, keine Typ-/Schema-Aenderung. Oeffentlich lesbar (kein
 *  Geheimwert), separat von der sonst admin-only GET /systemeinstellungen. */
export interface VideoEintrag {
  schluessel: string;
  url: string;
}

/**
 * Systemweite App-Einstellungen (Singleton-Dokument, immer dieselbe feste ID - siehe
 * backend/src/systemeinstellungen.ts). Anders als Systemkonfiguration/Turnierregeln bewusst NICHT
 * versioniert: es gibt hier keinen Anwendungsfall, bei dem eine aeltere Version noch gebraucht
 * wird (die Werte wirken immer nur "ab jetzt", werden nirgends in ein Turnier hineinkopiert).
 * Gedacht als Erweiterungspunkt fuer kuenftige globale Schalter, aktuell nur Selbstregistrierung.
 */
export interface Systemeinstellungen extends CouchMeta {
  docType: "systemeinstellungen";
  selbstregistrierungErlaubt: boolean;
  selbstregistrierungStandardRolle: SelbstregistrierungsRolle;
  /** Schaltet den tatsaechlichen Versand ueber die SMTP-Werte unten frei/aus - unabhaengig davon,
   *  ob diese vollstaendig gesetzt sind. So lassen sich Zugangsdaten eintragen und ueber den
   *  "Verbindung testen"-Knopf pruefen, bevor Einladungs-/Passwort-Reset-Mails tatsaechlich live
   *  verschickt werden. Default aus (sicherste Einstellung fuer eine frische Instanz). */
  mailversandAktiv?: boolean;
  /** E-Mail-Versand (Einladungen, Passwort-Reset) - ueber die Oberflaeche gepflegt statt
   *  backend/.env (analog IMAP-Zugang/Anthropic-Key im Mail-Postfach). Ohne vollstaendige
   *  Host/Benutzer/Passwort-Angabe (oder bei mailversandAktiv=false) faellt das Backend auf
   *  Link-in-Antwort/Server-Log zurueck. */
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPasswort?: string;
  /** Absenderadresse, Format `"Name" <adresse@beispiel.de>`. */
  smtpAbsender?: string;
  /** Feste Zieladresse fuer eine Benachrichtigung bei Selbstregistrierung/Einladung-Annahme -
   *  optional, ohne gesetzten Wert (oder ohne aktivierten/konfigurierten Mailversand) verschickt
   *  das Backend keine Benachrichtigung. */
  benachrichtigungEmpfaenger?: string;
  videos?: VideoEintrag[];
  geaendertVon?: BenutzerId;
  geaendertAm?: Zeitstempel;
}

/** Sicht auf Systemeinstellungen ohne das SMTP-Passwort - stattdessen nur ein Gesetzt-Flag,
 *  gleiches Muster wie MailPostfachEinstellungenOeffentlich. */
export interface SystemeinstellungenOeffentlich {
  selbstregistrierungErlaubt: boolean;
  selbstregistrierungStandardRolle: SelbstregistrierungsRolle;
  mailversandAktiv: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPasswortGesetzt: boolean;
  smtpAbsender?: string;
  benachrichtigungEmpfaenger?: string;
  videos: VideoEintrag[];
}

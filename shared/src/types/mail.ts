import { CouchMeta, Zeitstempel } from "./common";
import { KanbanId } from "./kanban";

export type MailNachrichtId = string;
export type MailBerichtId = string;

/** Grobe Einordnung einer eingegangenen Mail, von der KI-Klassifikation vergeben. */
export type MailKategorie = "fehlermeldung" | "lob" | "anregung" | "kritik" | "spam" | "sonstiges";

/** Manuelle Triage durch die Entwicklung, unabhaengig von der KI-Kategorie. */
export type MailManuellerStatus = "erledigt" | "ignoriert";

export type MailBerichtAusloeser = "automatisch" | "manuell";

/**
 * Eine per IMAP abgerufene Mail aus dem zentralen Feedback-Postfach (nur Entwicklungsinstanz,
 * siehe backend/src/mail/postfach.ts). `imapUid` verhindert doppeltes Abrufen derselben Mail;
 * `kategorie`/`kiZusammenfassung` werden erst nach dem naechsten Berichtslauf gesetzt.
 */
export interface MailNachricht extends CouchMeta {
  docType: "mailNachricht";
  imapUid: number;
  von: string;
  betreff: string;
  empfangenAm: Zeitstempel;
  text: string;
  kategorie?: MailKategorie;
  kiZusammenfassung?: string;
  /** Gesetzt, sobald (automatisch oder manuell) eine Kanban-Karte aus dieser Mail entstand. */
  kanbanKartenId?: KanbanId;
  manuellerStatus?: MailManuellerStatus;
  /** Referenz auf den MailBericht, der diese Mail zuletzt beruecksichtigt hat - verhindert
   *  eine erneute Beruecksichtigung im naechsten Lauf. */
  beruecksichtigtInBerichtId?: MailBerichtId;
  erstelltAm: Zeitstempel;
  aktualisiertAm: Zeitstempel;
}

/** Ergebnis eines Berichtslaufs (taeglich automatisch oder manuell ausgeloest). */
export interface MailBericht extends CouchMeta {
  docType: "mailBericht";
  erzeugtAm: Zeitstempel;
  ausgeloestDurch: MailBerichtAusloeser;
  anzahlMails: number;
  zusammenfassungText: string;
  mailIds: MailNachrichtId[];
  erstellteKartenIds: KanbanId[];
  /** Fuer eine grobe Kostenabschaetzung des KI-Aufrufs (Anthropic-Preise pro Token) - fehlt, wenn
   *  keine Mails zu klassifizieren waren (kein API-Aufruf noetig). */
  kiInputTokens?: number;
  kiOutputTokens?: number;
}

/**
 * Singleton-Dokument (feste ID, analog Systemeinstellungen) fuer die Betriebsparameter des
 * Mail-Postfachs - bewusst ALLE ueber die Oberflaeche pflegbar, inklusive IMAP-Zugang und
 * Anthropic-API-Key (Nutzer-Vorgabe: keine .env-Zugangsdaten fuer dieses Feature). `imapPasswort`
 * und `anthropicApiKey` werden nie ueber die API zurueckgegeben (siehe
 * `MailPostfachEinstellungenOeffentlich` unten) - gleiches Muster wie Passwort-Hash/2FA-Secret.
 */
export interface MailPostfachEinstellungen extends CouchMeta {
  docType: "mailPostfachEinstellungen";
  /** Uhrzeit des taeglichen automatischen Berichtslaufs, Format "HH:MM" (lokale Serverzeit). */
  berichtszeit: string;
  /** Ziel-Adresse(n) fuer den Bericht (Text-Zusammenfassung per Mail); ohne SMTP-Konfiguration
   *  bleibt der Bericht nur in der App sichtbar. */
  berichtEmpfaenger?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPasswort?: string;
  anthropicApiKey?: string;
  /** Hoechste bereits abgerufene IMAP-UID, fuer den naechsten Abruf. */
  letzteImapUid?: number;
  /** Datum (YYYY-MM-DD) des letzten automatischen Laufs, verhindert einen doppelten Lauf am
   *  selben Tag. */
  letzterAutomatischerLaufDatum?: string;
  /** Erledigte/ignorierte Mails werden nach so vielen Tagen automatisch geraeumt (nur die lokale
   *  Kopie, die Original-Mail bleibt im Postfach) - siehe mail/berichtHilfen.ts::istVeraltet().
   *  Optional, damit bereits bestehende Einstellungen-Dokumente ohne dieses Feld weiter gueltig
   *  bleiben; STANDARD_AUFBEWAHRUNG_TAGE dient dafuer als Fallback. */
  aufbewahrungTage?: number;
}

/** Sicht auf MailPostfachEinstellungen ohne die beiden Geheimwerte - stattdessen nur ein
 *  Gesetzt-Flag, damit die Oberflaeche weiss, ob bereits ein Wert hinterlegt ist, ohne ihn
 *  jemals im Klartext zu sehen (Formularfelder bleiben leer, bis neu eingegeben wird). */
export interface MailPostfachEinstellungenOeffentlich {
  berichtszeit: string;
  berichtEmpfaenger?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPasswortGesetzt: boolean;
  anthropicApiKeyGesetzt: boolean;
  aufbewahrungTage: number;
}

import { BenutzerId, CouchMeta, VereinId, Zeitstempel } from "./common";

/** Siehe Gesamtspezifikation Abschnitt 21.1. */
export type GlobaleRolle = "admin" | "manager" | "benutzer";

export type Sprache = "de" | "en" | "fr" | "it";

/** Praktische Ergaenzung, nicht Teil der urspruenglichen Spezifikation (Abschnitt 24.3
 * beschreibt nur das Farbschema-Prinzip). "system" folgt bei standardTheme unbesetzt
 * automatisch der Systemeinstellung des jeweiligen Geraets. */
export type Theme = "system" | "light" | "dark";
export type Dichte = "standard" | "schmal";
/** Inhaltsbreite: "standard" (schmale, gut lesbare Spalte) oder "breit" (mehr Bildschirmbreite nutzen). */
export type Breite = "standard" | "breit";

/** Siehe Gesamtspezifikation Abschnitt 20.15. */
export interface Benutzer extends CouchMeta {
  docType: "benutzer";
  benutzerId: BenutzerId;
  /** Entspricht dem Benutzernamen. */
  email: string;
  passwortHash?: string;
  name: string;
  /** Vorname als eigenes Feld (der `name` bleibt Nachname/Anzeigename). Zusammen mit `name` in die
   *  Schiedsrichter-Erfassung eines Turniers uebernehmbar (Name+Vorname). */
  vorname?: string;
  telefon?: string;
  /** Kontakt-/Stammdaten fuer die Uebernahme ins Turnier bzw. rein informativ. */
  lizenzVorhanden?: boolean;
  vereinVerband?: string;
  adresse?: string;
  globaleRolle: GlobaleRolle;
  sprache: Sprache;
  zweiFaAktiv: boolean;
  zweiFaSecret?: string;
  gesperrt: boolean;
  letzteAnmeldung?: Zeitstempel;
  erstelltVon?: BenutzerId;
  /**
   * Zugehoerigkeit zu einem Verein (Stammdaten). Vergibt AUSSCHLIESSLICH ein Admin - die Person selbst
   * kann sie nicht setzen. Grundlage der eingeschraenkten Sicht fuer Manager: Ein Manager sieht nur
   * sich selbst, die von ihm eingeladenen Konten und die Konten seines Vereins (siehe
   * backend/src/auth/benutzerSicht.ts). Eine Einladung durch einen Manager erbt dessen Verein.
   */
  vereinId?: VereinId;
  erstelltAm: Zeitstempel;

  /**
   * Persoenliche Anzeige-Voreinstellungen, kontogebunden (nicht geraetegebunden wie
   * das gleichnamige Gegenstueck im Browser-localStorage). Ein gesetzter Wert hat
   * IMMER Recht (Nutzer-Vorgabe 2026-08-20): er wird bei jedem Sitzungsstart auf dem
   * jeweiligen Geraet angewendet und ueberschreibt dabei eine dort getroffene lokale
   * Wahl (siehe uebernimmKontoStandards in frontend/src/auth.tsx). Unbesetzt = die
   * lokale Geraete-Einstellung bleibt massgeblich ("system" bzw. "standard").
   */
  standardTheme?: Theme;
  standardDichte?: Dichte;
  standardBreite?: Breite;

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

  /**
   * Brute-Force-Schutz fuer die oeffentlich erreichbare Zentrale Plattform: bei jedem falschen
   * Passwort hochgezaehlt, bei erfolgreichem Login zurueckgesetzt. Ab einer Schwelle
   * (FEHLVERSUCHE_SCHWELLE, backend/src/routes/auth.ts) wird `loginKontoGesperrtBis` gesetzt statt
   * das Konto dauerhaft zu sperren - siehe dort.
   */
  fehlgeschlageneLoginVersuche?: number;
  /**
   * Zeitbasierte Login-Sperre (Abkuehlzeit) nach zu vielen Fehlversuchen: bis zu diesem Zeitpunkt
   * werden weitere Login-Versuche abgewiesen, danach ist das Konto automatisch wieder frei (kein
   * Admin-Eingriff noetig). Bewusst getrennt von `gesperrt` (dauerhafte, bewusste Admin-Sperre),
   * damit ein Angreifer, der eine E-Mail kennt, ein Konto nicht mehr DAUERHAFT aussperren kann
   * (frueher: nach 10 Fehlversuchen dauerhaft `gesperrt` - ein DoS-Vektor). Vom Server gesetzt.
   */
  loginKontoGesperrtBis?: Zeitstempel;
  /**
   * Zeitschritt (30-Sekunden-Fenster) des zuletzt angenommenen 2FA-Codes. Ein Code aus diesem oder
   * einem frueheren Schritt wird nicht mehr angenommen - sonst liesse sich ein mitgelesener Code
   * innerhalb seiner Gueltigkeit ein zweites Mal verwenden. Vom Server gesetzt, nie nach aussen.
   */
  zweiFaLetzterZeitschritt?: number;
  /**
   * Unterscheidet, WARUM `gesperrt` gesetzt ist - wichtig, damit ein Passwort-Reset nur eine
   * automatische Fehlversuche-Sperre aufhebt, nie eine bewusste Admin-Sperre (die haette sich
   * sonst ueber den Reset-Link aushebeln lassen). Vom Server gesetzt, nie vom Client. Der Wert
   * "fehlversuche" entsteht seit der Umstellung auf `loginKontoGesperrtBis` nicht mehr neu, bleibt
   * aber fuer Altbestaende (frueher hart gesperrte Konten) erhalten, die ein Reset noch aufhebt.
   */
  gesperrtGrund?: "manuell" | "fehlversuche";

  /** Instanz-Kopplung (Turnier-Sync, Abschnitt 21.3/23): kurzlebiger Einmal-Code, mit dem eine
   *  lokale Installation sich dauerhaft mit diesem Konto koppelt (siehe VerbundeneInstanz). */
  instanzKopplungscodeHash?: string;
  instanzKopplungscodeAblauf?: Zeitstempel;

  /**
   * Die letzten sicherheitsrelevanten Aenderungen an DIESEM Konto (neueste zuletzt, begrenzt). Zweiter
   * Benachrichtigungsweg neben der Mail: funktioniert auch auf einer lokalen Installation ohne
   * Mailversand und ohne Internet. Vom Server gesetzt, nie vom Client.
   */
  kontoHinweise?: KontoHinweis[];
}

/** Welche Aenderung an einem Konto gemeldet wird. Texte: shared/src/logik/kontoHinweise.ts. */
export type KontoHinweisArt =
  | "passwort-zuruecksetzen-ausgeloest"
  | "passwort-geaendert"
  | "email-geaendert"
  | "zwei-fa-aktiviert"
  | "zwei-fa-deaktiviert"
  | "rolle-geaendert";

export interface KontoHinweis {
  id: string;
  art: KontoHinweisArt;
  zeitpunkt: Zeitstempel;
  /** Name der ANDEREN Person, die die Aenderung vorgenommen hat. Fehlt bei einer Aenderung durch die Person selbst. */
  durch?: string;
  /** Zusatz fuer die Anzeige (z. B. "ueber einen Zuruecksetzen-Link", neue Rolle). */
  detail?: string;
  /** Erst nach "Gelesen" bzw. bei Aenderungen der Person selbst in der laufenden Sitzung true. */
  gelesen: boolean;
}

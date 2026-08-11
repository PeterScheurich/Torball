import type {
  Benutzer,
  Dichte,
  GlobaleRolle,
  KanbanKarte,
  KanbanKategorie,
  KanbanPrioritaet,
  KanbanSpalte,
  Klassifizierung,
  MannschaftImTurnier,
  Protokollierungsart,
  SchiedsrichterImTurnier,
  Spiel,
  Spielfeld,
  Spieler,
  SpielerStatus,
  Spielmodus,
  Systemkonfiguration,
  Team,
  Theme,
  Turnier,
  TurnierBerechtigung,
  Turnierregeln,
  TurnierRolle,
  Verein,
} from "@torball/shared";

// Zentraler API-Client des Frontends: duenne fetch-Wrapper um die Backend-Routen. Alle
// Aufrufe laufen ueber `anfrage()` (einheitliche Fehlerbehandlung + Cookie-Auth) gegen das
// /api-Praefix, das der Vite-Dev-Proxy bzw. der Reverse-Proxy ans Backend weiterreicht.
const BASIS = "/api";

/** Nie ueber die API zurueckgegeben: Passwort-Hash, 2FA-Secret, Einladungs-/Reset-Token-Hashes (siehe backend/src/auth/benutzerProfil.ts). */
export type BenutzerProfil = Omit<
  Benutzer,
  "passwortHash" | "zweiFaSecret" | "einladungTokenHash" | "einladungAblauf" | "resetTokenHash" | "resetAblauf"
> & { hatPasswort: boolean };

async function anfrage<T>(pfad: string, init?: RequestInit): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(`${BASIS}${pfad}`, {
      ...init,
      credentials: "same-origin",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    // fetch() wirft nur, wenn die Verbindung gar nicht erst zustande kommt
    // (Backend nicht gestartet, Netzwerk weg) - klar von einer HTTP-Fehlerantwort unterscheiden.
    throw new Error("Server nicht erreichbar. Läuft das Backend?");
  }

  if (!antwort.ok) {
    if (antwort.status === 502 || antwort.status === 503 || antwort.status === 504) {
      throw new Error(`Backend antwortet nicht (Status ${antwort.status}). Läuft der Server?`);
    }
    const body = await antwort.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `Anfrage fehlgeschlagen (Status ${antwort.status})`);
  }

  if (antwort.status === 204) {
    return undefined as T;
  }

  return antwort.json() as Promise<T>;
}

export interface NeuesTurnier {
  name: string;
  datum: string;
  startzeit?: string;
  felder: Spielfeld[];
  spielplanModus?: Spielmodus;
  protokollierungsart?: Protokollierungsart;
  schiedsrichterPlanung?: boolean;
}

export function getTurniere(): Promise<Turnier[]> {
  return anfrage("/turniere");
}

export function getTurnier(id: string): Promise<Turnier> {
  return anfrage(`/turniere/${id}`);
}

export function createTurnier(daten: NeuesTurnier): Promise<Turnier> {
  return anfrage("/turniere", { method: "POST", body: JSON.stringify(daten) });
}

export function deleteTurnier(id: string): Promise<void> {
  return anfrage(`/turniere/${id}`, { method: "DELETE" });
}

/** Turnier bewusst abschliessen (Status -> "abgeschlossen"). Nur mit Schreibzugriff
 *  (Turnierleitung); danach erscheint es in der Uebersicht unter "Abgeschlossen". */
export function turnierAbschliessen(id: string): Promise<Turnier> {
  return anfrage(`/turniere/${id}/abschliessen`, { method: "POST" });
}

/** Ein abgeschlossenes Turnier wieder oeffnen (Status -> "aktiv"), reversibel. */
export function turnierWiederOeffnen(id: string): Promise<Turnier> {
  return anfrage(`/turniere/${id}/wieder-oeffnen`, { method: "POST" });
}

/** Leitet einen neuen Spieltag aus einem abgeschlossenen Vorgaenger-Turnier ab (Datenuebernahme:
 *  Mannschaften + Kader + Regeln + gespiegelter Spielplan). Liefert das neue Turnier. */
export function turnierAbleiten(
  basisId: string,
  daten: { name: string; datum: string; startzeit?: string },
): Promise<Turnier> {
  return anfrage(`/turniere/${basisId}/ableiten`, { method: "POST", body: JSON.stringify(daten) });
}

/** Entsperrt die (aus dem Vorgaenger uebernommenen) Regeln eines abgeleiteten Turniers. */
export function turnierRegelnEntsperren(id: string): Promise<Turnier> {
  return anfrage(`/turniere/${id}/regeln-entsperren`, { method: "POST" });
}

/** Optionale Freitextfelder duerfen explizit auf null gesetzt werden, um sie zu leeren -
 * JSON.stringify(undefined) liesse den Schluessel im Request-Body komplett verschwinden,
 * das Backend wuerde den bisherigen Wert dann faelschlich unveraendert stehen lassen. */
export function updateTurnier(
  id: string,
  daten: Partial<
    Pick<
      Turnier,
      | "spielplanModus"
      | "protokollierungsart"
      | "name"
      | "oeffentlichTurnierinfos"
      | "oeffentlichAnfahrtDokumente"
      | "oeffentlichSpielplan"
      | "oeffentlichErgebnisse"
      | "oeffentlichRegeln"
    >
  > & {
    spielortName?: string | null;
    spielortAdresse?: string | null;
    spielortGeo?: string | null;
    turnierleitungName?: string | null;
    turnierleitungKontakt?: string | null;
    ansprechpartnerName?: string | null;
    ansprechpartnerKontakt?: string | null;
    zusatzinfo?: string | null;
  } & Partial<Turnierregeln>,
): Promise<Turnier> {
  return anfrage(`/turniere/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

// --- Systemkonfiguration (Standardregeln) ---

export function getSystemkonfiguration(): Promise<Systemkonfiguration> {
  return anfrage("/systemkonfiguration");
}

export function updateSystemkonfiguration(
  daten: Turnierregeln & { forfaitErgebnis?: string; passwortMindestlaenge?: number; aenderungskommentar?: string },
): Promise<Systemkonfiguration> {
  return anfrage("/systemkonfiguration", { method: "PUT", body: JSON.stringify(daten) });
}

export interface NeueMannschaft {
  turnierId: string;
  name: string;
  teamId?: string;
  vereinId?: string;
  bundesland?: string;
  betreuer1Name?: string;
  betreuer1IstSchiedsrichter?: boolean;
  betreuer2Name?: string;
  betreuer2IstSchiedsrichter?: boolean;
  betreuer3Name?: string;
  betreuer3IstSchiedsrichter?: boolean;
}

export function getMannschaften(turnierId: string): Promise<MannschaftImTurnier[]> {
  return anfrage(`/turniere/${turnierId}/mannschaften`);
}

export function createMannschaft(daten: NeueMannschaft): Promise<MannschaftImTurnier> {
  return anfrage("/mannschaften", { method: "POST", body: JSON.stringify(daten) });
}

export interface MannschaftAktualisierung {
  name: string;
  vereinId?: string | null;
  /** null sendet, um ein gesetztes Bundesland gezielt zu leeren (siehe VereinAktualisierung). */
  bundesland?: string | null;
  /** Trainer/Betreuer (bis zu drei) - null sendet, um einen Eintrag gezielt zu leeren.
   * Das jeweilige IstSchiedsrichter-Flag markiert, dass die Person zugleich Schiedsrichter ist. */
  betreuer1Name?: string | null;
  betreuer1IstSchiedsrichter?: boolean;
  betreuer2Name?: string | null;
  betreuer2IstSchiedsrichter?: boolean;
  betreuer3Name?: string | null;
  betreuer3IstSchiedsrichter?: boolean;
}

export function updateMannschaft(id: string, daten: MannschaftAktualisierung): Promise<MannschaftImTurnier> {
  return anfrage(`/mannschaften/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export function deleteMannschaft(id: string): Promise<void> {
  return anfrage(`/mannschaften/${id}`, { method: "DELETE" });
}

export function mannschaftReihenfolgeAendern(
  turnierId: string,
  mannschaftIds: string[],
): Promise<MannschaftImTurnier[]> {
  return anfrage(`/turniere/${turnierId}/mannschaften/reihenfolge`, {
    method: "PUT",
    body: JSON.stringify({ mannschaftIds }),
  });
}

// --- Spieler / Kader (turnierbezogen an der Mannschaft, Abschnitt 5.3 / 20.8) ---

export interface NeuerSpieler {
  mannschaftId: string;
  name: string;
  vorname?: string | null;
  trikotnummer: string;
  klassifizierung: Klassifizierung;
  status?: SpielerStatus;
}

export interface SpielerAktualisierung {
  name: string;
  /** null sendet, um einen gesetzten Vornamen gezielt zu leeren (siehe VereinAktualisierung). */
  vorname?: string | null;
  trikotnummer: string;
  klassifizierung: Klassifizierung;
  status: SpielerStatus;
}

export function getSpieler(mannschaftId: string): Promise<Spieler[]> {
  return anfrage(`/mannschaften/${mannschaftId}/spieler`);
}

export function createSpieler(daten: NeuerSpieler): Promise<Spieler> {
  return anfrage("/spieler", { method: "POST", body: JSON.stringify(daten) });
}

export function updateSpieler(id: string, daten: SpielerAktualisierung): Promise<Spieler> {
  return anfrage(`/spieler/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export function deleteSpieler(id: string): Promise<void> {
  return anfrage(`/spieler/${id}`, { method: "DELETE" });
}

// --- Schiedsrichter (turnierbezogen, Abschnitt 5.4 / 20.9) ---

export interface NeuerSchiedsrichter {
  turnierId: string;
  name: string;
  vorname?: string;
  telefon?: string;
  email?: string;
  lizenzVorhanden?: boolean;
  mannschaftId?: string;
  istTurnierleitung?: boolean;
}

export interface SchiedsrichterAktualisierung {
  name: string;
  /** null sendet, um ein gesetztes optionales Feld gezielt zu leeren (siehe VereinAktualisierung). */
  vorname?: string | null;
  telefon?: string | null;
  email?: string | null;
  lizenzVorhanden: boolean;
  /** null loest die Mannschaftszugehoerigkeit ("— keine —"). */
  mannschaftId?: string | null;
  istTurnierleitung: boolean;
}

export function getSchiedsrichter(turnierId: string): Promise<SchiedsrichterImTurnier[]> {
  return anfrage(`/turniere/${turnierId}/schiedsrichter`);
}

export function createSchiedsrichter(daten: NeuerSchiedsrichter): Promise<SchiedsrichterImTurnier> {
  return anfrage("/schiedsrichter", { method: "POST", body: JSON.stringify(daten) });
}

export function updateSchiedsrichter(
  id: string,
  daten: SchiedsrichterAktualisierung,
): Promise<SchiedsrichterImTurnier> {
  return anfrage(`/schiedsrichter/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export function deleteSchiedsrichter(id: string): Promise<void> {
  return anfrage(`/schiedsrichter/${id}`, { method: "DELETE" });
}

export interface SpielplanVorschlagEintrag {
  mannschaftAId: string;
  mannschaftBId: string;
  feldId: string;
  slot: number;
  warnung?: string;
  startzeitGeplant?: string;
}

export interface SpielplanVorschlag {
  turnierId: string;
  wiederholungen: number;
  spiele: SpielplanVorschlagEintrag[];
}

export function getSpielplanVorschlag(turnierId: string, wiederholungen: 1 | 2): Promise<SpielplanVorschlag> {
  return anfrage(`/turniere/${turnierId}/spielplan-vorschlag?wiederholungen=${wiederholungen}`);
}

export interface SpielplanErgebnis {
  turnierId: string;
  spielplanVersion: number;
  anzahlSpiele: number;
  spiele: Spiel[];
}

export function erzeugeSpielplan(
  turnierId: string,
  wiederholungen: 1 | 2,
  eintraege?: SpielplanVorschlagEintrag[],
): Promise<SpielplanErgebnis> {
  return anfrage(`/turniere/${turnierId}/spielplan?wiederholungen=${wiederholungen}`, {
    method: "POST",
    body: eintraege ? JSON.stringify({ eintraege }) : undefined,
  });
}

export function getSpiele(turnierId: string): Promise<Spiel[]> {
  return anfrage(`/turniere/${turnierId}/spiele`);
}

export function reihenfolgeAendern(turnierId: string, spielIds: string[]): Promise<Spiel[]> {
  return anfrage(`/turniere/${turnierId}/spiele/reihenfolge`, {
    method: "PUT",
    body: JSON.stringify({ spielIds }),
  });
}

export interface SpielAnpassung {
  runde?: string;
  feldId?: string;
  startzeitGeplant?: string;
  /** null loest die Schiedsrichter-Zuordnung ("— keiner —"). */
  schiedsrichterId?: string | null;
}

/** Schiedsrichter-Vorschlag ueber alle Spiele des Turniers erzeugen und speichern (Abschnitt 5.4).
 * Bewusst eine ausdrueckliche Aktion, kein Automatismus bei der Spielplan-Erzeugung. */
export function schiedsrichterZuordnen(turnierId: string): Promise<Spiel[]> {
  return anfrage(`/turniere/${turnierId}/schiedsrichter-zuordnung`, { method: "POST" });
}

/** Gezielte Einzelanpassung (z.B. nur runde+Startzeit tauschen), ohne wie reihenfolgeAendern alle Spiele neu durchzunummerieren. */
export function spielAnpassen(spielId: string, daten: SpielAnpassung): Promise<Spiel> {
  return anfrage(`/spiele/${spielId}`, { method: "PUT", body: JSON.stringify(daten) });
}

/** Verschiebt dieses Spiel auf die neue Startzeit; alle nachfolgenden geplanten Spiele wandern um dasselbe Delta mit. */
export function spielStartzeitAendern(spielId: string, startzeitGeplant: string): Promise<Spiel[]> {
  return anfrage(`/spiele/${spielId}/startzeit`, {
    method: "PUT",
    body: JSON.stringify({ startzeitGeplant }),
  });
}

// --- Stammdaten (Vereine und Teams, Abschnitt 15) ---

/** Optionale Felder duerfen explizit null sein, um sie zu leeren - JSON.stringify(undefined)
 * liesse den Schluessel aus dem Body fallen, das Backend behielte den alten Wert dann bei
 * (gleiches Muster wie bei updateTurnier). */
export interface VereinAktualisierung {
  name: string;
  logo?: string | null;
  bundesland?: string | null;
  ansprechpartnerName?: string | null;
  ansprechpartnerTelefon?: string | null;
  ansprechpartnerEmail?: string | null;
}

export function getVereine(): Promise<Verein[]> {
  return anfrage("/vereine");
}

export function createVerein(daten: VereinAktualisierung): Promise<Verein> {
  return anfrage("/vereine", { method: "POST", body: JSON.stringify(daten) });
}

export function updateVerein(id: string, daten: VereinAktualisierung): Promise<Verein> {
  return anfrage(`/vereine/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export function deleteVerein(id: string): Promise<void> {
  return anfrage(`/vereine/${id}`, { method: "DELETE" });
}

export interface TeamAktualisierung {
  vereinId: string;
  name: string;
}

export function getTeams(): Promise<Team[]> {
  return anfrage("/teams");
}

export function createTeam(daten: TeamAktualisierung): Promise<Team> {
  return anfrage("/teams", { method: "POST", body: JSON.stringify(daten) });
}

export function updateTeam(id: string, daten: TeamAktualisierung): Promise<Team> {
  return anfrage(`/teams/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export function deleteTeam(id: string): Promise<void> {
  return anfrage(`/teams/${id}`, { method: "DELETE" });
}

// --- Authentifizierung ---

export type LoginErgebnis = BenutzerProfil | { benoetigtTotp: true };

export function login(email: string, passwort: string, totpCode?: string): Promise<LoginErgebnis> {
  return anfrage("/auth/login", { method: "POST", body: JSON.stringify({ email, passwort, totpCode }) });
}

export function logout(): Promise<void> {
  return anfrage("/auth/logout", { method: "POST" });
}

export function getMe(): Promise<BenutzerProfil> {
  return anfrage("/auth/me");
}

export function bootstrapAdmin(email: string, passwort: string, name: string): Promise<BenutzerProfil> {
  return anfrage("/auth/bootstrap-admin", { method: "POST", body: JSON.stringify({ email, passwort, name }) });
}

export function bootstrapVerfuegbar(): Promise<{ verfuegbar: boolean }> {
  return anfrage("/auth/bootstrap-verfuegbar");
}

// --- Benutzerverwaltung ---

export function getBenutzerListe(): Promise<BenutzerProfil[]> {
  return anfrage("/benutzer");
}

export interface NeuerBenutzer {
  email: string;
  name: string;
  globaleRolle: GlobaleRolle;
}

/** Ist E-Mail-Versand konfiguriert, geht der Einladungslink direkt an die neue Adresse und einladungsToken fehlt in der Antwort; andernfalls kommt der Klartext-Link direkt zurueck. */
export function benutzerEinladen(
  daten: NeuerBenutzer,
): Promise<{ benutzer: BenutzerProfil; einladungsToken?: string }> {
  return anfrage("/benutzer", { method: "POST", body: JSON.stringify(daten) });
}

export function benutzerAktualisieren(
  id: string,
  daten: Partial<Pick<Benutzer, "name" | "globaleRolle" | "gesperrt">>,
): Promise<BenutzerProfil> {
  return anfrage(`/benutzer/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

/** Admin deaktiviert die 2FA eines anderen Benutzers (z.B. bei verlorener Authenticator-App). */
export function benutzerZweiFaDeaktivieren(id: string): Promise<BenutzerProfil> {
  return anfrage(`/benutzer/${id}/2fa/deaktivieren`, { method: "POST" });
}

/** Selbst-Service fuers eigene Profil - kann anders als benutzerAktualisieren() weder Rolle noch Sperrung aendern. Bei E-Mail-Aenderung ist aktuellesPasswort Pflicht. standardTheme/standardDichte sind Anzeige-Voreinstellungen, kein Passwort noetig. */
export function eigenesProfilAktualisieren(daten: {
  name?: string;
  email?: string;
  aktuellesPasswort?: string;
  standardTheme?: Theme;
  standardDichte?: Dichte;
}): Promise<BenutzerProfil> {
  return anfrage("/benutzer/mich", { method: "PUT", body: JSON.stringify(daten) });
}

export function eigenesPasswortAendern(aktuellesPasswort: string, neuesPasswort: string): Promise<BenutzerProfil> {
  return anfrage("/benutzer/mich/passwort", {
    method: "PUT",
    body: JSON.stringify({ aktuellesPasswort, neuesPasswort }),
  });
}

export function getEinladung(token: string): Promise<{ email: string; name: string }> {
  return anfrage(`/benutzer/einladung/${token}`);
}

export function einladungAnnehmen(token: string, passwort: string): Promise<BenutzerProfil> {
  return anfrage(`/benutzer/einladung/${token}/annehmen`, { method: "POST", body: JSON.stringify({ passwort }) });
}

export function passwortVergessen(email: string): Promise<{ ok: true }> {
  return anfrage("/benutzer/passwort-vergessen", { method: "POST", body: JSON.stringify({ email }) });
}

export function passwortReset(token: string, neuesPasswort: string): Promise<{ ok: true }> {
  return anfrage(`/benutzer/passwort-reset/${token}`, { method: "POST", body: JSON.stringify({ neuesPasswort }) });
}

export interface TotpEinrichtung {
  secret: string;
  otpAuthUri: string;
  qrCodeDataUri: string;
}

export function totpEinrichten(): Promise<TotpEinrichtung> {
  return anfrage("/benutzer/2fa/einrichten", { method: "POST" });
}

export function totpBestaetigen(code: string): Promise<BenutzerProfil> {
  return anfrage("/benutzer/2fa/bestaetigen", { method: "POST", body: JSON.stringify({ code }) });
}

export function totpDeaktivieren(passwort: string): Promise<BenutzerProfil> {
  return anfrage("/benutzer/2fa/deaktivieren", { method: "POST", body: JSON.stringify({ passwort }) });
}

// --- Turnier-Berechtigungen ---

export function getTurnierBerechtigungen(turnierId: string): Promise<TurnierBerechtigung[]> {
  return anfrage(`/turniere/${turnierId}/berechtigungen`);
}

export function turnierBerechtigungVergeben(
  turnierId: string,
  benutzerId: string,
  rolle: TurnierRolle,
): Promise<TurnierBerechtigung> {
  return anfrage(`/turniere/${turnierId}/berechtigungen`, {
    method: "POST",
    body: JSON.stringify({ benutzerId, rolle }),
  });
}

export function turnierBerechtigungEntziehen(id: string): Promise<void> {
  return anfrage(`/berechtigungen/${id}`, { method: "DELETE" });
}

// --- Ergebniserfassung (Abschnitt 9/14) ---

export interface ErgebnisEingabe {
  ergebnisA: number;
  ergebnisB: number;
  istForfait?: boolean;
}

export function spielErgebnisSetzen(spielId: string, daten: ErgebnisEingabe): Promise<Spiel> {
  return anfrage(`/spiele/${spielId}/ergebnis`, { method: "PUT", body: JSON.stringify(daten) });
}

export function spielAbschliessen(spielId: string): Promise<Spiel> {
  return anfrage(`/spiele/${spielId}/abschliessen`, { method: "PUT" });
}

export function turnierSpieleAbschliessen(turnierId: string): Promise<Spiel[]> {
  return anfrage(`/turniere/${turnierId}/spiele/abschliessen`, { method: "PUT" });
}

export interface TabellenZeile {
  mannschaftId: string;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  toreFuer: number;
  toreGegen: number;
  tordifferenz: number;
  punkte: number;
}

export function getTabelle(turnierId: string): Promise<TabellenZeile[]> {
  return anfrage(`/turniere/${turnierId}/tabelle`);
}

export function getErgebnisToken(turnierId: string): Promise<{ tokenWert: string | null }> {
  return anfrage(`/turniere/${turnierId}/ergebnis-token`);
}

export function erzeugeErgebnisToken(turnierId: string): Promise<{ tokenWert: string }> {
  return anfrage(`/turniere/${turnierId}/ergebnis-token`, { method: "POST" });
}

export function widerrufeErgebnisToken(turnierId: string): Promise<void> {
  return anfrage(`/turniere/${turnierId}/ergebnis-token/widerrufen`, { method: "POST" });
}

// --- Oeffentliche Ergebniserfassung per Token (kein Login) ---

export interface ErgebnisErfassungSpiel {
  _id: string;
  runde?: string;
  feldId?: string;
  mannschaftAId: string;
  mannschaftBId: string;
  ergebnisA?: number;
  ergebnisB?: number;
  istForfait: boolean;
  ergebnisAbgeschlossen: boolean;
}

export interface ErgebnisErfassungDaten {
  turnierName: string;
  mannschaften: { _id: string; name: string }[];
  spiele: ErgebnisErfassungSpiel[];
}

export function getErgebnisErfassung(tokenWert: string): Promise<ErgebnisErfassungDaten> {
  return anfrage(`/ergebnis-erfassung/${tokenWert}`);
}

export function ergebnisPerTokenSetzen(
  tokenWert: string,
  spielId: string,
  daten: ErgebnisEingabe & { erfasserName: string; geraetKennung?: string },
): Promise<ErgebnisErfassungSpiel> {
  return anfrage(`/ergebnis-erfassung/${tokenWert}/spiele/${spielId}`, {
    method: "PUT",
    body: JSON.stringify(daten),
  });
}

// --- Oeffentliche Turnierseite (Abschnitt 13, kein Login) ---

export interface OeffentlichesSpiel {
  _id: string;
  runde?: string;
  feldId?: string;
  startzeitGeplant?: string;
  mannschaftAId: string;
  mannschaftBId: string;
  status: string;
  ergebnisA?: number;
  ergebnisB?: number;
  istForfait: boolean;
  ergebnisAbgeschlossen: boolean;
}

/** Ein einzelner Spieltag innerhalb eines Wettbewerbs (Datenimport Stufe 4). */
export interface OeffentlicherSpieltag {
  turnierId: string;
  spieltagNummer: number;
  name: string;
  tabelle: TabellenZeile[];
  spiele: OeffentlichesSpiel[];
  mannschaften: { _id: string; name: string; bundesland?: string }[];
  felder: Spielfeld[];
}

export interface OeffentlicheTurnierseite {
  turnierId: string;
  name: string;
  mannschaften: { _id: string; name: string; bundesland?: string }[];
  felder: Spielfeld[];
  /** Nur gesetzt, wenn das Turnier zu einem Wettbewerb mit >= 2 oeffentlich freigegebenen Spieltagen
   *  gehoert: aktiviert die Unter-Navigation "Gesamt | Spieltag 1 | Spieltag 2" im Ergebnis-Reiter. */
  wettbewerb: {
    aktuellerSpieltagNummer: number;
    gesamttabelle: TabellenZeile[];
    spieltage: OeffentlicherSpieltag[];
  } | null;
  turnierinfos: {
    datum: string;
    startzeit?: string;
    status: string;
    turnierleitungName?: string;
    turnierleitungKontakt?: string;
    ansprechpartnerName?: string;
    ansprechpartnerKontakt?: string;
    zusatzinfo?: string;
  } | null;
  anfahrt: {
    spielortName?: string;
    spielortAdresse?: string;
    spielortGeo?: string;
  } | null;
  spielplan: {
    version: number;
    geaendertAm?: string;
    spiele: OeffentlichesSpiel[];
  } | null;
  ergebnisse: {
    tabelle: TabellenZeile[];
    spiele: OeffentlichesSpiel[];
  } | null;
  regeln: {
    spielzeitMinuten: number;
    anzahlHalbzeiten: number;
    pauseMinuten: number;
    seitenwechsel: boolean;
    timeoutsJeHalbzeit: number;
    timeoutDauerSekunden: number;
    auswechslungenJeHalbzeit: number;
    tordifferenzAbbruch: boolean;
    tordifferenzLimit: number;
    verlaengerungAktiv: boolean;
    silbernesTor: boolean;
    punkteSieg: number;
    punkteUnentschieden: number;
    punkteNiederlage: number;
    tabellenKriterien: string[];
    forfaitErgebnis: string;
  } | null;
}

export function getOeffentlicheTurnierseite(turnierId: string): Promise<OeffentlicheTurnierseite> {
  return anfrage(`/oeffentlich/turniere/${turnierId}`);
}

// --- Kanban-Board (nur Admins, Entwicklungs-Organisation) ---

export interface KanbanBoard {
  karten: KanbanKarte[];
  /** true, wenn auf dieser Instanz importiert werden darf (nur Dev, KANBAN_SYNC=true). */
  syncAktiv: boolean;
}

export interface KanbanKarteEingabe {
  titel: string;
  /** null sendet, um eine gesetzte Beschreibung gezielt zu leeren (siehe api.ts oben). */
  beschreibung?: string | null;
  spalte: KanbanSpalte;
  kategorie: KanbanKategorie;
  prioritaet: KanbanPrioritaet;
}

export interface KanbanKonflikt {
  kanbanId: string;
  lokal: KanbanKarte;
  eingehend: KanbanKarte;
}

export interface KanbanImportVorschau {
  neu: KanbanKarte[];
  identisch: number;
  konflikte: KanbanKonflikt[];
  uebersprungen: number;
}

export type KanbanKonfliktWahl = "lokal" | "eingehend";

export interface KanbanImportErgebnis {
  eingefuegt: number;
  ueberschrieben: number;
  lokalBehalten: number;
  identisch: number;
  offen: number;
  uebersprungen: number;
}

export function getKanbanBoard(): Promise<KanbanBoard> {
  return anfrage("/kanban");
}

export function createKanbanKarte(daten: KanbanKarteEingabe): Promise<KanbanKarte> {
  return anfrage("/kanban/karten", { method: "POST", body: JSON.stringify(daten) });
}

export function updateKanbanKarte(id: string, daten: KanbanKarteEingabe): Promise<KanbanKarte> {
  return anfrage(`/kanban/karten/${id}`, { method: "PUT", body: JSON.stringify(daten) });
}

export function kanbanKarteVerschieben(id: string, richtung: "hoch" | "runter"): Promise<KanbanKarte[]> {
  return anfrage(`/kanban/karten/${id}/position`, {
    method: "PUT",
    body: JSON.stringify({ richtung }),
  });
}

export function deleteKanbanKarte(id: string): Promise<void> {
  return anfrage(`/kanban/karten/${id}`, { method: "DELETE" });
}

/** Schritt 1: ermittelt Neu/Identisch/Konflikte, ohne zu schreiben. */
export function kanbanImportVorschau(karten: KanbanKarte[]): Promise<KanbanImportVorschau> {
  return anfrage("/kanban/import/vorschau", { method: "POST", body: JSON.stringify({ karten }) });
}

/** Schritt 2: schreibt neue Karten und wendet die je Konflikt getroffenen Entscheidungen an. */
export function kanbanImportAnwenden(
  karten: KanbanKarte[],
  wahlen: Record<string, KanbanKonfliktWahl>,
): Promise<KanbanImportErgebnis> {
  return anfrage("/kanban/import/anwenden", { method: "POST", body: JSON.stringify({ karten, wahlen }) });
}

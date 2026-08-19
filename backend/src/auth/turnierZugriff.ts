import type { Benutzer, Turnier, TurnierBerechtigung, TurnierId, TurnierRolle } from "@torball/shared";
import { findAllBySelector } from "../repository";
import { findeAktivesCheckout } from "../sync/instanz";

/**
 * Dreistufig statt binaer (seit Abschnitt 21.2/21.3, Nutzer-Vorgabe 13.08.2026): "schreiben_voll"
 * deckt Grunddaten/Regeln/Mannschaften/Spieler/Schiedsrichter-Stammliste/Turnier-Lebenszyklus ab,
 * "schreiben_spielbetrieb" nur noch Spielplan (Status/Zeiten/Schiedsrichter-Zuordnung) und
 * Ergebniserfassung - passend zur fachlichen Trennung Turnierleitung/Spielleitung (Abschnitt 10.2).
 * Welche Route welche Stufe verlangt, steht jeweils an der Aufrufstelle (siehe Routen-Dateien).
 */
export type Zugriffsstufe = "lesen" | "schreiben_spielbetrieb" | "schreiben_voll";

const RANG: Record<Zugriffsstufe, number> = {
  lesen: 0,
  schreiben_spielbetrieb: 1,
  schreiben_voll: 2,
};

function rolleZuStufe(rolle: TurnierRolle): Zugriffsstufe {
  if (rolle === "turnierleitung") return "schreiben_voll";
  if (rolle === "spielleitung") return "schreiben_spielbetrieb";
  return "lesen";
}

/** Turnier-Code-Zugriff (Abschnitt 21.3, Betriebsmodus "Lokales Netzwerk") - ohne Benutzerkonto,
 *  gebunden an genau ein Turnier + eine der beiden Schreibrollen. */
export interface TurnierCodeZugriff {
  turnierId: TurnierId;
  rolle: Extract<TurnierRolle, "turnierleitung" | "spielleitung">;
}

/**
 * Fasst die beiden moeglichen Zugriffswege zusammen (echtes Benutzerkonto ODER Turnier-Code) -
 * absichtlich ein einfaches Interface statt FastifyRequest, damit dieses Modul frei von
 * Fastify-Importen bleibt. FastifyRequest erfuellt es dank struktureller Typisierung automatisch
 * (siehe req.benutzer/req.turnierCode in backend/src/auth/plugin.ts) - Aufrufstellen reichen daher
 * einfach `req` selbst durch, statt vorher `req.benutzer` herauszugreifen.
 */
export interface Zugriffsakteur {
  benutzer?: Benutzer;
  turnierCode?: TurnierCodeZugriff;
}

/**
 * Abschnitt 21.1/21.2/21.3: Admin hat immer Vollzugriff; ein Manager behaelt immer Zugriff auf
 * eigene (selbst erstellte) Turniere; alle anderen Benutzer-Zugriffe richten sich nach vergebenen
 * TurnierBerechtigung-Dokumenten. Ein passender Turnier-Code gibt unabhaengig von einem
 * Benutzerkonto Zugriff auf GENAU dieses eine Turnier. `benutzer` und `turnierCode` sind praktisch
 * nie gleichzeitig gesetzt (eine Session ist entweder das eine oder das andere, siehe
 * shared/src/types/session.ts) - die Code-Pruefung steht trotzdem bewusst zuerst, falls sich das
 * je aendert.
 */
export async function turnierZugriffsstufe(
  turnier: Turnier,
  akteur: Zugriffsakteur,
): Promise<Zugriffsstufe | undefined> {
  if (akteur.turnierCode && akteur.turnierCode.turnierId === turnier._id) {
    return rolleZuStufe(akteur.turnierCode.rolle);
  }

  const benutzer = akteur.benutzer;
  if (!benutzer) return undefined;
  if (benutzer.globaleRolle === "admin") return "schreiben_voll";
  if (benutzer.globaleRolle === "manager" && turnier.erstelltVon === benutzer._id) return "schreiben_voll";

  const berechtigungen = await findAllBySelector<TurnierBerechtigung>({
    docType: "turnierBerechtigung",
    turnierId: turnier._id,
    benutzerId: benutzer._id,
  });
  const beste = berechtigungen.map((b) => rolleZuStufe(b.rolle)).sort((a, b) => RANG[b] - RANG[a])[0];
  if (beste) return beste;

  // Pauschale Freigabe fuer ALLE angemeldeten Benutzer (turnier.zugriffFuerAlleBenutzer, z.B. fuer
  // eine Demo-Instanz) - bewusst erst NACH den individuellen TurnierBerechtigung-Pruefungen, greift
  // also nur, wenn fuer diesen Benutzer keine eigene Berechtigung existiert. "schreiben" (der alte,
  // vor der Dreiteilung einzige Wert) entspricht "schreiben_voll" - bewahrt das bisherige Verhalten.
  if (turnier.zugriffFuerAlleBenutzer) {
    return turnier.zugriffFuerAlleBenutzer === "schreiben" ? "schreiben_voll" : "lesen";
  }

  return undefined;
}

/**
 * Ein abgeschlossenes (oder archiviertes) Turnier ist inhaltlich schreibgeschuetzt: Mannschaften,
 * Spieler, Schiedsrichter, Spielplan, Ergebnisse und Grunddaten lassen sich erst nach dem
 * Wiederoeffnen (Status -> "aktiv") wieder aendern. Bewusst NICHT gesperrt (Nutzer-Vorgabe):
 * die Oeffentlich-Freigabe und das Teilen (Leserechte vergeben) - man veroeffentlicht Ergebnisse
 * oft erst nach dem Abschliessen. Die Routen, die reine Inhalte aendern, pruefen das zusaetzlich
 * zur Schreibberechtigung.
 */
export function turnierGesperrt(turnier: Turnier): boolean {
  return turnier.status === "abgeschlossen" || turnier.status === "archiviert";
}

/** Einheitliche Fehlermeldung (HTTP 409), wenn eine Inhaltsaenderung an einem abgeschlossenen
 *  Turnier abgelehnt wird. */
export const TURNIER_GESPERRT_FEHLER =
  "Turnier ist abgeschlossen. Zum Bearbeiten zuerst wieder öffnen.";

/**
 * Turnier-Sync (Abschnitt 21.3/23): ein an eine lokale Installation ausgechecktes Turnier
 * (`TurnierCheckout`, Status "angefordert" oder "aktiv") ist auf dem Server ebenfalls
 * schreibgeschuetzt - waehrend des Checkouts ist die lokale Instanz der alleinige fuehrende Stand
 * (1:1-Beziehung, kein Merge, siehe sync/checkin.ts). Ohne diese Sperre koennte jemand auf dem
 * Server unbemerkt Aenderungen vornehmen, die beim naechsten automatischen Check-in wieder
 * ueberschrieben wuerden (Nutzer-Vorgabe 2026-08-19). Anders als bei `turnierGesperrt()` bewusst
 * OHNE Ausnahme fuer die Oeffentlich-Freigabe: die oeffentlich*-Felder werden seit der
 * Voll-Synchronisation im Check-in ebenfalls automatisch vom lokalen Stand ueberschrieben - eine
 * direkte Server-Aenderung waere spaetestens beim naechsten Check-in ohnehin wieder verloren,
 * ein Sperren verhindert also nur eine sinnlose, unbemerkt verpuffende Aenderung.
 */
export async function turnierAusgecheckt(turnierId: TurnierId): Promise<boolean> {
  return (await findeAktivesCheckout(turnierId)) !== null;
}

export const TURNIER_AUSGECHECKT_FEHLER =
  "Turnier wird gerade auf einer lokalen Installation verwaltet und ist hier deshalb " +
  "schreibgeschützt. Über \"Turnier-Sync\" in der Übersicht lässt sich die Freigabe aufheben.";

/** Ein aus einem Vorgaenger abgeleitetes Turnier (Datenuebernahme / zweiter Spieltag). Erkennbar
 *  am gesetzten basisTurnierId. In so einem Turnier sind die Mannschaften hart gesperrt. */
export function istAbgeleitet(turnier: Turnier): boolean {
  return Boolean(turnier.basisTurnierId);
}

export const MANNSCHAFTEN_ABGELEITET_FEHLER =
  "Die Mannschaften wurden aus dem vorherigen Spieltag übernommen und sind nicht änderbar.";

export const REGELN_GESPERRT_FEHLER =
  "Die Regeln wurden aus dem vorherigen Spieltag übernommen und sind gesperrt. Zum Ändern zuerst entsperren.";

/**
 * Zuschreibung fuer Audit-/Denormalisierungs-Felder (erstelltVon/zuletztBearbeitetVon/
 * abgeschlossenVon/vergebenVon usw.): bei einem echten Benutzerkonto dessen ID+Name, bei einer
 * Turnier-Code-Session gibt es keine BenutzerId (es existiert kein Konto) - stattdessen ein
 * erkennbarer Platzhalter-Name, damit die *Von-Felder nicht mit `req.benutzer!` abstuerzen. Nur an
 * Stellen noetig, die tatsaechlich ueber requireZugriff (nicht requireAuth) erreichbar sind - die
 * ueber `markiereTurnierBearbeitet` laufenden Routen (mannschaft/spieler/schiedsrichter/spielplan)
 * akzeptieren `Benutzer | undefined` bereits von sich aus und brauchen das hier nicht.
 */
export function zuschreibung(akteur: Zugriffsakteur): { benutzerId?: string; name: string } {
  if (akteur.benutzer) return { benutzerId: akteur.benutzer._id, name: akteur.benutzer.name };
  if (akteur.turnierCode) {
    return { name: akteur.turnierCode.rolle === "turnierleitung" ? "Turnierleitung-Code" : "Spielleitung-Code" };
  }
  return { name: "Unbekannt" };
}

export async function hatMindestens(
  turnier: Turnier,
  akteur: Zugriffsakteur,
  mindestens: Zugriffsstufe,
): Promise<boolean> {
  const stufe = await turnierZugriffsstufe(turnier, akteur);
  if (!stufe) return false;
  return RANG[stufe] >= RANG[mindestens];
}

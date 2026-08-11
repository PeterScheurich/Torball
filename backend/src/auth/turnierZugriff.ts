import type { Benutzer, Turnier, TurnierBerechtigung } from "@torball/shared";
import { findAllBySelector } from "../repository";

export type Zugriffsstufe = "lesen" | "schreiben";

/**
 * Abschnitt 21.1/21.2: Admin hat immer Vollzugriff; ein Manager behaelt immer
 * Zugriff auf eigene (selbst erstellte) Turniere; alle anderen Zugriffe
 * richten sich nach vergebenen TurnierBerechtigung-Dokumenten
 * ("turnierleitung"/"spielleitung" = schreiben, "lesen" = lesen).
 */
export async function turnierZugriffsstufe(
  turnier: Turnier,
  benutzer: Benutzer | undefined,
): Promise<Zugriffsstufe | undefined> {
  if (!benutzer) return undefined;
  if (benutzer.globaleRolle === "admin") return "schreiben";
  if (benutzer.globaleRolle === "manager" && turnier.erstelltVon === benutzer._id) return "schreiben";

  const berechtigungen = await findAllBySelector<TurnierBerechtigung>({
    docType: "turnierBerechtigung",
    turnierId: turnier._id,
    benutzerId: benutzer._id,
  });
  if (berechtigungen.some((b) => b.rolle === "turnierleitung" || b.rolle === "spielleitung")) return "schreiben";
  if (berechtigungen.some((b) => b.rolle === "lesen")) return "lesen";
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

export async function hatMindestens(
  turnier: Turnier,
  benutzer: Benutzer | undefined,
  mindestens: Zugriffsstufe,
): Promise<boolean> {
  const stufe = await turnierZugriffsstufe(turnier, benutzer);
  if (!stufe) return false;
  if (mindestens === "lesen") return true; // "schreiben" oder "lesen" reichen beide
  return stufe === "schreiben";
}

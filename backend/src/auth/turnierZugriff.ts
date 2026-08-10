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

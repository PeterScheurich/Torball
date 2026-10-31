import type { Benutzer } from "@torball/shared";
import type { OeffentlichesBenutzerProfil } from "./benutzerProfil";

/**
 * Welche Konten ein MANAGER sehen und bearbeiten darf (Datenschutz, Auftraggeber-Entscheidung
 * 2026-10-31 nach einer Tester-Rueckmeldung): vorher lieferte `GET /benutzer` jeder Manager-Rolle das
 * VOLLE Profil ALLER Konten (Telefon, Adresse, Verein/Verband ...). Das passt nicht mehr, sobald viele
 * Vereine das Werkzeug nutzen. Ein Manager sieht jetzt nur
 *   - sich selbst,
 *   - Konten, die er selbst eingeladen hat (`erstelltVon`), und
 *   - Konten desselben Vereins (`vereinId`, vom Admin vergeben).
 * Admins sehen weiterhin alle Konten. Die Regel gilt NUR fuer die Rolle "manager" ("erst mal nur auf
 * Manager anwenden"); die Rolle "benutzer" hat keinen Zugang zur Benutzerverwaltung.
 *
 * Rein funktional (kein Datenbankzugriff), damit sie im normalen `npm test` laeuft.
 */
export function managerSiehtKonto(manager: Benutzer, ziel: Benutzer): boolean {
  if (ziel._id === manager._id) return true;
  if (ziel.erstelltVon === manager._id) return true;
  return Boolean(manager.vereinId) && ziel.vereinId === manager.vereinId;
}

/** Felder, die ein Manager von ANDEREN Konten sieht - was die Benutzerverwaltung zum Verwalten
 *  braucht, aber keine Kontaktdaten (Telefon, Adresse, Verein/Verband-Freitext, Voreinstellungen). */
const MANAGER_SICHT_FELDER = [
  "_id",
  "benutzerId",
  "docType",
  "email",
  "name",
  "vorname",
  "globaleRolle",
  "gesperrt",
  "gesperrtGrund",
  "hatPasswort",
  "zweiFaAktiv",
  "vereinId",
  "erstelltAm",
] as const;

export function profilFuerManager(profil: OeffentlichesBenutzerProfil): Partial<OeffentlichesBenutzerProfil> {
  const rest: Partial<OeffentlichesBenutzerProfil> = {};
  for (const feld of MANAGER_SICHT_FELDER) {
    if (feld in profil) (rest as Record<string, unknown>)[feld] = (profil as Record<string, unknown>)[feld];
  }
  return rest;
}

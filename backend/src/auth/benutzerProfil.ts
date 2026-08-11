import type { Benutzer } from "@torball/shared";

/** Nie ueber die API zurueckgeben: Passwort-Hash, 2FA-Secret, Einladungs-/Reset-Token-Hashes. */
export type OeffentlichesBenutzerProfil = Omit<
  Benutzer,
  "passwortHash" | "zweiFaSecret" | "einladungTokenHash" | "einladungAblauf" | "resetTokenHash" | "resetAblauf"
> & {
  /** Ersetzt passwortHash nach aussen: erlaubt der Benutzerverwaltung, "Einladung noch offen" anzuzeigen, ohne den Hash selbst preiszugeben. */
  hatPasswort: boolean;
};

/** Entfernt alle sensiblen Felder aus einem Benutzer-Dokument, bevor es die API verlaesst.
 *  Muss vor JEDER Rueckgabe eines Benutzers durchlaufen werden (siehe CLAUDE.md, Benutzer-Fachregeln). */
export function oeffentlichesProfil(benutzer: Benutzer): OeffentlichesBenutzerProfil {
  const {
    passwortHash,
    zweiFaSecret,
    einladungTokenHash,
    einladungAblauf,
    resetTokenHash,
    resetAblauf,
    ...rest
  } = benutzer;
  return { ...rest, hatPasswort: Boolean(passwortHash) };
}

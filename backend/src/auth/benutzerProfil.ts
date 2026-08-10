import type { Benutzer } from "@torball/shared";

/** Nie ueber die API zurueckgeben: Passwort-Hash, 2FA-Secret, Einladungs-/Reset-Token-Hashes. */
export type OeffentlichesBenutzerProfil = Omit<
  Benutzer,
  "passwortHash" | "zweiFaSecret" | "einladungTokenHash" | "einladungAblauf" | "resetTokenHash" | "resetAblauf"
>;

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
  return rest;
}

import { CouchMeta, TeamId, VereinId } from "./common";

/** Siehe Gesamtspezifikation Abschnitt 20.4/15. Zentrale Stammdaten. */
export interface Verein extends CouchMeta {
  docType: "verein";
  vereinId: VereinId;
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
}

/**
 * Siehe Gesamtspezifikation Abschnitt 20.4/15. Gehört zu einem Verein,
 * erbt dessen Logo, führt keine eigenen Spielerdaten (die liegen
 * turnierbezogen bei Spieler/MannschaftImTurnier).
 */
export interface Team extends CouchMeta {
  docType: "team";
  teamId: TeamId;
  vereinId: VereinId;
  name: string;
  /** Zurückgestellte Erweiterung (Abschnitt 29), aktuell ungenutzt. */
  logoOverride?: string;
}

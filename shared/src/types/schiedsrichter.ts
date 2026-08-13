import { CouchMeta, SchiedsrichterId, TurnierId, VereinId } from "./common";

/**
 * Stammdaten-Schiedsrichter (turnierübergreifend, analog Verein/Team - Abschnitt 15/29 "Backlog:
 * akkreditierte Schiedsrichter"). Referenziert einen Verein statt einer Mannschaft, da Stammdaten
 * keinen Turnier-/Mannschaftskontext kennen - optional, da manche Schiedsrichter neutral (ohne
 * Vereinsbindung) geführt werden. Dient nur als Vorlage: die Übernahme in ein Turnier (siehe
 * SchiedsrichterImTurnier) kopiert die Werte, keine Live-Verknüpfung.
 */
export interface Schiedsrichter extends CouchMeta {
  docType: "schiedsrichter";
  schiedsrichterId: SchiedsrichterId;
  name: string;
  vorname?: string;
  telefon?: string;
  email?: string;
  lizenzVorhanden?: boolean;
  vereinId?: VereinId;
}

/** Siehe Gesamtspezifikation Abschnitt 20.9. Genau eine Person je Turnier mit istTurnierleitung=true. */
export interface SchiedsrichterImTurnier extends CouchMeta {
  docType: "schiedsrichterImTurnier";
  schiedsrichterId: SchiedsrichterId;
  turnierId: TurnierId;
  name: string;
  vorname?: string;
  telefon?: string;
  email?: string;
  lizenzVorhanden: boolean;
  /**
   * Vereins- statt Mannschafts-Bezug (2026-08-14 umgestellt, vorher mannschaftId): ein
   * Schiedsrichter gehört fachlich zu einem Verein, nicht zu einer bestimmten
   * Turnier-Mannschaft. Die Konflikt-Erkennung (P1/P2, siehe schiedsrichterZuordnung.ts /
   * schiedsrichterKonflikt.ts) löst das über die Mannschaften des Turniers auf, die diesen
   * Verein als vereinId tragen - erfasst dadurch automatisch auch mehrere Mannschaften
   * desselben Vereins im selben Turnier (z. B. eine I- und eine II-Mannschaft).
   */
  vereinId?: VereinId;
  istTurnierleitung: boolean;
  /** Kennzeichen "nur Turnierleitung, nicht als Schiedsrichter aktiv". Nur relevant, wenn
   *  istTurnierleitung=true. Solche Personen pfeifen nicht und werden bei der Schiedsrichter-
   *  Einteilung nicht als Kandidat vorgeschlagen. */
  nurTurnierleitung?: boolean;
  importiertAusTurnierId?: TurnierId;
  importiertAusSchiedsrichterId?: SchiedsrichterId;
  /** Bei Übernahme aus den Stammdaten gesetzt: Verweis auf den Stammdaten-Schiedsrichter. */
  importiertAusStammdatenSchiedsrichterId?: SchiedsrichterId;
}

import {
  CouchMeta,
  FeldId,
  MannschaftId,
  SchiedsrichterId,
  SpielId,
  TurnierId,
  Zeitstempel,
} from "./common";
import type { GruppenKennung } from "./turniermodus";

export type SpielStatus = "geplant" | "laeuft" | "beendet" | "abgeschlossen";

/** Siehe Gesamtspezifikation Abschnitt 20.10. */
export interface Spiel extends CouchMeta {
  docType: "spiel";
  spielId: SpielId;
  turnierId: TurnierId;
  /** Z.B. 1, 2, "Finale", "Platz 3". */
  runde?: string;
  feldId?: FeldId;
  startzeitGeplant?: Zeitstempel;
  startzeitVoraussichtlich?: Zeitstempel;
  startzeitTatsaechlich?: Zeitstempel;
  endzeitTatsaechlich?: Zeitstempel;
  mannschaftAId: MannschaftId;
  mannschaftBId: MannschaftId;
  schiedsrichterId?: SchiedsrichterId;
  status: SpielStatus;
  ergebnisA?: number;
  ergebnisB?: number;
  istForfait: boolean;
  /**
   * Unabhängig vom status-Feld; relevant bei protokollierungsart=manuell,
   * wo ein Spiel direkt von "geplant" zu "Ergebnis erfasst" springen kann.
   */
  ergebnisAbgeschlossen: boolean;
  /**
   * Turniermodus mit Gruppen/Endrunde: Gruppe eines Vorrundenspiels und - bei Spielen spaeterer Runden -
   * die Kennung im Plan (`PlanSpiel.planId`) samt Anzeigename. Fehlt bei Modi ohne Gruppen. Vorrundenspiele
   * haben keine `planId`; nur sie zaehlen in die Gruppentabellen.
   */
  gruppe?: GruppenKennung;
  planId?: string;
  bezeichnung?: string;
}

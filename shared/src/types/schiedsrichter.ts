import { CouchMeta, MannschaftId, SchiedsrichterId, TurnierId } from "./common";

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
  mannschaftId?: MannschaftId;
  istTurnierleitung: boolean;
  importiertAusTurnierId?: TurnierId;
}

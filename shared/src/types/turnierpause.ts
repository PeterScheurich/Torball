import { CouchMeta, FeldId, TurnierId, TurnierpauseId, Zeitstempel } from "./common";

export type TurnierpauseTyp = "mittagspause" | "synchronisation";

/** "alle" oder eine Liste betroffener Spielfeld-IDs. */
export type TurnierpauseGiltFuer = "alle" | FeldId[];

/** Siehe Gesamtspezifikation Abschnitt 20.6. */
export interface Turnierpause extends CouchMeta {
  docType: "turnierpause";
  pauseId: TurnierpauseId;
  turnierId: TurnierId;
  startzeitGeplant?: Zeitstempel;
  dauerMinuten: number;
  giltFuer: TurnierpauseGiltFuer;
  typ: TurnierpauseTyp;
}

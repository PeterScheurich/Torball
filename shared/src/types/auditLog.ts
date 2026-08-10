import { AuditLogId, BenutzerId, CouchMeta, TurnierId, Zeitstempel } from "./common";

/** Siehe Gesamtspezifikation Abschnitt 20.17. */
export interface AuditLogEintrag extends CouchMeta {
  docType: "auditLogEintrag";
  logId: AuditLogId;
  turnierId?: TurnierId;
  benutzerId?: BenutzerId;
  /** Z.B. "turnier_geaendert", "spieler_hinzugefuegt", "protokoll_korrigiert". */
  aktion: string;
  details?: Record<string, unknown>;
  zeitstempel: Zeitstempel;
}

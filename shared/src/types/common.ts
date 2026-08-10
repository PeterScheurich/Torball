/** ISO-8601-Zeitstempel (z.B. `new Date().toISOString()`). */
export type Zeitstempel = string;

/** CouchDB-Basisfelder, die jedes persistierte Dokument trägt. */
export interface CouchMeta {
  _id: string;
  _rev?: string;
}

export type BenutzerId = string;
export type SystemkonfigurationId = string;
export type VereinId = string;
export type TeamId = string;
export type WettbewerbId = string;
export type TurnierId = string;
export type FeldId = string;
export type TurnierpauseId = string;
export type MannschaftId = string;
export type SpielerId = string;
export type SchiedsrichterId = string;
export type SpielId = string;
export type SpielprotokollId = string;
export type EventId = string;
export type DokumentAnhangId = string;
export type ErgebnisTokenId = string;
export type ErgebnisAenderungId = string;
export type TurnierBerechtigungId = string;
export type AuditLogId = string;

export * from "./common";
export * from "./benutzer";
export * from "./session";
export * from "./konfiguration";
export * from "./stammdaten";
export * from "./wettbewerb";
export * from "./turnier";
export * from "./turnierpause";
export * from "./mannschaft";
export * from "./spieler";
export * from "./schiedsrichter";
export * from "./spiel";
export * from "./spielprotokoll";
export * from "./event";
export * from "./dokumentAnhang";
export * from "./ergebnis";
export * from "./berechtigung";
export * from "./auditLog";

import type { Benutzer } from "./benutzer";
import type { Session } from "./session";
import type { Systemkonfiguration } from "./konfiguration";
import type { Verein, Team } from "./stammdaten";
import type { Wettbewerb } from "./wettbewerb";
import type { Turnier } from "./turnier";
import type { Turnierpause } from "./turnierpause";
import type { MannschaftImTurnier } from "./mannschaft";
import type { Spieler } from "./spieler";
import type { SchiedsrichterImTurnier } from "./schiedsrichter";
import type { Spiel } from "./spiel";
import type { Spielprotokoll } from "./spielprotokoll";
import type { Event } from "./event";
import type { DokumentAnhang } from "./dokumentAnhang";
import type { ErgebnisToken, ErgebnisAenderung } from "./ergebnis";
import type { TurnierBerechtigung } from "./berechtigung";
import type { AuditLogEintrag } from "./auditLog";

/**
 * Discriminated Union aller CouchDB-Dokumenttypen (Unterscheidung über
 * das Feld `docType`). Nützlich für generischen Dokumentzugriff.
 */
export type TorballDokument =
  | Benutzer
  | Session
  | Systemkonfiguration
  | Verein
  | Team
  | Wettbewerb
  | Turnier
  | Turnierpause
  | MannschaftImTurnier
  | Spieler
  | SchiedsrichterImTurnier
  | Spiel
  | Spielprotokoll
  | Event
  | DokumentAnhang
  | ErgebnisToken
  | ErgebnisAenderung
  | TurnierBerechtigung
  | AuditLogEintrag;

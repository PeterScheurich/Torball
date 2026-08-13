import { BenutzerId, CouchMeta, TurnierCheckoutId, TurnierId, VerbundeneInstanzId, Zeitstempel } from "./common";

/**
 * Turnier-Sync (Grundlage): eine lokale Installation koppelt sich per Kopplungscode dauerhaft mit
 * einem Server-Konto und meldet sich danach regelmäßig per Check-in (siehe
 * `backend/src/routes/instanzSync.ts`). Der `instanzTokenHash` ist das Dauer-Credential für diese
 * Check-ins - SHA-256 wie Einladungs-/Reset-Token (`backend/src/auth/token.ts`), nicht bcrypt wie
 * die Turnier-Codes: es handelt sich um ein maschinell erzeugtes Zufalls-Secret, kein von einem
 * Menschen gewähltes Passwort.
 */
export interface VerbundeneInstanz extends CouchMeta {
  docType: "verbundeneInstanz";
  instanzId: VerbundeneInstanzId;
  benutzerId: BenutzerId;
  instanzTokenHash: string;
  /** Menschenlesbare Kennung, beim Koppeln erfragt (z.B. "Laptop Halle 3"). */
  bezeichnung?: string;
  erstelltAm: Zeitstempel;
  letzterKontaktAm?: Zeitstempel;
  widerrufen: boolean;
  widerrufenAm?: Zeitstempel;
}

/**
 * Der "Checkout"-Zustand eines Turniers: höchstens ein nicht-`"freigegeben"`-Checkout pro
 * `turnierId` gleichzeitig (1:1-Beziehung Turnier <-> lokale Instanz). `"angefordert"` = Server hat
 * einen Download-Auftrag hinterlegt, noch nicht von der Instanz abgeholt/bestätigt; `"aktiv"` =
 * Instanz hat das Turnier (Download bestätigt oder per Upload neu angelegt); `"freigegeben"` =
 * Checkout beendet, Turnier wieder frei für eine neue Kopplung.
 */
export interface TurnierCheckout extends CouchMeta {
  docType: "turnierCheckout";
  checkoutId: TurnierCheckoutId;
  turnierId: TurnierId;
  instanzId: VerbundeneInstanzId;
  status: "angefordert" | "aktiv" | "freigegeben";
  stammdatenMitnehmen: boolean;
  angefordertVon?: BenutzerId;
  angefordertAm: Zeitstempel;
  uebertragenAm?: Zeitstempel;
  freigegebenAm?: Zeitstempel;
}

/**
 * Lokales Singleton-Dokument (Vorbild `Systemeinstellungen`, feste `_id`) - hält die Verbindung
 * DIESER Installation zu einem Zentralen-Plattform-Server. Existiert nur, wenn tatsächlich
 * gekoppelt wurde; wird nie exportiert/synchronisiert (rein instanzlokale Konfiguration).
 */
export interface LokaleSyncKonfiguration extends CouchMeta {
  docType: "lokaleSyncKonfiguration";
  serverUrl: string;
  instanzToken: string;
  gekoppeltAm: Zeitstempel;
}

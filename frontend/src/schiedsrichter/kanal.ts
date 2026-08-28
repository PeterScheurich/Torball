import type { Halbzeit, Mannschaftsseite } from "@torball/shared";

/**
 * Verbindung zwischen dem Protokoll-Fenster und der Schiedsrichter-Anzeige (Konzept
 * "Schiedsrichter-Sicht", Nutzer-Vorgabe 28.08.2026). Beide laufen IMMER auf demselben
 * Rechner - deshalb reden sie ueber einen BroadcastChannel direkt miteinander statt ueber den
 * Server. Das ist keine Bequemlichkeit, sondern Bedingung: Der 15-Sekunden-Abruf vom Server
 * waere fuer eine Frist von acht Sekunden nutzlos.
 *
 * Bewusst ein SCHLANKES, eigenes Paket statt des kompletten ProtokollStands: Die Anzeige
 * braucht weder Annullierungen noch Hinweise noch die Feldbesetzung, und eine ausdrueckliche
 * Schnittstelle macht sichtbar, wovon die zweite Ansicht wirklich abhaengt.
 */

export const KANAL_NAME = "torball-schiedsrichter";

/** Wie oft das Protokoll-Fenster auch ohne Aenderung sendet (Lebenszeichen). */
export const HERZSCHLAG_MS = 3000;

/** Ab dieser Stille gilt das Protokoll-Fenster als weg; die Anzeige faellt auf den Server zurueck. */
export const STILLE_BIS_ABGEMELDET_MS = 10000;

export interface AnzeigeStand {
  ergebnisA: number;
  ergebnisB: number;
  abschnitt: Halbzeit;
  abschnittNummer: number;
  uhrLaeuft: boolean;
  /** Sekunden der abgeschlossenen Laufphasen; die Anzeige rechnet laufendSeit selbst dazu. */
  gespielteSekunden: number;
  laufendSeit?: string;
  fouls: Record<Mannschaftsseite, number>;
  timeouts: Record<Mannschaftsseite, number>;
  /** Nur die Anzahl - wer geworfen hat, braucht die Anzeige nicht. */
  wurfAnzahl: Record<Mannschaftsseite, number>;
  spielGestartet: boolean;
  inPause: boolean;
  spielBeendet: boolean;
  letzterWurf?: { mannschaft: Mannschaftsseite; zeitstempel: string };
  letzteKontrolle?: { mannschaft: Mannschaftsseite; zeitstempel: string };
  strafwurfFrist?: { mannschaft: Mannschaftsseite; zeitstempel: string; art: "S" | "P" };
}

export interface StandPaket {
  typ: "stand";
  turnierId: string;
  /** Feld des laufenden Spiels - kann fehlen, wenn dem Spiel keines zugeordnet ist. */
  feldId?: string;
  spielId: string;
  /** Spiel.runde, also die Spielnummer im Plan. */
  runde?: string;
  teamA: string;
  teamB: string;
  seiteAVertauscht: boolean;
  timeoutsJeHalbzeit: number;
  spielzeitMinuten: number;
  anzahlHalbzeiten: number;
  /** Zeitpunkt des Sendens (Uhr desselben Rechners) - Grundlage der Stille-Erkennung. */
  gesendetAm: number;
  stand: AnzeigeStand;
}

/** Bitte des frisch geoeffneten Anzeige-Fensters um den aktuellen Stand (siehe unten). */
export interface StandAnfrage {
  typ: "bitte-stand";
  turnierId: string;
}

export type KanalNachricht = StandPaket | StandAnfrage;

/**
 * Nimmt die Anzeige dieses Paket an? Der Kanal ist einer fuer alle Felder - bei zwei Feldern
 * sind zwei Protokoll-Fenster und zwei Anzeigen offen, jede darf nur ihr eigenes Feld zeigen.
 *
 * Der Sonderfall `ohne feldId` ist keine Nachlaessigkeit: `Spiel.feldId` ist optional, und bei
 * einem Turnier mit nur einem Feld ist die Zuordnung ohnehin eindeutig. Bei mehreren Feldern
 * bleibt ein Paket ohne Feld dagegen liegen - lieber die Wartesicht als das falsche Spiel.
 */
export function paketPasstZuFeld(paket: StandPaket, feldId: string, nurEinFeld: boolean): boolean {
  if (paket.feldId) return paket.feldId === feldId;
  return nurEinFeld;
}

/** Legt den Kanal an - liefert `undefined`, wo BroadcastChannel fehlt (dann greift der Server-Abruf). */
export function oeffneKanal(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  try {
    return new BroadcastChannel(KANAL_NAME);
  } catch {
    return undefined;
  }
}

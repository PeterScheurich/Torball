import type { Event, SpielId, SpielprotokollId, TurnierId } from "@torball/shared";
import type { NeuesProtokollEvent } from "../api";

/**
 * Warteschlange fuer Protokoll-Ereignisse, die den Server (noch) nicht erreicht haben.
 *
 * Warum (Nutzer-Vorgabe 26.08.2026): Die Protokollierung laeuft in einer Sporthalle ueber WLAN.
 * Bricht die Verbindung kurz weg, ging ein in diesem Moment gebuchtes Tor bisher ersatzlos
 * verloren - es gab nur eine Fehlermeldung, kein erneuter Versuch. Und genau das faellt beim
 * Protokollieren nicht auf: Man verlaesst sich auf die Technik und schaut auf das Spiel.
 *
 * Grundsaetze:
 *  - Die REIHENFOLGE ist wesentlich (der Server vergibt die Sequenznummer beim Eintreffen).
 *    Sobald etwas wartet, wandert deshalb JEDES weitere Ereignis hinten in die Schlange, statt
 *    am Stau vorbei gesendet zu werden.
 *  - Wartende Ereignisse zaehlen im angezeigten Spielstand bereits mit (siehe
 *    `zuVorlaeufigemEvent`) - sonst zeigte die Anzeige waehrend einer Stoerung einen falschen
 *    Stand, und das waere schlimmer als die Stoerung selbst.
 *  - Die Schlange liegt im Browserspeicher, damit ein Neuladen oder ein abgestuerzter Reiter
 *    sie nicht mitnimmt.
 */

export interface WartendesEreignis {
  /** Nur lokal gueltige Kennung, bis der Server eine echte vergibt. */
  lokalId: string;
  daten: NeuesProtokollEvent;
  /** Zeitpunkt der Erfassung - nicht der spaeteren Uebertragung. */
  erfasstAm: string;
}

function schluessel(protokollId: string): string {
  return `torball-protokoll-warteschlange:${protokollId}`;
}

/** Browserspeicher kann in Sonderfaellen werfen (privates Fenster, gesperrte Website-Daten) -
 *  eine fehlende Zwischenspeicherung darf die Erfassung nie stoppen. */
export function ladeWarteschlange(protokollId: string): WartendesEreignis[] {
  try {
    const roh = window.localStorage.getItem(schluessel(protokollId));
    if (!roh) return [];
    const wert = JSON.parse(roh);
    return Array.isArray(wert) ? (wert as WartendesEreignis[]) : [];
  } catch {
    return [];
  }
}

export function speichereWarteschlange(protokollId: string, eintraege: WartendesEreignis[]): void {
  try {
    if (eintraege.length === 0) window.localStorage.removeItem(schluessel(protokollId));
    else window.localStorage.setItem(schluessel(protokollId), JSON.stringify(eintraege));
  } catch {
    /* Ohne Zwischenspeicher laeuft die Schlange nur im Arbeitsspeicher weiter - besser als nichts. */
  }
}

export function neuesWartendesEreignis(daten: NeuesProtokollEvent): WartendesEreignis {
  return {
    lokalId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    daten,
    erfasstAm: new Date().toISOString(),
  };
}

/**
 * Baut aus einem wartenden Ereignis ein vorlaeufiges `Event`, damit der Live-Stand es schon
 * mitzaehlt. Die `_id` traegt bewusst das Praefix `lokal:` - daran erkennt die Oberflaeche, dass
 * dieser Eintrag noch nicht beim Server ist (und dass eine Korrektur sich nicht darauf beziehen
 * darf: der Server kennt die Kennung nicht).
 */
export function zuVorlaeufigemEvent(
  eintrag: WartendesEreignis,
  kontext: { protokollId: SpielprotokollId; turnierId: TurnierId; spielId: SpielId; sequenz: number },
): Event {
  const id = `lokal:${eintrag.lokalId}`;
  return {
    _id: id,
    docType: "event",
    eventId: id,
    protokollId: kontext.protokollId,
    turnierId: kontext.turnierId,
    spielId: kontext.spielId,
    sequenz: kontext.sequenz,
    zeitstempel: eintrag.erfasstAm,
    spielzeit: eintrag.daten.spielzeit,
    halbzeit: eintrag.daten.halbzeit,
    eventTyp: eintrag.daten.eventTyp,
    mannschaft: eintrag.daten.mannschaft,
    spielerId: eintrag.daten.spielerId,
    spielerRausId: eintrag.daten.spielerRausId,
    istEigentor: eintrag.daten.istEigentor ?? false,
    istKorrektur: eintrag.daten.istKorrektur ?? false,
    korrigiertEventId: eintrag.daten.korrigiertEventId,
    zusatz: eintrag.daten.zusatz,
    erstelltVonName: eintrag.daten.erstelltVonName,
  };
}

/** Erkennt einen noch nicht uebertragenen Eintrag an seiner Kennung. */
export function istVorlaeufig(eventId: string): boolean {
  return eventId.startsWith("lokal:");
}

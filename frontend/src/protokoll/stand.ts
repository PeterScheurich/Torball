import type { Event, Halbzeit, Mannschaftsseite } from "@torball/shared";

/**
 * Live-Zustand der digitalen Protokollierung, vollstaendig aus dem Event-Strom berechnet
 * (Spez. 22.1: "Der aktuelle Spielstand wird nicht gespeichert, sondern berechnet"). Laeuft
 * bewusst NUR im Frontend - alle Pruefungen aus Spez. 22.3 sind Warnungen, keine Blockaden,
 * der Server muss sie nicht durchsetzen (Konzept Abschnitt 4). Die Annullierungs-Logik
 * (annullierteIds/wirksame Events) ist ein bewusstes kleines Duplikat von
 * backend/src/protokoll/ereignisse.ts (CommonJS-Regel: shared kann dem Frontend keine
 * Laufzeit-Logik liefern) - bei Aenderungen BEIDE Seiten anpassen.
 */

export interface WurfStand {
  /** Wer zuletzt fuer diese Mannschaft geworfen hat und wie oft in Folge (3-Wurf-Regel, Spez. 6.3). */
  spielerId?: string;
  anzahl: number;
}

export interface ProtokollStand {
  ergebnisA: number;
  ergebnisB: number;
  abschnitt: Halbzeit;
  /** Nummer des aktuellen Abschnitts (1-basiert) - fuer die "Halbzeit x von y"-Anzeige. */
  abschnittNummer: number;
  uhrLaeuft: boolean;
  /** Aufsummierte Sekunden der ABGESCHLOSSENEN Laufphasen des aktuellen Abschnitts. */
  gespielteSekunden: number;
  /** Zeitstempel des letzten GO, solange die Uhr laeuft - die Anzeige rechnet (jetzt - laufendSeit) dazu. */
  laufendSeit?: string;
  fouls: Record<Mannschaftsseite, number>;
  /** Verbrauchte Timeouts/Wechsel im AKTUELLEN Abschnitt (Kontingente gelten je Halbzeit). */
  timeouts: Record<Mannschaftsseite, number>;
  wechsel: Record<Mannschaftsseite, number>;
  wurf: Record<Mannschaftsseite, WurfStand>;
  /**
   * Aktuelle Feldbesetzung (Spieler-IDs, max. 3): letztes AUF-Event je Mannschaft,
   * fortgeschrieben durch E-Wechsel. Leeres Array = noch keine Aufstellung gebucht.
   */
  feld: Record<Mannschaftsseite, string[]>;
  /** Letzter Wurf ohne nachfolgende Kontrolle/Tor - Grundlage fuer die Timer-A-Anzeige (Spez. 6.2). */
  letzterWurf?: { mannschaft: Mannschaftsseite; zeitstempel: string };
  /** Letzte Kontrolle - Grundlage fuer die Timer-B-Anzeige. */
  letzteKontrolle?: { mannschaft: Mannschaftsseite; zeitstempel: string };
  /** Wurde das Spiel schon angepfiffen (mindestens ein wirksames GO)? Nur fuer die Statusanzeige. */
  spielGestartet: boolean;
  /** Uhr steht wegen Halbzeit/Pause (B/VB) und lief seither nicht wieder - Statusanzeige "Pause". */
  inPause: boolean;
  spielBeendet: boolean;
  abgeschlossen: boolean;
  /** IDs der annullierten Events (fuer die durchgestrichene Darstellung in der Ereignisliste). */
  annullierteIds: Set<string>;
  /** Aktuelle Regel-Hinweise (warnen, nie blockieren - Grundsatz des Projekts). */
  hinweise: string[];
}

export interface StandKontext {
  timeoutsJeHalbzeit: number;
  auswechslungenJeHalbzeit: number;
  tordifferenzAbbruch: boolean;
  tordifferenzLimit: number;
}

/** Tie-Break wie im Backend-Pendant (ereignisse.ts): gleiche Sequenz deterministisch ordnen. */
function sortiertNachSequenz(events: Event[]): Event[] {
  return [...events].sort(
    (a, b) => a.sequenz - b.sequenz || a.zeitstempel.localeCompare(b.zeitstempel) || a._id.localeCompare(b._id),
  );
}

/**
 * Annullierungs-Status aller Events (Korrektur-Semantik, Konzept Abschnitt 3.1) - inhaltlich
 * identisch zu backend/src/protokoll/ereignisse.ts::wirksameEvents (bewusstes Duplikat, s.o.).
 */
export function annullierteIds(events: Event[]): Set<string> {
  const sortiert = sortiertNachSequenz(events);
  const proId = new Map(sortiert.map((e) => [e._id, e]));
  const annulliert = new Set<string>();
  for (let i = sortiert.length - 1; i >= 0; i--) {
    const e = sortiert[i];
    if (annulliert.has(e._id)) continue;
    if (!e.istKorrektur || !e.korrigiertEventId) continue;
    const ziel = proId.get(e.korrigiertEventId);
    if (!ziel) continue;
    if (ziel.eventTyp === "PROT" && e.eventTyp !== "ANNULLIERT") continue; // Ergaenzung
    annulliert.add(ziel._id);
  }
  return annulliert;
}

const ABSCHNITTS_FOLGE: Halbzeit[] = ["1", "2", "V1", "V2", "FW"];

function gegenseite(seite: Mannschaftsseite): Mannschaftsseite {
  return seite === "A" ? "B" : "A";
}

function sekundenZwischen(vonIso: string, bisIso: string): number {
  return Math.max(0, Math.round((new Date(bisIso).getTime() - new Date(vonIso).getTime()) / 1000));
}

/** Berechnet den kompletten Live-Zustand aus dem Event-Strom (Reihenfolge = Server-Sequenz). */
export function berechneProtokollStand(events: Event[], kontext: StandKontext): ProtokollStand {
  const annulliert = annullierteIds(events);
  const wirksam = sortiertNachSequenz(events).filter((e) => !annulliert.has(e._id) && e.eventTyp !== "ANNULLIERT");

  const stand: ProtokollStand = {
    ergebnisA: 0,
    ergebnisB: 0,
    abschnitt: "1",
    abschnittNummer: 1,
    uhrLaeuft: false,
    gespielteSekunden: 0,
    fouls: { A: 0, B: 0 },
    timeouts: { A: 0, B: 0 },
    wechsel: { A: 0, B: 0 },
    wurf: { A: { anzahl: 0 }, B: { anzahl: 0 } },
    feld: { A: [], B: [] },
    spielGestartet: false,
    inPause: false,
    spielBeendet: false,
    abgeschlossen: false,
    annullierteIds: annulliert,
    hinweise: [],
  };

  function uhrAnhalten(zeitstempel: string) {
    if (stand.uhrLaeuft && stand.laufendSeit) {
      stand.gespielteSekunden += sekundenZwischen(stand.laufendSeit, zeitstempel);
    }
    stand.uhrLaeuft = false;
    stand.laufendSeit = undefined;
  }

  function naechsterAbschnitt(ziel?: Halbzeit) {
    const index = ABSCHNITTS_FOLGE.indexOf(stand.abschnitt);
    stand.abschnitt = ziel ?? ABSCHNITTS_FOLGE[Math.min(index + 1, ABSCHNITTS_FOLGE.length - 1)];
    stand.abschnittNummer = ABSCHNITTS_FOLGE.indexOf(stand.abschnitt) + 1;
    stand.gespielteSekunden = 0;
    // Timeout-/Wechsel-Kontingente gelten je Halbzeit (Spez. 6.5/6.6) - Foul- und Wurfzaehler
    // dagegen NICHT (pausenuebergreifend, Spez. 6.3/6.4).
    stand.timeouts = { A: 0, B: 0 };
    stand.wechsel = { A: 0, B: 0 };
    stand.letzterWurf = undefined;
    stand.letzteKontrolle = undefined;
  }

  for (const e of wirksam) {
    switch (e.eventTyp) {
      case "GO":
        stand.uhrLaeuft = true;
        stand.laufendSeit = e.zeitstempel;
        stand.spielGestartet = true;
        stand.inPause = false;
        break;
      case "STOP":
        uhrAnhalten(e.zeitstempel);
        break;
      case "B":
        uhrAnhalten(e.zeitstempel);
        stand.inPause = true;
        // Aus Halbzeit 1 -> 2; aus einer Verlaengerungshaelfte heraus dient B als Pause vor der
        // naechsten (V1 -> V2 erfolgt aber ueber das zweite VB-Event, nicht ueber B).
        if (stand.abschnitt === "1") naechsterAbschnitt("2");
        break;
      case "VB":
        uhrAnhalten(e.zeitstempel);
        stand.inPause = true;
        naechsterAbschnitt(stand.abschnitt === "V1" ? "V2" : "V1");
        break;
      case "W":
        if (!e.mannschaft) break;
        // Zaehler laeuft nur je Spieler weiter; ein ANDERER Spieler derselben Mannschaft setzt
        // ihn zurueck (Spez. 6.3) - pausenuebergreifend, deshalb kein Reset bei B/VB.
        if (e.spielerId && stand.wurf[e.mannschaft].spielerId === e.spielerId) {
          stand.wurf[e.mannschaft].anzahl += 1;
        } else {
          stand.wurf[e.mannschaft] = { spielerId: e.spielerId, anzahl: 1 };
        }
        stand.letzterWurf = { mannschaft: e.mannschaft, zeitstempel: e.zeitstempel };
        stand.letzteKontrolle = undefined;
        break;
      case "K":
        if (e.mannschaft) stand.letzteKontrolle = { mannschaft: e.mannschaft, zeitstempel: e.zeitstempel };
        stand.letzterWurf = undefined;
        break;
      case "G": {
        if (!e.mannschaft) break;
        const gutschrift = e.istEigentor ? gegenseite(e.mannschaft) : e.mannschaft;
        if (gutschrift === "A") stand.ergebnisA += 1;
        else stand.ergebnisB += 1;
        stand.letzterWurf = undefined;
        stand.letzteKontrolle = undefined;
        break;
      }
      case "F":
        if (e.mannschaft) stand.fouls[e.mannschaft] += 1;
        break;
      case "P":
        // Foulzaehler-Reset erst, wenn das (dritte-Foul-)Penalty protokolliert ist (Spez. 6.4).
        if (e.mannschaft && stand.fouls[e.mannschaft] >= 3) stand.fouls[e.mannschaft] = 0;
        break;
      case "T":
        if (e.mannschaft) stand.timeouts[e.mannschaft] += 1;
        break;
      case "E":
        if (!e.mannschaft) break;
        stand.wechsel[e.mannschaft] += 1;
        // Feldbesetzung fortschreiben: raus ersetzt durch rein (nur wenn eine Aufstellung
        // existiert - ohne AUF-Event gibt es nichts fortzuschreiben).
        if (e.spielerId && stand.feld[e.mannschaft].length > 0) {
          stand.feld[e.mannschaft] = [
            ...stand.feld[e.mannschaft].filter((id) => id !== e.spielerRausId),
            e.spielerId,
          ].slice(0, 3);
        }
        break;
      case "AUF":
        if (e.mannschaft && Array.isArray(e.zusatz?.spielerIds)) {
          stand.feld[e.mannschaft] = (e.zusatz.spielerIds as string[]).slice(0, 3);
        }
        break;
      case "End":
        uhrAnhalten(e.zeitstempel);
        stand.spielBeendet = true;
        break;
      case "Fin":
        stand.abgeschlossen = true;
        break;
      // PA (System-Hinweis), TT, FW, HANDOVER, PROT aendern den Live-Zustand nicht.
      default:
        break;
    }
  }

  // Regel-Hinweise (Spez. 22.3) - warnen, nie blockieren.
  for (const seite of ["A", "B"] as const) {
    // Aufstellung ist Pflichtschritt vor dem Anpfiff (Nutzer-Vorgabe 21.08.2026) - solange sie
    // fehlt/unvollstaendig ist, bleibt der Hinweis stehen (nach Spielende nicht mehr relevant).
    if (!stand.spielBeendet && stand.feld[seite].length !== 3) {
      stand.hinweise.push(
        stand.feld[seite].length === 0
          ? `Mannschaft ${seite}: Aufstellung fehlt noch - vor dem Anpfiff die drei Feldspieler festlegen.`
          : `Mannschaft ${seite}: Aufstellung unvollständig (${stand.feld[seite].length} von 3 Spielern).`,
      );
    }
    const wurf = stand.wurf[seite];
    if (wurf.anzahl === 3) stand.hinweise.push(`Mannschaft ${seite}: 3. Wurf in Folge - nächster Wurf wäre ein Foul.`);
    if (wurf.anzahl >= 4) stand.hinweise.push(`Mannschaft ${seite}: 4. Wurf in Folge - möglicher Foul-Hinweis!`);
    if (stand.fouls[seite] >= 3) stand.hinweise.push(`Mannschaft ${seite}: 3. Foul - Penalty fällig.`);
    if (stand.timeouts[seite] > kontext.timeoutsJeHalbzeit) {
      stand.hinweise.push(`Mannschaft ${seite}: Timeout-Kontingent überschritten - Team-Penalty-Hinweis.`);
    }
    if (stand.wechsel[seite] > kontext.auswechslungenJeHalbzeit) {
      stand.hinweise.push(`Mannschaft ${seite}: Auswechslungs-Kontingent überschritten.`);
    }
  }
  if (kontext.tordifferenzAbbruch && Math.abs(stand.ergebnisA - stand.ergebnisB) >= kontext.tordifferenzLimit) {
    stand.hinweise.push(
      `Tordifferenz von ${kontext.tordifferenzLimit} erreicht - der Schiedsrichter kann das Spiel beenden.`,
    );
  }

  return stand;
}

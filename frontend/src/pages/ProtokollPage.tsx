import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { MannschaftImTurnier, Mannschaftsseite, Spiel, Spieler, Spielprotokoll, Turnier } from "@torball/shared";
import {
  getMannschaften,
  getSpiele,
  getSpieler,
  getSpielProtokoll,
  getTurnier,
  protokollAnlegen,
  protokollAnzeigeSetzen,
  protokollBestaetigen,
  protokollEventSenden,
  protokollUnterschreiben,
  type NeuesProtokollEvent,
  type ProtokollEvent,
} from "../api";
import { berechneProtokollStand, type ProtokollStand } from "../protokoll/stand";
import {
  AKTIONS_BESCHRIFTUNG,
  LEERER_ZUSTAND,
  NUMMERN_JE_AKTION,
  TASTATUR_BELEGUNG,
  verarbeiteTaste,
  type EingabeBefehl,
  type EingabeZustand,
  type Taste,
  type UiAktion,
} from "../protokoll/eingabe";

/** Intervall fuers Nachladen fremder Events (z.B. zweites, nur lesendes Geraet). */
const AKTUALISIER_INTERVALL_MS = 15_000;
/** Automatischer Reset einer offenen, nicht abgeschlossenen Eingabe (Panel-Konzept, Punkt 2). */
const EINGABE_RESET_MS = 10_000;
/** 8-Sekunden-Regel (Spez. 6.2) - Anzeigedauer der beiden Timer. */
const ACHT_SEKUNDEN_MS = 8_000;

function formatiereSpielzeit(sekunden: number): string {
  const s = Math.max(0, Math.floor(sekunden));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const ABSCHNITT_BESCHRIFTUNG: Record<string, string> = {
  "1": "1. Halbzeit",
  "2": "2. Halbzeit",
  V1: "1. Verlängerung",
  V2: "2. Verlängerung",
  FW: "Freiwurfschießen",
};

const EVENT_BESCHRIFTUNG: Record<string, string> = {
  GO: "Uhr gestartet",
  STOP: "Uhr angehalten",
  B: "Halbzeit/Pause",
  VB: "Verlängerung",
  End: "Spielende",
  Fin: "Abschluss",
  W: "Wurf",
  K: "Kontrolle",
  G: "Tor",
  F: "Foul",
  P: "Penalty",
  PA: "Penalty-Hinweis (automatisch)",
  T: "Timeout",
  TT: "Technischer Timeout",
  E: "Wechsel",
  FW: "Freiwurf",
  HANDOVER: "Protokollantenwechsel",
  PROT: "Protest",
  AUF: "Aufstellung",
  ANNULLIERT: "Streichung",
};

/**
 * Live-Protokollierung eines Spiels (Konzept Abschnitt 7): Scoreboard + Timer + Eingabe per
 * Bildschirm-Buttons UND Tastatur (dieselbe Zustandsmaschine, die spaeter auch das HID-Panel
 * bedient), Ereignisliste mit Undo, Abschluss-Workflow. Liegt bewusst AUSSERHALB von
 * GeschuetzteRoute - der Zugriff laeuft rein serverseitig ueber das Session-Cookie (Benutzer-
 * ODER Turnier-Code-Session, insbesondere der Protokollant-Code).
 */
export function ProtokollPage() {
  const { turnierId, spielId } = useParams<{ turnierId: string; spielId: string }>();
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [spiel, setSpiel] = useState<Spiel | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [kader, setKader] = useState<Record<Mannschaftsseite, Spieler[]>>({ A: [], B: [] });
  const [protokoll, setProtokoll] = useState<Spielprotokoll | undefined>();
  const [events, setEvents] = useState<ProtokollEvent[]>([]);
  const [ohneProtokoll, setOhneProtokoll] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [hinweisKurz, setHinweisKurz] = useState<string | undefined>();
  const [eingabe, setEingabeState] = useState<EingabeZustand>(LEERER_ZUSTAND);
  // Spiegel des Eingabe-Zustands fuer taste(): der keydown-Listener haengt an window und wuerde
  // sonst einen veralteten Zustand aus seinem Closure sehen. WICHTIG: Befehle (Events senden)
  // duerfen NIE im setState-Updater ausgefuehrt werden - React ruft Updater im StrictMode
  // doppelt auf, was hier live zu doppelt gebuchten Events (inkl. Sequenz-Kollisionen durch
  // parallele Requests) gefuehrt hat.
  const eingabeRef = useRef<EingabeZustand>(LEERER_ZUSTAND);
  const setEingabe = useCallback((wert: EingabeZustand | ((alt: EingabeZustand) => EingabeZustand)) => {
    eingabeRef.current = typeof wert === "function" ? wert(eingabeRef.current) : wert;
    setEingabeState(eingabeRef.current);
  }, []);
  const [nameEingabe, setNameEingabe] = useState("");
  const [unterschriftName, setUnterschriftName] = useState("");
  const [protestTeam, setProtestTeam] = useState<Mannschaftsseite>("A");
  const [protestText, setProtestText] = useState("");
  const [handoverName, setHandoverName] = useState("");
  const [sendetGerade, setSendetGerade] = useState(false);
  // Entwurf der Aufstellungs-Auswahl je Team (max. 3) - wird beim Laden/nach fremden Events aus
  // der berechneten Feldbesetzung uebernommen, waehrend des Auswaehlens aber nicht ueberschrieben.
  const [aufstellungsWahl, setAufstellungsWahl] = useState<Record<Mannschaftsseite, string[]>>({ A: [], B: [] });
  const [aufstellungOffen, setAufstellungOffen] = useState(false);
  const feldStandRef = useRef("");
  // Nur fuer die tickenden Anzeigen (Uhr, 8-Sekunden-Timer) - erzwingt regelmaessiges Rendern.
  const [, setTick] = useState(0);

  const kurzHinweisTimer = useRef<number | undefined>(undefined);
  function zeigeKurzHinweis(text: string) {
    setHinweisKurz(text);
    window.clearTimeout(kurzHinweisTimer.current);
    kurzHinweisTimer.current = window.setTimeout(() => setHinweisKurz(undefined), 4000);
  }

  const laden = useCallback(async () => {
    if (!turnierId || !spielId) return;
    try {
      const [t, m, spiele] = await Promise.all([getTurnier(turnierId), getMannschaften(turnierId), getSpiele(turnierId)]);
      setTurnier(t);
      setMannschaften(m);
      const dasSpiel = spiele.find((s) => s._id === spielId);
      setSpiel(dasSpiel);
      if (dasSpiel) {
        const [kaderA, kaderB] = await Promise.all([
          getSpieler(dasSpiel.mannschaftAId),
          getSpieler(dasSpiel.mannschaftBId),
        ]);
        // Immer nach Trikotnummer sortiert (Nutzer-Vorgabe 21.08.2026), nicht nach Anlage-Reihenfolge.
        const nachNummer = (a: Spieler, b: Spieler) =>
          a.trikotnummer.localeCompare(b.trikotnummer, undefined, { numeric: true });
        setKader({ A: [...kaderA].sort(nachNummer), B: [...kaderB].sort(nachNummer) });
      }
      try {
        const daten = await getSpielProtokoll(spielId);
        setProtokoll(daten.protokoll);
        setEvents(daten.events);
        setOhneProtokoll(false);
      } catch {
        setOhneProtokoll(true);
      }
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [turnierId, spielId]);

  useEffect(() => {
    laden();
  }, [laden]);

  // Fremde Events nachladen (z.B. ein zweites, nur lesendes Geraet) - Muster wie ueberall im
  // Projekt: nur bei sichtbarem Tab, plus sofort bei Rueckkehr.
  useEffect(() => {
    if (!spielId || !protokoll) return;
    const aktualisieren = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const daten = await getSpielProtokoll(spielId);
        setProtokoll(daten.protokoll);
        setEvents(daten.events);
      } catch {
        /* stiller Poll-Fehler */
      }
    };
    const intervall = setInterval(aktualisieren, AKTUALISIER_INTERVALL_MS);
    document.addEventListener("visibilitychange", aktualisieren);
    return () => {
      clearInterval(intervall);
      document.removeEventListener("visibilitychange", aktualisieren);
    };
  }, [spielId, protokoll?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tickende Anzeigen (Spieluhr, Timer A/B).
  useEffect(() => {
    const intervall = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(intervall);
  }, []);

  const stand: ProtokollStand | undefined = useMemo(() => {
    if (!turnier) return undefined;
    return berechneProtokollStand(events, {
      timeoutsJeHalbzeit: turnier.timeoutsJeHalbzeit,
      auswechslungenJeHalbzeit: turnier.auswechslungenJeHalbzeit,
      tordifferenzAbbruch: turnier.tordifferenzAbbruch,
      tordifferenzLimit: turnier.tordifferenzLimit,
    });
  }, [events, turnier]);

  // Automatischer Reset einer offenen Eingabe nach Inaktivitaet (Panel-Konzept, Punkt 2).
  useEffect(() => {
    if (!eingabe.aktion && eingabe.aktuelleNummer === "") return;
    const timer = window.setTimeout(() => {
      setEingabe((z) => ({ ...LEERER_ZUSTAND, team: z.team }));
      zeigeKurzHinweis("Offene Eingabe nach 10 Sekunden verworfen.");
    }, EINGABE_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [eingabe, setEingabe]);

  // Aufstellungs-Entwurf mit der berechneten Feldbesetzung synchron halten (nur wenn die sich
  // tatsaechlich aendert - sonst wuerde jede laufende Auswahl beim naechsten Tick ueberschrieben).
  useEffect(() => {
    if (!stand) return;
    const key = JSON.stringify(stand.feld);
    if (key !== feldStandRef.current) {
      feldStandRef.current = key;
      setAufstellungsWahl({ A: stand.feld.A, B: stand.feld.B });
    }
  }, [stand]);

  const nameVon = (mannschaftId?: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? "?";
  const teamName = (seite: Mannschaftsseite) =>
    nameVon(seite === "A" ? spiel?.mannschaftAId : spiel?.mannschaftBId);
  const spielerVon = (seite: Mannschaftsseite, nummer: string) =>
    kader[seite].find((s) => s.trikotnummer === nummer);
  const spielerName = (spielerId?: string) => {
    const s = [...kader.A, ...kader.B].find((k) => k._id === spielerId);
    return s ? `Nr. ${s.trikotnummer} ${s.vorname ? `${s.vorname} ` : ""}${s.name}` : undefined;
  };

  /** Aktuelle Spielzeit in Sekunden (abgeschlossene Laufphasen + laufende Phase). */
  function aktuelleSpielzeit(): number {
    if (!stand) return 0;
    let sekunden = stand.gespielteSekunden;
    if (stand.uhrLaeuft && stand.laufendSeit) {
      sekunden += (Date.now() - new Date(stand.laufendSeit).getTime()) / 1000;
    }
    return sekunden;
  }

  async function sende(eventDaten: NeuesProtokollEvent): Promise<boolean> {
    if (!protokoll) return false;
    try {
      setSendetGerade(true);
      const antwort = await protokollEventSenden(protokoll._id, {
        spielzeit: Math.round(aktuelleSpielzeit()),
        halbzeit: stand?.abschnitt,
        ...eventDaten,
      });
      setEvents((alt) => [...alt, antwort.event]);
      setProtokoll(antwort.protokoll);
      setSpiel(antwort.spiel);
      setFehler(undefined);
      return true;
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
      return false;
    } finally {
      setSendetGerade(false);
    }
  }

  async function fuehreBefehlAus(befehl: EingabeBefehl, vorher: EingabeZustand) {
    switch (befehl.typ) {
      case "uhr":
        if (vorher.aktion) zeigeKurzHinweis("Offene Eingabe verworfen.");
        await sende({ eventTyp: stand?.uhrLaeuft ? "STOP" : "GO" });
        return;
      case "halbzeit":
        if (vorher.aktion) zeigeKurzHinweis("Offene Eingabe verworfen.");
        await sende({ eventTyp: "B" });
        return;
      case "eingabeVerworfen":
        zeigeKurzHinweis("Eingabe verworfen.");
        return;
      case "undo":
        await undoLetztes();
        return;
      case "buchen":
        await buche(befehl.team, befehl.aktion, befehl.nummern);
        return;
    }
  }

  async function buche(team: Mannschaftsseite, aktion: UiAktion, nummern: string[]) {
    // Spielernummern gegen den Kader aufloesen - ohne Treffer wird nicht gebucht (Hinweis).
    const spielerIds: string[] = [];
    for (const nummer of nummern) {
      const spieler = spielerVon(team, nummer);
      if (!spieler) {
        zeigeKurzHinweis(`Nummer ${nummer} ist nicht im Kader von ${teamName(team)} - nicht gebucht.`);
        return;
      }
      spielerIds.push(spieler._id);
    }
    // Feldbesetzungs-Pruefungen (Spez. 22.3) - warnen, nie blockieren: gebucht wird trotzdem.
    if (stand && stand.feld[team].length > 0) {
      const aufFeld = (id: string) => stand.feld[team].includes(id);
      if (["tor", "fehlwurf", "foul", "freiwurf"].includes(aktion) && spielerIds[0] && !aufFeld(spielerIds[0])) {
        zeigeKurzHinweis(`Hinweis: Nr. ${nummern[0]} steht laut Aufstellung nicht auf dem Feld.`);
      }
      if (aktion === "wechsel") {
        if (spielerIds[0] && !aufFeld(spielerIds[0])) {
          zeigeKurzHinweis(`Hinweis: Nr. ${nummern[0]} (raus) steht laut Aufstellung nicht auf dem Feld.`);
        } else if (spielerIds[1] && aufFeld(spielerIds[1])) {
          zeigeKurzHinweis(`Hinweis: Nr. ${nummern[1]} (rein) steht bereits auf dem Feld.`);
        }
      }
    }
    switch (aktion) {
      case "tor":
        // Tor = W+G-Doppel-Event (Konzept 3.3): erst der Wurf (3-Wurf-Zaehler), dann das Tor.
        if (await sende({ eventTyp: "W", mannschaft: team, spielerId: spielerIds[0] })) {
          await sende({ eventTyp: "G", mannschaft: team, spielerId: spielerIds[0] });
        }
        return;
      case "eigentor":
        await sende({ eventTyp: "G", mannschaft: team, istEigentor: true });
        return;
      case "fehlwurf":
        await sende({ eventTyp: "W", mannschaft: team, spielerId: spielerIds[0] });
        return;
      case "kontrolle":
        await sende({ eventTyp: "K", mannschaft: team });
        return;
      case "foul": {
        const gebucht = await sende({ eventTyp: "F", mannschaft: team, spielerId: spielerIds[0] });
        // Drittes Foul: automatischer System-Hinweis PA (Spez. 22.2) - das echte Penalty bucht
        // der Protokollant weiterhin selbst (erst DAS setzt den Foulzaehler zurueck).
        if (gebucht && stand && stand.fouls[team] + 1 >= 3) {
          await sende({ eventTyp: "PA", mannschaft: team });
        }
        return;
      }
      case "strafwurf":
        await sende({ eventTyp: "P", mannschaft: team });
        return;
      case "auszeit":
        await sende({ eventTyp: "T", mannschaft: team });
        return;
      case "techauszeit":
        await sende({ eventTyp: "TT", mannschaft: team });
        return;
      case "wechsel":
        await sende({ eventTyp: "E", mannschaft: team, spielerRausId: spielerIds[0], spielerId: spielerIds[1] });
        return;
      case "freiwurf":
        await sende({ eventTyp: "FW", mannschaft: team, spielerId: spielerIds[0] });
        return;
    }
  }

  function wirksameSortiert(): ProtokollEvent[] {
    if (!stand) return [];
    return events
      .filter((e) => !stand.annullierteIds.has(e._id) && e.eventTyp !== "ANNULLIERT")
      .sort((a, b) => a.sequenz - b.sequenz);
  }

  /**
   * Streicht ein beliebiges wirksames Event (ersatzlose ANNULLIERT-Korrektur) - ein Tor
   * (W+G-Paar) wird als Ganzes gestrichen. Genutzt vom Undo (letztes Event) UND vom
   * Streichen-Knopf in der Ereignisliste (aeltere Events, zwischen denen schon weitere
   * Aktionen liegen - z.B. ein falsches Foul nach zwischenzeitlichem Uhr-Stopp).
   */
  async function streiche(ziel: ProtokollEvent) {
    const wirksam = wirksameSortiert();
    if (await sende({ eventTyp: "ANNULLIERT", istKorrektur: true, korrigiertEventId: ziel._id })) {
      // Tor-Doppel-Event: das direkt vorausgehende W desselben Spielers gehoert zum Tor dazu.
      const index = wirksam.findIndex((e) => e._id === ziel._id);
      const davor = index > 0 ? wirksam[index - 1] : undefined;
      if (
        ziel.eventTyp === "G" &&
        !ziel.istEigentor &&
        davor?.eventTyp === "W" &&
        davor.sequenz === ziel.sequenz - 1 &&
        davor.spielerId === ziel.spielerId
      ) {
        await sende({ eventTyp: "ANNULLIERT", istKorrektur: true, korrigiertEventId: davor._id });
      }
      zeigeKurzHinweis(`Gestrichen: ${EVENT_BESCHRIFTUNG[ziel.eventTyp]}.`);
    }
  }

  /** Undo: streicht das letzte wirksame Event. */
  async function undoLetztes() {
    const wirksam = wirksameSortiert();
    const letztes = wirksam[wirksam.length - 1];
    if (!letztes) {
      zeigeKurzHinweis("Nichts zum Rückgängigmachen.");
      return;
    }
    await streiche(letztes);
  }

  function taste(t: Taste) {
    if (!protokoll || stand?.abgeschlossen || sendetGerade) return;
    const vorher = eingabeRef.current;
    const ergebnis = verarbeiteTaste(vorher, t, { einstelligeNummern: turnier?.einstelligeTrikotnummern ?? true });
    setEingabe(ergebnis.zustand);
    // Befehl bewusst AUSSERHALB des setState-Updaters ausfuehren (siehe Kommentar an eingabeRef).
    if (ergebnis.befehl) void fuehreBefehlAus(ergebnis.befehl, vorher);
  }

  // Tastatur-Bedienung - dieselbe Zustandsmaschine wie die Buttons (und spaeter das HID-Panel).
  useEffect(() => {
    function beiTaste(e: KeyboardEvent) {
      const ziel = e.target as HTMLElement | null;
      if (ziel && ["INPUT", "TEXTAREA", "SELECT"].includes(ziel.tagName)) return;
      const belegt = TASTATUR_BELEGUNG[e.key.toLowerCase()];
      if (!belegt) return;
      e.preventDefault();
      taste(belegt);
    }
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protokoll?._id, stand?.abgeschlossen, stand?.uhrLaeuft, sendetGerade, events]);

  async function starteProtokoll(event: React.FormEvent) {
    event.preventDefault();
    if (!spielId || !nameEingabe.trim()) return;
    try {
      const neu = await protokollAnlegen(spielId, nameEingabe.trim());
      setProtokoll(neu);
      setOhneProtokoll(false);
      setUnterschriftName(nameEingabe.trim());
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen");
    }
  }

  async function seitenTauschen() {
    if (!protokoll) return;
    try {
      setProtokoll(await protokollAnzeigeSetzen(protokoll._id, !protokoll.seiteAVertauscht));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  if (fehler && !turnier) return <p role="alert">{fehler}</p>;
  if (!turnier || !spiel || !stand) return <p>Lädt…</p>;

  if (turnier.protokollierungsart !== "digital") {
    return <p role="alert">Dieses Turnier verwendet keine digitale Protokollierung.</p>;
  }

  const linkeSeite: Mannschaftsseite = protokoll?.seiteAVertauscht ? "B" : "A";
  const rechteSeite: Mannschaftsseite = protokoll?.seiteAVertauscht ? "A" : "B";
  const spielzeitSekunden = aktuelleSpielzeit();
  // Abschnittsdauer: Halbzeiten laut Regel, Verlaengerung 2 Minuten (Spez. 6.7), Freiwurfschiessen
  // ohne Uhr. Die Uhr laeuft als COUNTDOWN (Restzeit, Nutzer-Vorgabe 21.08.2026) und zaehlt im
  // Ueberhang negativ weiter (Spez. 6.1: Signal, aber Spiel laeuft bis zum Abpfiff).
  const sollSekunden =
    stand.abschnitt === "FW"
      ? undefined
      : stand.abschnitt === "V1" || stand.abschnitt === "V2"
        ? 120
        : turnier.spielzeitMinuten * 60;
  const ueberhang = sollSekunden !== undefined && spielzeitSekunden > sollSekunden;
  const timerRest = (seit?: { zeitstempel: string }) =>
    seit ? Math.ceil((ACHT_SEKUNDEN_MS - (Date.now() - new Date(seit.zeitstempel).getTime())) / 1000) : undefined;
  const timerA = stand.uhrLaeuft ? timerRest(stand.letzterWurf) : undefined;
  const timerB = stand.uhrLaeuft ? timerRest(stand.letzteKontrolle) : undefined;
  const eventsAbsteigend = [...events].sort((a, b) => b.sequenz - a.sequenz);
  const aufstellungUnvollstaendig = stand.feld.A.length !== 3 || stand.feld.B.length !== 3;

  if (ohneProtokoll) {
    return (
      <>
        <h1>Spielprotokoll</h1>
        <p>
          {nameVon(spiel.mannschaftAId)} – {nameVon(spiel.mannschaftBId)}
          {spiel.runde ? ` (Spiel ${spiel.runde})` : ""}
        </p>
        {fehler && <p role="alert">{fehler}</p>}
        <p>Für dieses Spiel wurde noch kein Protokoll begonnen.</p>
        <form onSubmit={starteProtokoll}>
          <div className="feld">
            <label htmlFor="protokollantName">Name der protokollierenden Person</label>
            <input
              id="protokollantName"
              required
              autoFocus
              value={nameEingabe}
              onChange={(e) => setNameEingabe(e.target.value)}
            />
            <p className="feld-hinweis">Erscheint als „Protokollführung" auf dem Spielbericht.</p>
          </div>
          <button type="submit" disabled={!nameEingabe.trim()}>
            Protokoll beginnen
          </button>
        </form>
      </>
    );
  }

  const teamStatus = (seite: Mannschaftsseite) => (
    <div className="protokoll-teamstatus">
      <h3>{teamName(seite)}</h3>
      <p>
        Fouls: <strong>{stand.fouls[seite]}</strong> · Timeouts: {stand.timeouts[seite]}/{turnier.timeoutsJeHalbzeit} ·
        Wechsel: {stand.wechsel[seite]}/{turnier.auswechslungenJeHalbzeit}
      </p>
      <p>
        Auf dem Feld:{" "}
        {stand.feld[seite].length === 0
          ? "noch keine Aufstellung"
          : stand.feld[seite].map((id) => spielerName(id) ?? "?").join(", ")}
      </p>
      {stand.wurf[seite].spielerId && (
        <p>
          Letzter Werfer: {spielerName(stand.wurf[seite].spielerId)} ({stand.wurf[seite].anzahl}. Wurf in Folge)
        </p>
      )}
      <p className="protokoll-kader">
        Kader:{" "}
        {kader[seite].length === 0
          ? "keine Spieler erfasst"
          : kader[seite].map((s) => `${s.trikotnummer} ${s.name}`).join(", ")}
      </p>
    </div>
  );

  return (
    <div className="protokoll-seite">
      <h1>
        Spielprotokoll{spiel.runde ? ` – Spiel ${spiel.runde}` : ""}
      </h1>
      {fehler && <p role="alert">{fehler}</p>}

      {/* Scoreboard */}
      <section aria-label="Spielstand" className="protokoll-scoreboard">
        <div className="protokoll-stand">
          <span>{teamName(linkeSeite)}</span>
          <strong>
            {linkeSeite === "A" ? stand.ergebnisA : stand.ergebnisB} :{" "}
            {rechteSeite === "A" ? stand.ergebnisA : stand.ergebnisB}
          </strong>
          <span>{teamName(rechteSeite)}</span>
        </div>
        <p>
          {ABSCHNITT_BESCHRIFTUNG[stand.abschnitt]}
          {sollSekunden !== undefined && (
            <>
              {" "}· Restzeit{" "}
              <strong className={ueberhang ? "protokoll-ueberhang" : undefined}>
                {ueberhang
                  ? `-${formatiereSpielzeit(spielzeitSekunden - sollSekunden)}`
                  : formatiereSpielzeit(sollSekunden - spielzeitSekunden)}
              </strong>{" "}
              von {formatiereSpielzeit(sollSekunden)}
              {ueberhang && " (Überhang – Spiel läuft bis zum Abpfiff weiter)"}
            </>
          )}{" "}
          · {stand.uhrLaeuft ? "Uhr läuft" : "Uhr steht"}
        </p>
        {(timerA !== undefined || timerB !== undefined) && (
          <p>
            {timerA !== undefined && (
              <span className={timerA <= 0 ? "protokoll-ueberhang" : undefined}>
                8-Sekunden (nach Wurf): {Math.max(0, timerA)} s{" "}
              </span>
            )}
            {timerB !== undefined && (
              <span className={timerB <= 0 ? "protokoll-ueberhang" : undefined}>
                8-Sekunden ({teamName(stand.letzteKontrolle!.mannschaft)}, seit Kontrolle): {Math.max(0, timerB)} s
              </span>
            )}
          </p>
        )}
        <button type="button" className="button-sekundaer" onClick={seitenTauschen}>
          Seiten tauschen (nur Anzeige)
        </button>
      </section>

      <div className="protokoll-teams">
        {teamStatus(linkeSeite)}
        {teamStatus(rechteSeite)}
      </div>

      {/* Aufstellung (Nutzer-Vorgabe 21.08.2026: vor dem Anpfiff festlegen, welche Spieler auf
          dem Feld stehen). Solange eine Aufstellung fehlt/unvollstaendig ist, steht der Bereich
          automatisch offen; danach laesst er sich ueber den Knopf wieder oeffnen (z.B. fuer die
          Halbzeitpause, in der Wechsel unbegrenzt und ohne Kontingent-Anrechnung erlaubt sind). */}
      {!stand.spielBeendet && !stand.abgeschlossen && (
        <section aria-label="Aufstellung" className="protokoll-abschluss">
          {aufstellungUnvollstaendig || aufstellungOffen ? (
            <>
              <h2>Aufstellung</h2>
              <p>
                Je Mannschaft die drei Feldspieler antippen und mit „Aufstellung buchen" bestätigen –
                während des Spiels führt die Wechsel-Aktion die Feldbesetzung automatisch fort.
              </p>
              <div className="protokoll-teams">
                {([linkeSeite, rechteSeite] as Mannschaftsseite[]).map((seite) => (
                  <div key={seite} className="protokoll-teamstatus">
                    <h3>{teamName(seite)}</h3>
                    {kader[seite].length === 0 ? (
                      <p>Kein Kader erfasst – zuerst Spieler in der Mannschaftsverwaltung anlegen.</p>
                    ) : (
                      <div className="protokoll-tastengruppe" role="group" aria-label={`Aufstellung ${teamName(seite)}`}>
                        {kader[seite].map((spieler) => {
                          const gewaehlt = aufstellungsWahl[seite].includes(spieler._id);
                          return (
                            <button
                              type="button"
                              key={spieler._id}
                              aria-pressed={gewaehlt}
                              onClick={() =>
                                setAufstellungsWahl((alt) => ({
                                  ...alt,
                                  [seite]: gewaehlt
                                    ? alt[seite].filter((id) => id !== spieler._id)
                                    : alt[seite].length >= 3
                                      ? alt[seite]
                                      : [...alt[seite], spieler._id],
                                }))
                              }
                            >
                              {spieler.trikotnummer} {spieler.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={
                        aufstellungsWahl[seite].length !== 3 ||
                        JSON.stringify([...aufstellungsWahl[seite]].sort()) ===
                          JSON.stringify([...stand.feld[seite]].sort())
                      }
                      onClick={async () => {
                        if (
                          await sende({
                            eventTyp: "AUF",
                            mannschaft: seite,
                            zusatz: { spielerIds: aufstellungsWahl[seite] },
                          })
                        ) {
                          zeigeKurzHinweis(`Aufstellung ${teamName(seite)} gebucht.`);
                        }
                      }}
                    >
                      Aufstellung buchen ({aufstellungsWahl[seite].length}/3)
                    </button>
                  </div>
                ))}
              </div>
              {!aufstellungUnvollstaendig && (
                <button type="button" className="button-sekundaer" onClick={() => setAufstellungOffen(false)}>
                  Aufstellung schließen
                </button>
              )}
            </>
          ) : (
            <button type="button" className="button-sekundaer" onClick={() => setAufstellungOffen(true)}>
              Aufstellung ändern
            </button>
          )}
        </section>
      )}

      {/* Regel-Hinweise - warnen, nie blockieren. */}
      <div aria-live="polite">
        {stand.hinweise.map((h) => (
          <p key={h} className="schiri-warnung">
            ⚠ {h}
          </p>
        ))}
        {hinweisKurz && <p className="gespeichert-hinweis">{hinweisKurz}</p>}
      </div>

      {/* Eingabe */}
      {!stand.abgeschlossen && (
        <section aria-label="Ereignis erfassen" className="protokoll-eingabe">
          <div
            className={`protokoll-kontext ${eingabe.team ? `protokoll-kontext-${eingabe.team.toLowerCase()}` : ""}`}
            aria-live="polite"
          >
            {eingabe.team ? (
              <>
                <strong>{teamName(eingabe.team)}</strong>
                {!eingabe.aktion && <> · Ziffer bucht direkt einen Wurf</>}
                {eingabe.aktion && <> · {AKTIONS_BESCHRIFTUNG[eingabe.aktion]}</>}
                {(eingabe.nummern.length > 0 || eingabe.aktuelleNummer) && (
                  <> · Nr. {[...eingabe.nummern, eingabe.aktuelleNummer].filter(Boolean).join(" → ")}</>
                )}
                {eingabe.aktion && NUMMERN_JE_AKTION[eingabe.aktion] > 0 && (
                  <> (Spielernummer tippen, mit OK bestätigen)</>
                )}
              </>
            ) : (
              <>Kein Team gewählt – zuerst Team wählen (Taste A/B)</>
            )}
          </div>

          <div className="protokoll-tastenfeld">
            <div className="protokoll-tastengruppe" role="group" aria-label="Team wählen">
              <button type="button" aria-pressed={eingabe.team === "A"} onClick={() => taste({ art: "team", team: "A" })}>
                Team A – {teamName("A")}
              </button>
              <button type="button" aria-pressed={eingabe.team === "B"} onClick={() => taste({ art: "team", team: "B" })}>
                Team B – {teamName("B")}
              </button>
            </div>
            <div className="protokoll-tastengruppe" role="group" aria-label="Aktionen">
              {(Object.keys(AKTIONS_BESCHRIFTUNG) as UiAktion[]).map((aktion) => (
                <button
                  type="button"
                  key={aktion}
                  disabled={!eingabe.team}
                  aria-pressed={eingabe.aktion === aktion}
                  onClick={() => taste({ art: "aktion", aktion })}
                >
                  {AKTIONS_BESCHRIFTUNG[aktion]}
                </button>
              ))}
            </div>
            <div className="protokoll-tastengruppe" role="group" aria-label="Spielernummern">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((z) => (
                <button
                  type="button"
                  key={z}
                  disabled={!eingabe.team || (eingabe.aktion !== null && NUMMERN_JE_AKTION[eingabe.aktion] === 0)}
                  onClick={() => taste({ art: "ziffer", ziffer: z })}
                >
                  {z}
                </button>
              ))}
            </div>
            <div className="protokoll-tastengruppe" role="group" aria-label="Steuerung">
              <button type="button" onClick={() => taste({ art: "uhr" })}>
                {stand.uhrLaeuft ? "Uhr Stop" : "Uhr Start"} (Leertaste)
              </button>
              <button type="button" onClick={() => taste({ art: "halbzeit" })}>
                Halbzeit (H)
              </button>
              <button type="button" disabled={!eingabe.aktion} onClick={() => taste({ art: "ok" })}>
                OK (Enter)
              </button>
              <button type="button" className="button-sekundaer" onClick={() => taste({ art: "undo" })}>
                Rückgängig (Backspace)
              </button>
              <button type="button" className="button-sekundaer" onClick={() => taste({ art: "verwerfen" })}>
                Eingabe verwerfen (Esc)
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Abschluss-Workflow (Spez. 7.4) */}
      <section aria-label="Spielabschluss" className="protokoll-abschluss">
        <h2>Spielabschluss</h2>
        {!stand.spielBeendet && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Spielende erfassen? Korrekturen bleiben bis zum Abschluss möglich.")) {
                void sende({ eventTyp: "End" });
              }
            }}
          >
            Spielende erfassen
          </button>
        )}
        {stand.spielBeendet && !stand.abgeschlossen && (
          <>
            {protokoll?.protokollantName ? (
              <p>Unterschrieben von {protokoll.protokollantName}.</p>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!protokoll || !unterschriftName.trim()) return;
                  try {
                    setProtokoll(await protokollUnterschreiben(protokoll._id, unterschriftName.trim()));
                    setFehler(undefined);
                  } catch (err) {
                    setFehler(err instanceof Error ? err.message : "Unbekannter Fehler");
                  }
                }}
              >
                <div className="feld">
                  <label htmlFor="unterschrift">Unterschrift (Name der protokollierenden Person)</label>
                  <input
                    id="unterschrift"
                    required
                    value={unterschriftName}
                    onChange={(e) => setUnterschriftName(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={!unterschriftName.trim()}>
                  Unterschreiben
                </button>
              </form>
            )}
            <button
              type="button"
              disabled={!protokoll?.protokollantName}
              onClick={() => {
                if (window.confirm("Protokoll endgültig abschließen? Danach sind keine Änderungen mehr möglich.")) {
                  void sende({ eventTyp: "Fin" });
                }
              }}
            >
              Protokoll abschließen
            </button>
          </>
        )}
        {stand.abgeschlossen && (
          <p>
            Das Protokoll ist abgeschlossen.
            {turnier.protokollBestaetigungErforderlich &&
              (protokoll?.turnierleitungBestaetigtAm
                ? ` Bestätigt durch ${protokoll.turnierleitungBestaetigtVonName ?? "die Turnierleitung"}.`
                : " Die Bestätigung der Turnierleitung steht noch aus.")}
          </p>
        )}
        {stand.abgeschlossen &&
          turnier.protokollBestaetigungErforderlich &&
          protokoll &&
          !protokoll.turnierleitungBestaetigtAm && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const antwort = await protokollBestaetigen(protokoll._id);
                  setProtokoll(antwort.protokoll);
                  setSpiel(antwort.spiel);
                  setFehler(undefined);
                } catch (err) {
                  setFehler(err instanceof Error ? err.message : "Unbekannter Fehler");
                }
              }}
            >
              Als Turnierleitung bestätigen
            </button>
          )}
      </section>

      {/* Sonderfaelle: Protokollantenwechsel + Protest */}
      {!stand.abgeschlossen && (
        <details className="protokoll-sonderfaelle">
          <summary>Protokollantenwechsel / Protest</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!handoverName.trim()) return;
              if (
                await sende({
                  eventTyp: "HANDOVER",
                  zusatz: { neuerProtokollant: handoverName.trim() },
                  erstelltVonName: handoverName.trim(),
                })
              ) {
                setUnterschriftName(handoverName.trim());
                setHandoverName("");
                zeigeKurzHinweis("Protokollantenwechsel erfasst.");
              }
            }}
          >
            <div className="feld">
              <label htmlFor="handoverName">Protokollantenwechsel – Name der übernehmenden Person</label>
              <input id="handoverName" value={handoverName} onChange={(e) => setHandoverName(e.target.value)} />
            </div>
            <button type="submit" disabled={!handoverName.trim()}>
              Wechsel erfassen
            </button>
          </form>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!protestText.trim()) return;
              if (
                await sende({
                  eventTyp: "PROT",
                  mannschaft: protestTeam,
                  zusatz: { begruendung: protestText.trim(), entscheidung: null },
                })
              ) {
                setProtestText("");
                zeigeKurzHinweis("Protest vermerkt.");
              }
            }}
          >
            <div className="feld">
              <label htmlFor="protestTeam">Protest – protestierende Mannschaft</label>
              <select
                id="protestTeam"
                value={protestTeam}
                onChange={(e) => setProtestTeam(e.target.value as Mannschaftsseite)}
              >
                <option value="A">{teamName("A")}</option>
                <option value="B">{teamName("B")}</option>
              </select>
            </div>
            <div className="feld">
              <label htmlFor="protestText">Begründung</label>
              <textarea id="protestText" value={protestText} onChange={(e) => setProtestText(e.target.value)} />
            </div>
            <button type="submit" disabled={!protestText.trim()}>
              Protest vermerken
            </button>
          </form>
        </details>
      )}

      {/* Ereignisliste */}
      <section aria-label="Ereignisliste">
        <h2>Ereignisse</h2>
        {events.length === 0 ? (
          <p>Noch keine Ereignisse erfasst.</p>
        ) : (
          <div className="tabellen-wrapper">
            <table>
              <caption className="sr-only">Alle protokollierten Ereignisse, neueste zuerst</caption>
              <thead>
                <tr>
                  <th scope="col">Nr.</th>
                  <th scope="col">Spielzeit</th>
                  <th scope="col">Ereignis</th>
                  <th scope="col">Mannschaft</th>
                  <th scope="col">Spieler</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {eventsAbsteigend.map((e) => {
                  const gestrichen = stand.annullierteIds.has(e._id);
                  return (
                    <tr key={e._id} className={gestrichen ? "protokoll-gestrichen" : undefined}>
                      <td>{e.sequenz}</td>
                      <td>{e.spielzeit !== undefined ? formatiereSpielzeit(e.spielzeit) : "–"}</td>
                      <td>
                        {EVENT_BESCHRIFTUNG[e.eventTyp] ?? e.eventTyp}
                        {e.istEigentor && " (Eigentor)"}
                        {e.eventTyp === "ANNULLIERT" && e.korrigiertEventId && (
                          <> von Nr. {events.find((x) => x._id === e.korrigiertEventId)?.sequenz ?? "?"}</>
                        )}
                        {gestrichen && <span className="sr-only"> (gestrichen)</span>}
                        {e.eventTyp === "HANDOVER" && e.zusatz?.neuerProtokollant != null && (
                          <> → {String(e.zusatz.neuerProtokollant)}</>
                        )}
                        {e.eventTyp === "PROT" && e.zusatz?.begruendung != null && (
                          <>: {String(e.zusatz.begruendung)}</>
                        )}
                        {e.eventTyp === "AUF" && Array.isArray(e.zusatz?.spielerIds) && (
                          <>
                            :{" "}
                            {(e.zusatz.spielerIds as string[])
                              .map((id) => spielerName(id) ?? "?")
                              .join(", ")}
                          </>
                        )}
                      </td>
                      <td>{e.mannschaft ? teamName(e.mannschaft) : "–"}</td>
                      <td>
                        {spielerName(e.spielerId) ?? "–"}
                        {e.spielerRausId && ` (für ${spielerName(e.spielerRausId) ?? "?"})`}
                      </td>
                      <td>
                        {!gestrichen && e.eventTyp !== "ANNULLIERT" && !stand.abgeschlossen && (
                          <button
                            type="button"
                            className="symbol-button button-loeschen"
                            aria-label={`${EVENT_BESCHRIFTUNG[e.eventTyp] ?? e.eventTyp} (Nr. ${e.sequenz}) streichen`}
                            title="Streichen"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Ereignis Nr. ${e.sequenz} (${EVENT_BESCHRIFTUNG[e.eventTyp] ?? e.eventTyp}) streichen?`,
                                )
                              ) {
                                void streiche(e);
                              }
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p>
          Protokollführung: {protokoll?.ersterProtokollantName}
          {events
            .filter((e) => e.eventTyp === "HANDOVER" && !stand.annullierteIds.has(e._id))
            .map((e) => ` · ab ${e.spielzeit !== undefined ? formatiereSpielzeit(e.spielzeit) : "?"}: ${String(e.zusatz?.neuerProtokollant ?? "?")}`)
            .join("")}
        </p>
      </section>
    </div>
  );
}

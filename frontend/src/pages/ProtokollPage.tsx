import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import type { KanalNachricht, StandPaket } from "../schiedsrichter/kanal";
import { HERZSCHLAG_MS, oeffneKanal } from "../schiedsrichter/kanal";
import { VerbindungsFehler } from "../api";
import {
  istVorlaeufig,
  ladeWarteschlange,
  neuesWartendesEreignis,
  speichereWarteschlange,
  zuVorlaeufigemEvent,
  type WartendesEreignis,
} from "../protokoll/warteschlange";
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
  S: "Strafwurf",
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
  const navigate = useNavigate();
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [spiel, setSpiel] = useState<Spiel | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [kader, setKader] = useState<Record<Mannschaftsseite, Spieler[]>>({ A: [], B: [] });
  const [protokoll, setProtokoll] = useState<Spielprotokoll | undefined>();
  const [events, setEvents] = useState<ProtokollEvent[]>([]);
  /**
   * Ereignisse, die den Server noch nicht erreicht haben (siehe protokoll/warteschlange.ts).
   * Der Ref-Spiegel ist noetig, weil sende() auch aus dem window-keydown-Handler heraus laeuft -
   * der saehe sonst einen veralteten Stand (gleiches Muster wie eingabeRef).
   */
  const [warteschlange, setWarteschlangeState] = useState<WartendesEreignis[]>([]);
  const warteschlangeRef = useRef<WartendesEreignis[]>([]);
  const sendeLaeuftRef = useRef(false);

  /**
   * Schutz vor dem versehentlich geoeffneten FALSCHEN Protokoll (Nutzer-Vorgabe 28.08.2026).
   * Bei zwei Feldern ist genau das der wahrscheinliche Fehlgriff - und er faellt erst auf, wenn
   * schon Ereignisse im falschen Spiel stehen. Zwei Stufen:
   *   1. Beim OEFFNEN: Laeuft dieses Protokoll bereits und hat dieses Geraet es nicht selbst
   *      begonnen, kommt eine Zwischenseite mit der Frage "richtiges Spiel?".
   *   2. WAEHREND der Erfassung: Taucht ein Ereignis auf, das weder beim Oeffnen da war noch von
   *      diesem Geraet stammt, schreibt jemand parallel mit - Warnung in der Hinweiszeile.
   * Stufe 2 braucht keinen zusaetzlichen Server-Aufruf: die Seite ruft den Stand ohnehin alle
   * 15 s ab.
   */
  const [uebernahmeBestaetigt, setUebernahmeBestaetigt] = useState(false);
  const [fremdeErfassung, setFremdeErfassung] = useState(false);
  /** Ereignis-Kennungen, die beim Oeffnen schon da waren oder von diesem Geraet stammen. */
  const eigeneEventIdsRef = useRef<Set<string>>(new Set());

  /** Merker im Browserspeicher: DIESES Geraet erfasst dieses Protokoll. Dadurch fragt ein
   *  Neuladen oder ein spaeteres Zurueckkommen nicht erneut nach - nur ein fremdes Geraet. */
  const geraetNutztProtokoll = (protokollId: string): boolean => {
    try {
      return window.localStorage.getItem(`torball-protokoll-genutzt:${protokollId}`) === "ja";
    } catch {
      return false;
    }
  };
  const merkeGeraetNutztProtokoll = (protokollId: string) => {
    try {
      window.localStorage.setItem(`torball-protokoll-genutzt:${protokollId}`, "ja");
    } catch {
      /* ohne Speicher wird eben einmal mehr nachgefragt - unkritisch */
    }
  };
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
  const feldStandRef = useRef<Record<Mannschaftsseite, string>>({ A: "", B: "" });
  /**
   * Ansicht: "erfassung" = Vollbild-Protokollier-Ansicht (Standard, Nutzer-Vorgabe 21.08.2026 -
   * das IST die eigentliche Seite zum Protokollieren), "verlauf" = vollstaendige Ereignisliste
   * mit Korrekturen und Abschluss-Workflow. Esc, dann Enter wechselt zwischen beiden.
   */
  const [ansicht, setAnsicht] = useState<"erfassung" | "verlauf">("erfassung");
  const escArmedRef = useRef(0);
  // Wechsel-Popup (Nutzer-Wunsch: Bank-Spieler erscheinen nur dort, nicht im Tastenfeld).
  const [wechselSeite, setWechselSeite] = useState<Mannschaftsseite | null>(null);
  const [wechselRaus, setWechselRaus] = useState<string | null>(null);
  const [wechselRein, setWechselRein] = useState<string | null>(null);
  const wechselDialogRef = useRef<HTMLDialogElement>(null);
  // Ereignisliste der Erfassungs-Ansicht: zeigt ALLE wirksamen Ereignisse in einem Fenster von
  // fuenf Zeilen Hoehe (scrollbar); ein neues Ereignis springt automatisch wieder nach oben.
  const ereignisListeRef = useRef<HTMLDivElement>(null);
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
        // Alles, was beim Oeffnen schon da ist, gilt als "bekannt" - nur SPAETER hinzukommende
        // fremde Ereignisse deuten auf ein zweites erfassendes Geraet hin.
        daten.events.forEach((e) => eigeneEventIdsRef.current.add(e._id));
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
        // Ereignisse, die weder beim Oeffnen da waren noch von diesem Geraet stammen: Es
        // erfasst noch jemand mit. Erkennung ohne zusaetzlichen Aufruf und ohne Zeitfenster-
        // Raterei - allein daran, dass etwas Unbekanntes aufgetaucht ist.
        if (daten.events.some((e) => !eigeneEventIdsRef.current.has(e._id))) {
          setFremdeErfassung(true);
        }
        daten.events.forEach((e) => eigeneEventIdsRef.current.add(e._id));
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

  // Vollbild-Modus: solange die Erfassungs-Ansicht aktiv ist, blendet eine body-Klasse die
  // App-Kopfzeile, Banner und Fusszeile aus (CSS in index.css) - die Erfassung soll eine ganze
  // Bildschirmseite fuer sich haben (Nutzer-Vorgabe 21.08.2026).
  const erfassungAktiv =
    ansicht === "erfassung" && Boolean(protokoll) && !ohneProtokoll && protokoll?.status !== "abgeschlossen";
  useEffect(() => {
    document.body.classList.toggle("protokoll-vollbild-aktiv", erfassungAktiv);
    return () => document.body.classList.remove("protokoll-vollbild-aktiv");
  }, [erfassungAktiv]);

  useEffect(() => {
    if (ereignisListeRef.current) ereignisListeRef.current.scrollTop = 0;
  }, [events.length]);

  // Beim Oeffnen eine ggf. aus einer frueheren Sitzung liegen gebliebene Schlange uebernehmen -
  // z.B. wenn der Reiter waehrend einer Netzstoerung geschlossen oder neu geladen wurde.
  useEffect(() => {
    if (!protokoll) return;
    const liegengeblieben = ladeWarteschlange(protokoll._id);
    if (liegengeblieben.length > 0) {
      warteschlangeRef.current = liegengeblieben;
      setWarteschlangeState(liegengeblieben);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protokoll?._id]);

  /**
   * Nachsende-Versuche: regelmaessig, solange etwas wartet, und sofort, sobald das Geraet wieder
   * online meldet oder der Reiter in den Vordergrund kommt. Bewusst kein exponentielles
   * Zurueckweichen - waehrend eines Spiels ist "schnell wieder da" wichtiger als Sparsamkeit.
   */
  useEffect(() => {
    if (warteschlange.length === 0) return;
    void arbeiteWarteschlangeAb();
    const takt = window.setInterval(() => void arbeiteWarteschlangeAb(), 3000);
    const sofort = () => void arbeiteWarteschlangeAb();
    window.addEventListener("online", sofort);
    window.addEventListener("focus", sofort);
    return () => {
      window.clearInterval(takt);
      window.removeEventListener("online", sofort);
      window.removeEventListener("focus", sofort);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warteschlange.length, protokoll?._id]);

  // Tickende Anzeigen (Spieluhr, Timer A/B).
  useEffect(() => {
    const intervall = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(intervall);
  }, []);

  /**
   * Serverbekannte Ereignisse PLUS die noch wartenden. Alles, was den Spielstand berechnet oder
   * anzeigt, arbeitet auf dieser Liste - sonst zeigte die Anzeige waehrend einer Netzstoerung
   * einen falschen Stand, und das waere schlimmer als die Stoerung selbst.
   */
  const alleEvents: ProtokollEvent[] = useMemo(() => {
    if (warteschlange.length === 0 || !protokoll || !spiel) return events;
    const letzteSequenz = events.reduce((groesste, e) => Math.max(groesste, e.sequenz), 0);
    return [
      ...events,
      ...warteschlange.map((eintrag, i) =>
        zuVorlaeufigemEvent(eintrag, {
          protokollId: protokoll._id,
          turnierId: spiel.turnierId,
          spielId: spiel._id,
          sequenz: letzteSequenz + 1 + i,
        }),
      ),
    ];
  }, [events, warteschlange, protokoll, spiel]);

  const stand: ProtokollStand | undefined = useMemo(() => {
    if (!turnier) return undefined;
    return berechneProtokollStand(alleEvents, {
      timeoutsJeHalbzeit: turnier.timeoutsJeHalbzeit,
      auswechslungenJeHalbzeit: turnier.auswechslungenJeHalbzeit,
      tordifferenzAbbruch: turnier.tordifferenzAbbruch,
      tordifferenzLimit: turnier.tordifferenzLimit,
    });
  }, [alleEvents, turnier]);

  // Rotes Aufblitzen bei NEU auftauchenden Regel-Warnungen (Nutzer-Wunsch 21.08.2026: Warnungen
  // fielen im Eifer nicht immer sofort auf). Der Zaehler remountet das Overlay (key), dadurch
  // startet die CSS-Animation auch bei schnell aufeinanderfolgenden Warnungen jedes Mal neu -
  // kein Timeout/State-Reset noetig, die Animation endet von selbst unsichtbar.
  const [fehlerBlitz, setFehlerBlitz] = useState(0);
  const bekannteHinweiseRef = useRef<Set<string> | undefined>(undefined);
  useEffect(() => {
    // Erst vergleichen, wenn Protokoll + Events geladen sind (kommen in EINER Antwort) - sonst
    // wuerde eine beim Oeffnen bereits bestehende Warnung als "neu" blitzen.
    if (!protokoll || !stand) return;
    const vorher = bekannteHinweiseRef.current;
    bekannteHinweiseRef.current = new Set(stand.hinweise);
    if (!vorher) return;
    // Aufstellungs-Erinnerungen sind Arbeitsstand beim Einrichten, keine Fehler - sie wuerden
    // sonst waehrend der Aufstellung bei jedem Klick blitzen.
    const neue = stand.hinweise.filter((h) => !vorher.has(h) && !h.includes("Aufstellung"));
    if (neue.length > 0) setFehlerBlitz((z) => z + 1);
  }, [protokoll, stand]);
  useEffect(() => {
    if (fehler) setFehlerBlitz((z) => z + 1);
  }, [fehler]);

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
    // PRO SEITE vergleichen (Nutzer-Fund 21.08.2026): das Buchen der Aufstellung von Team A
    // aendert stand.feld nur fuer A - wuerde der komplette Entwurf ersetzt, ginge die noch
    // ungebuchte Auswahl von Team B dabei verloren.
    for (const seite of ["A", "B"] as const) {
      const key = JSON.stringify(stand.feld[seite]);
      if (key !== feldStandRef.current[seite]) {
        feldStandRef.current[seite] = key;
        const neu = stand.feld[seite];
        setAufstellungsWahl((alt) => ({ ...alt, [seite]: neu }));
      }
    }
  }, [stand]);

  const nameVon = (mannschaftId?: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? "?";
  const teamName = (seite: Mannschaftsseite) =>
    nameVon(seite === "A" ? spiel?.mannschaftAId : spiel?.mannschaftBId);

  // ---------------------------------------------------------- Schiedsrichter-Anzeige speisen
  /**
   * Speist die Schiedsrichter-Anzeige im zweiten Fenster (schiedsrichter/kanal.ts). Gesendet
   * wird bei jeder Aenderung UND als Lebenszeichen alle paar Sekunden: Ohne das koennte die
   * Anzeige eine lange ereignislose Phase nicht von einem geschlossenen Protokoll-Fenster
   * unterscheiden und wuerde faelschlich auf den langsamen Server-Abruf umschalten. Ein frisch
   * geoeffnetes Anzeige-Fenster fragt zusaetzlich aktiv nach ("bitte-stand"), damit es nicht
   * bis zum naechsten Ereignis leer bleibt.
   *
   * Der Stand liegt in einer Ref, damit der Kanal EINMAL aufgesetzt wird: Ein Neuaufbau bei
   * jeder Aenderung wuerde laufende Nachrichten verlieren.
   */
  const standPaketRef = useRef<StandPaket | undefined>(undefined);
  standPaketRef.current =
    turnier && spiel && protokoll && stand
      ? {
          typ: "stand",
          turnierId: turnier._id,
          feldId: spiel.feldId,
          spielId: spiel._id,
          runde: spiel.runde,
          teamA: nameVon(spiel.mannschaftAId),
          teamB: nameVon(spiel.mannschaftBId),
          seiteAVertauscht: protokoll.seiteAVertauscht ?? false,
          timeoutsJeHalbzeit: turnier.timeoutsJeHalbzeit,
          spielzeitMinuten: turnier.spielzeitMinuten,
          anzahlHalbzeiten: turnier.anzahlHalbzeiten,
          gesendetAm: Date.now(),
          stand: {
            ergebnisA: stand.ergebnisA,
            ergebnisB: stand.ergebnisB,
            abschnitt: stand.abschnitt,
            abschnittNummer: stand.abschnittNummer,
            uhrLaeuft: stand.uhrLaeuft,
            gespielteSekunden: stand.gespielteSekunden,
            laufendSeit: stand.laufendSeit,
            fouls: stand.fouls,
            timeouts: stand.timeouts,
            wurfAnzahl: { A: stand.wurf.A.anzahl, B: stand.wurf.B.anzahl },
            spielGestartet: stand.spielGestartet,
            inPause: stand.inPause,
            spielBeendet: stand.spielBeendet,
            letzterWurf: stand.letzterWurf,
            letzteKontrolle: stand.letzteKontrolle,
            strafwurfFrist: stand.strafwurfFrist,
          },
        }
      : undefined;

  const anzeigeKanalRef = useRef<BroadcastChannel | undefined>(undefined);
  useEffect(() => {
    const kanal = oeffneKanal();
    if (!kanal) return;
    anzeigeKanalRef.current = kanal;
    const senden = () => {
      const paket = standPaketRef.current;
      if (paket) kanal.postMessage({ ...paket, gesendetAm: Date.now() });
    };
    kanal.onmessage = (e: MessageEvent<KanalNachricht>) => {
      if (e.data?.typ === "bitte-stand") senden();
    };
    senden();
    const takt = window.setInterval(senden, HERZSCHLAG_MS);
    return () => {
      window.clearInterval(takt);
      kanal.close();
      anzeigeKanalRef.current = undefined;
    };
  }, []);

  // Sofort senden, sobald sich am Stand etwas aendert - der Herzschlag oben waere dafuer zu traege.
  useEffect(() => {
    const paket = standPaketRef.current;
    if (paket) anzeigeKanalRef.current?.postMessage({ ...paket, gesendetAm: Date.now() });
  }, [stand, protokoll, spiel, turnier]);

  /** Oeffnet die Schiedsrichter-Anzeige als eigenes Fenster (fuer den zweiten Bildschirm). */
  function oeffneSchiedsrichterAnzeige() {
    if (!turnier || !spiel) return;
    const feld = spiel.feldId ?? turnier.felder?.[0]?.feldId;
    if (!feld) {
      zeigeKurzHinweis("Für dieses Turnier ist kein Spielfeld angelegt.");
      return;
    }
    window.open(
      `/turniere/${encodeURIComponent(turnier._id)}/felder/${encodeURIComponent(feld)}/schiedsrichter`,
      "torball-schiedsrichter",
      "popup=yes,width=1280,height=720",
    );
  }
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

  /** Schlange setzen und im Browserspeicher festhalten (ueberlebt ein Neuladen). */
  function setzeWarteschlange(eintraege: WartendesEreignis[]) {
    warteschlangeRef.current = eintraege;
    setWarteschlangeState(eintraege);
    if (protokoll) speichereWarteschlange(protokoll._id, eintraege);
  }

  function stelleAn(daten: NeuesProtokollEvent) {
    setzeWarteschlange([...warteschlangeRef.current, neuesWartendesEreignis(daten)]);
  }

  /**
   * Ein Ereignis erfassen. Erreicht es den Server nicht, geht es NICHT verloren, sondern in die
   * Warteschlange - der Rueckgabewert bleibt `true`, weil die Eingabe lokal angenommen wurde
   * (aufrufende Ketten wie "Wurf, dann Tor" laufen dadurch normal weiter).
   *
   * Sobald etwas wartet, wandert auch jedes weitere Ereignis in die Schlange: Der Server vergibt
   * die Sequenznummer beim Eintreffen, ein Vorbeisenden am Stau wuerde die Reihenfolge zerstoeren.
   */
  async function sende(eventDaten: NeuesProtokollEvent): Promise<boolean> {
    if (!protokoll) return false;
    const nutzlast: NeuesProtokollEvent = {
      spielzeit: Math.round(aktuelleSpielzeit()),
      halbzeit: stand?.abschnitt,
      ...eventDaten,
    };

    if (warteschlangeRef.current.length > 0) {
      stelleAn(nutzlast);
      return true;
    }

    try {
      setSendetGerade(true);
      const antwort = await protokollEventSenden(protokoll._id, nutzlast);
      eigeneEventIdsRef.current.add(antwort.event._id);
      setEvents((alt) => [...alt, antwort.event]);
      setProtokoll(antwort.protokoll);
      setSpiel(antwort.spiel);
      setFehler(undefined);
      return true;
    } catch (err) {
      if (err instanceof VerbindungsFehler) {
        stelleAn(nutzlast);
        return true;
      }
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
      return false;
    } finally {
      setSendetGerade(false);
    }
  }

  /**
   * Arbeitet die Warteschlange der Reihe nach ab - immer nur EIN Ereignis gleichzeitig, damit
   * die Sequenz stimmt. Bricht bei einem Verbindungsfehler ab (naechster Versuch spaeter).
   *
   * Eine FACHLICHE Ablehnung (z.B. "Protokoll ist abgeschlossen") kann dagegen nie durchgehen -
   * das Ereignis wird verworfen und gemeldet, sonst blockierte es die Schlange dauerhaft und
   * nichts kaeme mehr durch.
   */
  async function arbeiteWarteschlangeAb() {
    if (sendeLaeuftRef.current || !protokoll || warteschlangeRef.current.length === 0) return;
    sendeLaeuftRef.current = true;
    try {
      while (warteschlangeRef.current.length > 0) {
        const naechstes = warteschlangeRef.current[0];
        try {
          const antwort = await protokollEventSenden(protokoll._id, naechstes.daten);
          eigeneEventIdsRef.current.add(antwort.event._id);
          setEvents((alt) => [...alt, antwort.event]);
          setProtokoll(antwort.protokoll);
          setSpiel(antwort.spiel);
          setzeWarteschlange(warteschlangeRef.current.filter((e) => e.lokalId !== naechstes.lokalId));
        } catch (err) {
          if (err instanceof VerbindungsFehler) return;
          setzeWarteschlange(warteschlangeRef.current.filter((e) => e.lokalId !== naechstes.lokalId));
          setFehler(
            `Ein nachträglich gesendetes Ereignis wurde abgelehnt und verworfen: ${
              err instanceof Error ? err.message : "unbekannter Grund"
            }`,
          );
        }
      }
      zeigeKurzHinweis("Alle Ereignisse sind gespeichert.");
    } finally {
      sendeLaeuftRef.current = false;
    }
  }

  /** Uhr automatisch anhalten nach Aktionen, auf die der Schiedsrichter neu anpfeift (Tor/
   *  Eigentor, Foul, Strafwurf, Penalty, Auszeit, technische Auszeit - Nutzer-Vorgabe
   *  21.08.2026): waehrend dieser Unterbrechungen laeuft keine Spielzeit (Netto-Zeit; bei
   *  Strafwurf/Penalty steht die Uhr laut Regel ohnehin - die 8-Sekunden-Frist des Wurfs laeuft
   *  trotzdem, siehe stand.strafwurfFrist). Neu gestartet wird wie gehabt manuell per
   *  Leertaste beim Anpfiff. */
  async function uhrAutoStopp() {
    if (stand?.uhrLaeuft) await sende({ eventTyp: "STOP" });
  }

  async function fuehreBefehlAus(befehl: EingabeBefehl, vorher: EingabeZustand) {
    switch (befehl.typ) {
      case "uhr":
        if (vorher.aktion) zeigeKurzHinweis("Offene Eingabe verworfen.");
        await sende({ eventTyp: stand?.uhrLaeuft ? "STOP" : "GO" });
        return;
      case "halbzeit": {
        if (vorher.aktion) zeigeKurzHinweis("Offene Eingabe verworfen.");
        const gebucht = await sende({ eventTyp: "B" });
        // Turnierregel "Seitenwechsel zur Halbzeit": die ANZEIGE-Seiten automatisch mittauschen
        // (Nutzer-Vorgabe 21.08.2026) - reine Darstellung, keine Daten (seiteAVertauscht).
        if (gebucht && turnier?.seitenwechsel && protokoll) {
          try {
            setProtokoll(await protokollAnzeigeSetzen(protokoll._id, !protokoll.seiteAVertauscht));
            zeigeKurzHinweis("Halbzeit gebucht – Anzeige-Seiten automatisch getauscht.");
          } catch {
            /* Anzeige-Tausch fehlgeschlagen - unkritisch, manuell nachholbar */
          }
        }
        return;
      }
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
        // Der torPaar-Marker unterscheidet dieses zusammen erzeugte Paar von einem separat
        // gebuchten Wurf mit nachgeschobenem G (dort darf ein Streichen des Tors den echten
        // Wurf NICHT mitnehmen).
        if (await sende({ eventTyp: "W", mannschaft: team, spielerId: spielerIds[0], zusatz: { torPaar: true } })) {
          if (await sende({ eventTyp: "G", mannschaft: team, spielerId: spielerIds[0] })) await uhrAutoStopp();
        }
        return;
      case "eigentor":
        if (await sende({ eventTyp: "G", mannschaft: team, istEigentor: true })) await uhrAutoStopp();
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
        if (gebucht) await uhrAutoStopp();
        return;
      }
      // Strafwurf (einzelnes Foul) und Penalty (drittes Foul) sind zwei verschiedene Ereignisse
      // (Nutzer-Vorgabe 28.08.2026) - gebucht wird bei beiden die BESTRAFTE Mannschaft, wie beim
      // Foul selbst; geworfen wird von der Gegenseite.
      case "strafwurf":
        if (await sende({ eventTyp: "S", mannschaft: team })) await uhrAutoStopp();
        return;
      case "penalty":
        if (await sende({ eventTyp: "P", mannschaft: team })) await uhrAutoStopp();
        return;
      case "auszeit":
        if (await sende({ eventTyp: "T", mannschaft: team })) await uhrAutoStopp();
        return;
      case "techauszeit":
        if (await sende({ eventTyp: "TT", mannschaft: team })) await uhrAutoStopp();
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
    return alleEvents
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
    // Ein noch nicht uebertragenes Ereignis laesst sich nicht korrigieren: Der Server kennt
    // seine (nur lokale) Kennung nicht und wuerde die Korrektur ablehnen. Der Weg dahin ist
    // "Rueckgaengig" - das nimmt es einfach wieder aus der Warteschlange.
    if (istVorlaeufig(ziel._id)) {
      zeigeKurzHinweis("Noch nicht gespeichert - mit Rückgängig entfernen.");
      return;
    }
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
        davor.spielerId === ziel.spielerId &&
        davor.zusatz?.torPaar === true
      ) {
        await sende({ eventTyp: "ANNULLIERT", istKorrektur: true, korrigiertEventId: davor._id });
      }
      zeigeKurzHinweis(`Gestrichen: ${EVENT_BESCHRIFTUNG[ziel.eventTyp]}.`);
    }
  }

  /**
   * Ersatz-Korrektur "falsche Spielernummer" (Nutzer-Frage 21.08.2026): erzeugt ein neues Event
   * gleichen Typs mit korrigiertEventId auf das falsche - das alte gilt damit als annulliert,
   * das neue zaehlt an seiner Stelle (Konzept Abschnitt 3.1, "Ersatz"). Ein zusammenhaengendes
   * W/G-Paar desselben Werfers wird immer MIT korrigiert (der Torschuetze ist der Werfer).
   */
  async function korrigiereNummer(ziel: ProtokollEvent) {
    // Ein noch nicht uebertragenes Ereignis laesst sich nicht korrigieren: Der Server kennt
    // seine (nur lokale) Kennung nicht und wuerde die Korrektur ablehnen. Der Weg dahin ist
    // "Rueckgaengig" - das nimmt es einfach wieder aus der Warteschlange.
    if (istVorlaeufig(ziel._id)) {
      zeigeKurzHinweis("Noch nicht gespeichert - mit Rückgängig entfernen.");
      return;
    }
    if (!ziel.mannschaft) return;
    const eingabeWert = window.prompt(
      `Neue Spielernummer für "${EVENT_BESCHRIFTUNG[ziel.eventTyp]}" (bisher ${spielerName(ziel.spielerId) ?? "?"}, ${teamName(ziel.mannschaft)}):`,
    );
    if (!eingabeWert?.trim()) return;
    const spieler = spielerVon(ziel.mannschaft, eingabeWert.trim());
    if (!spieler) {
      zeigeKurzHinweis(`Nummer ${eingabeWert.trim()} ist nicht im Kader von ${teamName(ziel.mannschaft)} - nicht korrigiert.`);
      return;
    }
    const wirksam = wirksameSortiert();
    const index = wirksam.findIndex((x) => x._id === ziel._id);
    const davor = index > 0 ? wirksam[index - 1] : undefined;
    const danach = index >= 0 ? wirksam[index + 1] : undefined;
    const paar: ProtokollEvent[] = [ziel];
    if (
      ziel.eventTyp === "G" &&
      !ziel.istEigentor &&
      davor?.eventTyp === "W" &&
      davor.sequenz === ziel.sequenz - 1 &&
      davor.spielerId === ziel.spielerId
    ) {
      paar.unshift(davor);
    }
    if (
      ziel.eventTyp === "W" &&
      danach?.eventTyp === "G" &&
      !danach.istEigentor &&
      danach.sequenz === ziel.sequenz + 1 &&
      danach.spielerId === ziel.spielerId
    ) {
      paar.push(danach);
    }
    for (const e of paar) {
      await sende({
        eventTyp: e.eventTyp,
        mannschaft: e.mannschaft,
        spielerId: spieler._id,
        istEigentor: e.istEigentor || undefined,
        istKorrektur: true,
        korrigiertEventId: e._id,
        spielzeit: e.spielzeit,
        halbzeit: e.halbzeit,
        zusatz: e.zusatz,
      });
    }
    zeigeKurzHinweis(`Korrigiert: jetzt ${spielerName(spieler._id)}.`);
  }

  /** Undo: streicht das letzte wirksame Event. */
  async function undoLetztes() {
    // Wartet noch etwas, wird der letzte Eintrag einfach aus der Schlange genommen: Er hat den
    // Server nie erreicht, es gibt also nichts zu korrigieren - und eine Korrektur koennte sich
    // gar nicht auf ihn beziehen (der Server kennt die lokale Kennung nicht).
    if (warteschlangeRef.current.length > 0) {
      setzeWarteschlange(warteschlangeRef.current.slice(0, -1));
      zeigeKurzHinweis("Noch nicht gespeichertes Ereignis verworfen.");
      return;
    }
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
    // Die Team-Tasten folgen der SEITENANSICHT (Nutzer-Vorgabe 21.08.2026): Taste A = linke
    // Mannschaft, Taste B = rechte - bei getauschter Anzeige (seiteAVertauscht) wird die Taste
    // deshalb auf die jeweils andere Datenseite abgebildet. Intern bleiben A/B stabil.
    if (t.art === "team" && protokoll.seiteAVertauscht) {
      t = { art: "team", team: t.team === "A" ? "B" : "A" };
    }
    // "G" unmittelbar nach einem gebuchten Wurf = Tor zu GENAU diesem Wurf (Nutzer-Vorgabe
    // 21.08.2026): der Werfer ist bekannt, es braucht weder Nummer noch Enter - und es entsteht
    // nur das G-Event (der Wurf existiert ja schon, kein torPaar-Doppel).
    if (t.art === "aktion" && t.aktion === "tor" && !eingabeRef.current.aktion) {
      const wirksam = wirksameSortiert();
      const letztes = wirksam[wirksam.length - 1];
      if (
        letztes?.eventTyp === "W" &&
        letztes.mannschaft &&
        letztes.spielerId &&
        (!eingabeRef.current.team || eingabeRef.current.team === letztes.mannschaft)
      ) {
        setEingabe({ ...LEERER_ZUSTAND, team: letztes.mannschaft });
        void (async () => {
          if (await sende({ eventTyp: "G", mannschaft: letztes.mannschaft, spielerId: letztes.spielerId })) {
            zeigeKurzHinweis(`Tor zum letzten Wurf (${spielerName(letztes.spielerId) ?? "?"}).`);
            await uhrAutoStopp();
          }
        })();
        return;
      }
    }
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
      // Offenes Wechsel-Popup: das native <dialog> uebernimmt die Tastatur (Esc schliesst es).
      if (wechselDialogRef.current?.open) return;
      // Esc, dann Enter (innerhalb von 3 s): zwischen Erfassungs- und Verlauf-Ansicht wechseln.
      // Nur wenn keine Eingabe offen ist - sonst verwirft Esc wie gehabt erst die Eingabe.
      const offen = eingabeRef.current.aktion !== null || eingabeRef.current.aktuelleNummer !== "";
      if (e.key === "Escape" && !offen) escArmedRef.current = Date.now();
      if (e.key === "Enter" && !offen && Date.now() - escArmedRef.current < 3000) {
        e.preventDefault();
        escArmedRef.current = 0;
        setAnsicht((a) => (a === "erfassung" ? "verlauf" : "erfassung"));
        return;
      }
      const belegt = TASTATUR_BELEGUNG[e.key.toLowerCase()];
      if (!belegt) return;
      e.preventDefault();
      taste(belegt);
    }
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
    // seiteAVertauscht gehoert in die Dependencies, weil taste() die Team-Tasten darueber auf
    // die Seitenansicht abbildet - sonst arbeitet der Listener nach "Seiten tauschen" mit dem
    // alten Wert weiter (live erwischt: Taste A waehlte weiterhin die alte Seite).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protokoll?._id, protokoll?.seiteAVertauscht, stand?.abgeschlossen, stand?.uhrLaeuft, sendetGerade, events]);

  async function starteProtokoll(event: React.FormEvent) {
    event.preventDefault();
    if (!spielId || !nameEingabe.trim()) return;
    try {
      const neu = await protokollAnlegen(spielId, nameEingabe.trim());
      merkeGeraetNutztProtokoll(neu._id);
      setProtokoll(neu);
      setOhneProtokoll(false);
      setUnterschriftName(nameEingabe.trim());
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen");
    }
  }

  function vollbildUmschalten() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }

  async function seitenTauschen() {
    if (!protokoll) return;
    try {
      setProtokoll(await protokollAnzeigeSetzen(protokoll._id, !protokoll.seiteAVertauscht));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  /** Klick auf einen Feldspieler-Knopf (Erfassungs-Ansicht): bucht dessen Wurf - bzw. liefert
   *  die Spielernummer fuer eine bereits gewaehlte 1-Nummern-Aktion (Foul, Tor, Freiwurf). */
  function spielerKlick(seite: Mannschaftsseite, sp: Spieler) {
    const z = eingabeRef.current;
    if (z.aktion === "wechsel") {
      oeffneWechsel(seite);
      return;
    }
    const aktion = z.aktion && z.team === seite && NUMMERN_JE_AKTION[z.aktion] === 1 ? z.aktion : "fehlwurf";
    setEingabe({ ...LEERER_ZUSTAND, team: seite });
    void buche(seite, aktion, [sp.trikotnummer]);
  }

  function oeffneWechsel(seite: Mannschaftsseite) {
    setWechselSeite(seite);
    setWechselRaus(null);
    setWechselRein(null);
    setEingabe({ ...LEERER_ZUSTAND, team: seite });
  }

  useEffect(() => {
    if (wechselSeite) wechselDialogRef.current?.showModal();
    else wechselDialogRef.current?.close();
  }, [wechselSeite]);

  async function wechselBuchen() {
    if (!wechselSeite || !wechselRaus || !wechselRein) return;
    if (await sende({ eventTyp: "E", mannschaft: wechselSeite, spielerRausId: wechselRaus, spielerId: wechselRein })) {
      zeigeKurzHinweis("Wechsel gebucht.");
      setWechselSeite(null);
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
  // Ohne uhrLaeuft-Bedingung - siehe achtSekunden() in der Erfassungs-Ansicht.
  const timerStrafwurf = timerRest(stand.strafwurfFrist);
  const eventsAbsteigend = [...alleEvents].sort((a, b) => b.sequenz - a.sequenz);
  const aufstellungUnvollstaendig = stand.feld.A.length !== 3 || stand.feld.B.length !== 3;

  /** Aufstellungs-Auswahl - in beiden Ansichten eingebunden (Erfassung + Verlauf). */
  // Aufstellung (Nutzer-Vorgabe 21.08.2026: vor dem Anpfiff festlegen, welche Spieler auf dem
  // Feld stehen). Solange eine Aufstellung fehlt/unvollstaendig ist, steht der Bereich automatisch
  // offen; danach laesst er sich ueber den Knopf wieder oeffnen (z.B. fuer die Halbzeitpause, in
  // der Wechsel unbegrenzt und ohne Kontingent-Anrechnung erlaubt sind).
  const aufstellungsBereich =
    !stand.spielBeendet && !stand.abgeschlossen && (
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
    );

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

  /**
   * Zwischenseite: Dieses Protokoll laeuft bereits, und dieses Geraet hat es nicht begonnen.
   *
   * Der wahrscheinliche Fehlgriff bei zwei Feldern ist das VERSEHENTLICH falsche Spiel
   * (Nutzer-Vorgabe 28.08.2026) - und der faellt sonst erst auf, wenn schon Ereignisse im
   * falschen Protokoll stehen. Deshalb steht hier das SPIEL gross im Vordergrund, nicht die
   * Warnung: Die Frage, die beantwortet werden muss, lautet "ist das ueberhaupt mein Spiel?".
   */
  if (protokoll && !uebernahmeBestaetigt && !geraetNutztProtokoll(protokoll._id)) {
    const letztes = [...events].sort((a, b) => a.zeitstempel.localeCompare(b.zeitstempel)).pop();
    const feldName = turnier.felder.find((f) => f.feldId === spiel.feldId)?.name;
    const minutenHer = letztes
      ? Math.max(0, Math.round((Date.now() - new Date(letztes.zeitstempel).getTime()) / 60000))
      : undefined;

    return (
      <>
        <h1>Protokoll wird bereits geführt</h1>

        <div className="warnkasten">
          <p>
            Für dieses Spiel läuft bereits ein Protokoll – begonnen von{" "}
            <strong>{protokoll.ersterProtokollantName}</strong>
            {minutenHer !== undefined && (
              <>
                , letzte Eingabe{" "}
                {minutenHer === 0 ? "gerade eben" : `vor ${minutenHer} ${minutenHer === 1 ? "Minute" : "Minuten"}`}
              </>
            )}
            .
          </p>
          <p>
            <strong>Bitte zuerst prüfen, ob das wirklich dein Spiel ist.</strong> Wird auf mehreren Feldern
            gespielt, ist ein versehentlich geöffnetes falsches Spiel der häufigste Fehlgriff.
          </p>
        </div>

        <h2>Dieses Spiel</h2>
        <div className="tabellen-wrapper">
          <table className="uebersicht-tabelle">
            <caption className="sr-only">Angaben zum geöffneten Spiel</caption>
            <tbody>
              <tr>
                <th scope="row">Begegnung</th>
                <td>
                  {nameVon(spiel.mannschaftAId)} – {nameVon(spiel.mannschaftBId)}
                </td>
              </tr>
              {spiel.runde && (
                <tr>
                  <th scope="row">Spiel</th>
                  <td>Nr. {spiel.runde}</td>
                </tr>
              )}
              {feldName && (
                <tr>
                  <th scope="row">Spielfeld</th>
                  <td>{feldName}</td>
                </tr>
              )}
              {spiel.startzeitGeplant && (
                <tr>
                  <th scope="row">Geplanter Beginn</th>
                  <td>{new Date(spiel.startzeitGeplant).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              )}
              <tr>
                <th scope="row">Bisher erfasst</th>
                <td>
                  {events.length} {events.length === 1 ? "Ereignis" : "Ereignisse"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="protokoll-uebernahme-aktionen">
          <button type="button" className="button-sekundaer" onClick={() => navigate(-1)}>
            Zurück – das ist nicht mein Spiel
          </button>{" "}
          <button
            type="button"
            onClick={() => {
              merkeGeraetNutztProtokoll(protokoll._id);
              setUebernahmeBestaetigt(true);
            }}
          >
            Ja, hier weiter protokollieren
          </button>
        </p>
        <p className="feld-hinweis">
          Wird auf zwei Geräten gleichzeitig erfasst, entstehen doppelte Einträge. Bitte vorher klären, wer
          protokolliert.
        </p>
      </>
    );
  }

  // ============================ Erfassungs-Ansicht (Vollbild) ============================
  // Die eigentliche Protokollier-Ansicht (Nutzer-Vorgabe 21.08.2026, Layout aus dem
  // Design-Canvas "Protokoll-Anzeigeseite"): grosses Scoreboard mit Restzeit + SPIEL LAEUFT,
  // 8-Sekunden an den Aussenseiten (nach Wurf neutral auf BEIDEN Seiten, erst Kontrolle legt
  // die Seite fest - Konzept 3.4), Feldspieler-Tasten je Seite (Bank nur im Wechsel-Popup),
  // kompakte Aktions-Tasten in der Mitte, nur die letzten 5 Ereignisse. Esc, dann Enter
  // wechselt zur Verlauf-Ansicht (Korrekturen, Abschluss).
  if (ansicht === "erfassung" && !stand.abgeschlossen) {
    const feldSpieler = (seite: Mannschaftsseite): Spieler[] =>
      stand.feld[seite]
        .map((id) => kader[seite].find((sp) => sp._id === id))
        .filter((sp): sp is Spieler => Boolean(sp));
    const bankSpieler = (seite: Mannschaftsseite): Spieler[] =>
      kader[seite].filter((sp) => !stand.feld[seite].includes(sp._id));
    const achtSekunden = (seite: Mannschaftsseite): { wert: string; label?: string; abgelaufen: boolean } => {
      // Strafwurf/Penalty zuerst und BEWUSST ohne die uhrLaeuft-Bedingung der uebrigen Zweige
      // (Nutzer-Vorgabe 28.08.2026): Waehrend der Ausfuehrung ruht die Spielzeit, die
      // 8-Sekunden-Regel gilt trotzdem - und sie laeuft ab dem Pfiff, weil der Werfer den Ball
      // direkt bekommt (kein vorheriges "unter Kontrolle bringen").
      if (stand.strafwurfFrist) {
        if (stand.strafwurfFrist.mannschaft !== seite) return { wert: "–", abgelaufen: false };
        const rest = timerRest(stand.strafwurfFrist)!;
        return {
          wert: String(Math.max(0, rest)),
          label: stand.strafwurfFrist.art === "P" ? "Penalty" : "Strafwurf",
          abgelaufen: rest <= 0,
        };
      }
      if (stand.uhrLaeuft && stand.letzteKontrolle) {
        if (stand.letzteKontrolle.mannschaft !== seite) return { wert: "–", abgelaufen: false };
        const rest = timerRest(stand.letzteKontrolle)!;
        return { wert: String(Math.max(0, rest)), label: "seit Kontrolle", abgelaufen: rest <= 0 };
      }
      if (stand.uhrLaeuft && stand.letzterWurf) {
        const rest = timerRest(stand.letzterWurf)!;
        return { wert: String(Math.max(0, rest)), label: "nach Wurf – Seite offen", abgelaufen: rest <= 0 };
      }
      return { wert: "–", abgelaufen: false };
    };
    const achtBlock = (seite: Mannschaftsseite) => {
      const a = achtSekunden(seite);
      return (
        <div className={`protokoll-vb-acht ${a.abgelaufen ? "protokoll-vb-acht-abgelaufen" : ""}`}>
          <div className="protokoll-vb-acht-label">8-Sek.</div>
          <div className="protokoll-vb-acht-wert">{a.wert}</div>
          {a.label && <div className="protokoll-vb-acht-label">{a.label}</div>}
        </div>
      );
    };
    const teamKopf = (seite: Mannschaftsseite, tasteLabel: "A" | "B", ausrichtung: "links" | "rechts") => (
      <div className={`protokoll-vb-team protokoll-vb-team-${ausrichtung}`}>
        <button
          type="button"
          className={`protokoll-vb-teamname ${
            eingabe.team === seite
              ? seite === linkeSeite
                ? "protokoll-vb-teamname-links"
                : "protokoll-vb-teamname-rechts"
              : ""
          }`}
          aria-pressed={eingabe.team === seite}
          onClick={() => taste({ art: "team", team: tasteLabel })}
        >
          <span className="protokoll-vb-teamname-text">{teamName(seite)}</span>
        </button>
        <div className="protokoll-vb-chips">
          <span>
            Fouls <strong>{stand.fouls[seite]}</strong>
          </span>
          <span>
            Auszeit {stand.timeouts[seite]}/{turnier.timeoutsJeHalbzeit}
          </span>
          <span>
            Wechsel {stand.wechsel[seite]}/{turnier.auswechslungenJeHalbzeit}
          </span>
        </div>
        {stand.wurf[seite].spielerId && (
          <div className="protokoll-vb-werfer">
            Letzter Werfer: {spielerName(stand.wurf[seite].spielerId)} ({stand.wurf[seite].anzahl}. Wurf)
          </div>
        )}
      </div>
    );
    const feldKnoepfe = (seite: Mannschaftsseite, tasteLabel: "A" | "B") => (
      <div className="protokoll-vb-seite">
        <div className="protokoll-vb-gruppe-label">
          {teamName(seite)} · Auf dem Feld (Taste {tasteLabel})
        </div>
        <div className="protokoll-tastengruppe">
          {feldSpieler(seite).length === 0 ? (
            <p>Noch keine Aufstellung.</p>
          ) : (
            feldSpieler(seite).map((sp) => (
              <button
                type="button"
                key={sp._id}
                className="protokoll-vb-spieler"
                onClick={() => spielerKlick(seite, sp)}
              >
                {stand.wurf[seite].spielerId === sp._id && (
                  <span
                    className={`protokoll-vb-badge ${stand.wurf[seite].anzahl > 3 ? "protokoll-vb-badge-warnung" : ""}`}
                  >
                    {stand.wurf[seite].anzahl}. Wurf
                  </span>
                )}
                <span className="protokoll-vb-spieler-nr">{sp.trikotnummer}</span>
                <span className="protokoll-vb-spieler-name">
                  {sp.vorname ? `${sp.vorname} ` : ""}
                  {sp.name}
                </span>
              </button>
            ))
          )}
        </div>
        <button type="button" className="button-sekundaer" onClick={() => oeffneWechsel(seite)}>
          Wechsel …
        </button>
      </div>
    );
    const aktionsKnopf = (aktion: UiAktion, kuerzel: string) => (
      <button
        type="button"
        key={aktion}
        disabled={!eingabe.team && aktion !== "tor"}
        aria-pressed={eingabe.aktion === aktion}
        onClick={() => taste({ art: "aktion", aktion })}
        className="protokoll-vb-aktion"
      >
        <kbd>{kuerzel}</kbd> {AKTIONS_BESCHRIFTUNG[aktion]}
      </button>
    );
    // Aktuelle Protokollfuehrung: letzter wirksamer Protokollantenwechsel, sonst der Startname.
    const letzterHandover = wirksameSortiert()
      .filter((e) => e.eventTyp === "HANDOVER")
      .pop();
    const aktuellerProtokollant = String(
      letzterHandover?.zusatz?.neuerProtokollant ?? protokoll?.ersterProtokollantName ?? "",
    );
    return (
      <div className="protokoll-erfassung">
        {/* Rein visueller Aufmerksamkeits-Blitz (s. fehlerBlitz oben) - Screenreader bedient
            weiterhin die aria-live-Hinweiszeile. */}
        {fehlerBlitz > 0 && <div key={fehlerBlitz} className="protokoll-fehler-blitz" aria-hidden="true" />}
        <div className="protokoll-vb-kopf">
          <span>
            {spiel.runde ? `Spiel ${spiel.runde}` : "Spiel"}
            {aktuellerProtokollant && <> · Protokoll: {aktuellerProtokollant}</>}
          </span>
          <span className="protokoll-vb-kopf-aktionen">
            <button type="button" className="button-sekundaer" onClick={vollbildUmschalten}>
              Vollbild an/aus
            </button>
            <button type="button" className="button-sekundaer" onClick={oeffneSchiedsrichterAnzeige}>
              Schiedsrichter-Anzeige öffnen
            </button>
            <button type="button" className="button-sekundaer" onClick={() => setAnsicht("verlauf")}>
              Vollständiges Protokoll &amp; Korrekturen (Esc, dann Enter)
            </button>
          </span>
        </div>
        {fehler && <p role="alert">{fehler}</p>}

        <section aria-label="Spielstand" className="protokoll-vb-score">
          {achtBlock(linkeSeite)}
          {teamKopf(linkeSeite, "A", "links")}
          <div className="protokoll-vb-mitte">
            <div className="protokoll-vb-ergebnis">
              {linkeSeite === "A" ? stand.ergebnisA : stand.ergebnisB} :{" "}
              {rechteSeite === "A" ? stand.ergebnisA : stand.ergebnisB}
            </div>
            <div>
              {ABSCHNITT_BESCHRIFTUNG[stand.abschnitt]}
              {sollSekunden !== undefined && (
                <>
                  {" "}
                  · Restzeit{" "}
                  <strong className={`protokoll-vb-restzeit ${ueberhang ? "protokoll-ueberhang" : ""}`}>
                    {ueberhang
                      ? `-${formatiereSpielzeit(spielzeitSekunden - sollSekunden)}`
                      : formatiereSpielzeit(sollSekunden - spielzeitSekunden)}
                  </strong>
                </>
              )}
            </div>
            <div className={`protokoll-vb-laeuft ${stand.uhrLaeuft ? "" : "protokoll-vb-steht"}`}>
              <span className="protokoll-vb-punkt"></span>
              {stand.uhrLaeuft
                ? "SPIEL LÄUFT"
                : !stand.spielGestartet
                  ? "NOCH NICHT GESTARTET"
                  : stand.spielBeendet
                    ? "SPIEL BEENDET"
                    : stand.inPause
                      ? "PAUSE"
                      : "UNTERBROCHEN"}
            </div>
            {ueberhang && (
              <div className="protokoll-ueberhang">Überhang – Spiel läuft bis zum Abpfiff</div>
            )}
          </div>
          {teamKopf(rechteSeite, "B", "rechts")}
          {achtBlock(rechteSeite)}
        </section>

        <div
          className={`protokoll-kontext ${eingabe.team ? `protokoll-kontext-${eingabe.team === linkeSeite ? "a" : "b"}` : ""}`}
          aria-live="polite"
        >
          {eingabe.team ? (
            <>
              <strong>{teamName(eingabe.team)}</strong>
              {!eingabe.aktion && <> · Spieler-Taste/Ziffer bucht direkt einen Wurf · G nach Wurf = Tor</>}
              {eingabe.aktion && <> · {AKTIONS_BESCHRIFTUNG[eingabe.aktion]}</>}
              {(eingabe.nummern.length > 0 || eingabe.aktuelleNummer) && (
                <> · Nr. {[...eingabe.nummern, eingabe.aktuelleNummer].filter(Boolean).join(" → ")}</>
              )}
              {eingabe.aktion && NUMMERN_JE_AKTION[eingabe.aktion] > 0 && <> – Spielernummer wählen</>}
            </>
          ) : (
            <>Kein Team gewählt – Team-Taste A/B oder Mannschaftsname antippen</>
          )}
        </div>

        <div aria-live="polite" className="protokoll-vb-hinweise">
          {fremdeErfassung && (
            <p className="protokoll-wartet">
              ⚠ Dieses Spiel wird gerade auch auf einem anderen Gerät protokolliert. Bitte klären, wer erfasst –
              sonst entstehen doppelte Einträge.
            </p>
          )}
          {warteschlange.length > 0 && (
            <p className="protokoll-wartet">
              ⧗ {warteschlange.length} {warteschlange.length === 1 ? "Ereignis" : "Ereignisse"} noch nicht
              gespeichert – wird automatisch nachgeholt.
            </p>
          )}
          {stand.hinweise.map((h) => (
            <p key={h} className="schiri-warnung">
              ⚠ {h}
            </p>
          ))}
          {hinweisKurz && <p className="gespeichert-hinweis">{hinweisKurz}</p>}
        </div>

        {aufstellungUnvollstaendig && aufstellungsBereich}

        <div className="protokoll-vb-eingabe">
          {feldKnoepfe(linkeSeite, "A")}
          <div className="protokoll-vb-aktionen">
            <div className="protokoll-vb-gruppe-label">Aktionen (fürs gewählte Team)</div>
            <div className="protokoll-vb-aktion-grid">
              {aktionsKnopf("tor", "G")}
              {aktionsKnopf("fehlwurf", "X")}
              {aktionsKnopf("kontrolle", "K")}
              {aktionsKnopf("foul", "F")}
              {aktionsKnopf("strafwurf", "S")}
              {aktionsKnopf("penalty", "P")}
              {aktionsKnopf("auszeit", "T")}
              {aktionsKnopf("techauszeit", "M")}
              {aktionsKnopf("freiwurf", "R")}
              <button
                type="button"
                disabled={!eingabe.team}
                onClick={() => taste({ art: "aktion", aktion: "eigentor" })}
                className="protokoll-vb-aktion"
              >
                Eigentor
              </button>
              <button
                type="button"
                disabled={!eingabe.aktion}
                onClick={() => taste({ art: "ok" })}
                className="protokoll-vb-aktion"
              >
                <kbd>Enter</kbd> OK
              </button>
            </div>
            <button type="button" className="protokoll-vb-uhr" onClick={() => taste({ art: "uhr" })}>
              <kbd>Leertaste</kbd> {stand.uhrLaeuft ? "Uhr Stop" : "Uhr Start"}
            </button>
            <div className="protokoll-vb-aktion-grid">
              <button type="button" className="protokoll-vb-aktion" onClick={() => taste({ art: "halbzeit" })}>
                <kbd>H</kbd> Halbzeit
              </button>
              <button
                type="button"
                className="protokoll-vb-aktion button-loeschen"
                onClick={() => taste({ art: "undo" })}
              >
                <kbd>⌫</kbd> Rückgängig
              </button>
              {/* Gehoert fachlich zur Halbzeit (dort ggf. automatisch, Turnierregel Seitenwechsel),
                  bleibt aber jederzeit erreichbar - z.B. falls die Anzeige schon vor Spielbeginn
                  gedreht werden muss. */}
              <button
                type="button"
                className="protokoll-vb-aktion"
                title={turnier.seitenwechsel ? "Tauscht zur Halbzeit automatisch" : undefined}
                onClick={seitenTauschen}
              >
                Anzeige tauschen
              </button>
            </div>
          </div>
          {feldKnoepfe(rechteSeite, "B")}
        </div>

        <div className="protokoll-vb-fuss">
          <div>
            <div className="protokoll-vb-gruppe-label">Letzte Ereignisse</div>
            <div className="protokoll-vb-ereignisliste" ref={ereignisListeRef} tabIndex={-1}>
            {eventsAbsteigend
              .filter((e) => !stand.annullierteIds.has(e._id) && e.eventTyp !== "ANNULLIERT")
              .map((e) => (
                <div key={e._id} className="protokoll-vb-ereignis">
                  <span className="protokoll-vb-ereignis-aktionen">
                  {/* Korrekturen auch direkt hier (Nutzer-Wunsch) - gleiche Aktionen wie in der
                      Verlauf-Ansicht: Spielernummer korrigieren bzw. ersatzlos streichen. */}
                  {["W", "G", "F", "FW"].includes(e.eventTyp) && e.spielerId && !e.istEigentor && (
                    <button
                      type="button"
                      className="symbol-button"
                      aria-label={`Spielernummer von ${EVENT_BESCHRIFTUNG[e.eventTyp]} (Nr. ${e.sequenz}) korrigieren`}
                      title="Spielernummer korrigieren"
                      onClick={() => void korrigiereNummer(e)}
                    >
                      ✎
                    </button>
                  )}
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
                  </span>
                  <span className="protokoll-vb-ereignis-text">
                    {istVorlaeufig(e._id) && <span className="protokoll-wartet">⧗ </span>}
                    {e.spielzeit !== undefined ? formatiereSpielzeit(e.spielzeit) : "–"} ·{" "}
                    {EVENT_BESCHRIFTUNG[e.eventTyp] ?? e.eventTyp}
                    {e.istEigentor && " (Eigentor)"}
                    {e.mannschaft && <> · {teamName(e.mannschaft)}</>}
                    {e.spielerId && <> · {spielerName(e.spielerId)}</>}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="protokoll-vb-fussrechts">
            <button type="button" className="button-sekundaer" onClick={() => setAnsicht("verlauf")}>
              Spielende / Abschluss …
            </button>
            <button type="button" className="button-sekundaer" onClick={() => navigate(-1)}>
              Zurück zur Spielübersicht
            </button>
          </div>
        </div>

        <dialog ref={wechselDialogRef} className="protokoll-wechsel-dialog" onClose={() => setWechselSeite(null)}>
          {wechselSeite && (
            <>
              <h2>Wechsel – {teamName(wechselSeite)}</h2>
              <p className="protokoll-vb-gruppe-label">Raus (auf dem Feld)</p>
              <div className="protokoll-tastengruppe">
                {feldSpieler(wechselSeite).map((sp) => (
                  <button
                    type="button"
                    key={sp._id}
                    className="protokoll-vb-spieler"
                    aria-pressed={wechselRaus === sp._id}
                    onClick={() => setWechselRaus(sp._id)}
                  >
                    <span className="protokoll-vb-spieler-nr">{sp.trikotnummer}</span>
                    <span className="protokoll-vb-spieler-name">{sp.name}</span>
                  </button>
                ))}
              </div>
              <p className="protokoll-vb-gruppe-label">Rein (Bank)</p>
              <div className="protokoll-tastengruppe">
                {bankSpieler(wechselSeite).length === 0 ? (
                  <p>Keine weiteren Spieler im Kader.</p>
                ) : (
                  bankSpieler(wechselSeite).map((sp) => (
                    <button
                      type="button"
                      key={sp._id}
                      className="protokoll-vb-spieler"
                      aria-pressed={wechselRein === sp._id}
                      onClick={() => setWechselRein(sp._id)}
                    >
                      <span className="protokoll-vb-spieler-nr">{sp.trikotnummer}</span>
                      <span className="protokoll-vb-spieler-name">{sp.name}</span>
                    </button>
                  ))
                )}
              </div>
              <p className="feld-hinweis">
                Per Tastatur geht es auch ohne Popup: E, Nummer raus, Nummer rein – bucht sofort.
              </p>
              <div className="protokoll-vb-dialog-aktionen">
                <button type="button" className="button-sekundaer" onClick={() => setWechselSeite(null)}>
                  Abbrechen (Esc)
                </button>
                <button type="button" disabled={!wechselRaus || !wechselRein} onClick={() => void wechselBuchen()}>
                  Wechsel buchen
                </button>
              </div>
            </>
          )}
        </dialog>
      </div>
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
      <p>
        {!stand.abgeschlossen && (
          <>
            <button type="button" onClick={() => setAnsicht("erfassung")}>
              Zur Erfassungsansicht (Esc, dann Enter)
            </button>{" "}
          </>
        )}
        <button type="button" className="button-sekundaer" onClick={() => navigate(-1)}>
          Zurück zur Spielübersicht
        </button>
      </p>

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
        {(timerA !== undefined || timerB !== undefined || timerStrafwurf !== undefined) && (
          <p>
            {timerStrafwurf !== undefined && (
              <span className={timerStrafwurf <= 0 ? "protokoll-ueberhang" : undefined}>
                8-Sekunden ({teamName(stand.strafwurfFrist!.mannschaft)},{" "}
                {stand.strafwurfFrist!.art === "P" ? "Penalty" : "Strafwurf"}):{" "}
                {Math.max(0, timerStrafwurf)} s{" "}
              </span>
            )}
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

      {aufstellungsBereich}

      {/* Regel-Hinweise - warnen, nie blockieren. */}
      <div aria-live="polite">
        {fremdeErfassung && (
          <p className="protokoll-wartet">
            ⚠ Dieses Spiel wird gerade auch auf einem anderen Gerät protokolliert. Bitte klären, wer erfasst –
            sonst entstehen doppelte Einträge.
          </p>
        )}
        {warteschlange.length > 0 && (
          <p className="protokoll-wartet">
            ⧗ {warteschlange.length} {warteschlange.length === 1 ? "Ereignis" : "Ereignisse"} noch nicht gespeichert –
            wird automatisch nachgeholt. Bitte dieses Fenster geöffnet lassen.
          </p>
        )}
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
            className={`protokoll-kontext ${eingabe.team ? `protokoll-kontext-${eingabe.team === linkeSeite ? "a" : "b"}` : ""}`}
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
            <div className="protokoll-tastengruppe" role="group" aria-label="Team wählen (A = links, B = rechts)">
              {/* Taste A gehoert IMMER zur links angezeigten Mannschaft (taste() mappt bei
                  getauschter Seitenansicht auf die andere Datenseite). */}
              <button type="button" aria-pressed={eingabe.team === linkeSeite} onClick={() => taste({ art: "team", team: "A" })}>
                A (links) – {teamName(linkeSeite)}
              </button>
              <button type="button" aria-pressed={eingabe.team === rechteSeite} onClick={() => taste({ art: "team", team: "B" })}>
                B (rechts) – {teamName(rechteSeite)}
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
            {/* Solange etwas in der Warteschlange steht, darf nicht abgeschlossen werden: Der
                Abschluss wuerde selbst nur hinten anstehen, und der Server nimmt danach keine
                Ereignisse mehr an - die wartenden gingen also verloren. */}
            <button
              type="button"
              disabled={!protokoll?.protokollantName || warteschlange.length > 0}
              title={
                warteschlange.length > 0
                  ? "Erst wenn alle Ereignisse gespeichert sind - das läuft gerade automatisch."
                  : undefined
              }
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
                        {!gestrichen &&
                          !stand.abgeschlossen &&
                          ["W", "G", "F", "FW"].includes(e.eventTyp) &&
                          e.spielerId &&
                          !e.istEigentor && (
                            <button
                              type="button"
                              className="symbol-button"
                              aria-label={`Spielernummer von ${EVENT_BESCHRIFTUNG[e.eventTyp]} (Nr. ${e.sequenz}) korrigieren`}
                              title="Spielernummer korrigieren"
                              onClick={() => void korrigiereNummer(e)}
                            >
                              ✎
                            </button>
                          )}{" "}
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

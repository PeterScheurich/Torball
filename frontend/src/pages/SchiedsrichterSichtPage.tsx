import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { MannschaftImTurnier, Mannschaftsseite, Spiel, Turnier } from "@torball/shared";
import { getMannschaften, getSpiele, getSpielProtokoll, getTurnier } from "../api";
import { formatiereUhrzeit } from "../format";
import { berechneProtokollStand } from "../protokoll/stand";
import type { AnzeigeStand, KanalNachricht, StandPaket } from "../schiedsrichter/kanal";
import { STILLE_BIS_ABGEMELDET_MS, oeffneKanal, paketPasstZuFeld } from "../schiedsrichter/kanal";
import type { AnzeigeTheme } from "../schiedsrichter/anzeigeTheme";
import { geladenesAnzeigeTheme, merkeAnzeigeTheme } from "../schiedsrichter/anzeigeTheme";

/**
 * Zweite Anzeige am Feld, fuer den Schiedsrichter (Nutzer-Vorgabe 28.08.2026). Drei Dinge
 * unterscheiden sie von der Protokollseite:
 *
 * 1. **Sie ist gespiegelt.** Der Schiedsrichter steht auf der GEGENUEBERLIEGENDEN Seite des
 *    Feldes - was fuer den Protokollanten links liegt, liegt fuer ihn rechts. Getauscht werden
 *    die Seiten der Mannschaften samt allem, was zu ihnen gehoert; die Schrift bleibt normal.
 *    Umgesetzt als exakte Umkehrung von `seiteAVertauscht` (siehe linkeSeite unten).
 * 2. **Sie haengt an Turnier + FELD, nicht an einem Spiel** - sonst muesste sie nach jedem
 *    Spiel umgestellt werden. Sie sucht sich das laufende Spiel selbst und zeigt zwischen zwei
 *    Spielen das letzte Ergebnis und die naechste Begegnung.
 * 3. **Sie wird nicht bedient.** Ausser Vollbild und Hell/Dunkel gibt es keine Aktion; kein
 *    Klick auf dieser Seite aendert jemals Daten.
 *
 * Die Zahlen kommen ueber einen BroadcastChannel direkt aus dem Protokoll-Fenster desselben
 * Rechners (schiedsrichter/kanal.ts). Der Server-Abruf ist nur das Sicherheitsnetz fuer den
 * Fall, dass dieses Fenster geschlossen wurde - fuer eine Frist von acht Sekunden waere er
 * viel zu langsam, was die Seite dann auch offen anzeigt.
 */

const ACHT_SEKUNDEN_MS = 8000;
const SERVER_ABRUF_MS = 15000;

const ABSCHNITT_BESCHRIFTUNG: Record<string, string> = {
  "1": "1. Halbzeit",
  "2": "2. Halbzeit",
  V1: "1. Verlängerung",
  V2: "2. Verlängerung",
  FW: "Freiwurfschießen",
};

function formatiereSpielzeit(sekunden: number): string {
  const m = Math.floor(Math.max(0, sekunden) / 60);
  const s = Math.max(0, sekunden) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Ein laufendes Spiel gilt als "auf diesem Feld", wenn es ihm zugeordnet ist. */
function aufFeld(spiel: Spiel, feldId: string, nurEinFeld: boolean): boolean {
  return spiel.feldId ? spiel.feldId === feldId : nurEinFeld;
}

export function SchiedsrichterSichtPage() {
  const { turnierId, feldId } = useParams<{ turnierId: string; feldId: string }>();

  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();

  /** Zuletzt empfangenes Paket aus dem Protokoll-Fenster (der Normalfall). */
  const [paket, setPaket] = useState<StandPaket | undefined>();
  /** Selbst berechneter Stand aus Server-Daten - nur wenn kein Protokoll-Fenster sendet. */
  const [ersatzPaket, setErsatzPaket] = useState<StandPaket | undefined>();

  const [theme, setTheme] = useState<AnzeigeTheme>(() => geladenesAnzeigeTheme());
  const [vollbild, setVollbild] = useState(false);
  // Erzwingt das regelmaessige Neuzeichnen der tickenden Anzeigen (Restzeit, 8 Sekunden).
  const [, setTick] = useState(0);

  const nurEinFeld = (turnier?.felder?.length ?? 0) <= 1;

  // ---------------------------------------------------------------- Stammdaten + Server-Abruf

  const ladeStammdaten = useCallback(async () => {
    if (!turnierId) return;
    try {
      const [t, sp, m] = await Promise.all([
        getTurnier(turnierId),
        getSpiele(turnierId),
        getMannschaften(turnierId),
      ]);
      setTurnier(t);
      setSpiele(sp);
      setMannschaften(m);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Die Daten konnten nicht geladen werden.");
    }
  }, [turnierId]);

  useEffect(() => {
    void ladeStammdaten();
    const intervall = setInterval(() => {
      if (document.visibilityState === "visible") void ladeStammdaten();
    }, SERVER_ABRUF_MS);
    return () => clearInterval(intervall);
  }, [ladeStammdaten]);

  useEffect(() => {
    const intervall = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(intervall);
  }, []);

  // ---------------------------------------------------------------------------------- Kanal

  useEffect(() => {
    if (!turnierId || !feldId) return;
    const kanal = oeffneKanal();
    if (!kanal) return;
    kanal.onmessage = (e: MessageEvent<KanalNachricht>) => {
      const nachricht = e.data;
      if (!nachricht || nachricht.typ !== "stand") return;
      if (nachricht.turnierId !== turnierId) return;
      if (!paketPasstZuFeld(nachricht, feldId, nurEinFeld)) return;
      setPaket(nachricht);
    };
    // Das Protokoll-Fenster sendet sonst erst beim naechsten Ereignis - ohne diese Bitte
    // bliebe eine frisch geoeffnete Anzeige bis dahin auf der Wartesicht stehen.
    kanal.postMessage({ typ: "bitte-stand", turnierId });
    return () => kanal.close();
  }, [turnierId, feldId, nurEinFeld]);

  const paketFrisch = paket !== undefined && Date.now() - paket.gesendetAm < STILLE_BIS_ABGEMELDET_MS;

  // ------------------------------------------------- Sicherheitsnetz: Stand selbst berechnen

  /**
   * Laufendes Spiel auf diesem Feld. Bei mehreren (sollte nicht vorkommen, ist aber moeglich)
   * gewinnt das zuletzt begonnene - stillschweigend das falsche zu zeigen waere schlimmer als
   * der Hinweis, der dann zusaetzlich in der Kopfzeile erscheint.
   */
  const laufendeSpiele = useMemo(() => {
    if (!feldId) return [];
    return spiele
      .filter((s) => s.status === "laeuft" && aufFeld(s, feldId, nurEinFeld))
      .sort((a, b) => (a.startzeitTatsaechlich ?? "").localeCompare(b.startzeitTatsaechlich ?? ""));
  }, [spiele, feldId, nurEinFeld]);

  const laufendesSpiel = laufendeSpiele[laufendeSpiele.length - 1];

  useEffect(() => {
    // Nur wenn das Protokoll-Fenster schweigt - sonst waere das ein ueberfluessiger Abruf.
    if (paketFrisch || !laufendesSpiel || !turnier) {
      setErsatzPaket(undefined);
      return;
    }
    let abgebrochen = false;
    (async () => {
      try {
        const { protokoll, events } = await getSpielProtokoll(laufendesSpiel._id);
        if (abgebrochen) return;
        const stand = berechneProtokollStand(events, {
          timeoutsJeHalbzeit: turnier.timeoutsJeHalbzeit,
          auswechslungenJeHalbzeit: turnier.auswechslungenJeHalbzeit,
          tordifferenzAbbruch: turnier.tordifferenzAbbruch,
          tordifferenzLimit: turnier.tordifferenzLimit,
        });
        setErsatzPaket({
          typ: "stand",
          turnierId: laufendesSpiel.turnierId,
          feldId: laufendesSpiel.feldId,
          spielId: laufendesSpiel._id,
          runde: laufendesSpiel.runde,
          teamA: mannschaftName(laufendesSpiel.mannschaftAId),
          teamB: mannschaftName(laufendesSpiel.mannschaftBId),
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
        });
      } catch {
        // Kein Protokoll (noch nicht begonnen) - dann bleibt es bei der Wartesicht.
        if (!abgebrochen) setErsatzPaket(undefined);
      }
    })();
    return () => {
      abgebrochen = true;
    };
    // mannschaftName haengt an `mannschaften` und wird deshalb dort mitgefuehrt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paketFrisch, laufendesSpiel, turnier, mannschaften, spiele]);

  function mannschaftName(id: string): string {
    return mannschaften.find((m) => m._id === id)?.name ?? "Mannschaft";
  }

  // ------------------------------------------------------------------- Vollbild / Bildschirm

  useEffect(() => {
    const merken = () => setVollbild(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", merken);
    return () => document.removeEventListener("fullscreenchange", merken);
  }, []);

  /**
   * Der Bildschirm darf waehrend eines Spiels nicht abschalten. Die Sperre geht verloren, wenn
   * das Fenster in den Hintergrund geraet - deshalb bei jeder Rueckkehr neu anfordern.
   */
  useEffect(() => {
    let sperre: { release: () => Promise<void> } | undefined;
    const anfordern = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<never> } }).wakeLock;
        if (wl) sperre = await wl.request("screen");
      } catch {
        // Nicht überall verfügbar (und ohne HTTPS oft gar nicht) - kein Grund zu stören.
      }
    };
    void anfordern();
    document.addEventListener("visibilitychange", anfordern);
    return () => {
      document.removeEventListener("visibilitychange", anfordern);
      void sperre?.release().catch(() => {});
    };
  }, []);

  async function vollbildUmschalten() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Vom Browser abgelehnt - der Rest der Seite funktioniert unverändert.
    }
  }

  function themeUmschalten() {
    const neu: AnzeigeTheme = theme === "dunkel" ? "hell" : "dunkel";
    setTheme(neu);
    merkeAnzeigeTheme(neu);
  }

  // Blendet Kopfzeile/Fußzeile der App aus - dieselbe Mechanik wie die Protokoll-Vollbildseite.
  useEffect(() => {
    document.body.classList.add("protokoll-vollbild-aktiv");
    return () => document.body.classList.remove("protokoll-vollbild-aktiv");
  }, []);

  // --------------------------------------------------------------------------------- Anzeige

  const aktiv = paketFrisch ? paket : ersatzPaket;
  const feldName = turnier?.felder?.find((f) => f.feldId === feldId)?.name ?? "Feld";
  const klasse = `sr-sicht sr-sicht-${theme}`;

  const bedienung = (
    <div className="sr-bedienung">
      <button type="button" onClick={themeUmschalten}>
        {theme === "dunkel" ? "Helle Darstellung" : "Dunkle Darstellung"}
      </button>
      <button type="button" onClick={() => void vollbildUmschalten()}>
        {vollbild ? "Vollbild beenden" : "Vollbild"}
      </button>
    </div>
  );

  if (fehler) {
    return (
      <div className={klasse}>
        <div className="sr-tafel">
          <p role="alert" className="sr-fehler">
            {fehler}
          </p>
        </div>
        {bedienung}
      </div>
    );
  }

  // ------------------------------------------------------------------------------ Wartesicht

  if (!aktiv) {
    const aufDiesemFeld = feldId ? spiele.filter((s) => aufFeld(s, feldId, nurEinFeld)) : [];
    const nachZeit = (a: Spiel, b: Spiel) =>
      (a.startzeitGeplant ?? "").localeCompare(b.startzeitGeplant ?? "");
    const fertige = aufDiesemFeld
      .filter((s) => s.status === "beendet" || s.status === "abgeschlossen")
      .sort(nachZeit);
    const zuletzt = fertige[fertige.length - 1];
    const naechstes = aufDiesemFeld.filter((s) => s.status === "geplant").sort(nachZeit)[0];

    return (
      <div className={klasse}>
        <div className="sr-tafel">
          <div className="sr-kopf">
            <span>{feldName}</span>
            <span className="sr-status-still">Kein Spiel</span>
          </div>
          <div className="sr-warte">
            {zuletzt && (
              <div className="sr-warte-zeile">
                <div className="sr-warte-label">
                  Zuletzt{zuletzt.runde ? ` · Spiel ${zuletzt.runde}` : ""}
                </div>
                <div className="sr-warte-wert">
                  {mannschaftName(zuletzt.mannschaftAId)}{" "}
                  <span className="sr-hervor">
                    {zuletzt.ergebnisA ?? 0} : {zuletzt.ergebnisB ?? 0}
                  </span>{" "}
                  {mannschaftName(zuletzt.mannschaftBId)}
                </div>
              </div>
            )}
            {naechstes ? (
              <div className="sr-warte-zeile">
                <div className="sr-warte-label">
                  Als Nächstes{naechstes.runde ? ` · Spiel ${naechstes.runde}` : ""}
                </div>
                <div className="sr-warte-wert sr-warte-gross">
                  {mannschaftName(naechstes.mannschaftAId)} – {mannschaftName(naechstes.mannschaftBId)}
                </div>
                {naechstes.startzeitGeplant && (
                  <div className="sr-warte-wert">
                    <span className="sr-hervor">{formatiereUhrzeit(naechstes.startzeitGeplant)}</span>
                  </div>
                )}
              </div>
            ) : (
              !zuletzt && <div className="sr-warte-wert">Für dieses Feld ist nichts geplant.</div>
            )}
          </div>
        </div>
        {bedienung}
      </div>
    );
  }

  // -------------------------------------------------------------------------- Spiel-Anzeige

  const stand: AnzeigeStand = aktiv.stand;

  /**
   * DIE Spiegelung: Die Protokollseite zeigt bei `seiteAVertauscht` B links - hier ist es
   * genau umgekehrt, weil der Schiedsrichter von der anderen Feldseite schaut. Weil dieser
   * eine Ausdruck alles steuert (Namen, Fouls, Auszeiten, 8-Sekunden-Band), kippt die Anzeige
   * beim automatischen Seitenwechsel zur Halbzeit von selbst mit.
   */
  const linkeSeite: Mannschaftsseite = aktiv.seiteAVertauscht ? "A" : "B";
  const rechteSeite: Mannschaftsseite = aktiv.seiteAVertauscht ? "B" : "A";

  const teamName = (seite: Mannschaftsseite) => (seite === "A" ? aktiv.teamA : aktiv.teamB);
  const tore = (seite: Mannschaftsseite) => (seite === "A" ? stand.ergebnisA : stand.ergebnisB);

  const spielzeitSekunden =
    stand.gespielteSekunden +
    (stand.uhrLaeuft && stand.laufendSeit
      ? Math.max(0, Math.round((Date.now() - new Date(stand.laufendSeit).getTime()) / 1000))
      : 0);
  const sollSekunden =
    stand.abschnitt === "FW"
      ? undefined
      : stand.abschnitt === "V1" || stand.abschnitt === "V2"
        ? 120
        : aktiv.spielzeitMinuten * 60;
  const ueberhang = sollSekunden !== undefined && spielzeitSekunden > sollSekunden;

  const restZeit =
    sollSekunden === undefined
      ? "–"
      : ueberhang
        ? `-${formatiereSpielzeit(spielzeitSekunden - sollSekunden)}`
        : formatiereSpielzeit(sollSekunden - spielzeitSekunden);

  const restSekunden = (seit: { zeitstempel: string }) =>
    Math.ceil((ACHT_SEKUNDEN_MS - (Date.now() - new Date(seit.zeitstempel).getTime())) / 1000);

  /**
   * Das 8-Sekunden-Band. Drei Faelle, in dieser Reihenfolge (identisch zur Protokollseite,
   * damit beide Fenster nie Verschiedenes behaupten):
   * 1. Strafwurf/Penalty - laeuft OHNE die uhrLaeuft-Bedingung, denn dabei ruht die Spielzeit.
   * 2. Nach einer Kontrolle - Frist genau der kontrollierenden Mannschaft.
   * 3. Nach einem Wurf, solange keine Seite den Ball hat - neutral, ueber die volle Breite.
   */
  const band = (() => {
    if (stand.strafwurfFrist) {
      const rest = restSekunden(stand.strafwurfFrist);
      return {
        seite: stand.strafwurfFrist.mannschaft,
        wert: Math.max(0, rest),
        titel: stand.strafwurfFrist.art === "P" ? "Penalty" : "Strafwurf",
        unter: `${teamName(stand.strafwurfFrist.mannschaft)} wirft`,
        abgelaufen: rest <= 0,
      };
    }
    if (stand.uhrLaeuft && stand.letzteKontrolle) {
      const rest = restSekunden(stand.letzteKontrolle);
      return {
        seite: stand.letzteKontrolle.mannschaft,
        wert: Math.max(0, rest),
        titel: teamName(stand.letzteKontrolle.mannschaft),
        unter: "seit Kontrolle",
        abgelaufen: rest <= 0,
      };
    }
    if (stand.uhrLaeuft && stand.letzterWurf) {
      const rest = restSekunden(stand.letzterWurf);
      return {
        seite: undefined,
        wert: Math.max(0, rest),
        titel: "Ball unterwegs",
        unter: "Seite offen",
        abgelaufen: rest <= 0,
      };
    }
    return undefined;
  })();

  const statusText = stand.spielBeendet
    ? "Spiel beendet"
    : !stand.spielGestartet
      ? "Noch nicht gestartet"
      : stand.uhrLaeuft
        ? "Spiel läuft"
        : stand.inPause
          ? "Pause"
          : "Uhr steht";

  const teamBlock = (seite: Mannschaftsseite, ausrichtung: "links" | "rechts") => (
    <div className={`sr-team sr-team-${ausrichtung}`}>
      <div className="sr-teamname">{teamName(seite)}</div>
      <div className="sr-chips">
        <span>
          Fouls <b className={stand.fouls[seite] >= 3 ? "sr-alarm" : undefined}>{stand.fouls[seite]}</b>
        </span>
        <span>
          Auszeit{" "}
          <b>
            {stand.timeouts[seite]}/{aktiv.timeoutsJeHalbzeit}
          </b>
        </span>
        {/* Der Wurfzaehler erscheint erst ab dem dritten Wurf in Folge und ab dem vierten rot:
            Der vierte Wurf desselben Spielers ist ein Foul, das der Schiedsrichter pfeifen
            muss - vorher ist die Zahl fuer ihn ohne Belang und wuerde nur ablenken. */}
        {stand.wurfAnzahl[seite] >= 3 && (
          <span>
            <b className={stand.wurfAnzahl[seite] >= 4 ? "sr-alarm" : undefined}>
              {stand.wurfAnzahl[seite]}. Wurf in Folge
            </b>
          </span>
        )}
      </div>
    </div>
  );

  const bandFeld = (seite: Mannschaftsseite | "voll") => {
    if (!band) return <div className="sr-band-feld sr-band-leer" />;
    const zeigen = band.seite === undefined ? seite === "voll" : band.seite === seite;
    if (!zeigen) return <div className="sr-band-feld sr-band-leer" />;
    const art = band.abgelaufen ? "sr-band-alarm" : band.seite === undefined ? "sr-band-offen" : "sr-band-aktiv";
    return (
      <div className={`sr-band-feld ${art} ${seite === rechteSeite ? "sr-band-rechts" : ""}`}>
        <div className="sr-band-zahl">{band.wert}</div>
        <div className="sr-band-text">
          <strong>{band.titel}</strong>
          <span>{band.unter}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={klasse}>
      <div className="sr-tafel">
        <div className="sr-kopf">
          <span>
            {feldName} · {ABSCHNITT_BESCHRIFTUNG[stand.abschnitt] ?? stand.abschnitt}
            {laufendeSpiele.length > 1 && " · Achtung: zwei Spiele offen"}
          </span>
          <span className={stand.uhrLaeuft ? "sr-status" : "sr-status-still"}>{statusText}</span>
        </div>

        <div className="sr-mitte">
          {teamBlock(linkeSeite, "links")}
          <div className="sr-kern">
            <div className={`sr-zeit ${ueberhang ? "sr-alarm" : ""}`}>{restZeit}</div>
            <div className="sr-kern-label">{ueberhang ? "Überhang" : "Restzeit"}</div>
            <div className="sr-stand">
              {tore(linkeSeite)} : {tore(rechteSeite)}
            </div>
          </div>
          {teamBlock(rechteSeite, "rechts")}
        </div>

        {band && band.seite === undefined ? (
          <div className="sr-band">{bandFeld("voll")}</div>
        ) : (
          <div className="sr-band">
            {bandFeld(linkeSeite)}
            {bandFeld(rechteSeite)}
          </div>
        )}

        {!paketFrisch && (
          <p className="sr-verzoegert">
            Protokoll-Fenster nicht erreichbar – Anzeige kann bis zu 15 Sekunden alt sein.
          </p>
        )}
      </div>
      {bedienung}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import {
  erzeugeSpielplan,
  getMannschaften,
  getSpiele,
  getSpielplanVorschlag,
  getTurnier,
  reihenfolgeAendern,
  spielStartzeitAendern,
  type SpielplanVorschlagEintrag,
} from "../api";
import { formatiereUhrzeit } from "../format";
import { berechneStartzeit } from "../zeitplanung";

const BACK_TO_BACK_HINWEIS = "Direktes Folgespiel (Back-to-Back) konnte nicht vermieden werden";

function verschobeneListe<T>(liste: T[], vonIndex: number, nachIndex: number): T[] {
  const kopie = [...liste];
  const [element] = kopie.splice(vonIndex, 1);
  kopie.splice(nachIndex, 0, element);
  return kopie;
}

/** HH:mm im lokalen Zeitanteil des ISO-Zeitstempels - passend zum Wert eines <input type="time">. */
function zeitEingabeWert(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function mitNeuerUhrzeit(iso: string, hhmm: string): string {
  const [stunden, minuten] = hhmm.split(":").map(Number);
  const datum = new Date(iso);
  datum.setHours(stunden, minuten, 0, 0);
  return datum.toISOString();
}

/**
 * Nach einer manuellen Umsortierung muss auch neu geprueft werden, ob ein direktes
 * Folgespiel entsteht - der Algorithmus laeuft dabei nicht erneut, deshalb hier eine
 * einfache Nachbarschaftspruefung (jede Position ist nach dem Verschieben ohnehin ein
 * eigener Slot, siehe verschobeneListe-Aufrufer).
 */
function mitNeuBerechnetenWarnungen(eintraege: SpielplanVorschlagEintrag[]): SpielplanVorschlagEintrag[] {
  return eintraege.map((eintrag, i) => {
    if (i === 0) return { ...eintrag, warnung: undefined };
    const vorheriger = eintraege[i - 1];
    const teamsVorher = [vorheriger.mannschaftAId, vorheriger.mannschaftBId];
    const kollidiert = teamsVorher.includes(eintrag.mannschaftAId) || teamsVorher.includes(eintrag.mannschaftBId);
    return { ...eintrag, warnung: kollidiert ? BACK_TO_BACK_HINWEIS : undefined };
  });
}

interface Props {
  turnierId: string;
  /** Wird nach jedem Laden/Aendern mit der aktuellen Spieleliste aufgerufen. */
  onGeaendert?: (spiele: Spiel[]) => void;
}

export function SpielplanVerwaltung({ turnierId, onGeaendert }: Props) {
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [vorschlag, setVorschlag] = useState<SpielplanVorschlagEintrag[] | undefined>();
  const [wiederholungen, setWiederholungen] = useState<1 | 2>(1);
  const [fehler, setFehler] = useState<string | undefined>();
  const [ziehIndex, setZiehIndex] = useState<number | null>(null);
  const [ziehZielIndex, setZiehZielIndex] = useState<number | null>(null);

  const laden = useCallback(async () => {
    try {
      const [t, m, s] = await Promise.all([getTurnier(turnierId), getMannschaften(turnierId), getSpiele(turnierId)]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      onGeaendert?.(s);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  const nameVon = (mannschaftId: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;

  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));
  const vorschlagSortiert = vorschlag ? [...vorschlag].sort((a, b) => a.slot - b.slot) : undefined;

  async function anNeuePositionVerschieben(vonIndex: number, nachIndex: number) {
    if (vonIndex === nachIndex || vonIndex < 0 || nachIndex < 0 || nachIndex >= spieleSortiert.length) return;
    const neueReihenfolge = verschobeneListe(spieleSortiert, vonIndex, nachIndex).map((s) => s._id);
    try {
      await reihenfolgeAendern(turnierId, neueReihenfolge);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Reihenfolge");
    }
  }

  async function startzeitPersistiertAendern(spiel: Spiel, hhmm: string) {
    if (!spiel.startzeitGeplant) return;
    try {
      await spielStartzeitAendern(spiel._id, mitNeuerUhrzeit(spiel.startzeitGeplant, hhmm));
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Startzeit");
    }
  }

  /**
   * Verschiebt einen Eintrag im noch ungespeicherten Vorschlag. Rein clientseitig,
   * kein Server-Rundlauf: slot/Startzeit werden mit derselben Formel wie im Backend
   * (frontend/src/zeitplanung.ts) aus der neuen Position neu berechnet, Warnungen
   * werden fuer die neue Nachbarschaft neu geprueft.
   */
  function vorschlagVerschieben(vonIndex: number, nachIndex: number) {
    if (!turnier || !vorschlagSortiert) return;
    if (vonIndex === nachIndex || vonIndex < 0 || nachIndex < 0 || nachIndex >= vorschlagSortiert.length) return;
    const neu = verschobeneListe(vorschlagSortiert, vonIndex, nachIndex).map((eintrag, index) => ({
      ...eintrag,
      slot: index,
      startzeitGeplant: berechneStartzeit(turnier, index),
    }));
    setVorschlag(mitNeuBerechnetenWarnungen(neu));
  }

  /** Verschiebt einen Eintrag im Vorschlag auf eine manuell gewaehlte Uhrzeit; alle nachfolgenden ruecken um dasselbe Delta mit. */
  function vorschlagZeitAendern(index: number, hhmm: string) {
    if (!vorschlagSortiert) return;
    const eintrag = vorschlagSortiert[index];
    if (!eintrag.startzeitGeplant) return;
    const neueZeit = mitNeuerUhrzeit(eintrag.startzeitGeplant, hhmm);
    const deltaMs = new Date(neueZeit).getTime() - new Date(eintrag.startzeitGeplant).getTime();
    const aktualisiert = vorschlagSortiert.map((e, i) => {
      if (i < index || !e.startzeitGeplant) return e;
      return { ...e, startzeitGeplant: new Date(new Date(e.startzeitGeplant).getTime() + deltaMs).toISOString() };
    });
    setVorschlag(aktualisiert);
  }

  async function vorschlagAnzeigen() {
    try {
      const ergebnis = await getSpielplanVorschlag(turnierId, wiederholungen);
      setVorschlag(ergebnis.spiele);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Berechnen des Vorschlags");
    }
  }

  async function spielplanErzeugen() {
    try {
      const eintraege = vorschlagSortiert?.map(({ mannschaftAId, mannschaftBId, feldId, slot, warnung }) => ({
        mannschaftAId,
        mannschaftBId,
        feldId,
        slot,
        warnung,
      }));
      await erzeugeSpielplan(turnierId, wiederholungen, eintraege);
      setVorschlag(undefined);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Erzeugen des Spielplans");
    }
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  return (
    <div>
      {fehler && <p role="alert">{fehler}</p>}

      <div className="feld">
        <label htmlFor="wiederholungen">Modus</label>
        <select
          id="wiederholungen"
          value={wiederholungen}
          onChange={(e) => setWiederholungen(Number(e.target.value) === 2 ? 2 : 1)}
        >
          <option value={1}>Jeder gegen Jeden (einfach)</option>
          <option value={2}>Jeder zweimal gegen Jeden (doppelt)</option>
        </select>
      </div>

      <button type="button" onClick={vorschlagAnzeigen} disabled={mannschaften.length < 2}>
        Vorschlag anzeigen
      </button>

      {/* Ergebnisbereich steht bewusst immer an derselben Stelle unterhalb der Steuerung:
          Vorschau, falls gerade berechnet, sonst der zuletzt gespeicherte Spielplan - nie beides
          gleichzeitig und nie "oberhalb" der gerade benutzten Bedienelemente. */}
      {vorschlag ? (
        <>
          <h3>Vorschau (noch nicht gespeichert)</h3>
          {spiele.length > 0 && (
            <p>
              Es existiert bereits ein gespeicherter Spielplan (Version {turnier.spielplanVersion}). Er bleibt
              unverändert, bis du „Spielplan erzeugen" klickst.
            </p>
          )}
          <div className="tabellen-wrapper">
            <table>
              <caption className="sr-only">
                Berechneter Spielplan-Vorschlag, Reihenfolge und Startzeit per Ziehpunkt, Pfeiltasten bzw. Zeitfeld
                änderbar
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Reihenfolge</span>
                  </th>
                  <th scope="col">Spiel</th>
                  <th scope="col">Feld</th>
                  <th scope="col">Startzeit</th>
                  <th scope="col">Mannschaft A</th>
                  <th scope="col">Mannschaft B</th>
                  <th scope="col">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {vorschlagSortiert!.map((eintrag, i) => (
                  <tr
                    key={i}
                    className={ziehZielIndex === i ? "zieh-ziel" : undefined}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setZiehZielIndex(i);
                    }}
                    onDrop={() => {
                      if (ziehIndex !== null) vorschlagVerschieben(ziehIndex, i);
                      setZiehIndex(null);
                      setZiehZielIndex(null);
                    }}
                  >
                    <td className="reihenfolge-zelle">
                      <span
                        className="ziehpunkt"
                        draggable
                        onDragStart={() => setZiehIndex(i)}
                        onDragEnd={() => {
                          setZiehIndex(null);
                          setZiehZielIndex(null);
                        }}
                        aria-hidden="true"
                        title="Zum Verschieben ziehen"
                      >
                        ⠿
                      </span>
                      <button
                        type="button"
                        className="symbol-button"
                        onClick={() => vorschlagVerschieben(i, i - 1)}
                        disabled={i === 0}
                        aria-label={`Spiel ${eintrag.slot + 1} nach vorne verschieben`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="symbol-button"
                        onClick={() => vorschlagVerschieben(i, i + 1)}
                        disabled={i === vorschlagSortiert!.length - 1}
                        aria-label={`Spiel ${eintrag.slot + 1} nach hinten verschieben`}
                      >
                        ▼
                      </button>
                    </td>
                    <td>{eintrag.slot + 1}</td>
                    <td>{eintrag.feldId}</td>
                    <td>
                      <label className="sr-only" htmlFor={`vorschau-zeit-${i}`}>
                        Startzeit von Spiel {eintrag.slot + 1}
                      </label>
                      {eintrag.startzeitGeplant ? (
                        <input
                          id={`vorschau-zeit-${i}`}
                          type="time"
                          value={zeitEingabeWert(eintrag.startzeitGeplant)}
                          onChange={(e) => vorschlagZeitAendern(i, e.target.value)}
                        />
                      ) : (
                        "–"
                      )}
                    </td>
                    <td>{nameVon(eintrag.mannschaftAId)}</td>
                    <td>{nameVon(eintrag.mannschaftBId)}</td>
                    <td>{eintrag.warnung ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={spielplanErzeugen}>
            {spiele.length > 0 ? "Spielplan neu erzeugen" : "Spielplan erzeugen"}
          </button>{" "}
          <button type="button" onClick={() => setVorschlag(undefined)}>
            Vorschlag verwerfen
          </button>
        </>
      ) : spiele.length > 0 ? (
        <>
          <p>Spielplan ist bereits erzeugt (Version {turnier.spielplanVersion}).</p>
          <div className="tabellen-wrapper">
            <table>
              <caption className="sr-only">
                Erzeugter Spielplan, Reihenfolge und Startzeit per Ziehpunkt, Pfeiltasten bzw. Zeitfeld änderbar
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Reihenfolge</span>
                  </th>
                  <th scope="col">Spiel</th>
                  <th scope="col">Feld</th>
                  <th scope="col">Startzeit</th>
                  <th scope="col">Mannschaft A</th>
                  <th scope="col">Mannschaft B</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {spieleSortiert.map((s, i) => (
                  <tr
                    key={s._id}
                    className={ziehZielIndex === i ? "zieh-ziel" : undefined}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setZiehZielIndex(i);
                    }}
                    onDrop={() => {
                      if (ziehIndex !== null) anNeuePositionVerschieben(ziehIndex, i);
                      setZiehIndex(null);
                      setZiehZielIndex(null);
                    }}
                  >
                    <td className="reihenfolge-zelle">
                      <span
                        className="ziehpunkt"
                        draggable={s.status === "geplant"}
                        onDragStart={() => setZiehIndex(i)}
                        onDragEnd={() => {
                          setZiehIndex(null);
                          setZiehZielIndex(null);
                        }}
                        aria-hidden="true"
                        title="Zum Verschieben ziehen"
                      >
                        ⠿
                      </span>
                      <button
                        type="button"
                        className="symbol-button"
                        onClick={() => anNeuePositionVerschieben(i, i - 1)}
                        disabled={i === 0 || s.status !== "geplant"}
                        aria-label={`Spiel ${s.runde} nach vorne verschieben`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="symbol-button"
                        onClick={() => anNeuePositionVerschieben(i, i + 1)}
                        disabled={i === spieleSortiert.length - 1 || s.status !== "geplant"}
                        aria-label={`Spiel ${s.runde} nach hinten verschieben`}
                      >
                        ▼
                      </button>
                    </td>
                    <td>{s.runde}</td>
                    <td>{s.feldId}</td>
                    <td>
                      <label className="sr-only" htmlFor={`spiel-zeit-${s._id}`}>
                        Startzeit von Spiel {s.runde}
                      </label>
                      {s.startzeitGeplant ? (
                        <input
                          id={`spiel-zeit-${s._id}`}
                          type="time"
                          value={zeitEingabeWert(s.startzeitGeplant)}
                          disabled={s.status !== "geplant"}
                          onChange={(e) => startzeitPersistiertAendern(s, e.target.value)}
                        />
                      ) : (
                        formatiereUhrzeit(s.startzeitGeplant)
                      )}
                    </td>
                    <td>{nameVon(s.mannschaftAId)}</td>
                    <td>{nameVon(s.mannschaftBId)}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>Noch kein Spielplan erzeugt.</p>
      )}
    </div>
  );
}

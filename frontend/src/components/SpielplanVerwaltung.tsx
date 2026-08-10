import { useCallback, useEffect, useState } from "react";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import { berechneStartzeit } from "../zeitplanung";
import {
  erzeugeSpielplan,
  getMannschaften,
  getSpiele,
  getSpielplanVorschlag,
  getTurnier,
  reihenfolgeAendern,
  type SpielplanVorschlagEintrag,
} from "../api";

function verschobeneListe<T>(liste: T[], vonIndex: number, nachIndex: number): T[] {
  const kopie = [...liste];
  const [element] = kopie.splice(vonIndex, 1);
  kopie.splice(nachIndex, 0, element);
  return kopie;
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

  const startzeitAnzeigen = (startzeitGeplant: string | undefined) =>
    startzeitGeplant
      ? new Date(startzeitGeplant).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : "–";

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

  /**
   * Verschiebt einen Eintrag im noch ungespeicherten Vorschlag. Rein clientseitig,
   * kein Server-Rundlauf: slot/Startzeit werden mit derselben Formel wie im Backend
   * (shared/zeitplanung) aus der neuen Position neu berechnet.
   */
  function vorschlagVerschieben(vonIndex: number, nachIndex: number) {
    if (!turnier || !vorschlagSortiert) return;
    if (vonIndex === nachIndex || vonIndex < 0 || nachIndex < 0 || nachIndex >= vorschlagSortiert.length) return;
    const neu = verschobeneListe(vorschlagSortiert, vonIndex, nachIndex).map((eintrag, index) => ({
      ...eintrag,
      slot: index,
      startzeitGeplant: berechneStartzeit(turnier, index),
    }));
    setVorschlag(neu);
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
      await erzeugeSpielplan(turnierId, wiederholungen);
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
      </button>{" "}
      <button type="button" onClick={spielplanErzeugen} disabled={mannschaften.length < 2}>
        {spiele.length > 0 ? "Spielplan neu erzeugen" : "Spielplan erzeugen"}
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
              unverändert, bis du unten auf „Spielplan erzeugen“ klickst.
            </p>
          )}
          <table>
            <caption className="sr-only">
              Berechneter Spielplan-Vorschlag, Reihenfolge per Ziehpunkt oder Pfeiltasten änderbar
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
                  <td>
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
                  <td>{startzeitAnzeigen(eintrag.startzeitGeplant)}</td>
                  <td>{nameVon(eintrag.mannschaftAId)}</td>
                  <td>{nameVon(eintrag.mannschaftBId)}</td>
                  <td>{eintrag.warnung ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setVorschlag(undefined)}>
            Vorschlag verwerfen
          </button>
        </>
      ) : spiele.length > 0 ? (
        <>
          <p>Spielplan ist bereits erzeugt (Version {turnier.spielplanVersion}).</p>
          <table>
            <caption className="sr-only">
              Erzeugter Spielplan, Reihenfolge per Ziehpunkt oder Pfeiltasten änderbar
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
                  <td>
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
                  <td>{startzeitAnzeigen(s.startzeitGeplant)}</td>
                  <td>{nameVon(s.mannschaftAId)}</td>
                  <td>{nameVon(s.mannschaftBId)}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>Noch kein Spielplan erzeugt.</p>
      )}
    </div>
  );
}

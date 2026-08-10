import { useCallback, useEffect, useState } from "react";
import type { MannschaftImTurnier, Spiel, Spielfeld, Turnier } from "@torball/shared";
import {
  erzeugeSpielplan,
  getMannschaften,
  getSpiele,
  getSpielplanVorschlag,
  getTurnier,
  reihenfolgeAendern,
  spielAnpassen,
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

interface WarnbarerEintrag {
  mannschaftAId: string;
  mannschaftBId: string;
  slot: number;
}

/**
 * Prueft direkte Folgespiele ueber die echte Zeit-Slot-Nachbarschaft (nicht die
 * Listenposition!): bei mehreren Feldern koennen zwei Spiele denselben Slot teilen
 * (= gleichzeitig auf verschiedenen Feldern), eine reine "voriger Listeneintrag"-
 * Pruefung wuerde dann teils die falschen Nachbarn vergleichen.
 */
function slotWarnungen<T extends WarnbarerEintrag>(eintraege: T[]): (string | undefined)[] {
  const teamsProSlot = new Map<number, Set<string>>();
  for (const e of eintraege) {
    const set = teamsProSlot.get(e.slot) ?? new Set<string>();
    set.add(e.mannschaftAId);
    set.add(e.mannschaftBId);
    teamsProSlot.set(e.slot, set);
  }
  return eintraege.map((e) => {
    const vorSlot = teamsProSlot.get(e.slot - 1);
    const betroffen = vorSlot?.has(e.mannschaftAId) || vorSlot?.has(e.mannschaftBId);
    return betroffen ? BACK_TO_BACK_HINWEIS : undefined;
  });
}

/** Findet den naechsten/vorigen Eintrag auf demselben Feld (ueberspringt Eintraege anderer Felder). */
function nachbarImFeldIndex<T extends { feldId?: string }>(
  sortiert: T[],
  aktuellerIndex: number,
  feldId: string,
  richtung: -1 | 1,
): number | null {
  for (let i = aktuellerIndex + richtung; i >= 0 && i < sortiert.length; i += richtung) {
    if (sortiert[i].feldId === feldId) return i;
  }
  return null;
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
  const [aktuellesFeld, setAktuellesFeld] = useState<string | undefined>();

  const laden = useCallback(async () => {
    try {
      const [t, m, s] = await Promise.all([getTurnier(turnierId), getMannschaften(turnierId), getSpiele(turnierId)]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      onGeaendert?.(s);
      setFehler(undefined);
      setAktuellesFeld((bisherig) => bisherig ?? t.felder[0]?.feldId);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  const nameVon = (mannschaftId: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;

  const mehrereFelder = (turnier?.felder.length ?? 0) > 1;

  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));
  const spielWarnungen = slotWarnungen(spieleSortiert.map((s) => ({ ...s, slot: Number(s.runde) })));

  const vorschlagSortiert = vorschlag ? [...vorschlag].sort((a, b) => a.slot - b.slot) : undefined;

  const angezeigteSpiele = mehrereFelder
    ? spieleSortiert.filter((s) => s.feldId === aktuellesFeld)
    : spieleSortiert;
  const angezeigterVorschlag = vorschlagSortiert
    ? mehrereFelder
      ? vorschlagSortiert.filter((e) => e.feldId === aktuellesFeld)
      : vorschlagSortiert
    : undefined;

  function FeldTabs({ felder }: { felder: Spielfeld[] }) {
    if (felder.length <= 1) return null;
    return (
      <div role="tablist" aria-label="Spielfeld auswählen" className="feld-tabs">
        {felder.map((f) => (
          <button
            key={f.feldId}
            type="button"
            role="tab"
            aria-selected={aktuellesFeld === f.feldId}
            className={aktuellesFeld === f.feldId ? "tab tab-aktiv" : "tab"}
            onClick={() => setAktuellesFeld(f.feldId)}
          >
            {f.name}
          </button>
        ))}
      </div>
    );
  }

  async function anNeuePositionVerschieben(vonVollIndex: number, richtung: -1 | 1) {
    if (!aktuellesFeld) return;

    if (!mehrereFelder) {
      const nachIndex = vonVollIndex + richtung;
      if (nachIndex < 0 || nachIndex >= spieleSortiert.length) return;
      const neueReihenfolge = verschobeneListe(spieleSortiert, vonVollIndex, nachIndex).map((s) => s._id);
      try {
        await reihenfolgeAendern(turnierId, neueReihenfolge);
        await laden();
      } catch (err) {
        setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Reihenfolge");
      }
      return;
    }

    // Bei mehreren Feldern: nur runde+Startzeit der beiden Spiele auf DEMSELBEN Feld gezielt
    // vertauschen (nicht reihenfolgeAendern - das wuerde ALLE Spiele fortlaufend neu
    // durchnummerieren und damit die Feld-Parallelitaet der uebrigen Spiele zerstoeren).
    const nachbarIndex = nachbarImFeldIndex(spieleSortiert, vonVollIndex, aktuellesFeld, richtung);
    if (nachbarIndex === null) return;
    const a = spieleSortiert[vonVollIndex];
    const b = spieleSortiert[nachbarIndex];
    try {
      await Promise.all([
        spielAnpassen(a._id, { runde: b.runde, startzeitGeplant: b.startzeitGeplant }),
        spielAnpassen(b._id, { runde: a.runde, startzeitGeplant: a.startzeitGeplant }),
      ]);
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
   * kein Server-Rundlauf: bei einem Feld wird die Position (und damit slot/Startzeit)
   * komplett neu vergeben; bei mehreren Feldern werden nur die Slots der beiden
   * betroffenen Spiele auf demselben Feld vertauscht, der Rest bleibt unberuehrt.
   * Warnungen werden in jedem Fall fuer die neue Nachbarschaft neu berechnet.
   */
  function vorschlagVerschieben(vonVollIndex: number, richtung: -1 | 1) {
    if (!turnier || !vorschlagSortiert || !aktuellesFeld) return;

    if (!mehrereFelder) {
      const nachIndex = vonVollIndex + richtung;
      if (nachIndex < 0 || nachIndex >= vorschlagSortiert.length) return;
      const neu = verschobeneListe(vorschlagSortiert, vonVollIndex, nachIndex).map((eintrag, index) => ({
        ...eintrag,
        slot: index,
        startzeitGeplant: berechneStartzeit(turnier, index),
      }));
      setVorschlag(neu.map((e, i) => ({ ...e, warnung: slotWarnungen(neu)[i] })));
      return;
    }

    const nachbarIndex = nachbarImFeldIndex(vorschlagSortiert, vonVollIndex, aktuellesFeld, richtung);
    if (nachbarIndex === null) return;
    const neu = vorschlagSortiert.map((e, i) => {
      if (i === vonVollIndex) return { ...e, slot: vorschlagSortiert[nachbarIndex].slot };
      if (i === nachbarIndex) return { ...e, slot: vorschlagSortiert[vonVollIndex].slot };
      return e;
    });
    const warnungen = slotWarnungen(neu);
    setVorschlag(
      neu.map((e, i) => ({ ...e, startzeitGeplant: berechneStartzeit(turnier, e.slot), warnung: warnungen[i] })),
    );
  }

  /** Verschiebt einen Eintrag im Vorschlag auf eine manuell gewaehlte Uhrzeit; alle nachfolgenden ruecken um dasselbe Delta mit. */
  function vorschlagZeitAendern(vollIndex: number, hhmm: string) {
    if (!vorschlagSortiert) return;
    const eintrag = vorschlagSortiert[vollIndex];
    if (!eintrag.startzeitGeplant) return;
    const neueZeit = mitNeuerUhrzeit(eintrag.startzeitGeplant, hhmm);
    const deltaMs = new Date(neueZeit).getTime() - new Date(eintrag.startzeitGeplant).getTime();
    const aktualisiert = vorschlagSortiert.map((e, i) => {
      if (i < vollIndex || !e.startzeitGeplant) return e;
      return { ...e, startzeitGeplant: new Date(new Date(e.startzeitGeplant).getTime() + deltaMs).toISOString() };
    });
    setVorschlag(aktualisiert);
  }

  async function neuerVorschlag() {
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

      <button type="button" onClick={neuerVorschlag} disabled={mannschaften.length < 2}>
        Neuer Vorschlag
      </button>

      <FeldTabs felder={turnier.felder} />

      {/* Ergebnisbereich steht bewusst immer an derselben Stelle unterhalb der Steuerung:
          Vorschau, falls gerade berechnet, sonst der zuletzt gespeicherte Spielplan - nie beides
          gleichzeitig und nie "oberhalb" der gerade benutzten Bedienelemente. */}
      {vorschlagSortiert && angezeigterVorschlag ? (
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
                  {!mehrereFelder && <th scope="col">Feld</th>}
                  <th scope="col">Startzeit</th>
                  <th scope="col">Mannschaft A</th>
                  <th scope="col">Mannschaft B</th>
                  <th scope="col">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {angezeigterVorschlag.map((eintrag, anzeigeIndex) => {
                  const vollIndex = vorschlagSortiert.indexOf(eintrag);
                  return (
                    <tr
                      key={vollIndex}
                      className={ziehZielIndex === vollIndex ? "zieh-ziel" : undefined}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setZiehZielIndex(vollIndex);
                      }}
                      onDrop={() => {
                        if (ziehIndex !== null) {
                          const richtung = ziehIndex < vollIndex ? 1 : -1;
                          vorschlagVerschieben(ziehIndex, richtung);
                        }
                        setZiehIndex(null);
                        setZiehZielIndex(null);
                      }}
                    >
                      <td className="reihenfolge-zelle">
                        <span
                          className="ziehpunkt"
                          draggable
                          onDragStart={() => setZiehIndex(vollIndex)}
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
                          onClick={() => vorschlagVerschieben(vollIndex, -1)}
                          disabled={anzeigeIndex === 0}
                          aria-label={`Spiel ${anzeigeIndex + 1} nach vorne verschieben`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="symbol-button"
                          onClick={() => vorschlagVerschieben(vollIndex, 1)}
                          disabled={anzeigeIndex === angezeigterVorschlag.length - 1}
                          aria-label={`Spiel ${anzeigeIndex + 1} nach hinten verschieben`}
                        >
                          ▼
                        </button>
                      </td>
                      <td>{anzeigeIndex + 1}</td>
                      {!mehrereFelder && <td>{eintrag.feldId}</td>}
                      <td>
                        <label className="sr-only" htmlFor={`vorschau-zeit-${vollIndex}`}>
                          Startzeit von Spiel {anzeigeIndex + 1}
                        </label>
                        {eintrag.startzeitGeplant ? (
                          <input
                            id={`vorschau-zeit-${vollIndex}`}
                            type="time"
                            value={zeitEingabeWert(eintrag.startzeitGeplant)}
                            onChange={(e) => vorschlagZeitAendern(vollIndex, e.target.value)}
                          />
                        ) : (
                          "–"
                        )}
                      </td>
                      <td>{nameVon(eintrag.mannschaftAId)}</td>
                      <td>{nameVon(eintrag.mannschaftBId)}</td>
                      <td>{eintrag.warnung ?? ""}</td>
                    </tr>
                  );
                })}
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
                  {!mehrereFelder && <th scope="col">Feld</th>}
                  <th scope="col">Startzeit</th>
                  <th scope="col">Mannschaft A</th>
                  <th scope="col">Mannschaft B</th>
                  <th scope="col">Status</th>
                  <th scope="col">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {angezeigteSpiele.map((s, anzeigeIndex) => {
                  const vollIndex = spieleSortiert.indexOf(s);
                  return (
                    <tr
                      key={s._id}
                      className={ziehZielIndex === vollIndex ? "zieh-ziel" : undefined}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setZiehZielIndex(vollIndex);
                      }}
                      onDrop={() => {
                        if (ziehIndex !== null) {
                          const richtung = ziehIndex < vollIndex ? 1 : -1;
                          anNeuePositionVerschieben(ziehIndex, richtung);
                        }
                        setZiehIndex(null);
                        setZiehZielIndex(null);
                      }}
                    >
                      <td className="reihenfolge-zelle">
                        <span
                          className="ziehpunkt"
                          draggable={s.status === "geplant"}
                          onDragStart={() => setZiehIndex(vollIndex)}
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
                          onClick={() => anNeuePositionVerschieben(vollIndex, -1)}
                          disabled={anzeigeIndex === 0 || s.status !== "geplant"}
                          aria-label={`Spiel ${anzeigeIndex + 1} nach vorne verschieben`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="symbol-button"
                          onClick={() => anNeuePositionVerschieben(vollIndex, 1)}
                          disabled={anzeigeIndex === angezeigteSpiele.length - 1 || s.status !== "geplant"}
                          aria-label={`Spiel ${anzeigeIndex + 1} nach hinten verschieben`}
                        >
                          ▼
                        </button>
                      </td>
                      <td>{anzeigeIndex + 1}</td>
                      {!mehrereFelder && <td>{s.feldId}</td>}
                      <td>
                        <label className="sr-only" htmlFor={`spiel-zeit-${s._id}`}>
                          Startzeit von Spiel {anzeigeIndex + 1}
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
                      <td>{spielWarnungen[vollIndex] ?? ""}</td>
                    </tr>
                  );
                })}
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

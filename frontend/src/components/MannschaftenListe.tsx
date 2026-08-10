import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { MannschaftImTurnier, Team, Verein } from "@torball/shared";
import {
  createMannschaft,
  deleteMannschaft,
  getMannschaften,
  getSpieler,
  getTeams,
  getVereine,
  mannschaftReihenfolgeAendern,
  updateMannschaft,
} from "../api";
import { BUNDESLAENDER } from "../bundeslaender";
import { SpielerKader } from "./SpielerKader";

interface MannschaftBearbeitung {
  name: string;
  bundesland: string;
  betreuer1Name: string;
  betreuer2Name: string;
  betreuer3Name: string;
}

function verschobeneListe<T>(liste: T[], vonIndex: number, nachIndex: number): T[] {
  const kopie = [...liste];
  const [element] = kopie.splice(vonIndex, 1);
  kopie.splice(nachIndex, 0, element);
  return kopie;
}

interface Props {
  turnierId: string;
  /** Wird nach jedem Laden/Aendern mit der aktuellen Liste aufgerufen (z.B. um "Weiter" im Anlege-Assistenten freizuschalten). */
  onGeaendert?: (mannschaften: MannschaftImTurnier[]) => void;
}

export function MannschaftenListe({ turnierId, onGeaendert }: Props) {
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const [neueMannschaft, setNeueMannschaft] = useState("");
  const [neuesBundesland, setNeuesBundesland] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [vereine, setVereine] = useState<Verein[]>([]);
  const [ausgewaehltesTeamId, setAusgewaehltesTeamId] = useState("");
  const mannschaftsnameRef = useRef<HTMLInputElement>(null);

  const [bearbeitung, setBearbeitung] = useState<Record<string, MannschaftBearbeitung>>({});
  const [ziehIndex, setZiehIndex] = useState<number | null>(null);
  const [ziehZielIndex, setZiehZielIndex] = useState<number | null>(null);
  // Mannschaften, deren Kader gerade aufgeklappt ist (mehrere gleichzeitig moeglich).
  const [offeneKader, setOffeneKader] = useState<Set<string>>(new Set());
  // Spielerzahl je Mannschaft - vorab geladen, damit schon im zugeklappten Zustand erkennbar
  // ist, wo bereits Kaderdaten erfasst sind. Wird beim Bearbeiten eines Kaders live aktualisiert.
  const [spielerAnzahl, setSpielerAnzahl] = useState<Record<string, number>>({});

  function kaderUmschalten(id: string) {
    setOffeneKader((bisherig) => {
      const naechste = new Set(bisherig);
      if (naechste.has(id)) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });
  }

  const laden = useCallback(async () => {
    try {
      const geladen = await getMannschaften(turnierId);
      setMannschaften(geladen);
      onGeaendert?.(geladen);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Mannschaften");
    }
    // onGeaendert absichtlich nicht in den Dependencies: soll bei jedem Laden aufgerufen werden,
    // aber kein Neuladen ausloesen, wenn der Elternteil eine neue Funktionsreferenz uebergibt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  useEffect(() => {
    Promise.all([getTeams(), getVereine()])
      .then(([geladeneTeams, geladeneVereine]) => {
        setTeams(geladeneTeams);
        setVereine(geladeneVereine);
      })
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Stammdaten"));
  }, []);

  useEffect(() => {
    setBearbeitung((bisherig) => {
      const naechster: Record<string, MannschaftBearbeitung> = {};
      for (const m of mannschaften) {
        naechster[m._id] = bisherig[m._id] ?? {
          name: m.name,
          bundesland: m.bundesland ?? "",
          betreuer1Name: m.betreuer1Name ?? "",
          betreuer2Name: m.betreuer2Name ?? "",
          betreuer3Name: m.betreuer3Name ?? "",
        };
      }
      return naechster;
    });
  }, [mannschaften]);

  // Spielerzahlen aller Mannschaften vorab laden (fuer die Kader-Info im zugeklappten Zustand).
  // Bewusst nur Zusatzinfo: schlaegt einer der Aufrufe fehl, wird die Zahl still weggelassen,
  // nicht als Seitenfehler angezeigt.
  useEffect(() => {
    let abgebrochen = false;
    Promise.all(mannschaften.map(async (m) => [m._id, (await getSpieler(m._id)).length] as const))
      .then((eintraege) => {
        if (!abgebrochen) setSpielerAnzahl(Object.fromEntries(eintraege));
      })
      .catch(() => {
        /* Zaehler sind optional - Fehler hier nicht hochblasen. */
      });
    return () => {
      abgebrochen = true;
    };
  }, [mannschaften]);

  const mannschaftenSortiert = [...mannschaften].sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));

  // Ein Team darf in einem Turnier nur einmal als Mannschaft auftreten - bereits
  // verwendete Teams verschwinden daher aus der Auswahl (nicht nur eine Warnung).
  const verwendeteTeamIds = new Set(mannschaften.map((m) => m.teamId).filter((id): id is string => !!id));
  const teamsSortiert = [...teams]
    .filter((t) => !verwendeteTeamIds.has(t._id))
    .sort((a, b) => {
      const vereinA = vereine.find((v) => v._id === a.vereinId)?.name ?? "";
      const vereinB = vereine.find((v) => v._id === b.vereinId)?.name ?? "";
      return vereinA.localeCompare(vereinB) || a.name.localeCompare(b.name);
    });

  /** Team aus den Stammdaten ausgewaehlt: Name+Bundesland als Vorschlag uebernehmen (kopiert,
   * nicht verknuepft - siehe Gesamtspezifikation Abschnitt 15), danach frei weiter bearbeitbar.
   * Mannschaftsname wird NUR aus dem Teamnamen uebernommen, ohne Vereinsnamen-Praefix
   * (der Vereinsname dient in der Auswahlliste selbst nur zur Unterscheidung gleichnamiger
   * Teams verschiedener Vereine, ist aber nicht Teil des uebernommenen Namens).
   * "Manuell eingeben" (leerer Wert) loest nur die Verknuepfung, laesst bereits Eingegebenes stehen. */
  function teamAusgewaehlt(teamId: string) {
    setAusgewaehltesTeamId(teamId);
    if (!teamId) return;
    const team = teams.find((t) => t._id === teamId);
    if (!team) return;
    const verein = vereine.find((v) => v._id === team.vereinId);
    setNeueMannschaft(team.name);
    setNeuesBundesland(verein?.bundesland ?? "");
  }

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    const team = teams.find((t) => t._id === ausgewaehltesTeamId);
    try {
      await createMannschaft({
        turnierId,
        name: neueMannschaft,
        bundesland: neuesBundesland || undefined,
        teamId: team?._id,
        vereinId: team?.vereinId,
      });
      setNeueMannschaft("");
      setNeuesBundesland("");
      setAusgewaehltesTeamId("");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen der Mannschaft");
    } finally {
      mannschaftsnameRef.current?.focus();
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteMannschaft(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen der Mannschaft");
    }
  }

  /** Speichert automatisch beim Verlassen des Feldes - konsistent zu Loeschen/Verschieben, die auch sofort wirken. */
  async function feldVerlassen(m: MannschaftImTurnier) {
    const werte = bearbeitung[m._id];
    if (!werte) return;

    if (werte.name.trim() === "") {
      setFehler("Mannschaftsname darf nicht leer sein");
      return;
    }

    // Leere optionale Felder als null senden (nicht undefined), sonst liesse der Backend-Merge
    // einen zuvor gesetzten Wert beim Leeren unveraendert stehen (undefined faellt aus dem Body).
    const bundeslandNeu = werte.bundesland || null;
    const betreuer1Neu = werte.betreuer1Name.trim() || null;
    const betreuer2Neu = werte.betreuer2Name.trim() || null;
    const betreuer3Neu = werte.betreuer3Name.trim() || null;
    const unveraendert =
      werte.name === m.name &&
      bundeslandNeu === (m.bundesland ?? null) &&
      betreuer1Neu === (m.betreuer1Name ?? null) &&
      betreuer2Neu === (m.betreuer2Name ?? null) &&
      betreuer3Neu === (m.betreuer3Name ?? null);
    if (unveraendert) return;

    try {
      await updateMannschaft(m._id, {
        name: werte.name,
        bundesland: bundeslandNeu,
        betreuer1Name: betreuer1Neu,
        betreuer2Name: betreuer2Neu,
        betreuer3Name: betreuer3Neu,
      });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Mannschaft");
    }
  }

  async function anNeuePositionVerschieben(vonIndex: number, nachIndex: number) {
    if (vonIndex === nachIndex || vonIndex < 0 || nachIndex < 0 || nachIndex >= mannschaftenSortiert.length) return;
    const neueReihenfolge = verschobeneListe(mannschaftenSortiert, vonIndex, nachIndex).map((m) => m._id);
    try {
      await mannschaftReihenfolgeAendern(turnierId, neueReihenfolge);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Reihenfolge");
    }
  }

  return (
    <div>
      {fehler && <p role="alert">{fehler}</p>}

      {mannschaften.length === 0 ? (
        <p>Noch keine Mannschaften angelegt.</p>
      ) : (
        <div className="tabellen-wrapper">
        <table>
          <caption className="sr-only">
            Angemeldete Mannschaften, Name und Bundesland bearbeitbar; Trainer/Betreuer und Kader je Mannschaft über
            den Kader-Bereich; Reihenfolge per Ziehpunkt oder Pfeiltasten änderbar
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Reihenfolge</span>
              </th>
              <th scope="col">Name</th>
              <th scope="col">Bundesland</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {mannschaftenSortiert.map((m, i) => (
              <Fragment key={m._id}>
              <tr
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
                    onClick={() => anNeuePositionVerschieben(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`${m.name} nach oben verschieben`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="symbol-button"
                    onClick={() => anNeuePositionVerschieben(i, i + 1)}
                    disabled={i === mannschaftenSortiert.length - 1}
                    aria-label={`${m.name} nach unten verschieben`}
                  >
                    ▼
                  </button>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`name-${m._id}`}>
                    Name von {m.name}
                  </label>
                  <input
                    id={`name-${m._id}`}
                    value={bearbeitung[m._id]?.name ?? ""}
                    onChange={(e) =>
                      setBearbeitung((b) => ({ ...b, [m._id]: { ...b[m._id], name: e.target.value } }))
                    }
                    onBlur={() => feldVerlassen(m)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`bundesland-${m._id}`}>
                    Bundesland von {m.name}
                  </label>
                  <input
                    id={`bundesland-${m._id}`}
                    list="bundeslaender-liste"
                    value={bearbeitung[m._id]?.bundesland ?? ""}
                    onChange={(e) =>
                      setBearbeitung((b) => ({ ...b, [m._id]: { ...b[m._id], bundesland: e.target.value } }))
                    }
                    onBlur={() => feldVerlassen(m)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </td>
                <td className="mannschaft-aktionen">
                  <button
                    type="button"
                    className="button-link"
                    onClick={() => kaderUmschalten(m._id)}
                    aria-expanded={offeneKader.has(m._id)}
                    aria-controls={`kader-${m._id}`}
                    title={spielerAnzahl[m._id] ? `${spielerAnzahl[m._id]} Spieler erfasst` : undefined}
                  >
                    Kader
                    {spielerAnzahl[m._id] ? (
                      <span className="kader-anzahl">{spielerAnzahl[m._id]}</span>
                    ) : (
                      ""
                    )}{" "}
                    {offeneKader.has(m._id) ? "▾" : "▸"}
                  </button>{" "}
                  <button
                    type="button"
                    className="symbol-button"
                    onClick={() => loeschen(m._id)}
                    aria-label={`${m.name} löschen`}
                    title="Löschen"
                  >
                    ✕
                  </button>
                </td>
              </tr>
              {offeneKader.has(m._id) && (
                <tr>
                  <td colSpan={4} id={`kader-${m._id}`} className="kader-zelle">
                    <div className="betreuer-bereich">
                      <div className="feld">
                        <label htmlFor={`betreuer1-${m._id}`}>Trainer/Betreuer 1</label>
                        <input
                          id={`betreuer1-${m._id}`}
                          value={bearbeitung[m._id]?.betreuer1Name ?? ""}
                          onChange={(e) =>
                            setBearbeitung((b) => ({ ...b, [m._id]: { ...b[m._id], betreuer1Name: e.target.value } }))
                          }
                          onBlur={() => feldVerlassen(m)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </div>
                      <div className="feld">
                        <label htmlFor={`betreuer2-${m._id}`}>Trainer/Betreuer 2</label>
                        <input
                          id={`betreuer2-${m._id}`}
                          value={bearbeitung[m._id]?.betreuer2Name ?? ""}
                          onChange={(e) =>
                            setBearbeitung((b) => ({ ...b, [m._id]: { ...b[m._id], betreuer2Name: e.target.value } }))
                          }
                          onBlur={() => feldVerlassen(m)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </div>
                      <div className="feld">
                        <label htmlFor={`betreuer3-${m._id}`}>Trainer/Betreuer 3</label>
                        <input
                          id={`betreuer3-${m._id}`}
                          value={bearbeitung[m._id]?.betreuer3Name ?? ""}
                          onChange={(e) =>
                            setBearbeitung((b) => ({ ...b, [m._id]: { ...b[m._id], betreuer3Name: e.target.value } }))
                          }
                          onBlur={() => feldVerlassen(m)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </div>
                    </div>
                    <h3 className="kader-titel">Kader – {m.name}</h3>
                    <SpielerKader
                      mannschaftId={m._id}
                      onAnzahlGeaendert={(anzahl) => setSpielerAnzahl((b) => ({ ...b, [m._id]: anzahl }))}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <datalist id="bundeslaender-liste">
        {BUNDESLAENDER.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <form onSubmit={anlegen}>
        {teamsSortiert.length > 0 && (
          <div className="feld">
            <label htmlFor="mannschaftTeam">Aus Stammdaten übernehmen (optional)</label>
            <select
              id="mannschaftTeam"
              value={ausgewaehltesTeamId}
              onChange={(e) => teamAusgewaehlt(e.target.value)}
            >
              <option value="">— manuell eingeben —</option>
              {teamsSortiert.map((t) => {
                const verein = vereine.find((v) => v._id === t.vereinId);
                return (
                  <option key={t._id} value={t._id}>
                    {verein ? `${verein.name} ${t.name}` : t.name}
                  </option>
                );
              })}
            </select>
          </div>
        )}
        <div className="feld">
          <label htmlFor="mannschaftName">Mannschaftsname</label>
          <input
            id="mannschaftName"
            ref={mannschaftsnameRef}
            required
            value={neueMannschaft}
            onChange={(e) => setNeueMannschaft(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="mannschaftBundesland">Bundesland (optional)</label>
          <input
            id="mannschaftBundesland"
            list="bundeslaender-liste"
            value={neuesBundesland}
            onChange={(e) => setNeuesBundesland(e.target.value)}
          />
        </div>
        <button type="submit">Mannschaft anlegen</button>
      </form>
    </div>
  );
}

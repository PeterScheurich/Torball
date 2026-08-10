import { useCallback, useEffect, useRef, useState } from "react";
import type { MannschaftImTurnier } from "@torball/shared";
import { createMannschaft, deleteMannschaft, getMannschaften, mannschaftReihenfolgeAendern, updateMannschaft } from "../api";
import { BUNDESLAENDER } from "../bundeslaender";

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
  const mannschaftsnameRef = useRef<HTMLInputElement>(null);

  const [bearbeitung, setBearbeitung] = useState<Record<string, { name: string; bundesland: string }>>({});
  const [ziehIndex, setZiehIndex] = useState<number | null>(null);
  const [ziehZielIndex, setZiehZielIndex] = useState<number | null>(null);

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
    setBearbeitung((bisherig) => {
      const naechster: Record<string, { name: string; bundesland: string }> = {};
      for (const m of mannschaften) {
        naechster[m._id] = bisherig[m._id] ?? { name: m.name, bundesland: m.bundesland ?? "" };
      }
      return naechster;
    });
  }, [mannschaften]);

  const mannschaftenSortiert = [...mannschaften].sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createMannschaft({ turnierId, name: neueMannschaft, bundesland: neuesBundesland || undefined });
      setNeueMannschaft("");
      setNeuesBundesland("");
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

    const bundeslandNeu = werte.bundesland || undefined;
    const unveraendert = werte.name === m.name && bundeslandNeu === (m.bundesland ?? undefined);
    if (unveraendert) return;

    try {
      await updateMannschaft(m._id, { name: werte.name, bundesland: bundeslandNeu });
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
            Angemeldete Mannschaften, Name und Bundesland bearbeitbar, Reihenfolge per Ziehpunkt oder Pfeiltasten
            änderbar
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
              <tr
                key={m._id}
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
                <td>
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

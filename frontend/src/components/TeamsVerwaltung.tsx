import { useCallback, useEffect, useRef, useState } from "react";
import type { Team, Verein } from "@torball/shared";
import { createTeam, deleteTeam, getTeams, updateTeam } from "../api";

interface Bearbeitung {
  name: string;
  vereinId: string;
}

interface Props {
  vereine: Verein[];
}

export function TeamsVerwaltung({ vereine }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const [neuerName, setNeuerName] = useState("");
  const [neuerVereinId, setNeuerVereinId] = useState("");
  const [bearbeitung, setBearbeitung] = useState<Record<string, Bearbeitung>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    try {
      const geladen = await getTeams();
      setTeams(geladen);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Teams");
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  useEffect(() => {
    setBearbeitung((bisherig) => {
      const naechste: Record<string, Bearbeitung> = {};
      for (const t of teams) {
        naechste[t._id] = bisherig[t._id] ?? { name: t.name, vereinId: t.vereinId };
      }
      return naechste;
    });
  }, [teams]);

  useEffect(() => {
    if (!neuerVereinId && vereine.length > 0) setNeuerVereinId(vereine[0]._id);
  }, [vereine, neuerVereinId]);

  const nameVonVerein = (vereinId: string) => vereine.find((v) => v._id === vereinId)?.name ?? vereinId;
  const teamsSortiert = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    if (!neuerVereinId) {
      setFehler("Bitte zuerst einen Verein anlegen.");
      return;
    }
    try {
      await createTeam({ vereinId: neuerVereinId, name: neuerName.trim() });
      setNeuerName("");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen des Teams");
    } finally {
      nameRef.current?.focus();
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteTeam(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen des Teams");
    }
  }

  async function speichernWerte(t: Team, werte: Bearbeitung) {
    if (werte.name.trim() === "") {
      setFehler("Teamname darf nicht leer sein");
      return;
    }

    const unveraendert = werte.name === t.name && werte.vereinId === t.vereinId;
    if (unveraendert) return;

    try {
      await updateTeam(t._id, { name: werte.name.trim(), vereinId: werte.vereinId });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Teams");
    }
  }

  function feldVerlassen(t: Team) {
    const werte = bearbeitung[t._id];
    if (werte) speichernWerte(t, werte);
  }

  /** Verein-Auswahl speichert sofort (wie im Rest der App bei Auswahlfeldern ueblich),
   * nicht erst per onBlur - der aktuelle Namenswert aus dem Bearbeitungszustand wird
   * dabei mitgenommen, statt synchron auf den noch nicht aktualisierten State zu warten. */
  function vereinAendern(t: Team, vereinId: string) {
    const werte: Bearbeitung = { name: bearbeitung[t._id]?.name ?? t.name, vereinId };
    setBearbeitung((b) => ({ ...b, [t._id]: werte }));
    speichernWerte(t, werte);
  }

  return (
    <div>
      <h2>Teams</h2>
      {fehler && <p role="alert">{fehler}</p>}

      {vereine.length === 0 ? (
        <p>Bitte zuerst mindestens einen Verein anlegen.</p>
      ) : teams.length === 0 ? (
        <p>Noch keine Teams angelegt.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Team-Stammdaten, Name und Verein bearbeitbar</caption>
            <thead>
              <tr>
                <th scope="col">
                  Name <span className="pflicht-stern" title="Pflichtfeld">*</span>
                </th>
                <th scope="col">Verein</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {teamsSortiert.map((t) => (
                <tr key={t._id}>
                  <td>
                    <label className="sr-only" htmlFor={`team-name-${t._id}`}>
                      Name von {t.name} ({nameVonVerein(t.vereinId)})
                    </label>
                    <input
                      id={`team-name-${t._id}`}
                      value={bearbeitung[t._id]?.name ?? ""}
                      onChange={(e) =>
                        setBearbeitung((b) => ({ ...b, [t._id]: { ...b[t._id], name: e.target.value } }))
                      }
                      onBlur={() => feldVerlassen(t)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`team-verein-${t._id}`}>
                      Verein von {t.name}
                    </label>
                    <select
                      id={`team-verein-${t._id}`}
                      value={bearbeitung[t._id]?.vereinId ?? t.vereinId}
                      onChange={(e) => vereinAendern(t, e.target.value)}
                    >
                      {vereine.map((v) => (
                        <option key={v._id} value={v._id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="symbol-button"
                      onClick={() => loeschen(t._id)}
                      aria-label={`${t.name} löschen`}
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

      {vereine.length > 0 && (
        <form onSubmit={anlegen}>
          <div className="feld">
            <label htmlFor="teamVerein">Verein</label>
            <select id="teamVerein" value={neuerVereinId} onChange={(e) => setNeuerVereinId(e.target.value)}>
              {vereine.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                </option>
              ))}
            </select>{" "}
            <button
              type="button"
              onClick={() => setNeuerName(nameVonVerein(neuerVereinId))}
              disabled={!neuerVereinId}
            >
              als Teamname übernehmen
            </button>
          </div>
          <div className="feld">
            <label htmlFor="teamName">Teamname (z.B. „I", „II")</label>
            <input
              id="teamName"
              ref={nameRef}
              required
              value={neuerName}
              onChange={(e) => setNeuerName(e.target.value)}
            />
          </div>
          <button type="submit">Team anlegen</button>
        </form>
      )}
    </div>
  );
}

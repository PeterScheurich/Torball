import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Turnier } from "@torball/shared";
import { deleteTurnier, getTurniere } from "../api";
import { formatiereDatum } from "../format";

export function TurnierListePage() {
  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();

  useEffect(() => {
    laden();
  }, []);

  async function laden() {
    try {
      setTurniere(await getTurniere());
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteTurnier(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen");
    }
  }

  return (
    <>
      <h1>Turniere</h1>

      {fehler && <p role="alert">{fehler}</p>}

      {turniere.length === 0 && !fehler ? (
        <p>Noch keine Turniere angelegt.</p>
      ) : (
        <table>
          <caption className="sr-only">Liste der angelegten Turniere</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Datum</th>
              <th scope="col">Status</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {turniere.map((turnier) => (
              <tr key={turnier._id}>
                <td>
                  <Link to={`/turniere/${encodeURIComponent(turnier._id)}`}>{turnier.name}</Link>
                </td>
                <td>{formatiereDatum(turnier.datum)}</td>
                <td>{turnier.status}</td>
                <td>
                  <button
                    type="button"
                    className="symbol-button"
                    onClick={() => loeschen(turnier._id)}
                    aria-label={`${turnier.name} löschen`}
                    title="Löschen"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p>
        <Link to="/turniere/neu" className="button-link">
          Neues Turnier anlegen
        </Link>
      </p>
    </>
  );
}

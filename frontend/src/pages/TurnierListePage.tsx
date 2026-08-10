import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Turnier } from "@torball/shared";
import { createTurnier, deleteTurnier, getTurniere } from "../api";

export function TurnierListePage() {
  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [ladeFehler, setLadeFehler] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [datum, setDatum] = useState("");
  const [startzeit, setStartzeit] = useState("");
  const [anzahlFelder, setAnzahlFelder] = useState<1 | 2>(1);
  const [speichernFehler, setSpeichernFehler] = useState<string | undefined>();
  const navigate = useNavigate();

  useEffect(() => {
    ladeTurniere();
  }, []);

  async function ladeTurniere() {
    try {
      setTurniere(await getTurniere());
      setLadeFehler(undefined);
    } catch (err) {
      setLadeFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    setSpeichernFehler(undefined);

    const felder = Array.from({ length: anzahlFelder }, (_, i) => ({
      feldId: `feld:${i + 1}`,
      name: `Feld ${i + 1}`,
    }));

    try {
      const neu = await createTurnier({ name, datum, startzeit: startzeit || undefined, felder });
      navigate(`/turniere/${encodeURIComponent(neu._id)}`);
    } catch (err) {
      setSpeichernFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen");
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteTurnier(id);
      await ladeTurniere();
    } catch (err) {
      setLadeFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen");
    }
  }

  return (
    <>
      <h1>Turniere</h1>

      {ladeFehler && <p role="alert">{ladeFehler}</p>}

      {turniere.length === 0 && !ladeFehler ? (
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
                <td>{turnier.datum}</td>
                <td>{turnier.status}</td>
                <td>
                  <button type="button" onClick={() => loeschen(turnier._id)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Neues Turnier anlegen</h2>
      <form onSubmit={anlegen}>
        <div className="feld">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="datum">Datum</label>
          <input id="datum" type="date" required value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="startzeit">Startzeit (optional)</label>
          <input id="startzeit" type="time" value={startzeit} onChange={(e) => setStartzeit(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="anzahlFelder">Anzahl Spielfelder</label>
          <select
            id="anzahlFelder"
            value={anzahlFelder}
            onChange={(e) => setAnzahlFelder(Number(e.target.value) === 2 ? 2 : 1)}
          >
            <option value={1}>1 (Normalfall)</option>
            <option value={2}>2 (Ausnahmefall)</option>
          </select>
        </div>
        {speichernFehler && <p role="alert">{speichernFehler}</p>}
        <button type="submit">Turnier anlegen</button>
      </form>
    </>
  );
}

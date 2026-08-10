import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTurnier } from "../api";

export function TurnierAnlegenPage() {
  const [name, setName] = useState("");
  const [datum, setDatum] = useState("");
  const [startzeit, setStartzeit] = useState("");
  const [anzahlFelder, setAnzahlFelder] = useState<1 | 2>(1);
  const [fehler, setFehler] = useState<string | undefined>();
  const navigate = useNavigate();

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);

    const felder = Array.from({ length: anzahlFelder }, (_, i) => ({
      feldId: `feld:${i + 1}`,
      name: `Feld ${i + 1}`,
    }));

    try {
      const neu = await createTurnier({ name, datum, startzeit: startzeit || undefined, felder });
      navigate(`/turniere/${encodeURIComponent(neu._id)}/mannschaften-erfassen`);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen");
    }
  }

  return (
    <>
      <p>Schritt 1 von 3: Turnier anlegen</p>
      <h1>Neues Turnier</h1>

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
        {fehler && <p role="alert">{fehler}</p>}
        <button type="submit">Weiter zu Mannschaften</button>
      </form>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import {
  createMannschaft,
  deleteMannschaft,
  erzeugeSpielplan,
  getMannschaften,
  getSpiele,
  getSpielplanVorschlag,
  getTurnier,
  reihenfolgeAendern,
  updateMannschaft,
  type SpielplanVorschlagEintrag,
} from "../api";

export function TurnierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;

  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [vorschlag, setVorschlag] = useState<SpielplanVorschlagEintrag[] | undefined>();
  const [wiederholungen, setWiederholungen] = useState<1 | 2>(1);
  const [fehler, setFehler] = useState<string | undefined>();

  const [neueMannschaft, setNeueMannschaft] = useState("");
  const [neuesBundesland, setNeuesBundesland] = useState("");

  const [bearbeitung, setBearbeitung] = useState<Record<string, { name: string; bundesland: string }>>({});

  useEffect(() => {
    setBearbeitung((bisherig) => {
      const naechster: Record<string, { name: string; bundesland: string }> = {};
      for (const m of mannschaften) {
        naechster[m._id] = bisherig[m._id] ?? { name: m.name, bundesland: m.bundesland ?? "" };
      }
      return naechster;
    });
  }, [mannschaften]);

  const ladeAlles = useCallback(async () => {
    try {
      const [t, m, s] = await Promise.all([
        getTurnier(turnierId),
        getMannschaften(turnierId),
        getSpiele(turnierId),
      ]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [turnierId]);

  useEffect(() => {
    ladeAlles();
  }, [ladeAlles]);

  const nameVon = (mannschaftId: string) =>
    mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;

  const startzeitAnzeigen = (startzeitGeplant: string | undefined) =>
    startzeitGeplant ? new Date(startzeitGeplant).toLocaleTimeString("de-DE") : "–";

  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));
  const vorschlagSortiert = vorschlag ? [...vorschlag].sort((a, b) => a.slot - b.slot) : undefined;

  async function mannschaftAnlegen(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createMannschaft({
        turnierId,
        name: neueMannschaft,
        bundesland: neuesBundesland || undefined,
      });
      setNeueMannschaft("");
      setNeuesBundesland("");
      await ladeAlles();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen der Mannschaft");
    }
  }

  async function mannschaftLoeschen(mannschaftId: string) {
    try {
      await deleteMannschaft(mannschaftId);
      await ladeAlles();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen der Mannschaft");
    }
  }

  async function mannschaftSpeichern(mannschaftId: string) {
    const werte = bearbeitung[mannschaftId];
    try {
      await updateMannschaft(mannschaftId, {
        name: werte.name,
        bundesland: werte.bundesland || undefined,
      });
      await ladeAlles();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern der Mannschaft");
    }
  }

  async function spielVerschieben(spielId: string, richtung: -1 | 1) {
    const index = spieleSortiert.findIndex((s) => s._id === spielId);
    const zielIndex = index + richtung;
    if (index < 0 || zielIndex < 0 || zielIndex >= spieleSortiert.length) return;

    const neueReihenfolge = spieleSortiert.map((s) => s._id);
    [neueReihenfolge[index], neueReihenfolge[zielIndex]] = [neueReihenfolge[zielIndex], neueReihenfolge[index]];

    try {
      await reihenfolgeAendern(turnierId, neueReihenfolge);
      await ladeAlles();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Reihenfolge");
    }
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
      await ladeAlles();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Erzeugen des Spielplans");
    }
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  return (
    <>
      <p>
        <Link to="/">&larr; Zurück zur Turnierliste</Link>
      </p>
      <h1>{turnier.name}</h1>
      <p>
        {turnier.datum}
        {turnier.startzeit ? `, ${turnier.startzeit} Uhr` : ""} · Status: {turnier.status} · Felder:{" "}
        {turnier.felder.map((f) => f.name).join(", ") || "keine"}
      </p>

      {fehler && <p role="alert">{fehler}</p>}

      <h2>Mannschaften</h2>
      {mannschaften.length === 0 ? (
        <p>Noch keine Mannschaften angelegt.</p>
      ) : (
        <table>
          <caption className="sr-only">Angemeldete Mannschaften, Name und Bundesland bearbeitbar</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Bundesland</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {mannschaften.map((m) => (
              <tr key={m._id}>
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
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`bundesland-${m._id}`}>
                    Bundesland von {m.name}
                  </label>
                  <input
                    id={`bundesland-${m._id}`}
                    value={bearbeitung[m._id]?.bundesland ?? ""}
                    onChange={(e) =>
                      setBearbeitung((b) => ({ ...b, [m._id]: { ...b[m._id], bundesland: e.target.value } }))
                    }
                  />
                </td>
                <td>
                  <button type="button" onClick={() => mannschaftSpeichern(m._id)}>
                    Speichern
                  </button>{" "}
                  <button type="button" onClick={() => mannschaftLoeschen(m._id)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={mannschaftAnlegen}>
        <div className="feld">
          <label htmlFor="mannschaftName">Mannschaftsname</label>
          <input
            id="mannschaftName"
            required
            value={neueMannschaft}
            onChange={(e) => setNeueMannschaft(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="mannschaftBundesland">Bundesland (optional)</label>
          <input
            id="mannschaftBundesland"
            value={neuesBundesland}
            onChange={(e) => setNeuesBundesland(e.target.value)}
          />
        </div>
        <button type="submit">Mannschaft anlegen</button>
      </form>

      <h2>Spielplan</h2>

      {spiele.length > 0 ? (
        <>
          <p>Spielplan ist bereits erzeugt (Version {turnier.spielplanVersion}).</p>
          <table>
            <caption className="sr-only">Erzeugter Spielplan</caption>
            <thead>
              <tr>
                <th scope="col">Spiel</th>
                <th scope="col">Feld</th>
                <th scope="col">Startzeit</th>
                <th scope="col">Mannschaft A</th>
                <th scope="col">Mannschaft B</th>
                <th scope="col">Status</th>
                <th scope="col">Reihenfolge</th>
              </tr>
            </thead>
            <tbody>
              {spieleSortiert.map((s, i) => (
                <tr key={s._id}>
                  <td>{s.runde}</td>
                  <td>{s.feldId}</td>
                  <td>{startzeitAnzeigen(s.startzeitGeplant)}</td>
                  <td>{nameVon(s.mannschaftAId)}</td>
                  <td>{nameVon(s.mannschaftBId)}</td>
                  <td>{s.status}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => spielVerschieben(s._id, -1)}
                      disabled={i === 0 || s.status !== "geplant"}
                      aria-label={`Spiel ${s.runde} nach vorne verschieben`}
                    >
                      ▲
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => spielVerschieben(s._id, 1)}
                      disabled={i === spieleSortiert.length - 1 || s.status !== "geplant"}
                      aria-label={`Spiel ${s.runde} nach hinten verschieben`}
                    >
                      ▼
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>Noch kein Spielplan erzeugt.</p>
      )}

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

      {vorschlag && (
        <>
          <h3>Vorschau (noch nicht gespeichert)</h3>
          <table>
            <caption className="sr-only">Berechneter Spielplan-Vorschlag</caption>
            <thead>
              <tr>
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
                <tr key={i}>
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
        </>
      )}
    </>
  );
}

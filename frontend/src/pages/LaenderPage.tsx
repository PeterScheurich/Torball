import { useEffect, useRef, useState } from "react";
import { getLaender, setLaender } from "../api";
import { SpeicherHinweis, useSpeicherHinweis } from "../components/SpeicherHinweis";

/**
 * Admin → „Länder“: die Vorschlagsliste für das Feld „Land“ bei Vereinen und bei den Mannschaften eines
 * internationalen Turniers (Auftraggeber 01.11.2026: nur die Länder, aus denen tatsächlich Mannschaften
 * kommen). Es ist eine Vorschlagsliste, keine Sperre: ein Land, das hier fehlt, lässt sich weiterhin von
 * Hand eintragen. Jede Änderung wird sofort gespeichert und angesagt.
 */
export function LaenderPage() {
  const [laender, setListe] = useState<string[]>([]);
  const [neu, setNeu] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const { hinweis, melde } = useSpeicherHinweis();
  const eingabeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getLaender()
      .then(setListe)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Die Länder konnten nicht geladen werden."));
  }, []);

  async function speichern(naechste: string[], meldung: string) {
    setFehler(undefined);
    try {
      setListe(await setLaender(naechste));
      melde(meldung);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Die Länder konnten nicht gespeichert werden.");
    } finally {
      // Nach dem Hinzufügen wie nach dem Entfernen geht es am Eingabefeld weiter - die Zeile, auf der
      // der Fokus lag, ist dann weg.
      eingabeRef.current?.focus();
    }
  }

  async function hinzufuegen(event: React.FormEvent) {
    event.preventDefault();
    const land = neu.trim();
    if (!land) return;
    if (laender.some((l) => l.toLocaleLowerCase("de") === land.toLocaleLowerCase("de"))) {
      setFehler(`„${land}“ steht schon in der Liste.`);
      return;
    }
    setNeu("");
    await speichern([...laender, land], `${land} hinzugefügt.`);
  }

  async function entfernen(land: string) {
    if (!window.confirm(`„${land}“ aus der Liste entfernen? Bereits eingetragene Vereine und Mannschaften behalten ihr Land.`)) {
      return;
    }
    await speichern(
      laender.filter((l) => l !== land),
      `${land} entfernt.`,
    );
  }

  return (
    <>
      <h1>Länder</h1>
      {fehler && <p role="alert">{fehler}</p>}
      <SpeicherHinweis hinweis={hinweis} />
      <p>
        Diese Länder werden vorgeschlagen, wenn bei einem Verein oder bei einer Mannschaft eines internationalen
        Turniers das Land eingetragen wird. Es ist eine Vorschlagsliste: Ein Land, das hier fehlt, kann trotzdem von
        Hand eingetragen werden. Bereits gespeicherte Länder ändern sich durch die Liste nicht.
      </p>

      {laender.length === 0 ? (
        <p>Die Liste ist leer – es werden keine Länder vorgeschlagen.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Vorgeschlagene Länder</caption>
            <thead>
              <tr>
                <th scope="col">Land</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {laender.map((l) => (
                <tr key={l}>
                  <td>{l}</td>
                  <td>
                    <button
                      type="button"
                      className="symbol-button button-loeschen"
                      onClick={() => entfernen(l)}
                      aria-label={`${l} entfernen`}
                      title="Entfernen"
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

      <h2>Land hinzufügen</h2>
      <form onSubmit={hinzufuegen} className="stammdaten-formular">
        <div className="tabellen-wrapper">
          <table className="uebersicht-tabelle">
            <caption className="sr-only">Land hinzufügen</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="neues-land">Land</label>
                </th>
                <td>
                  <input
                    id="neues-land"
                    ref={eingabeRef}
                    required
                    value={neu}
                    onChange={(e) => setNeu(e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="submit">Hinzufügen</button>
      </form>
    </>
  );
}

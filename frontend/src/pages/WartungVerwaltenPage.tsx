import { useCallback, useEffect, useState } from "react";
import { getWartungStatus, updateWartung } from "../api";

/** ISO-Zeitstempel -> Wert fuer <input type="datetime-local"> (lokale Zeit, ohne Sekunden/Zeitzone). */
function isoZuDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Wartungsmodus (nur Admin): ein angekuendigtes Zeitfenster (Warnhinweis auf der Startseite bzw.
 * Kurzfristhinweis fuer angemeldete Personen ab 15 Minuten vorher) und ein davon unabhaengiger,
 * manueller "Wartung laeuft gerade"-Schalter, der die App fuer alle ausser Admins sperrt (Frontend
 * UND Backend, siehe App.tsx bzw. backend/src/wartung.ts). Bewusst zwei getrennte Schalter statt
 * einer Automatik anhand der Uhrzeit (Nutzer-Vorgabe) - die Turnierleitung schaltet die Sperre
 * genau dann scharf, wenn die Wartung tatsaechlich beginnt.
 */
export function WartungVerwaltenPage() {
  const [aktiv, setAktiv] = useState(false);
  const [angekuendigtAb, setAngekuendigtAb] = useState("");
  const [angekuendigtBis, setAngekuendigtBis] = useState("");
  const [geladen, setGeladen] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [gespeichertHinweis, setGespeichertHinweis] = useState(false);

  const laden = useCallback(async () => {
    try {
      const status = await getWartungStatus();
      setAktiv(status.aktiv);
      setAngekuendigtAb(status.angekuendigtAb ? isoZuDatetimeLocal(status.angekuendigtAb) : "");
      setAngekuendigtBis(status.angekuendigtBis ? isoZuDatetimeLocal(status.angekuendigtBis) : "");
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    } finally {
      setGeladen(true);
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  async function speichern(event: React.FormEvent) {
    event.preventDefault();
    setSendet(true);
    setGespeichertHinweis(false);
    try {
      await updateWartung({
        aktiv,
        angekuendigtAb: angekuendigtAb ? new Date(angekuendigtAb).toISOString() : null,
        angekuendigtBis: angekuendigtBis ? new Date(angekuendigtBis).toISOString() : null,
      });
      setFehler(undefined);
      setGespeichertHinweis(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    } finally {
      setSendet(false);
    }
  }

  return (
    <>
      <h1>Wartungsmodus</h1>
      <p>Systemweite Ankündigung und Sperre für Wartungsarbeiten (nicht turnierbezogen).</p>

      {fehler && <p role="alert">{fehler}</p>}

      {geladen && (
        <form onSubmit={speichern}>
          <h2>Ankündigung</h2>
          <p>
            Wird als Warnhinweis auf der Startseite angezeigt, solange der Beginn in der Zukunft liegt. Angemeldete
            Personen bekommen zusätzlich ab 15 Minuten vor Beginn einen Kurzfristhinweis, damit sie ihre Arbeit
            rechtzeitig abschließen können. Setzt für sich genommen noch keine Sperre.
          </p>
          <div className="feld">
            <label htmlFor="wartung-ab">Beginn</label>
            <input
              id="wartung-ab"
              type="datetime-local"
              value={angekuendigtAb}
              onChange={(e) => setAngekuendigtAb(e.target.value)}
            />
          </div>
          <div className="feld">
            <label htmlFor="wartung-bis">Voraussichtliches Ende (optional)</label>
            <input
              id="wartung-bis"
              type="datetime-local"
              value={angekuendigtBis}
              onChange={(e) => setAngekuendigtBis(e.target.value)}
            />
          </div>

          <h2>Sperre</h2>
          <p>
            Solange aktiv, sehen alle außer angemeldeten Admins nur eine Wartungsseite - Frontend UND Backend sind
            dann für sie gesperrt (auch Turnier-Codes, externe Ergebniserfassung usw.). Unabhängig von der
            Ankündigung oben: bitte erst einschalten, wenn die Wartung tatsächlich beginnt.
          </p>
          <div className="feld">
            <label htmlFor="wartung-aktiv">
              <input id="wartung-aktiv" type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />{" "}
              Wartung läuft gerade
            </label>
          </div>

          {gespeichertHinweis && <p>Gespeichert.</p>}
          <button type="submit" disabled={sendet}>
            Speichern
          </button>
        </form>
      )}
    </>
  );
}

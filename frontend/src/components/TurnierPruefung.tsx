import { useState } from "react";
import type { Spieler, Turnier } from "@torball/shared";
import { getMannschaften, getSchiedsrichter, getSpiele, getSpieler } from "../api";
import { turnierPruefen, type PruefErgebnis, type PruefStatus } from "../turnierPruefung";

const SYMBOL: Record<PruefStatus, string> = { ok: "✓", hinweis: "⚠", fehler: "✕", info: "•" };

/**
 * „Turnier prüfen": laedt die relevanten Daten und zeigt eine Liste der Regel-Pruefungen. Bewusst
 * nur informierend - nichts wird blockiert (siehe turnierPruefung.ts).
 */
export function TurnierPruefung({ turnier }: { turnier: Turnier }) {
  const [ergebnisse, setErgebnisse] = useState<PruefErgebnis[] | undefined>();
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();

  async function pruefen() {
    setLaedt(true);
    setFehler(undefined);
    try {
      const [mannschaften, spiele, schiedsrichter] = await Promise.all([
        getMannschaften(turnier._id),
        getSpiele(turnier._id),
        getSchiedsrichter(turnier._id),
      ]);
      const spielerListen = await Promise.all(mannschaften.map((m) => getSpieler(m._id)));
      const spielerProMannschaft: Record<string, Spieler[]> = {};
      mannschaften.forEach((m, i) => {
        spielerProMannschaft[m._id] = spielerListen[i];
      });
      setErgebnisse(turnierPruefen({ turnier, mannschaften, spielerProMannschaft, spiele, schiedsrichter }));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler bei der Prüfung");
    } finally {
      setLaedt(false);
    }
  }

  return (
    <section>
      <h2>Turnier prüfen</h2>
      <p className="feld-hinweis">
        Prüft die Angaben gegen die Regeln und zeigt Auffälligkeiten – ohne etwas zu blockieren.
      </p>
      <button type="button" onClick={pruefen} disabled={laedt}>
        {laedt ? "Prüfe…" : "Turnier prüfen"}
      </button>
      {fehler && <p role="alert">{fehler}</p>}
      {ergebnisse && (
        <ul className="pruef-liste">
          {ergebnisse.map((e, i) => (
            <li key={i} className={`pruef-${e.status}`}>
              <span className="pruef-symbol" aria-hidden="true">
                {SYMBOL[e.status]}
              </span>
              <span>
                <strong>{e.titel}:</strong> {e.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

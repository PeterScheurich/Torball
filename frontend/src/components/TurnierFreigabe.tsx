import { useCallback, useEffect, useState } from "react";
import type { TurnierBerechtigung, TurnierRolle } from "@torball/shared";
import {
  getBenutzerListe,
  getTurnierBerechtigungen,
  turnierBerechtigungEntziehen,
  turnierBerechtigungVergeben,
  type BenutzerProfil,
} from "../api";

const ROLLEN_LABEL: Record<TurnierRolle, string> = {
  turnierleitung: "Turnierleitung (bearbeiten)",
  spielleitung: "Spielleitung (bearbeiten)",
  lesen: "Nur lesen",
};

/**
 * Freigabe eines Turniers fuer weitere angemeldete Benutzer (Abschnitt 21.2). Nutzt die
 * bestehenden TurnierBerechtigung-Routen. Der Ersteller/Admin hat ohnehin Vollzugriff und
 * muss sich hier nicht selbst eintragen. Die Benutzerliste (fuer die Auswahl) ist nur fuer
 * Administrator/Manager abrufbar - fehlt sie, bleibt die Anzeige bestehender Freigaben
 * moeglich, nur das Vergeben ist dann nicht angeboten.
 */
export function TurnierFreigabe({ turnierId }: { turnierId: string }) {
  const [berechtigungen, setBerechtigungen] = useState<TurnierBerechtigung[]>([]);
  const [benutzer, setBenutzer] = useState<BenutzerProfil[]>([]);
  const [benutzerListeFehlt, setBenutzerListeFehlt] = useState(false);
  const [zielBenutzerId, setZielBenutzerId] = useState("");
  const [rolle, setRolle] = useState<TurnierRolle>("turnierleitung");
  const [fehler, setFehler] = useState<string | undefined>();

  const laden = useCallback(async () => {
    try {
      setBerechtigungen(await getTurnierBerechtigungen(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Laden der Freigaben");
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
    getBenutzerListe()
      .then(setBenutzer)
      .catch(() => setBenutzerListeFehlt(true));
  }, [laden]);

  const nameVon = (id: string) => benutzer.find((b) => b._id === id)?.name ?? id;
  const vergebbareBenutzer = benutzer.filter((b) => !berechtigungen.some((x) => x.benutzerId === b._id));

  async function vergeben(event: React.FormEvent) {
    event.preventDefault();
    if (!zielBenutzerId) return;
    setFehler(undefined);
    try {
      await turnierBerechtigungVergeben(turnierId, zielBenutzerId, rolle);
      setZielBenutzerId("");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Vergeben der Freigabe");
    }
  }

  async function entziehen(b: TurnierBerechtigung) {
    setFehler(undefined);
    try {
      await turnierBerechtigungEntziehen(b._id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Entziehen der Freigabe");
    }
  }

  return (
    <section>
      <h2>Freigabe für andere Benutzer</h2>
      <p className="feld-hinweis">
        Gib dieses Turnier für weitere angemeldete Benutzer frei. Ersteller und Administratoren haben ohnehin vollen
        Zugriff und müssen hier nicht eingetragen werden.
      </p>

      {fehler && <p role="alert">{fehler}</p>}

      {berechtigungen.length === 0 ? (
        <p className="platzhalter-zeile">Noch keine Freigaben vergeben.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Vergebene Freigaben</caption>
            <thead>
              <tr>
                <th scope="col">Benutzer</th>
                <th scope="col">Zugriff</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {berechtigungen.map((b) => (
                <tr key={b._id}>
                  <td>{nameVon(b.benutzerId)}</td>
                  <td>{ROLLEN_LABEL[b.rolle]}</td>
                  <td>
                    <button type="button" onClick={() => entziehen(b)}>
                      Entziehen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {benutzerListeFehlt ? (
        <p className="feld-hinweis">
          Zum Vergeben einer Freigabe wird die Benutzerliste benötigt (nur für Administrator/Manager verfügbar).
        </p>
      ) : (
        <form onSubmit={vergeben} className="schiedsrichter-formular">
          <div className="feld">
            <label htmlFor="freigabe-benutzer">Benutzer</label>
            <select
              id="freigabe-benutzer"
              value={zielBenutzerId}
              onChange={(e) => setZielBenutzerId(e.target.value)}
              required
            >
              <option value="">– bitte wählen –</option>
              {vergebbareBenutzer.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name} ({b.email})
                </option>
              ))}
            </select>
          </div>
          <div className="feld">
            <label htmlFor="freigabe-rolle">Zugriff</label>
            <select id="freigabe-rolle" value={rolle} onChange={(e) => setRolle(e.target.value as TurnierRolle)}>
              {(Object.keys(ROLLEN_LABEL) as TurnierRolle[]).map((r) => (
                <option key={r} value={r}>
                  {ROLLEN_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={!zielBenutzerId}>
            Freigeben
          </button>
        </form>
      )}
    </section>
  );
}

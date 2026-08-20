import { useCallback, useEffect, useState } from "react";
import type { Turnier, TurnierBerechtigung, TurnierRolle } from "@torball/shared";
import {
  getBenutzerListe,
  getTurnierBerechtigungen,
  getTurnierCodes,
  turnierBerechtigungEntziehen,
  turnierBerechtigungVergeben,
  turnierCodesSetzen,
  updateTurnier,
  type BenutzerProfil,
  type TurnierCodesStatus,
} from "../api";

const ROLLEN_LABEL: Record<TurnierRolle, string> = {
  turnierleitung: "Turnierleitung (bearbeiten)",
  spielleitung: "Spielleitung (bearbeiten)",
  lesen: "Nur lesen",
};

type AlleBenutzerZugriff = "kein" | "lesen" | "schreiben";

const ALLE_BENUTZER_LABEL: Record<AlleBenutzerZugriff, string> = {
  kein: "Kein pauschaler Zugriff",
  lesen: "Alle angemeldeten Benutzer dürfen lesen",
  schreiben: "Alle angemeldeten Benutzer dürfen lesen und bearbeiten",
};

/**
 * Freigabe eines Turniers fuer weitere angemeldete Benutzer (Abschnitt 21.2). Nutzt die
 * bestehenden TurnierBerechtigung-Routen fuer einzelne Personen, plus einen pauschalen Schalter
 * (turnier.zugriffFuerAlleBenutzer) fuer ALLE angemeldeten Benutzer auf einmal - z.B. fuer eine
 * Demo-Instanz, auf der beliebige (auch erst spaeter selbst-registrierte) Tester ein Turnier
 * nutzen koennen sollen, ohne einzeln freigeschaltet zu werden. Der Ersteller/Admin hat ohnehin
 * Vollzugriff und muss sich hier nicht selbst eintragen. Die Benutzerliste (fuer die Auswahl) ist
 * nur fuer Administrator/Manager abrufbar - fehlt sie, bleibt die Anzeige bestehender Freigaben
 * moeglich, nur das Vergeben ist dann nicht angeboten.
 */
export function TurnierFreigabe({
  turnier,
  onGeaendert,
}: {
  turnier: Turnier;
  onGeaendert: (turnier: Turnier) => void;
}) {
  const turnierId = turnier._id;
  const [berechtigungen, setBerechtigungen] = useState<TurnierBerechtigung[]>([]);
  const [benutzer, setBenutzer] = useState<BenutzerProfil[]>([]);
  const [benutzerListeFehlt, setBenutzerListeFehlt] = useState(false);
  const [zielBenutzerId, setZielBenutzerId] = useState("");
  const [rolle, setRolle] = useState<TurnierRolle>("turnierleitung");
  const [fehler, setFehler] = useState<string | undefined>();

  const [codesStatus, setCodesStatus] = useState<TurnierCodesStatus | undefined>();
  const [turnierleitungCodeEingabe, setTurnierleitungCodeEingabe] = useState("");
  const [spielleitungCodeEingabe, setSpielleitungCodeEingabe] = useState("");
  const [codesFehler, setCodesFehler] = useState<string | undefined>();
  const [codesHinweis, setCodesHinweis] = useState<string | undefined>();

  const laden = useCallback(async () => {
    try {
      setBerechtigungen(await getTurnierBerechtigungen(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Laden der Freigaben");
    }
  }, [turnierId]);

  const codesLaden = useCallback(async () => {
    try {
      setCodesStatus(await getTurnierCodes(turnierId));
    } catch (err) {
      setCodesFehler(err instanceof Error ? err.message : "Fehler beim Laden der Codes");
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
    codesLaden();
    getBenutzerListe()
      .then(setBenutzer)
      .catch(() => setBenutzerListeFehlt(true));
  }, [laden, codesLaden]);

  async function codeSetzen(feld: "turnierleitungCode" | "spielleitungCode", wert: string | null) {
    setCodesFehler(undefined);
    setCodesHinweis(undefined);
    try {
      setCodesStatus(await turnierCodesSetzen(turnierId, { [feld]: wert }));
      if (feld === "turnierleitungCode") setTurnierleitungCodeEingabe("");
      else setSpielleitungCodeEingabe("");
      setCodesHinweis(wert ? "Code gespeichert." : "Code gelöscht.");
    } catch (err) {
      setCodesFehler(err instanceof Error ? err.message : "Fehler beim Speichern des Codes");
    }
  }

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

  async function alleBenutzerZugriffAendern(wert: AlleBenutzerZugriff) {
    setFehler(undefined);
    try {
      onGeaendert(
        await updateTurnier(turnierId, { zugriffFuerAlleBenutzer: wert === "kein" ? null : wert }),
      );
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Ändern der pauschalen Freigabe");
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

      <div className="feld">
        <label htmlFor="freigabe-alle-benutzer">Pauschaler Zugriff für alle angemeldeten Benutzer</label>
        <select
          id="freigabe-alle-benutzer"
          value={turnier.zugriffFuerAlleBenutzer ?? "kein"}
          onChange={(e) => alleBenutzerZugriffAendern(e.target.value as AlleBenutzerZugriff)}
        >
          {(Object.keys(ALLE_BENUTZER_LABEL) as AlleBenutzerZugriff[]).map((wert) => (
            <option key={wert} value={wert}>
              {ALLE_BENUTZER_LABEL[wert]}
            </option>
          ))}
        </select>
        <p className="feld-hinweis">
          Gilt zusätzlich zu den unten einzeln vergebenen Freigaben - sinnvoll, wenn wirklich jede angemeldete Person
          Zugriff haben soll (z. B. auf einer Demo-Instanz), nicht nur ausgewählte Benutzer.
        </p>
      </div>

      <h3>Einzelne Freigaben</h3>

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

      <h3>Codes für Lokales Netzwerk</h3>
      <p className="feld-hinweis">
        Alternativer Zugriff ohne eigenes Konto für Geräte im selben Netzwerk wie der Turnier-Server (Betriebsmodus
        „Lokales Netzwerk"). Wer den Code kennt, meldet sich unter{" "}
        <code>{`${window.location.origin}/turniere/${turnierId}/code`}</code> an.
      </p>

      {codesFehler && <p role="alert">{codesFehler}</p>}
      {codesHinweis && <p>{codesHinweis}</p>}

      <div className="tabellen-wrapper">
        <table>
          <caption className="sr-only">Turnier-Codes</caption>
          <thead>
            <tr>
              <th scope="col">Rolle</th>
              <th scope="col">Status</th>
              <th scope="col">Neuer Code</th>
              <th scope="col">Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Turnierleitung (Vollzugriff)</th>
              <td>{codesStatus?.turnierleitungCodeAktiv ? "Aktiv" : "Nicht gesetzt"}</td>
              <td>
                <label className="sr-only" htmlFor="code-turnierleitung">
                  Neuer Turnierleitung-Code
                </label>
                <input
                  id="code-turnierleitung"
                  autoComplete="off"
                  value={turnierleitungCodeEingabe}
                  onChange={(e) => setTurnierleitungCodeEingabe(e.target.value)}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => codeSetzen("turnierleitungCode", turnierleitungCodeEingabe.trim())}
                  disabled={!turnierleitungCodeEingabe.trim()}
                >
                  Speichern
                </button>{" "}
                {codesStatus?.turnierleitungCodeAktiv && (
                  <button type="button" className="button-loeschen" onClick={() => codeSetzen("turnierleitungCode", null)}>
                    Löschen
                  </button>
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Spielleitung (Spielplan &amp; Ergebnisse)</th>
              <td>{codesStatus?.spielleitungCodeAktiv ? "Aktiv" : "Nicht gesetzt"}</td>
              <td>
                <label className="sr-only" htmlFor="code-spielleitung">
                  Neuer Spielleitung-Code
                </label>
                <input
                  id="code-spielleitung"
                  autoComplete="off"
                  value={spielleitungCodeEingabe}
                  onChange={(e) => setSpielleitungCodeEingabe(e.target.value)}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => codeSetzen("spielleitungCode", spielleitungCodeEingabe.trim())}
                  disabled={!spielleitungCodeEingabe.trim()}
                >
                  Speichern
                </button>{" "}
                {codesStatus?.spielleitungCodeAktiv && (
                  <button type="button" className="button-loeschen" onClick={() => codeSetzen("spielleitungCode", null)}>
                    Löschen
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { SelbstregistrierungsRolle } from "@torball/shared";
import { getSystemeinstellungen, updateSystemeinstellungen } from "../api";

/**
 * Systemweite App-Einstellungen (nur Admin) - aktuell Selbstregistrierung, gedacht als
 * Erweiterungspunkt fuer kuenftige globale Schalter (siehe shared Systemeinstellungen-Typ).
 * Bewusst getrennt von den Standardregeln (Turnierregeln): andere Art von Einstellung
 * (unversioniert, wirkt sofort), keine Kopplung an neu angelegte Turniere.
 */
export function SystemeinstellungenPage() {
  const [selbstregistrierungErlaubt, setSelbstregistrierungErlaubt] = useState(false);
  const [selbstregistrierungStandardRolle, setSelbstregistrierungStandardRolle] =
    useState<SelbstregistrierungsRolle>("benutzer");
  const [geladen, setGeladen] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [gespeichertHinweis, setGespeichertHinweis] = useState(false);

  const laden = useCallback(async () => {
    try {
      const einstellungen = await getSystemeinstellungen();
      setSelbstregistrierungErlaubt(einstellungen.selbstregistrierungErlaubt);
      setSelbstregistrierungStandardRolle(einstellungen.selbstregistrierungStandardRolle);
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
      await updateSystemeinstellungen({ selbstregistrierungErlaubt, selbstregistrierungStandardRolle });
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
      <h1>Systemeinstellungen</h1>
      <p>Systemweite Einstellungen der Anwendung (nicht turnierbezogen).</p>

      {fehler && <p role="alert">{fehler}</p>}

      {geladen && (
        <form onSubmit={speichern}>
          <h2>Selbstregistrierung</h2>
          <p>
            Erlaubt es Besuchern, sich unter <code>/registrieren</code> ohne Einladung selbst einen Account
            anzulegen - z. B. praktisch für eine Demo-Instanz. Neue Accounts erhalten automatisch die unten
            gewählte Rolle.
          </p>
          <div className="feld">
            <label htmlFor="selbstregistrierungErlaubt">
              <input
                id="selbstregistrierungErlaubt"
                type="checkbox"
                checked={selbstregistrierungErlaubt}
                onChange={(e) => setSelbstregistrierungErlaubt(e.target.checked)}
              />{" "}
              Selbstregistrierung erlauben
            </label>
          </div>
          <div className="feld">
            <label htmlFor="selbstregistrierungStandardRolle">Rolle für selbst registrierte Accounts</label>
            <select
              id="selbstregistrierungStandardRolle"
              value={selbstregistrierungStandardRolle}
              disabled={!selbstregistrierungErlaubt}
              onChange={(e) => setSelbstregistrierungStandardRolle(e.target.value as SelbstregistrierungsRolle)}
            >
              <option value="benutzer">Benutzer</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <p>
            Aus Sicherheitsgründen ist „Admin" hier bewusst nicht wählbar - eine Selbstregistrierung darf nie
            automatisch Admin-Rechte vergeben.
          </p>
          {gespeichertHinweis && <p>Gespeichert.</p>}
          <button type="submit" disabled={sendet}>
            Speichern
          </button>
        </form>
      )}
    </>
  );
}

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { passwortReset } from "../api";
import { PasswortRegeln } from "../PasswortRegeln";

/**
 * Passwort-Reset ueber den Einmal-Link aus der "Passwort vergessen"-E-Mail (Token in der URL).
 * Nach erfolgreichem Setzen werden serverseitig alle bisherigen Sitzungen beendet - darauf
 * weist die Erfolgsmeldung hin.
 */
export function PasswortResetPage() {
  const { token } = useParams<{ token: string }>();
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [erfolgreich, setErfolgreich] = useState(false);
  const navigate = useNavigate();

  async function absenden(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setFehler(undefined);
    if (neuesPasswort !== wiederholung) {
      setFehler("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    try {
      await passwortReset(token, neuesPasswort);
      setErfolgreich(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  if (erfolgreich) {
    return (
      <>
        <p>Passwort wurde geändert. Alle bisherigen Sitzungen wurden beendet.</p>
        <button type="button" onClick={() => navigate("/login")}>
          Zur Anmeldung
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Neues Passwort setzen</h1>
      <form onSubmit={absenden}>
        <div className="feld">
          <label htmlFor="neuesPasswort">Neues Passwort</label>
          <input
            id="neuesPasswort"
            type="password"
            autoComplete="new-password"
            required
            value={neuesPasswort}
            onChange={(e) => setNeuesPasswort(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="wiederholung">Passwort wiederholen</label>
          <input
            id="wiederholung"
            type="password"
            autoComplete="new-password"
            required
            value={wiederholung}
            onChange={(e) => setWiederholung(e.target.value)}
          />
        </div>
        <PasswortRegeln passwort={neuesPasswort} />
        {fehler && <p role="alert">{fehler}</p>}
        <button type="submit">Passwort ändern</button>
      </form>
    </>
  );
}

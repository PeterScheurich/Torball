import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { bootstrapVerfuegbar, registrierungVerfuegbar } from "../api";
import { useAuth } from "../auth";

/**
 * Anmeldeseite. Zweistufig, wenn 2FA aktiv ist: Der erste Login-Versuch liefert
 * `benoetigtTotp`, danach wird zusaetzlich der Authenticator-Code abgefragt (E-Mail/Passwort
 * bleiben gesperrt, damit sie zwischen den Schritten nicht mehr geaendert werden). Zeigt oben
 * einen Ersteinrichtungs-Hinweis, solange ueberhaupt noch kein Benutzer existiert.
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [feststelltasteAktiv, setFeststelltasteAktiv] = useState(false);
  const [benoetigtTotp, setBenoetigtTotp] = useState(false);
  const [ersteinrichtungVerfuegbar, setErsteinrichtungVerfuegbar] = useState(false);
  const [registrierungErlaubt, setRegistrierungErlaubt] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  useEffect(() => {
    bootstrapVerfuegbar()
      .then((r) => setErsteinrichtungVerfuegbar(r.verfuegbar))
      .catch(() => setErsteinrichtungVerfuegbar(false));
    registrierungVerfuegbar()
      .then((r) => setRegistrierungErlaubt(r.verfuegbar))
      .catch(() => setRegistrierungErlaubt(false));
  }, []);

  // Meldet an; verlangt der Server 2FA, wird auf die Code-Eingabe umgeschaltet statt
  // weiterzuleiten. Erst der zweite Aufruf (mit Code) fuehrt zum Ziel.
  async function anmelden(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setSendet(true);
    try {
      const ergebnis = await authLogin(email, passwort, benoetigtTotp ? totpCode : undefined);
      if ("benoetigtTotp" in ergebnis) {
        setBenoetigtTotp(true);
        return;
      }
      navigate("/");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler bei der Anmeldung");
    } finally {
      setSendet(false);
    }
  }

  return (
    <>
      <h1>Anmeldung</h1>

      {ersteinrichtungVerfuegbar && (
        <p>
          Es existiert noch kein Benutzer.
          <br />
          <Link to="/ersteinrichtung" className="button-link">
            Ersteinrichtung starten
          </Link>
        </p>
      )}

      <form onSubmit={anmelden}>
        <div className="feld">
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={benoetigtTotp}
          />
        </div>
        <div className="feld">
          <label htmlFor="passwort">Passwort</label>
          <input
            id="passwort"
            type="password"
            autoComplete="current-password"
            required
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            onKeyDown={(e) => setFeststelltasteAktiv(e.getModifierState("CapsLock"))}
            onKeyUp={(e) => setFeststelltasteAktiv(e.getModifierState("CapsLock"))}
            onBlur={() => setFeststelltasteAktiv(false)}
            disabled={benoetigtTotp}
          />
          {feststelltasteAktiv && (
            <p className="feststelltaste-hinweis" role="status">
              Achtung: Die Feststelltaste ist aktiviert.
            </p>
          )}
        </div>
        {benoetigtTotp && (
          <div className="feld">
            <label htmlFor="totpCode">Bestätigungscode (2FA)</label>
            <input
              id="totpCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          </div>
        )}
        {fehler && <p role="alert">{fehler}</p>}
        <button type="submit" disabled={sendet}>
          Anmelden
        </button>
      </form>

      <p>
        <Link to="/passwort-vergessen">Passwort vergessen?</Link>
      </p>
      {registrierungErlaubt && (
        <p>
          Noch keinen Account? <Link to="/registrieren">Jetzt registrieren</Link>
        </p>
      )}
    </>
  );
}

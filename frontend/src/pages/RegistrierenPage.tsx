import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { registrieren, registrierungVerfuegbar } from "../api";
import { useAuth } from "../auth";
import { PasswortRegeln } from "../PasswortRegeln";

/**
 * Oeffentliche Selbstregistrierung - nur nutzbar, wenn ein Admin sie unter Systemeinstellungen
 * aktiviert hat (Abfrage bei /auth/registrierung-verfuegbar, dieselbe Rolle bekommen alle so
 * angelegten Benutzer, s. Systemeinstellungen.selbstregistrierungStandardRolle). Nach dem Anlegen
 * wird direkt angemeldet und auf die Startseite geleitet - analog zur Ersteinrichtung.
 */
export function RegistrierenPage() {
  const [verfuegbar, setVerfuegbar] = useState<boolean | undefined>();
  const [name, setName] = useState("");
  const [vorname, setVorname] = useState("");
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [passwortWiederholung, setPasswortWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    registrierungVerfuegbar()
      .then((r) => setVerfuegbar(r.verfuegbar))
      .catch(() => setVerfuegbar(false));
  }, []);

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);

    if (passwort !== passwortWiederholung) {
      setFehler("Die beiden Passwörter stimmen nicht überein.");
      return;
    }

    setSendet(true);
    try {
      await registrieren(email, passwort, name, vorname);
      await login(email, passwort);
      navigate("/");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler bei der Registrierung");
    } finally {
      setSendet(false);
    }
  }

  if (verfuegbar === undefined) {
    return <p>Lädt…</p>;
  }

  if (!verfuegbar) {
    return (
      <>
        <h1>Registrieren</h1>
        <p>Die Selbstregistrierung ist derzeit nicht aktiviert.</p>
      </>
    );
  }

  return (
    <>
      <h1>Registrieren</h1>
      <p>Lege einen eigenen Account an.</p>

      <form onSubmit={anlegen}>
        <div className="feld">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="vorname">Vorname</label>
          <input id="vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="passwort">Passwort</label>
          <input
            id="passwort"
            type="password"
            autoComplete="new-password"
            required
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="passwortWiederholung">Passwort wiederholen</label>
          <input
            id="passwortWiederholung"
            type="password"
            autoComplete="new-password"
            required
            value={passwortWiederholung}
            onChange={(e) => setPasswortWiederholung(e.target.value)}
          />
        </div>
        <PasswortRegeln passwort={passwort} />
        {fehler && <p role="alert">{fehler}</p>}
        <button type="submit" disabled={sendet}>
          Account anlegen
        </button>
      </form>
    </>
  );
}

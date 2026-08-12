import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { bootstrapAdmin } from "../api";
import { useAuth } from "../auth";
import { PasswortRegeln } from "../PasswortRegeln";

/**
 * Einmalige Ersteinrichtung: legt den allerersten Admin-Account an (Bootstrap). Die zugehoerige
 * API funktioniert serverseitig nur, solange noch kein Benutzer existiert. Nach dem Anlegen wird
 * direkt angemeldet und auf die Startseite geleitet.
 */
export function ErsteinrichtungPage() {
  const [name, setName] = useState("");
  const [vorname, setVorname] = useState("");
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [passwortWiederholung, setPasswortWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  // Legt den Admin an und meldet ihn direkt an. Passwort-Gleichheit wird hier im Client
  // vorgeprueft (die inhaltlichen Passwortregeln erzwingt zusaetzlich der Server).
  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);

    if (passwort !== passwortWiederholung) {
      setFehler("Die beiden Passwörter stimmen nicht überein.");
      return;
    }

    setSendet(true);
    try {
      await bootstrapAdmin(email, passwort, name, vorname);
      await login(email, passwort);
      navigate("/");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler bei der Ersteinrichtung");
    } finally {
      setSendet(false);
    }
  }

  return (
    <>
      <h1>Ersteinrichtung</h1>
      <p>Lege den ersten Admin-Account an. Diese Seite funktioniert nur, solange noch kein Benutzer existiert.</p>

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
          Admin-Account anlegen
        </button>
      </form>
    </>
  );
}

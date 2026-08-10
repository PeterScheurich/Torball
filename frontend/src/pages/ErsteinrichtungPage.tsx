import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { bootstrapAdmin } from "../api";
import { useAuth } from "../auth";

export function ErsteinrichtungPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [passwortWiederholung, setPasswortWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);

    if (passwort !== passwortWiederholung) {
      setFehler("Die beiden Passwörter stimmen nicht überein.");
      return;
    }

    setSendet(true);
    try {
      await bootstrapAdmin(email, passwort, name);
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
        <p>Mindestens 8 Zeichen, davon 1 Großbuchstabe, 1 Zahl, 1 Sonderzeichen.</p>
        {fehler && <p role="alert">{fehler}</p>}
        <button type="submit" disabled={sendet}>
          Admin-Account anlegen
        </button>
      </form>
    </>
  );
}

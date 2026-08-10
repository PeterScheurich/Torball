import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { einladungAnnehmen, getEinladung } from "../api";
import { useAuth } from "../auth";

export function EinladungAnnehmenPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<{ email: string; name: string } | undefined>();
  const [passwort, setPasswort] = useState("");
  const [passwortWiederholung, setPasswortWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    if (!token) return;
    getEinladung(token)
      .then(setInfo)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Einladung ungültig"));
  }, [token]);

  async function annehmen(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !info) return;
    setFehler(undefined);
    if (passwort !== passwortWiederholung) {
      setFehler("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    setSendet(true);
    try {
      await einladungAnnehmen(token, passwort);
      await login(info.email, passwort);
      navigate("/");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Aktivieren des Accounts");
    } finally {
      setSendet(false);
    }
  }

  if (fehler && !info) return <p role="alert">{fehler}</p>;
  if (!info) return <p>Lädt…</p>;

  return (
    <>
      <h1>Willkommen, {info.name}</h1>
      <p>Setze dein Passwort für {info.email}, um deinen Account zu aktivieren.</p>
      <form onSubmit={annehmen}>
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
          Account aktivieren
        </button>
      </form>
    </>
  );
}

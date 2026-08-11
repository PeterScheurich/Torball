import { useState } from "react";
import { passwortVergessen } from "../api";

/**
 * Seite "Passwort vergessen": fordert per E-Mail einen Reset-Link an. Die Erfolgsmeldung ist
 * bewusst neutral formuliert ("falls ein Account existiert..."), damit sie nicht verraet, ob
 * eine E-Mail-Adresse registriert ist (keine Account-Enumeration).
 */
export function PasswortVergessenPage() {
  const [email, setEmail] = useState("");
  const [abgeschickt, setAbgeschickt] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();

  /** Schickt die Reset-Anforderung ab und schaltet auf die neutrale Bestaetigung um. */
  async function absenden(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    try {
      await passwortVergessen(email);
      setAbgeschickt(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  if (abgeschickt) {
    return <p>Falls ein Account mit dieser E-Mail-Adresse existiert, wurde ein Reset-Link erzeugt.</p>;
  }

  return (
    <>
      <h1>Passwort vergessen</h1>
      <form onSubmit={absenden}>
        <div className="feld">
          <label htmlFor="email">E-Mail</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {fehler && <p role="alert">{fehler}</p>}
        <button type="submit">Link anfordern</button>
      </form>
    </>
  );
}

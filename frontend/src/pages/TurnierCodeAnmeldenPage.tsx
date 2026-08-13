import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { turnierCodeAnmeldung } from "../api";

/**
 * Oeffentliche Code-Anmeldung fuer den Betriebsmodus "Lokales Netzwerk" (Abschnitt 21.3): wer den
 * von der Turnierleitung mitgeteilten Code kennt, bekommt ohne eigenes Konto Zugriff auf genau
 * dieses Turnier. Nach erfolgreicher Anmeldung (Session-Cookie ist gesetzt) je nach Rolle
 * weitergeleitet - Turnierleitung-Code auf die volle Verwaltungsansicht, Spielleitung-Code auf die
 * schlankere Ansicht mit nur Spielplan + Ergebnissen. Vorbild fuer die Seitenstruktur:
 * ErgebnisErfassungPage.tsx (ebenfalls oeffentlich, kein useAuth()).
 */
export function TurnierCodeAnmeldenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [fehler, setFehler] = useState<string | undefined>();
  const [laedt, setLaedt] = useState(false);

  async function anmelden(event: React.FormEvent) {
    event.preventDefault();
    const wert = code.trim();
    if (!wert) return;
    setFehler(undefined);
    setLaedt(true);
    try {
      const { rolle } = await turnierCodeAnmeldung(turnierId, wert);
      const ziel =
        rolle === "turnierleitung"
          ? `/turniere/${turnierId}/code/turnierleitung`
          : `/turniere/${turnierId}/code/spielleitung`;
      navigate(ziel, { replace: true });
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler bei der Anmeldung");
      setLaedt(false);
    }
  }

  return (
    <>
      <h1>Turnier-Code</h1>
      <p>
        Gib den von der Turnierleitung mitgeteilten Code ein, um dieses Turnier ohne eigenes Konto zu bearbeiten
        (Betriebsmodus „Lokales Netzwerk" - nur im selben Netzwerk wie der Turnier-Server erreichbar).
      </p>

      {fehler && <p role="alert">{fehler}</p>}

      <form onSubmit={anmelden}>
        <div className="feld">
          <label htmlFor="turnierCode">Code</label>
          <input
            id="turnierCode"
            required
            autoFocus
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <button type="submit" disabled={laedt || !code.trim()}>
          Anmelden
        </button>
      </form>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Turnier, Turnierregeln } from "@torball/shared";
import { getSystemkonfiguration, getTurnier, updateTurnier } from "../api";
import { TurnierregelnFormular } from "../components/TurnierregelnFormular";

/**
 * Regeln-Schritt des Anlage-Assistenten (zwischen Grunddaten und Mannschaften). Die Regeln sind
 * bereits mit den Standardwerten vorbelegt; hier lassen sie sich fuer dieses Turnier anpassen.
 * Kein „Zurueck zu Grunddaten": das Turnier ist bereits angelegt - stattdessen „Später fortsetzen".
 */
export function SpielregelnErfassenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();

  const laden = useCallback(async () => {
    try {
      setTurnier(await getTurnier(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  async function speichern(regeln: Turnierregeln) {
    setTurnier(await updateTurnier(turnierId, regeln));
  }

  const gesamtSchritte = turnier?.schiedsrichterPlanung ? 5 : 4;

  return (
    <>
      <p>
        Schritt 2 von {gesamtSchritte}: Regeln ·{" "}
        <Link to={`/turniere/${encodeURIComponent(turnierId)}`}>Später fortsetzen</Link>
      </p>
      <h1>Regeln</h1>
      <p className="feld-hinweis">
        Vorbelegt mit den aktuellen Standardwerten. Passe sie bei Bedarf für dieses Turnier an und speichere – oder gehe
        einfach weiter.
      </p>
      {fehler && <p role="alert">{fehler}</p>}
      {turnier && (
        <TurnierregelnFormular werte={turnier} onSpeichern={speichern} standardWerte={getSystemkonfiguration} />
      )}

      <button
        type="button"
        onClick={() => navigate(`/turniere/${encodeURIComponent(turnierId)}/mannschaften-erfassen`)}
      >
        Weiter zu Mannschaften
      </button>
    </>
  );
}

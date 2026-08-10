import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Spiel } from "@torball/shared";
import { SpielplanVerwaltung } from "../components/SpielplanVerwaltung";

export function SpielplanErstellenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();
  const [anzahlSpiele, setAnzahlSpiele] = useState(0);

  return (
    <>
      <p>
        Schritt 3 von 3: Spielplan erstellen ·{" "}
        <Link to={`/turniere/${encodeURIComponent(turnierId)}/mannschaften-erfassen`}>Zurück zu Mannschaften</Link>
      </p>
      <h1>Spielplan</h1>

      <SpielplanVerwaltung turnierId={turnierId} onGeaendert={(spiele: Spiel[]) => setAnzahlSpiele(spiele.length)} />

      <button
        type="button"
        onClick={() => navigate(`/turniere/${encodeURIComponent(turnierId)}`)}
        disabled={anzahlSpiele === 0}
      >
        Fertig, zur Turnierverwaltung
      </button>
      {anzahlSpiele === 0 && <p>Erzeuge zuerst den Spielplan, um den Vorgang abzuschließen.</p>}
    </>
  );
}

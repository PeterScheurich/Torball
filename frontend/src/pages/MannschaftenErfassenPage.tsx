import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MannschaftImTurnier } from "@torball/shared";
import { MannschaftenListe } from "../components/MannschaftenListe";

export function MannschaftenErfassenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();
  const [anzahl, setAnzahl] = useState(0);

  return (
    <>
      <p>
        Schritt 2 von 3: Mannschaften erfassen ·{" "}
        <Link to={`/turniere/${encodeURIComponent(turnierId)}`}>Später fortsetzen</Link>
      </p>
      <h1>Mannschaften</h1>

      <MannschaftenListe
        turnierId={turnierId}
        onGeaendert={(mannschaften: MannschaftImTurnier[]) => setAnzahl(mannschaften.length)}
      />

      <button
        type="button"
        onClick={() => navigate(`/turniere/${encodeURIComponent(turnierId)}/spielplan-erstellen`)}
        disabled={anzahl < 2}
      >
        Weiter zum Spielplan
      </button>
      {anzahl < 2 && <p>Mindestens zwei Mannschaften nötig, um weiterzugehen.</p>}
    </>
  );
}

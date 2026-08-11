import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MannschaftImTurnier } from "@torball/shared";
import { getTurnier } from "../api";
import { MannschaftenListe } from "../components/MannschaftenListe";

export function MannschaftenErfassenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();
  const [anzahl, setAnzahl] = useState(0);
  const [schiedsrichterPlanung, setSchiedsrichterPlanung] = useState(false);

  useEffect(() => {
    getTurnier(turnierId)
      .then((t) => setSchiedsrichterPlanung(!!t.schiedsrichterPlanung))
      .catch(() => {});
  }, [turnierId]);

  const gesamtSchritte = schiedsrichterPlanung ? 5 : 4;
  const naechsterPfad = schiedsrichterPlanung
    ? `/turniere/${encodeURIComponent(turnierId)}/schiedsrichter-erfassen`
    : `/turniere/${encodeURIComponent(turnierId)}/spielplan-erstellen`;
  const naechsterText = schiedsrichterPlanung ? "Weiter zu Schiedsrichter" : "Weiter zum Spielplan";

  return (
    <>
      <p>
        Schritt 3 von {gesamtSchritte}: Mannschaften erfassen ·{" "}
        <Link to={`/turniere/${encodeURIComponent(turnierId)}`}>Später fortsetzen</Link>
      </p>
      <h1>Mannschaften</h1>

      <MannschaftenListe
        turnierId={turnierId}
        onGeaendert={(mannschaften: MannschaftImTurnier[]) => setAnzahl(mannschaften.length)}
      />

      <button type="button" onClick={() => navigate(naechsterPfad)} disabled={anzahl < 2}>
        {naechsterText}
      </button>
      {anzahl < 2 && <p>Mindestens zwei Mannschaften nötig, um weiterzugehen.</p>}
    </>
  );
}

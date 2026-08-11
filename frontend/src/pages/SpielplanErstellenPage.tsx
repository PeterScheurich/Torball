import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Spiel } from "@torball/shared";
import { getTurnier } from "../api";
import { SpielplanVerwaltung } from "../components/SpielplanVerwaltung";

export function SpielplanErstellenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();
  const [anzahlSpiele, setAnzahlSpiele] = useState(0);
  const [schiedsrichterPlanung, setSchiedsrichterPlanung] = useState(false);

  useEffect(() => {
    getTurnier(turnierId)
      .then((t) => setSchiedsrichterPlanung(!!t.schiedsrichterPlanung))
      .catch(() => {});
  }, [turnierId]);

  const gesamtSchritte = schiedsrichterPlanung ? 4 : 3;
  const zurueckPfad = schiedsrichterPlanung
    ? `/turniere/${encodeURIComponent(turnierId)}/schiedsrichter-erfassen`
    : `/turniere/${encodeURIComponent(turnierId)}/mannschaften-erfassen`;
  const zurueckText = schiedsrichterPlanung ? "Zurück zu Schiedsrichter" : "Zurück zu Mannschaften";

  return (
    <>
      <p>
        Schritt {gesamtSchritte} von {gesamtSchritte}: Spielplan erstellen ·{" "}
        <Link to={zurueckPfad}>{zurueckText}</Link>
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

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Spiel } from "@torball/shared";
import { getTurnier } from "../api";
import { SpielplanVerwaltung } from "../components/SpielplanVerwaltung";

/**
 * Letzter Schritt des Anlege-Assistenten: den Spielplan erzeugen (ueber die wiederverwendete
 * SpielplanVerwaltung) und danach in die Turnierverwaltung abschliessen. Erst mit mindestens
 * einem erzeugten Spiel ist "Fertig" moeglich.
 *
 * Die Schrittzahl (5 bzw. 4) haengt am optionalen Schiedsrichter-Schritt und wird - wie in
 * jedem Assistenten-Schritt - lokal aus dem Turnier-Flag berechnet; es gibt bewusst keinen
 * zentralen Wizard-Zustand (siehe CLAUDE.md). Bei einer Ablauf-Aenderung muessen die
 * Schrittzahlen auf allen Assistenten-Seiten mitgezogen werden.
 */
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

  const gesamtSchritte = schiedsrichterPlanung ? 5 : 4;
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

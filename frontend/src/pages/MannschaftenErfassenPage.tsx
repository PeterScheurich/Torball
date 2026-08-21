import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MannschaftImTurnier } from "@torball/shared";
import { getTurnier } from "../api";
import { MannschaftenListe } from "../components/MannschaftenListe";

/**
 * Assistenten-Schritt 3: teilnehmende Mannschaften erfassen (ueber die wiederverwendete
 * MannschaftenListe). Weiter geht es erst ab zwei Mannschaften; der naechste Schritt ist je
 * nach Turnier-Flag die Schiedsrichter- oder direkt die Spielplan-Seite.
 *
 * Die Gesamt-Schrittzahl (5 bzw. 4) wird lokal aus dem Schiedsrichter-Flag berechnet - kein
 * zentraler Wizard-Zustand (siehe CLAUDE.md); bei Ablauf-Aenderungen auf allen Seiten mitziehen.
 */
export function MannschaftenErfassenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const navigate = useNavigate();
  const [anzahl, setAnzahl] = useState(0);
  const [schiedsrichterPlanung, setSchiedsrichterPlanung] = useState(false);
  const [maxSehendeSpieler, setMaxSehendeSpieler] = useState<number | undefined>();
  const [maxSpielerJeMannschaft, setMaxSpielerJeMannschaft] = useState<number | undefined>();
  const [digital, setDigital] = useState(false);

  useEffect(() => {
    getTurnier(turnierId)
      .then((t) => {
        setSchiedsrichterPlanung(!!t.schiedsrichterPlanung);
        setMaxSehendeSpieler(t.maxSehendeSpieler);
        setMaxSpielerJeMannschaft(t.maxSpielerJeMannschaft);
        setDigital(t.protokollierungsart === "digital");
      })
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
        <Link to={`/turniere/${encodeURIComponent(turnierId)}/regeln-erfassen`}>Zurück zu Regeln</Link> ·{" "}
        <Link to={`/turniere/${encodeURIComponent(turnierId)}`}>Später fortsetzen</Link>
      </p>
      <h1>Mannschaften</h1>

      <MannschaftenListe
        turnierId={turnierId}
        onGeaendert={(mannschaften: MannschaftImTurnier[]) => setAnzahl(mannschaften.length)}
        maxSehendeSpieler={maxSehendeSpieler}
        maxSpielerJeMannschaft={maxSpielerJeMannschaft}
        digitaleProtokollierung={digital}
      />

      <button type="button" onClick={() => navigate(naechsterPfad)} disabled={anzahl < 2}>
        {naechsterText}
      </button>
      {anzahl < 2 && <p>Mindestens zwei Mannschaften nötig, um weiterzugehen.</p>}
    </>
  );
}

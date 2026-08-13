import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Turnier } from "@torball/shared";
import { getTurnier } from "../api";
import { ErgebnisVerwaltung } from "../components/ErgebnisVerwaltung";
import { SpielplanVerwaltung } from "../components/SpielplanVerwaltung";

/**
 * Schlanke Ansicht fuer eine Spielleitung-Code-Sitzung (Abschnitt 21.3, Betriebsmodus "Lokales
 * Netzwerk"): zeigt nur Spielplan (Reihenfolge/Zeiten/Status/Schiedsrichter-Zuordnung zu Spielen)
 * und Ergebnisse - kein eigenes Konto noetig. Die Zugriffsstufe "schreiben_spielbetrieb" der
 * Code-Session erlaubt serverseitig ohnehin nur genau das (backend/src/auth/turnierZugriff.ts);
 * andere Bereiche (Mannschaften, Regeln, Freigaben, ...) sind hier bewusst nicht eingebunden.
 */
export function SpielleitungCodePage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();

  useEffect(() => {
    getTurnier(turnierId)
      .then(setTurnier)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"));
  }, [turnierId]);

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  const istGesperrt = turnier.status === "abgeschlossen" || turnier.status === "archiviert";

  return (
    <>
      <h1>{turnier.name}</h1>
      <p>Angemeldet als Spielleitung (Turnier-Code).</p>

      {istGesperrt && (
        <p className="turnier-gesperrt-hinweis" role="status">
          Dieses Turnier ist <strong>abgeschlossen</strong> – Spielplan und Ergebnisse sind gesperrt.
        </p>
      )}

      <h2>Spielplan</h2>
      <SpielplanVerwaltung turnierId={turnierId} gesperrt={istGesperrt} />

      <h2>Ergebnisse</h2>
      <ErgebnisVerwaltung turnierId={turnierId} />
    </>
  );
}

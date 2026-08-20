import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Turnier } from "@torball/shared";
import { getTurnier, getTurnierCheckoutStatus } from "../api";
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
  // Siehe TurnierVerwaltenPage.tsx: dieselbe Kennzeichnung fuer ein per Turnier-Sync an eine
  // lokale Installation ausgechecktes (und damit hier ebenfalls schreibgeschuetztes) Turnier.
  const [ausgecheckt, setAusgecheckt] = useState(false);

  useEffect(() => {
    getTurnier(turnierId)
      .then(setTurnier)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"));
    getTurnierCheckoutStatus(turnierId)
      .then((status) => setAusgecheckt(status.ausgecheckt))
      .catch(() => setAusgecheckt(false));
  }, [turnierId]);

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  const istGesperrt = turnier.status === "abgeschlossen" || turnier.status === "archiviert";
  // Ausgechecktes Turnier: der Server lehnt hier jede Aenderung ab (409) - alle Eingaben sperren,
  // damit man nicht ins Leere tippt. Freigabe aufheben ist von dieser Code-Ansicht aus ohnehin nicht
  // moeglich (kein Turnier-Sync-Bereich) - das laeuft ueber die serverseitige Verwaltung/das Konto.
  const eingabeGesperrt = istGesperrt || ausgecheckt;

  return (
    <>
      <h1>
        {ausgecheckt ? (
          <span style={{ color: "var(--danger)" }}>{turnier.name} (gesperrt)</span>
        ) : (
          turnier.name
        )}
      </h1>
      <p>Angemeldet als Spielleitung (Turnier-Code).</p>

      {ausgecheckt ? (
        <p className="turnier-gesperrt-hinweis" role="status">
          Dieses Turnier wird gerade auf einer <strong>lokalen Installation</strong> verwaltet und ist hier deshalb
          <strong> schreibgeschützt</strong>.
        </p>
      ) : (
        istGesperrt && (
          <p className="turnier-gesperrt-hinweis" role="status">
            Dieses Turnier ist <strong>abgeschlossen</strong> – Spielplan und Ergebnisse sind gesperrt.
          </p>
        )
      )}

      <h2>Spielplan</h2>
      <SpielplanVerwaltung turnierId={turnierId} gesperrt={eingabeGesperrt} />

      <h2>Ergebnisse</h2>
      {/* ErgebnisVerwaltung sperrt Ergebnisfelder selbst ueber ergebnisAbgeschlossen; bei einem
          ausgecheckten Turnier zusaetzlich nativ ueber ein disabled-<fieldset> (siehe TurnierVerwaltenPage). */}
      <fieldset className="blank-fieldset" disabled={ausgecheckt}>
        <ErgebnisVerwaltung turnierId={turnierId} />
      </fieldset>
    </>
  );
}

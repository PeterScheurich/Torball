import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOeffentlicheTurnierliste, type OeffentlichesTurnierListenElement } from "../api";
import { formatiereDatum } from "../format";

function istAbgeschlossen(status: string): boolean {
  return status === "abgeschlossen" || status === "archiviert";
}

function TurnierListe({ turniere, leerText }: { turniere: OeffentlichesTurnierListenElement[]; leerText: string }) {
  if (turniere.length === 0) return <p>{leerText}</p>;
  return (
    <ul className="oeffentliche-turnierliste">
      {turniere.map((t) => (
        <li key={t.turnierId}>
          <Link to={`/turniere/${t.turnierId}/oeffentlich`}>{t.name}</Link>
          <span className="startseite-zusatz">
            {formatiereDatum(t.datum)}
            {t.spielortName ? ` · ${t.spielortName}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Oeffentliche Startseite der Server-App (kein Login): zeigt die oeffentlich freigegebenen Turniere
 * (nur Name/Datum/Spielort), getrennt nach aktuellen und abgeschlossenen, plus einen Link zur
 * Anmeldung. Fuer angemeldete Benutzer rendert die Root-Route stattdessen die Verwaltungs-Liste.
 */
export function OeffentlicheStartseitePage() {
  const [turniere, setTurniere] = useState<OeffentlichesTurnierListenElement[]>([]);
  const [fehler, setFehler] = useState<string>();
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    getOeffentlicheTurnierliste()
      .then(setTurniere)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"))
      .finally(() => setGeladen(true));
  }, []);

  // Aktuelle Turniere nach Datum aufsteigend (naechste zuerst), abgeschlossene absteigend (neueste zuerst).
  const geplant = turniere
    .filter((t) => !istAbgeschlossen(t.status))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const abgeschlossen = turniere
    .filter((t) => istAbgeschlossen(t.status))
    .sort((a, b) => b.datum.localeCompare(a.datum));

  return (
    <>
      <h1>Torball-Turniere</h1>
      <p>
        Öffentlich freigegebene Turniere im Überblick. Zur Verwaltung bitte{" "}
        <Link to="/login">anmelden</Link>.
      </p>

      {fehler && <p role="alert">{fehler}</p>}

      {geladen && turniere.length === 0 && !fehler ? (
        <p>Aktuell sind keine Turniere öffentlich freigegeben.</p>
      ) : (
        <>
          <h2>Aktuelle Turniere</h2>
          <TurnierListe turniere={geplant} leerText="Keine aktuellen Turniere." />

          <h2>Abgeschlossene Turniere</h2>
          <TurnierListe turniere={abgeschlossen} leerText="Keine abgeschlossenen Turniere." />
        </>
      )}
    </>
  );
}

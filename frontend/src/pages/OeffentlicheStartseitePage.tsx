import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOeffentlicheTurnierliste, type OeffentlichesTurnierListenElement } from "../api";
import { formatiereDatum } from "../format";
import { TurnierLogo } from "../components/TurnierLogo";

function istAbgeschlossen(status: string): boolean {
  return status === "abgeschlossen" || status === "archiviert";
}

function TurnierListe({ turniere, leerText }: { turniere: OeffentlichesTurnierListenElement[]; leerText: string }) {
  if (turniere.length === 0) return <p>{leerText}</p>;
  return (
    <ul className="oeffentliche-turnierliste">
      {turniere.map((t) => (
        <li key={t.turnierId}>
          <span className="turnier-name-mit-logo">
            <TurnierLogo logoDataUrl={t.logoDataUrl} hoehe={28} />
            <Link to={`/turniere/${t.turnierId}/oeffentlich`}>{t.name}</Link>
          </span>
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

  // Aktive/geplante Turniere nach Datum aufsteigend (naechste zuerst), abgeschlossene absteigend (neueste zuerst).
  const aktiv = turniere.filter((t) => t.status === "aktiv").sort((a, b) => a.datum.localeCompare(b.datum));
  const geplant = turniere.filter((t) => t.status === "entwurf").sort((a, b) => a.datum.localeCompare(b.datum));
  const abgeschlossen = turniere
    .filter((t) => istAbgeschlossen(t.status))
    .sort((a, b) => b.datum.localeCompare(a.datum));

  return (
    <>
      <div className="startseite-kopf">
        <div>
          <h1>Torball-Turniere</h1>
          <p>
            Öffentlich freigegebene Turniere im Überblick. Zur Verwaltung bitte{" "}
            <Link to="/login">anmelden</Link>.
          </p>
        </div>
        {/* youtube-nocookie.com statt youtube.com: setzt erst bei tatsaechlicher Wiedergabe
            Tracking-Cookies, nicht schon beim reinen Laden der Seite. */}
        <div className="startseite-video">
          <iframe
            src="https://www.youtube-nocookie.com/embed/SJfSENCQlNE"
            title="Einführungsvideo: Torball-Turniere"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>

      {fehler && <p role="alert">{fehler}</p>}

      {geladen && turniere.length === 0 && !fehler ? (
        <p>Aktuell sind keine Turniere öffentlich freigegeben.</p>
      ) : (
        <>
          {aktiv.length > 0 && (
            <>
              <h2>Aktive Turniere</h2>
              <TurnierListe turniere={aktiv} leerText="Keine aktiven Turniere." />
            </>
          )}

          <h2>Geplante Turniere</h2>
          <TurnierListe turniere={geplant} leerText="Keine geplanten Turniere." />

          <h2>Abgeschlossene Turniere</h2>
          <TurnierListe turniere={abgeschlossen} leerText="Keine abgeschlossenen Turniere." />
        </>
      )}
    </>
  );
}

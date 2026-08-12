import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Turnier, TurnierStatus } from "@torball/shared";
import { deleteTurnier, getTurniere } from "../api";
import { useAuth } from "../auth";
import { formatiereDatum, formatiereUhrzeit } from "../format";

/** Anzeige-Labels der Status-Werte (das rohe Feld waere z.B. "entwurf" - hier lesbar gemacht). */
const STATUS_LABEL: Record<TurnierStatus, string> = {
  entwurf: "Entwurf",
  aktiv: "Aktiv",
  abgeschlossen: "Abgeschlossen",
  archiviert: "Archiviert",
};

/**
 * Trennkriterium der Uebersicht: "abgeschlossen" (bewusst von der Turnierleitung beendet)
 * und "archiviert" (Langzeit-Archiv) gelten als abgeschlossen; entwurf/aktiv (inkl. gerade
 * laufender Turniere) zaehlen zu den geplanten. Vorgabe des Nutzers: laufende Turniere
 * gehoeren zu den geplanten.
 */
function istAbgeschlossen(status: TurnierStatus): boolean {
  return status === "abgeschlossen" || status === "archiviert";
}

/** „am TT.MM.JJJJ um HH:MM" aus einem ISO-Zeitstempel. */
function zeitpunkt(iso: string): string {
  return `am ${formatiereDatum(iso.slice(0, 10))} um ${formatiereUhrzeit(iso)}`;
}

/**
 * Kleine Meta-Zeile je Turnier: bei offenen Turnieren „angelegt … von …" plus „zuletzt bearbeitet
 * von …" (Ergebnis-Erfassung zaehlt hier bewusst nicht mit); bei abgeschlossenen „abgeschlossen …
 * von …". Aeltere Turniere ohne denormalisierte Namen fallen still auf den reinen Zeitpunkt zurueck.
 */
function TurnierMeta({ turnier }: { turnier: Turnier }) {
  if (istAbgeschlossen(turnier.status)) {
    if (!turnier.abgeschlossenAm) return null;
    return (
      <div className="turnier-meta">
        Abgeschlossen {zeitpunkt(turnier.abgeschlossenAm)}
        {turnier.abgeschlossenVonName ? ` von ${turnier.abgeschlossenVonName}` : ""}
      </div>
    );
  }
  return (
    <div className="turnier-meta">
      Angelegt {zeitpunkt(turnier.erstelltAm)}
      {turnier.erstelltVonName ? ` von ${turnier.erstelltVonName}` : ""}
      {turnier.zuletztBearbeitetVonName ? ` · zuletzt bearbeitet von ${turnier.zuletztBearbeitetVonName}` : ""}
    </div>
  );
}

/** Eine Turnier-Tabelle (fuer je eine Gruppe der Uebersicht). Zeigt eine eigene
 *  Leer-Meldung, wenn die Gruppe keine Turniere enthaelt. */
function TurnierTabelle({
  turniere,
  beschriftung,
  leerText,
  onLoeschen,
}: {
  turniere: Turnier[];
  beschriftung: string;
  leerText: string;
  onLoeschen: (id: string) => void;
}) {
  if (turniere.length === 0) {
    return <p>{leerText}</p>;
  }
  return (
    <table>
      <caption className="sr-only">{beschriftung}</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Spieltag</th>
          <th scope="col">Status</th>
          <th scope="col">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {turniere.map((turnier) => (
          <tr key={turnier._id}>
            <td>
              <Link to={`/turniere/${encodeURIComponent(turnier._id)}`}>{turnier.name}</Link>
              <TurnierMeta turnier={turnier} />
            </td>
            <td>{formatiereDatum(turnier.datum)}</td>
            <td className="status-zelle">{STATUS_LABEL[turnier.status]}</td>
            <td>
              <button
                type="button"
                className="symbol-button"
                onClick={() => onLoeschen(turnier._id)}
                aria-label={`${turnier.name} löschen`}
                title="Löschen"
              >
                ✕
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TurnierListePage() {
  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const { benutzer } = useAuth();
  const darfAnlegen = benutzer?.globaleRolle === "admin" || benutzer?.globaleRolle === "manager";

  useEffect(() => {
    laden();
  }, []);

  /** Laedt die fuer den angemeldeten Benutzer sichtbaren Turniere neu. */
  async function laden() {
    try {
      setTurniere(await getTurniere());
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }

  /** Loescht ein Turnier (mit allen abhaengigen Daten, Kaskade im Backend) und laedt neu. */
  async function loeschen(id: string) {
    try {
      await deleteTurnier(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen");
    }
  }

  const geplant = turniere.filter((t) => !istAbgeschlossen(t.status));
  const abgeschlossen = turniere.filter((t) => istAbgeschlossen(t.status));

  return (
    <>
      <h1>Turniere</h1>

      {/* Anlegen-Knopf bewusst oberhalb der Uebersicht (Nutzer-Vorgabe): sofort erreichbar,
          ohne an langen Listen vorbeiscrollen zu muessen. */}
      {darfAnlegen && (
        <p>
          <Link to="/turniere/neu" className="button-link">
            Neues Turnier anlegen
          </Link>
        </p>
      )}

      {fehler && <p role="alert">{fehler}</p>}

      {turniere.length === 0 && !fehler ? (
        <p>Noch keine Turniere angelegt.</p>
      ) : (
        <>
          <h2>Geplante Turniere</h2>
          <TurnierTabelle
            turniere={geplant}
            beschriftung="Geplante und laufende Turniere"
            leerText="Keine geplanten Turniere."
            onLoeschen={loeschen}
          />

          <h2>Abgeschlossene Turniere</h2>
          <TurnierTabelle
            turniere={abgeschlossen}
            beschriftung="Abgeschlossene Turniere"
            leerText="Keine abgeschlossenen Turniere."
            onLoeschen={loeschen}
          />
        </>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import { getMannschaften, getSpiele, getTurnier } from "../api";

/**
 * Eingeschraenkte Ansicht fuer die Protokollant-Code-Anmeldung (digitale Protokollierung,
 * Konzept Abschnitt 6): Spielplan NUR LESEND plus je Spiel der Einstieg in die
 * Live-Protokollierung. Liegt wie die anderen Code-Seiten AUSSERHALB von GeschuetzteRoute -
 * die Zugriffskontrolle laeuft rein serverseitig ueber das Code-Session-Cookie (Stufe "lesen"
 * plus das eigene Protokollier-Recht, siehe backend/src/auth/turnierZugriff.ts).
 */
export function ProtokollantCodePage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();

  const laden = useCallback(async () => {
    try {
      const [t, m, s] = await Promise.all([getTurnier(turnierId), getMannschaften(turnierId), getSpiele(turnierId)]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  if (fehler) return <p role="alert">{fehler}</p>;
  if (!turnier) return <p>Lädt…</p>;

  const nameVon = (mannschaftId: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;
  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));

  return (
    <>
      <h1>{turnier.name} – Protokoll</h1>
      <p>
        Du bist per Protokollant-Code angemeldet. Wähle ein Spiel, um dessen Live-Protokoll zu führen –
        alle anderen Turnierdaten sind hier nur lesbar.
      </p>
      {turnier.protokollierungsart !== "digital" && (
        <p role="alert">Dieses Turnier verwendet keine digitale Protokollierung.</p>
      )}
      {spieleSortiert.length === 0 ? (
        <p>Noch kein Spielplan vorhanden.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Spiele dieses Turniers</caption>
            <thead>
              <tr>
                <th scope="col">Spiel</th>
                <th scope="col">Begegnung</th>
                <th scope="col">Ergebnis</th>
                <th scope="col">Status</th>
                <th scope="col">Protokoll</th>
              </tr>
            </thead>
            <tbody>
              {spieleSortiert.map((spiel, index) => (
                <tr key={spiel._id}>
                  <td>{spiel.runde ?? index + 1}</td>
                  <td>
                    {nameVon(spiel.mannschaftAId)} – {nameVon(spiel.mannschaftBId)}
                  </td>
                  <td>
                    {spiel.ergebnisA != null && spiel.ergebnisB != null
                      ? `${spiel.ergebnisA}:${spiel.ergebnisB}`
                      : "–"}
                  </td>
                  <td>{spiel.status}</td>
                  <td>
                    {turnier.protokollierungsart === "digital" && (
                      <Link className="button-link" to={`/turniere/${turnierId}/spiele/${spiel._id}/protokoll`}>
                        Protokollieren
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

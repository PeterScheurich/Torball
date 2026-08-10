import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getOeffentlicheTurnierseite, type OeffentlicheTurnierseite, type OeffentlichesSpiel } from "../api";
import { formatiereDatum, formatiereUhrzeit } from "../format";

/** Intervall fuers automatische Aktualisieren der oeffentlichen Seite (Live-Ergebnisse/-Spielplan fuer Zuschauer). */
const AKTUALISIER_INTERVALL_MS = 15_000;

type Tab = "turnierinfos" | "anfahrt" | "spielplan" | "ergebnisse";

const TAB_LABEL: Record<Tab, string> = {
  turnierinfos: "Turnierinfos",
  anfahrt: "Anfahrt & Dokumente",
  spielplan: "Spielplan",
  ergebnisse: "Ergebnisse",
};

const STATUS_LABEL: Record<string, string> = {
  geplant: "Offen",
  laeuft: "Spiel läuft",
  beendet: "Erfasst",
  abgeschlossen: "Abgeschlossen",
};

/** Gleiche Kartendienst-Logik wie in TurnierVerwaltenPage.tsx (dort fuer die
 * Turnierleitung mit Bearbeitungszustand, hier rein lesend fuer Gaeste). */
function kartenUrl(dienst: "google" | "osm", geo?: string, name?: string, adresse?: string): string {
  const koordinaten = geo?.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (koordinaten) {
    const [, breite, laenge] = koordinaten;
    return dienst === "google"
      ? `https://www.google.com/maps/search/?api=1&query=${breite},${laenge}`
      : `https://www.openstreetmap.org/?mlat=${breite}&mlon=${laenge}#map=18/${breite}/${laenge}`;
  }
  const suchtext = [name, adresse].filter(Boolean).join(", ");
  if (dienst === "google") {
    return suchtext
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suchtext)}`
      : "https://www.google.com/maps";
  }
  return suchtext
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(suchtext)}`
    : "https://www.openstreetmap.org";
}

interface SpieleTabelleProps {
  spiele: OeffentlichesSpiel[];
  daten: OeffentlicheTurnierseite;
  zeigeErgebnis: boolean;
}

function SpieleTabelle({ spiele, daten, zeigeErgebnis }: SpieleTabelleProps) {
  const mehrereFelder = daten.felder.length > 1;
  const nameVonMannschaft = (id: string) => daten.mannschaften.find((m) => m._id === id)?.name ?? id;
  const nameVonFeld = (feldId: string | undefined) => daten.felder.find((f) => f.feldId === feldId)?.name ?? feldId ?? "";
  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));

  if (spieleSortiert.length === 0) {
    return <p>Noch kein Spielplan veröffentlicht.</p>;
  }

  return (
    <div className="tabellen-wrapper">
      <table>
        <caption className="sr-only">Spielplan</caption>
        <thead>
          <tr>
            <th scope="col">Spiel</th>
            {mehrereFelder && <th scope="col">Feld</th>}
            <th scope="col">Startzeit</th>
            <th scope="col">Mannschaft A</th>
            <th scope="col">Mannschaft B</th>
            {zeigeErgebnis && <th scope="col">Ergebnis</th>}
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {spieleSortiert.map((s, index) => (
            <tr key={s._id}>
              <td>{index + 1}</td>
              {mehrereFelder && <td>{nameVonFeld(s.feldId)}</td>}
              <td>{formatiereUhrzeit(s.startzeitGeplant)}</td>
              <td>{nameVonMannschaft(s.mannschaftAId)}</td>
              <td>{nameVonMannschaft(s.mannschaftBId)}</td>
              {zeigeErgebnis && (
                <td>{s.ergebnisA != null && s.ergebnisB != null ? `${s.ergebnisA} : ${s.ergebnisB}` : "–"}</td>
              )}
              <td>{STATUS_LABEL[s.status] ?? s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OeffentlicheTurnierseitePage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;
  const [daten, setDaten] = useState<OeffentlicheTurnierseite | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();

  const laden = useCallback(() => {
    getOeffentlicheTurnierseite(turnierId)
      .then(setDaten)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"));
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  // Fuer Zuschauer automatisch aktualisieren, damit neue Ergebnisse/Spielplan-Aenderungen ohne
  // manuelles Neuladen erscheinen. Nur bei sichtbarer Seite, plus sofort beim Zurueckkehren.
  useEffect(() => {
    const intervall = setInterval(() => {
      if (document.visibilityState === "visible") laden();
    }, AKTUALISIER_INTERVALL_MS);
    const beiRueckkehr = () => {
      if (document.visibilityState === "visible") laden();
    };
    window.addEventListener("focus", beiRueckkehr);
    document.addEventListener("visibilitychange", beiRueckkehr);
    return () => {
      clearInterval(intervall);
      window.removeEventListener("focus", beiRueckkehr);
      document.removeEventListener("visibilitychange", beiRueckkehr);
    };
  }, [laden]);

  if (fehler) return <p role="alert">{fehler}</p>;
  if (!daten) return <p>Lädt…</p>;

  const verfuegbareTabs = (["turnierinfos", "anfahrt", "spielplan", "ergebnisse"] as Tab[]).filter(
    (tab) => daten[tab] !== null,
  );

  const tabParam = searchParams.get("tab") as Tab | null;
  const aktiverTab: Tab | undefined = verfuegbareTabs.includes(tabParam as Tab) ? (tabParam as Tab) : verfuegbareTabs[0];

  function tabSetzen(tab: Tab) {
    setSearchParams(
      (bisherig) => {
        const naechste = new URLSearchParams(bisherig);
        naechste.set("tab", tab);
        return naechste;
      },
      { replace: true },
    );
  }

  return (
    <>
      <h1>{daten.name}</h1>

      {verfuegbareTabs.length === 0 || !aktiverTab ? (
        <p>Diese Turnierseite ist aktuell nicht öffentlich freigegeben.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Turnierbereiche">
            {verfuegbareTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={aktiverTab === tab}
                className={aktiverTab === tab ? "tab tab-aktiv" : "tab"}
                onClick={() => tabSetzen(tab)}
              >
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>

          {aktiverTab === "turnierinfos" && daten.turnierinfos && (
            <div>
              <div className="tabellen-wrapper">
                <table>
                  <caption className="sr-only">Turnierinfos</caption>
                  <tbody>
                    <tr>
                      <th scope="row">Datum</th>
                      <td>{formatiereDatum(daten.turnierinfos.datum)}</td>
                    </tr>
                    {daten.turnierinfos.startzeit && (
                      <tr>
                        <th scope="row">Startzeit</th>
                        <td>{formatiereUhrzeit(`${daten.turnierinfos.datum}T${daten.turnierinfos.startzeit}:00`)}</td>
                      </tr>
                    )}
                    <tr>
                      <th scope="row">Status</th>
                      <td className="status-zelle">{daten.turnierinfos.status}</td>
                    </tr>
                    {daten.turnierinfos.turnierleitungName && (
                      <tr>
                        <th scope="row">Turnierleitung</th>
                        <td>
                          {daten.turnierinfos.turnierleitungName}
                          {daten.turnierinfos.turnierleitungKontakt ? ` – ${daten.turnierinfos.turnierleitungKontakt}` : ""}
                        </td>
                      </tr>
                    )}
                    {daten.turnierinfos.ansprechpartnerName && (
                      <tr>
                        <th scope="row">Ansprechpartner</th>
                        <td>
                          {daten.turnierinfos.ansprechpartnerName}
                          {daten.turnierinfos.ansprechpartnerKontakt
                            ? ` – ${daten.turnierinfos.ansprechpartnerKontakt}`
                            : ""}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {daten.turnierinfos.zusatzinfo && <p>{daten.turnierinfos.zusatzinfo}</p>}

              <h2>Teilnehmende Mannschaften</h2>
              {daten.mannschaften.length === 0 ? (
                <p>Noch keine Mannschaften gemeldet.</p>
              ) : (
                <ul>
                  {daten.mannschaften.map((m) => (
                    <li key={m._id}>
                      {m.name}
                      {m.bundesland ? ` (${m.bundesland})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {aktiverTab === "anfahrt" && daten.anfahrt && (
            <div>
              {!daten.anfahrt.spielortName && !daten.anfahrt.spielortAdresse ? (
                <p>Noch keine Ortsangabe hinterlegt.</p>
              ) : (
                <>
                  <div className="tabellen-wrapper">
                    <table>
                      <caption className="sr-only">Anfahrt</caption>
                      <tbody>
                        {daten.anfahrt.spielortName && (
                          <tr>
                            <th scope="row">Ort</th>
                            <td>{daten.anfahrt.spielortName}</td>
                          </tr>
                        )}
                        {daten.anfahrt.spielortAdresse && (
                          <tr>
                            <th scope="row">Adresse</th>
                            <td>{daten.anfahrt.spielortAdresse}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    <a
                      className="button-link"
                      href={kartenUrl(
                        "google",
                        daten.anfahrt.spielortGeo,
                        daten.anfahrt.spielortName,
                        daten.anfahrt.spielortAdresse,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google Maps
                    </a>{" "}
                    <a
                      className="button-link"
                      href={kartenUrl(
                        "osm",
                        daten.anfahrt.spielortGeo,
                        daten.anfahrt.spielortName,
                        daten.anfahrt.spielortAdresse,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenStreetMap
                    </a>
                  </p>
                </>
              )}
            </div>
          )}

          {aktiverTab === "spielplan" && daten.spielplan && (
            <div>
              <p>
                Version {daten.spielplan.version}
                {daten.spielplan.geaendertAm &&
                  `, zuletzt geändert am ${formatiereDatum(daten.spielplan.geaendertAm.slice(0, 10))} um ${formatiereUhrzeit(daten.spielplan.geaendertAm)}`}
              </p>
              <SpieleTabelle spiele={daten.spielplan.spiele} daten={daten} zeigeErgebnis={false} />
            </div>
          )}

          {aktiverTab === "ergebnisse" && daten.ergebnisse && (
            <div>
              <h2>Tabelle</h2>
              {daten.ergebnisse.tabelle.length === 0 ? (
                <p>Noch keine Ergebnisse erfasst.</p>
              ) : (
                <div className="tabellen-wrapper">
                  <table>
                    <caption className="sr-only">Turniertabelle</caption>
                    <thead>
                      <tr>
                        <th scope="col">Platz</th>
                        <th scope="col">Mannschaft</th>
                        <th scope="col">Sp</th>
                        <th scope="col">S</th>
                        <th scope="col">U</th>
                        <th scope="col">N</th>
                        <th scope="col">Tore</th>
                        <th scope="col">Diff</th>
                        <th scope="col">Punkte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daten.ergebnisse.tabelle.map((zeile, index) => (
                        <tr key={zeile.mannschaftId}>
                          <td>{index + 1}</td>
                          <td>{daten.mannschaften.find((m) => m._id === zeile.mannschaftId)?.name ?? zeile.mannschaftId}</td>
                          <td>{zeile.spiele}</td>
                          <td>{zeile.siege}</td>
                          <td>{zeile.unentschieden}</td>
                          <td>{zeile.niederlagen}</td>
                          <td>
                            {zeile.toreFuer}:{zeile.toreGegen}
                          </td>
                          <td>{zeile.tordifferenz}</td>
                          <td>{zeile.punkte}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h2>Spiele</h2>
              <SpieleTabelle spiele={daten.ergebnisse.spiele} daten={daten} zeigeErgebnis={true} />
            </div>
          )}
        </>
      )}
    </>
  );
}

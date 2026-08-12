import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  getOeffentlicheTurnierseite,
  type OeffentlicheTurnierseite,
  type OeffentlichesSpiel,
  type TabellenZeile,
} from "../api";
import { formatiereDatum, formatiereUhrzeit } from "../format";
import { QrCode } from "../components/QrCode";
import { KontextHilfe } from "../components/KontextHilfe";

/** Intervall fuers automatische Aktualisieren der oeffentlichen Seite (Live-Ergebnisse/-Spielplan fuer Zuschauer). */
const AKTUALISIER_INTERVALL_MS = 15_000;

type Tab = "turnierinfos" | "anfahrt" | "spielplan" | "ergebnisse" | "regeln";

const TAB_LABEL: Record<Tab, string> = {
  turnierinfos: "Turnierinfos",
  anfahrt: "Anfahrt & Dokumente",
  spielplan: "Spielplan",
  ergebnisse: "Ergebnisse",
  regeln: "Regeln",
};

/** Anzeige-Labels der Tabellen-Sortierkriterien (Reiter "Regeln"). */
const KRITERIUM_LABEL: Record<string, string> = {
  punkte: "Punkte",
  tordifferenz: "Tordifferenz",
  tore: "Erzielte Tore",
  direkter_vergleich: "Direkter Vergleich",
  freiwuerfe: "Freiwürfe",
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

type Mannschaftsliste = OeffentlicheTurnierseite["mannschaften"];
type Felderliste = OeffentlicheTurnierseite["felder"];

interface SpieleTabelleProps {
  spiele: OeffentlichesSpiel[];
  mannschaften: Mannschaftsliste;
  felder: Felderliste;
  zeigeErgebnis: boolean;
}

/** Spielplan-/Ergebnis-Tabelle der oeffentlichen Seite. Die Feld-Spalte erscheint nur bei
 *  mehreren Feldern, die Ergebnis-Spalte nur, wenn die Ergebnisse freigegeben sind. Mannschaften/
 *  Felder werden explizit uebergeben (nicht das ganze `daten`), damit die Tabelle auch je Spieltag
 *  eines Wettbewerbs mit dessen eigenen Mannschaften/Feldern aufloesen kann (Datenimport Stufe 4). */
function SpieleTabelle({ spiele, mannschaften, felder, zeigeErgebnis }: SpieleTabelleProps) {
  const mehrereFelder = felder.length > 1;
  const nameVonMannschaft = (id: string) => mannschaften.find((m) => m._id === id)?.name ?? id;
  const nameVonFeld = (feldId: string | undefined) => felder.find((f) => f.feldId === feldId)?.name ?? feldId ?? "";
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

interface TabellenAnzeigeProps {
  tabelle: TabellenZeile[];
  mannschaften: Mannschaftsliste;
}

/** Platzierungstabelle der oeffentlichen Seite (Platz, Mannschaft, Sp/S/U/N, Tore, Diff, Punkte).
 *  Wird sowohl fuer die Einzel-Tabelle eines Turniers als auch fuer die Gesamt-/Spieltag-Tabellen
 *  eines Wettbewerbs verwendet (Datenimport Stufe 4). */
function TabellenAnzeige({ tabelle, mannschaften }: TabellenAnzeigeProps) {
  if (tabelle.length === 0) {
    return <p>Noch keine Ergebnisse erfasst.</p>;
  }
  return (
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
          {tabelle.map((zeile, index) => (
            <tr key={zeile.mannschaftId}>
              <td>{index + 1}</td>
              <td>{mannschaften.find((m) => m._id === zeile.mannschaftId)?.name ?? zeile.mannschaftId}</td>
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
  );
}

interface WettbewerbErgebnisseProps {
  wettbewerb: NonNullable<OeffentlicheTurnierseite["wettbewerb"]>;
  aktuelleSpiele: OeffentlichesSpiel[];
  aktuelleMannschaften: Mannschaftsliste;
  aktuelleFelder: Felderliste;
}

/**
 * Ergebnis-Ansicht fuer einen Wettbewerb mit mehreren Spieltagen (Datenimport Stufe 4):
 * Unter-Navigation "Gesamt | Spieltag 1 | Spieltag 2". "Gesamt" zeigt die Summentabelle ueber alle
 * (freigegebenen) Spieltage plus die Spiele des aktuell aufgerufenen Spieltags; jeder Spieltag-Reiter
 * zeigt dessen eigene Tabelle und Spiele. Der Unter-Reiter-Zustand ist rein lokal (kein URL-Parameter).
 */
function WettbewerbErgebnisse({
  wettbewerb,
  aktuelleSpiele,
  aktuelleMannschaften,
  aktuelleFelder,
}: WettbewerbErgebnisseProps) {
  // "gesamt" oder eine turnierId eines Spieltags.
  const [unterTab, setUnterTab] = useState<string>("gesamt");
  const aktiverSpieltag = wettbewerb.spieltage.find((s) => s.turnierId === unterTab);
  // Faellt auf "gesamt" zurueck, falls der gewaehlte Spieltag verschwindet (z. B. Freigabe zurueckgezogen).
  const gewaehlt = unterTab === "gesamt" || aktiverSpieltag ? unterTab : "gesamt";

  return (
    <>
      <div role="tablist" aria-label="Spieltage" className="unter-tablist">
        <button
          type="button"
          role="tab"
          aria-selected={gewaehlt === "gesamt"}
          className={gewaehlt === "gesamt" ? "tab tab-aktiv" : "tab"}
          onClick={() => setUnterTab("gesamt")}
        >
          Gesamt
        </button>
        {wettbewerb.spieltage.map((s) => (
          <button
            key={s.turnierId}
            type="button"
            role="tab"
            aria-selected={gewaehlt === s.turnierId}
            className={gewaehlt === s.turnierId ? "tab tab-aktiv" : "tab"}
            onClick={() => setUnterTab(s.turnierId)}
          >
            Spieltag {s.spieltagNummer}
          </button>
        ))}
      </div>

      {gewaehlt === "gesamt" ? (
        <>
          <h2>Gesamttabelle</h2>
          <TabellenAnzeige tabelle={wettbewerb.gesamttabelle} mannschaften={aktuelleMannschaften} />
          <h2>Spiele Spieltag {wettbewerb.aktuellerSpieltagNummer}</h2>
          <SpieleTabelle
            spiele={aktuelleSpiele}
            mannschaften={aktuelleMannschaften}
            felder={aktuelleFelder}
            zeigeErgebnis={true}
          />
        </>
      ) : (
        aktiverSpieltag && (
          <>
            <h2>Tabelle Spieltag {aktiverSpieltag.spieltagNummer}</h2>
            <TabellenAnzeige tabelle={aktiverSpieltag.tabelle} mannschaften={aktiverSpieltag.mannschaften} />
            <h2>Spiele</h2>
            <SpieleTabelle
              spiele={aktiverSpieltag.spiele}
              mannschaften={aktiverSpieltag.mannschaften}
              felder={aktiverSpieltag.felder}
              zeigeErgebnis={true}
            />
          </>
        )
      )}
    </>
  );
}

/**
 * Oeffentliche Turnierseite ohne Login (die Turnier-ID selbst ist die Adresse). Zeigt in Reitern
 * Turnierinfos, Anfahrt & Dokumente, Spielplan und Ergebnisse - jeweils nur, wenn die Sektion
 * von der Turnierleitung freigegeben ist (vier oeffentlich*-Flags). Schiedsrichter werden hier
 * grundsaetzlich nicht genannt. Aktualisiert sich fuer Zuschauer automatisch (Polling).
 */
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

  const verfuegbareTabs = (["turnierinfos", "anfahrt", "spielplan", "ergebnisse", "regeln"] as Tab[]).filter(
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

  const oeffentlicheSeiteUrl = `${window.location.origin}/turniere/${turnierId}/oeffentlich`;

  return (
    <>
      <h1>{daten.name}</h1>

      <KontextHilfe>
        <p>
          Diese Seite zeigt die öffentlich freigegebenen Informationen zu diesem Turnier. Je nach Freigabe erscheinen
          oben Reiter für Turnierinfos, Anfahrt, Spielplan und Ergebnisse.
        </p>
        <p>Die Seite aktualisiert sich automatisch – neue Ergebnisse und Änderungen erscheinen von selbst.</p>
        <p>Über den QR-Code kannst du diese Seite direkt auf dem Smartphone öffnen.</p>
      </KontextHilfe>

      <details className="qr-aufklappen">
        <summary>
          <span aria-hidden="true">📱</span> Diese Seite auf dem Smartphone öffnen
        </summary>
        <div className="qr-aufklappen-inhalt">
          <p className="feld-hinweis">Mit der Kamera bzw. einer QR-App vom Bildschirm abscannen.</p>
          <QrCode text={oeffentlicheSeiteUrl} dateiname={`turnier-${daten.name}`} zeigeDownload={false} />
        </div>
      </details>

      <p className="druck-links">
        Als PDF:{" "}
        <Link className="button-link" to={`/turniere/${turnierId}/oeffentlich/druck?doc=info`}>
          Turnierinformationen
        </Link>{" "}
        {daten.spielplan && (
          <Link className="button-link" to={`/turniere/${turnierId}/oeffentlich/druck?doc=spielplan`}>
            Spielplan
          </Link>
        )}
      </p>

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
              <SpieleTabelle
                spiele={daten.spielplan.spiele}
                mannschaften={daten.mannschaften}
                felder={daten.felder}
                zeigeErgebnis={false}
              />
            </div>
          )}

          {aktiverTab === "ergebnisse" && daten.ergebnisse && (
            <div>
              {daten.wettbewerb ? (
                <WettbewerbErgebnisse
                  wettbewerb={daten.wettbewerb}
                  aktuelleSpiele={daten.ergebnisse.spiele}
                  aktuelleMannschaften={daten.mannschaften}
                  aktuelleFelder={daten.felder}
                />
              ) : (
                <>
                  <h2>Tabelle</h2>
                  <TabellenAnzeige tabelle={daten.ergebnisse.tabelle} mannschaften={daten.mannschaften} />
                  <h2>Spiele</h2>
                  <SpieleTabelle
                    spiele={daten.ergebnisse.spiele}
                    mannschaften={daten.mannschaften}
                    felder={daten.felder}
                    zeigeErgebnis={true}
                  />
                </>
              )}
            </div>
          )}

          {aktiverTab === "regeln" && daten.regeln && (
            <details className="regeln-aufklappen" open>
              <summary>Turnierregeln</summary>
              <div className="tabellen-wrapper">
                <table>
                  <caption className="sr-only">Turnierregeln</caption>
                  <tbody>
                    <tr>
                      <th scope="row">Spielzeit</th>
                      <td>
                        {daten.regeln.spielzeitMinuten} Min. ({daten.regeln.anzahlHalbzeiten} Halbzeit
                        {daten.regeln.anzahlHalbzeiten === 1 ? "" : "en"}
                        {daten.regeln.seitenwechsel ? ", mit Seitenwechsel" : ""})
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Pause</th>
                      <td>{daten.regeln.pauseMinuten} Min.</td>
                    </tr>
                    <tr>
                      <th scope="row">Timeouts</th>
                      <td>
                        {daten.regeln.timeoutsJeHalbzeit} je Halbzeit à {daten.regeln.timeoutDauerSekunden} s
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Auswechslungen</th>
                      <td>{daten.regeln.auswechslungenJeHalbzeit} je Halbzeit</td>
                    </tr>
                    <tr>
                      <th scope="row">Tordifferenz-Abbruch</th>
                      <td>
                        {daten.regeln.tordifferenzAbbruch
                          ? `ab ${daten.regeln.tordifferenzLimit} Toren Differenz`
                          : "nein"}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Verlängerung</th>
                      <td>
                        {daten.regeln.verlaengerungAktiv
                          ? `ja${daten.regeln.silbernesTor ? " (silbernes Tor)" : ""}`
                          : "nein"}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Wertung</th>
                      <td>
                        Sieg {daten.regeln.punkteSieg} · Unentschieden {daten.regeln.punkteUnentschieden} · Niederlage{" "}
                        {daten.regeln.punkteNiederlage} Punkte
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Tabellenwertung</th>
                      <td>{daten.regeln.tabellenKriterien.map((k) => KRITERIUM_LABEL[k] ?? k).join(" → ")}</td>
                    </tr>
                    <tr>
                      <th scope="row">Nichtantreten (Forfait)</th>
                      <td>{daten.regeln.forfaitErgebnis}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}

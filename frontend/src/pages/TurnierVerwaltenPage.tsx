import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Protokollierungsart, Spielmodus, Turnier } from "@torball/shared";
import { getTurnier, updateTurnier } from "../api";
import { ErgebnisVerwaltung } from "../components/ErgebnisVerwaltung";
import { MannschaftenListe } from "../components/MannschaftenListe";
import { SchiedsrichterVerwaltung } from "../components/SchiedsrichterVerwaltung";
import { SpielplanVerwaltung } from "../components/SpielplanVerwaltung";
import { formatiereDatum, formatiereUhrzeit } from "../format";

type Tab = "uebersicht" | "mannschaften" | "schiedsrichter" | "spielplan" | "ergebnisse";

const TABS: { id: Tab; label: string }[] = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "mannschaften", label: "Mannschaften" },
  { id: "schiedsrichter", label: "Schiedsrichter" },
  { id: "spielplan", label: "Spielplan" },
  { id: "ergebnisse", label: "Ergebnisse" },
];

/** Freitextfelder aus Abschnitt 5.1 ("Allgemein"), die bisher nur beim Anlegen (Name)
 * bzw. gar nicht erfasst werden konnten. Eigener Bearbeitungszustand mit Speichern beim
 * Verlassen des Feldes, analog zu Mannschaften/Vereinen/Teams. */
interface AllgemeinBearbeitung {
  name: string;
  spielortName: string;
  spielortAdresse: string;
  spielortGeo: string;
  turnierleitungName: string;
  turnierleitungKontakt: string;
  ansprechpartnerName: string;
  ansprechpartnerKontakt: string;
  zusatzinfo: string;
}

/** Erkennt "Breite, Laenge" (z.B. "50.1109, 8.6821") im Geo-Feld. */
const KOORDINATEN_MUSTER = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/;

/**
 * Oeffnet einen Kartendienst in einem neuen Tab. Stehen im Geo-Feld bereits Koordinaten
 * (z.B. von einem frueheren Kartenbesuch dort abgelesen und hier eingetragen), springt der
 * Dienst direkt an diese Position - sonst wird mit Spielort-Name/-Adresse gesucht.
 * Bewusst nur ein Link, keine eingebettete Karte: eine fremde Seite kann eine dort markierte
 * Position nicht automatisch an unsere App zurueckmelden - der/die Nutzer:in muss die
 * Koordinaten dort ablesen und selbst ins Geo-Feld eintragen.
 */
function kartenSucheUrl(dienst: "google" | "osm", allgemein: AllgemeinBearbeitung | undefined): string {
  const koordinaten = allgemein?.spielortGeo?.trim().match(KOORDINATEN_MUSTER);
  if (koordinaten) {
    const [, breite, laenge] = koordinaten;
    return dienst === "google"
      ? `https://www.google.com/maps/search/?api=1&query=${breite},${laenge}`
      : `https://www.openstreetmap.org/?mlat=${breite}&mlon=${laenge}#map=18/${breite}/${laenge}`;
  }

  const suchtext = [allgemein?.spielortName, allgemein?.spielortAdresse].filter(Boolean).join(", ");
  if (dienst === "google") {
    return suchtext
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suchtext)}`
      : "https://www.google.com/maps";
  }
  return suchtext
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(suchtext)}`
    : "https://www.openstreetmap.org";
}

type SichtbarkeitsFeld =
  | "oeffentlichTurnierinfos"
  | "oeffentlichAnfahrtDokumente"
  | "oeffentlichSpielplan"
  | "oeffentlichErgebnisse";

const SICHTBARKEITS_FELDER: { feld: SichtbarkeitsFeld; label: string }[] = [
  { feld: "oeffentlichTurnierinfos", label: "Turnierinfos" },
  { feld: "oeffentlichAnfahrtDokumente", label: "Anfahrt & Dokumente" },
  { feld: "oeffentlichSpielplan", label: "Spielplan" },
  { feld: "oeffentlichErgebnisse", label: "Ergebnisse" },
];

function allgemeinAusTurnier(turnier: Turnier): AllgemeinBearbeitung {
  return {
    name: turnier.name,
    spielortName: turnier.spielortName ?? "",
    spielortAdresse: turnier.spielortAdresse ?? "",
    spielortGeo: turnier.spielortGeo ?? "",
    turnierleitungName: turnier.turnierleitungName ?? "",
    turnierleitungKontakt: turnier.turnierleitungKontakt ?? "",
    ansprechpartnerName: turnier.ansprechpartnerName ?? "",
    ansprechpartnerKontakt: turnier.ansprechpartnerKontakt ?? "",
    zusatzinfo: turnier.zusatzinfo ?? "",
  };
}

export function TurnierVerwaltenPage() {
  const { id } = useParams<{ id: string }>();
  const turnierId = id!;

  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [allgemein, setAllgemein] = useState<AllgemeinBearbeitung | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const [linkHinweis, setLinkHinweis] = useState<string | undefined>();
  // Aktiver Reiter steckt in der URL (?tab=...), nicht nur im lokalen State - sonst
  // springt ein Reload (F5) immer zurueck auf "Uebersicht", egal auf welchem Reiter
  // man gerade war.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const aktiverTab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "uebersicht";
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    uebersicht: null,
    mannschaften: null,
    schiedsrichter: null,
    spielplan: null,
    ergebnisse: null,
  });

  useEffect(() => {
    getTurnier(turnierId)
      .then(setTurnier)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"));
  }, [turnierId]);

  // Nur beim ersten Laden aus dem Turnier uebernehmen, nicht bei jeder Aktualisierung
  // (z.B. nach Aendern des Spielmodus) - sonst wuerde ein noch ungespeicherter Entwurf
  // in einem der Felder hier ueberschrieben.
  useEffect(() => {
    if (turnier && !allgemein) setAllgemein(allgemeinAusTurnier(turnier));
  }, [turnier, allgemein]);

  async function allgemeinFeldSpeichern(feld: keyof AllgemeinBearbeitung) {
    if (!allgemein || !turnier) return;
    const wert = allgemein[feld].trim();

    if (feld === "name" && wert === "") {
      setFehler("Turniername darf nicht leer sein");
      setAllgemein((a) => (a ? { ...a, name: turnier.name } : a));
      return;
    }

    const aktuell = ((turnier as unknown as Record<string, string | undefined>)[feld] ?? "").trim();
    if (wert === aktuell) return;

    try {
      const aktualisiert = await updateTurnier(turnierId, { [feld]: feld === "name" ? wert : wert || null });
      setTurnier(aktualisiert);
      setAllgemein((a) => (a ? { ...a, [feld]: wert } : a));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
  }

  async function spielplanModusAendern(modus: Spielmodus) {
    try {
      setTurnier(await updateTurnier(turnierId, { spielplanModus: modus }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern des Spielmodus");
    }
  }

  async function protokollierungsartAendern(art: Protokollierungsart) {
    try {
      setTurnier(await updateTurnier(turnierId, { protokollierungsart: art }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Protokollierungsart");
    }
  }

  async function sichtbarkeitAendern(feld: SichtbarkeitsFeld, sichtbar: boolean) {
    try {
      setTurnier(await updateTurnier(turnierId, { [feld]: sichtbar }));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Ändern der Freigabe");
    }
  }

  async function oeffentlicherLinkKopieren() {
    try {
      await navigator.clipboard.writeText(oeffentlicheSeiteUrl);
      setLinkHinweis("Link kopiert.");
    } catch {
      setFehler("Link konnte nicht kopiert werden.");
    }
  }

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

  function tabWechseln(index: number) {
    const naechster = TABS[(index + TABS.length) % TABS.length];
    tabSetzen(naechster.id);
    tabRefs.current[naechster.id]?.focus();
  }

  function aufTastendruck(event: React.KeyboardEvent, aktuellerIndex: number) {
    if (event.key === "ArrowRight") tabWechseln(aktuellerIndex + 1);
    else if (event.key === "ArrowLeft") tabWechseln(aktuellerIndex - 1);
    else if (event.key === "Home") tabWechseln(0);
    else if (event.key === "End") tabWechseln(TABS.length - 1);
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  const oeffentlicheSeiteUrl = `${window.location.origin}/turniere/${turnierId}/oeffentlich`;

  return (
    <>
      <p>
        <Link to="/">&larr; Zurück zur Turnierliste</Link>
      </p>
      <h1>{turnier.name}</h1>
      {fehler && <p role="alert">{fehler}</p>}

      <div role="tablist" aria-label="Turnierbereiche">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={aktiverTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={aktiverTab === tab.id ? 0 : -1}
            className={aktiverTab === tab.id ? "tab tab-aktiv" : "tab"}
            onClick={() => tabSetzen(tab.id)}
            onKeyDown={(e) => aufTastendruck(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-uebersicht" aria-labelledby="tab-uebersicht" hidden={aktiverTab !== "uebersicht"}>
        <div className="tabellen-wrapper">
          <table className="uebersicht-tabelle">
            <caption className="sr-only">Turnier-Übersicht</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="turnierName">Name</label>
                </th>
                <td>
                  <input
                    id="turnierName"
                    required
                    value={allgemein?.name ?? turnier.name}
                    onChange={(e) => setAllgemein((a) => (a ? { ...a, name: e.target.value } : a))}
                    onBlur={() => allgemeinFeldSpeichern("name")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="uebersichtDatum">Datum</label>
                </th>
                <td>
                  <input id="uebersichtDatum" readOnly value={formatiereDatum(turnier.datum)} />
                </td>
              </tr>
              {turnier.startzeit && (
                <tr>
                  <th scope="row">
                    <label htmlFor="uebersichtStartzeit">Startzeit</label>
                  </th>
                  <td>
                    <input
                      id="uebersichtStartzeit"
                      readOnly
                      value={formatiereUhrzeit(`${turnier.datum}T${turnier.startzeit}:00`)}
                    />
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">
                  <label htmlFor="uebersichtStatus">Status</label>
                </th>
                <td>
                  <input id="uebersichtStatus" readOnly className="status-zelle" value={turnier.status} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="uebersichtSpielfelder">Spielfelder</label>
                </th>
                <td>
                  <input
                    id="uebersichtSpielfelder"
                    readOnly
                    value={turnier.felder.map((f) => f.name).join(", ") || "keine"}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="spielplanModus">Spielmodus</label>
                </th>
                <td>
                  <select
                    id="spielplanModus"
                    value={turnier.spielplanModus}
                    onChange={(e) => spielplanModusAendern(e.target.value === "doppelt" ? "doppelt" : "einfach")}
                  >
                    <option value="einfach">Jeder gegen Jeden (einfach)</option>
                    <option value="doppelt">Jeder zweimal gegen Jeden (doppelt)</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="protokollierungsart">Protokollierung</label>
                </th>
                <td>
                  <select
                    id="protokollierungsart"
                    value={turnier.protokollierungsart}
                    onChange={(e) =>
                      protokollierungsartAendern(e.target.value === "digital" ? "digital" : "manuell")
                    }
                  >
                    <option value="manuell">Manuell (Papierprotokoll, nur Endergebnisse erfasst)</option>
                    <option value="digital">Digital (Live-Ereignisprotokollierung - noch nicht umgesetzt)</option>
                  </select>
                  {turnier.protokollierungsart === "digital" && (
                    <p>
                      Die digitale Live-Protokollierung ist noch nicht umgesetzt - für Ergebniserfassung aktuell
                      auf „Manuell" umstellen.
                    </p>
                  )}
                </td>
              </tr>
              {(
                [
                  { feld: "spielortName", label: "Spielort (Name)" },
                  { feld: "spielortAdresse", label: "Spielort (Adresse)" },
                  { feld: "spielortGeo", label: "Spielort (Geo-Referenz, optional)" },
                  { feld: "turnierleitungName", label: "Turnierleitung (Name)" },
                  { feld: "turnierleitungKontakt", label: "Turnierleitung (Kontakt)" },
                  { feld: "ansprechpartnerName", label: "Ansprechpartner (Name)" },
                  { feld: "ansprechpartnerKontakt", label: "Ansprechpartner (Kontakt)" },
                ] as { feld: keyof AllgemeinBearbeitung; label: string }[]
              ).map(({ feld, label }) => (
                <tr key={feld}>
                  <th scope="row">
                    <label htmlFor={feld}>{label}</label>
                  </th>
                  <td>
                    <input
                      id={feld}
                      value={allgemein?.[feld] ?? (turnier[feld as keyof Turnier] as string | undefined) ?? ""}
                      onChange={(e) => setAllgemein((a) => (a ? { ...a, [feld]: e.target.value } : a))}
                      onBlur={() => allgemeinFeldSpeichern(feld)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                    {feld === "spielortGeo" && (
                      <>
                        {" "}
                        <a
                          className="button-link"
                          href={kartenSucheUrl("google", allgemein)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Standort in Google Maps suchen - Koordinaten dort ablesen und hier eintragen (kein automatischer Rückweg möglich)"
                        >
                          Google Maps
                        </a>{" "}
                        <a
                          className="button-link"
                          href={kartenSucheUrl("osm", allgemein)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Standort in OpenStreetMap suchen - Koordinaten dort ablesen und hier eintragen (kein automatischer Rückweg möglich)"
                        >
                          OpenStreetMap
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">
                  <label htmlFor="zusatzinfo">Zusatzinformationen</label>
                </th>
                <td>
                  <textarea
                    id="zusatzinfo"
                    rows={3}
                    value={allgemein?.zusatzinfo ?? turnier.zusatzinfo ?? ""}
                    onChange={(e) => setAllgemein((a) => (a ? { ...a, zusatzinfo: e.target.value } : a))}
                    onBlur={() => allgemeinFeldSpeichern("zusatzinfo")}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Öffentliche Turnierseite</h2>
        <p>
          Wer diesen Link hat, sieht die unten freigeschalteten Bereiche - ohne Anmeldung. Jeder Bereich ist einzeln
          schaltbar (Abschnitt 13); ohne freigeschalteten Bereich zeigt der Link nur den Turniernamen.
        </p>
        <ul>
          {SICHTBARKEITS_FELDER.map(({ feld, label }) => (
            <li key={feld}>
              <label>
                <input
                  type="checkbox"
                  checked={turnier[feld]}
                  onChange={(e) => sichtbarkeitAendern(feld, e.target.checked)}
                />{" "}
                {label}
              </label>
            </li>
          ))}
        </ul>
        <p>
          <input type="text" readOnly value={oeffentlicheSeiteUrl} onFocus={(e) => e.target.select()} />
          <br />
          <button type="button" onClick={oeffentlicherLinkKopieren}>
            Link kopieren
          </button>{" "}
          <a className="button-link" href={oeffentlicheSeiteUrl} target="_blank" rel="noopener noreferrer">
            Öffnen
          </a>
          {linkHinweis && <> {linkHinweis}</>}
        </p>
      </div>

      <div
        role="tabpanel"
        id="panel-mannschaften"
        aria-labelledby="tab-mannschaften"
        hidden={aktiverTab !== "mannschaften"}
      >
        <MannschaftenListe turnierId={turnierId} />
      </div>

      <div
        role="tabpanel"
        id="panel-schiedsrichter"
        aria-labelledby="tab-schiedsrichter"
        hidden={aktiverTab !== "schiedsrichter"}
      >
        <SchiedsrichterVerwaltung turnierId={turnierId} />
      </div>

      <div role="tabpanel" id="panel-spielplan" aria-labelledby="tab-spielplan" hidden={aktiverTab !== "spielplan"}>
        <SpielplanVerwaltung turnierId={turnierId} />
      </div>

      <div role="tabpanel" id="panel-ergebnisse" aria-labelledby="tab-ergebnisse" hidden={aktiverTab !== "ergebnisse"}>
        <ErgebnisVerwaltung turnierId={turnierId} />
      </div>
    </>
  );
}

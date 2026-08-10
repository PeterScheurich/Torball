import { useCallback, useEffect, useState } from "react";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import {
  erzeugeErgebnisToken,
  getErgebnisToken,
  getMannschaften,
  getSpiele,
  getTabelle,
  getTurnier,
  spielAbschliessen,
  spielErgebnisSetzen,
  turnierSpieleAbschliessen,
  widerrufeErgebnisToken,
  type TabellenZeile,
} from "../api";
import { useErgebnisEingaben } from "../useErgebnisEingaben";

interface Props {
  turnierId: string;
}

/** Intervall fuers automatische Aktualisieren (damit zeitgleich per Token-Link erfasste Ergebnisse erscheinen). */
const AKTUALISIER_INTERVALL_MS = 10_000;

export function ErgebnisVerwaltung({ turnierId }: Props) {
  const [turnier, setTurnier] = useState<Turnier | undefined>();
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [spiele, setSpiele] = useState<Spiel[]>([]);
  const [tabelle, setTabelle] = useState<TabellenZeile[]>([]);
  const [tokenWert, setTokenWert] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>();
  const [linkHinweis, setLinkHinweis] = useState<string | undefined>();
  const { eingaben, setFeld, konflikte } = useErgebnisEingaben(spiele);

  const laden = useCallback(async () => {
    try {
      const [t, m, s, tab, token] = await Promise.all([
        getTurnier(turnierId),
        getMannschaften(turnierId),
        getSpiele(turnierId),
        getTabelle(turnierId),
        getErgebnisToken(turnierId),
      ]);
      setTurnier(t);
      setMannschaften(m);
      setSpiele(s);
      setTabelle(tab);
      setTokenWert(token.tokenWert);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [turnierId]);

  /** Leichtgewichtiges Aktualisieren fuers Polling: nur die Daten, die sich mit Ergebnissen aendern. */
  const aktualisieren = useCallback(async () => {
    try {
      const [s, tab] = await Promise.all([getSpiele(turnierId), getTabelle(turnierId)]);
      setSpiele(s);
      setTabelle(tab);
    } catch {
      /* stiller Poll-Fehler - keine Seiten-Fehlermeldung, der naechste Versuch folgt automatisch */
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  // Automatisch aktualisieren, damit zeitgleich per Token-Link erfasste Ergebnisse hier erscheinen.
  // Nur bei sichtbarer Seite (der Tab-Panel bleibt gemountet), plus sofort beim Zurueckkehren.
  useEffect(() => {
    const intervall = setInterval(() => {
      if (document.visibilityState === "visible") aktualisieren();
    }, AKTUALISIER_INTERVALL_MS);
    const beiRueckkehr = () => {
      if (document.visibilityState === "visible") aktualisieren();
    };
    window.addEventListener("focus", beiRueckkehr);
    document.addEventListener("visibilitychange", beiRueckkehr);
    return () => {
      clearInterval(intervall);
      window.removeEventListener("focus", beiRueckkehr);
      document.removeEventListener("visibilitychange", beiRueckkehr);
    };
  }, [aktualisieren]);

  const nameVon = (mannschaftId: string) => mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;
  const spieleSortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));

  async function ergebnisSpeichern(spiel: Spiel, istForfait = false) {
    const eingabe = eingaben[spiel._id];
    const ergebnisA = Number(eingabe?.a);
    const ergebnisB = Number(eingabe?.b);
    if (!Number.isFinite(ergebnisA) || !Number.isFinite(ergebnisB) || ergebnisA < 0 || ergebnisB < 0) {
      setFehler("Bitte gültige Ergebnisse (0 oder größer) für beide Mannschaften eingeben.");
      return;
    }
    try {
      await spielErgebnisSetzen(spiel._id, { ergebnisA, ergebnisB, istForfait });
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Ergebnisses");
    }
  }

  function nichtAngetreten(spiel: Spiel, forfaitSeite: "a" | "b") {
    setFeld(spiel._id, "a", forfaitSeite === "a" ? "0" : "3");
    setFeld(spiel._id, "b", forfaitSeite === "a" ? "3" : "0");
    // Direkt mit den gesetzten Forfait-Werten speichern, nicht erst auf einen weiteren Klick warten.
    spielErgebnisSetzen(spiel._id, forfaitSeite === "a" ? { ergebnisA: 0, ergebnisB: 3, istForfait: true } : { ergebnisA: 3, ergebnisB: 0, istForfait: true })
      .then(laden)
      .catch((err) => setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern"));
  }

  async function abschliessenEinzeln(spiel: Spiel) {
    try {
      await spielAbschliessen(spiel._id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Abschließen");
    }
  }

  async function abschliessenAlle() {
    try {
      await turnierSpieleAbschliessen(turnierId);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Abschließen");
    }
  }

  async function linkErzeugen() {
    try {
      const ergebnis = await erzeugeErgebnisToken(turnierId);
      setTokenWert(ergebnis.tokenWert);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Erzeugen des Links");
    }
  }

  async function linkWiderrufen() {
    try {
      await widerrufeErgebnisToken(turnierId);
      setTokenWert(null);
      setLinkHinweis(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Widerrufen des Links");
    }
  }

  async function linkKopieren(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setLinkHinweis("Link kopiert.");
    } catch {
      setFehler("Link konnte nicht kopiert werden.");
    }
  }

  if (!turnier) {
    return fehler ? <p role="alert">{fehler}</p> : <p>Lädt…</p>;
  }

  const erfassungsLink = tokenWert ? `${window.location.origin}/ergebnis-erfassung/${tokenWert}` : undefined;

  return (
    <div>
      {fehler && <p role="alert">{fehler}</p>}

      {turnier.protokollierungsart !== "manuell" && (
        <p>
          Dieses Turnier ist auf „Digital" eingestellt - die digitale Live-Protokollierung ist noch nicht
          umgesetzt. Für Ergebniserfassung auf der Übersicht-Seite auf „Manuell" umstellen.
        </p>
      )}

      <h2>Ergebnisse</h2>
      {spiele.length === 0 ? (
        <p>Noch kein Spielplan erzeugt.</p>
      ) : (
        <>
          <div className="tabellen-wrapper">
            <table>
              <caption className="sr-only">Ergebniserfassung je Spiel</caption>
              <thead>
                <tr>
                  <th scope="col">Spiel</th>
                  <th scope="col">Mannschaft A</th>
                  <th scope="col">Ergebnis</th>
                  <th scope="col">Mannschaft B</th>
                  <th scope="col">Status</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {spieleSortiert.map((spiel, index) => {
                  const eingabe = eingaben[spiel._id] ?? { a: "", b: "" };
                  return (
                    <tr key={spiel._id}>
                      <td>{index + 1}</td>
                      <td>{nameVon(spiel.mannschaftAId)}</td>
                      <td>
                        <label className="sr-only" htmlFor={`ergebnisA-${spiel._id}`}>
                          Tore {nameVon(spiel.mannschaftAId)}
                        </label>
                        <input
                          id={`ergebnisA-${spiel._id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="ergebnis-eingabe"
                          disabled={spiel.ergebnisAbgeschlossen}
                          value={eingabe.a}
                          onChange={(e) => setFeld(spiel._id, "a", e.target.value)}
                        />
                        {" : "}
                        <label className="sr-only" htmlFor={`ergebnisB-${spiel._id}`}>
                          Tore {nameVon(spiel.mannschaftBId)}
                        </label>
                        <input
                          id={`ergebnisB-${spiel._id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="ergebnis-eingabe"
                          disabled={spiel.ergebnisAbgeschlossen}
                          value={eingabe.b}
                          onChange={(e) => setFeld(spiel._id, "b", e.target.value)}
                        />
                        {konflikte.has(spiel._id) && (
                          <div className="schiri-warnung" role="alert">
                            ⚠ Wurde zwischenzeitlich anderweitig gespeichert (jetzt {spiel.ergebnisA ?? "–"} :{" "}
                            {spiel.ergebnisB ?? "–"}). Speichern überschreibt diesen Wert.
                          </div>
                        )}
                      </td>
                      <td>{nameVon(spiel.mannschaftBId)}</td>
                      <td>
                        {spiel.ergebnisAbgeschlossen
                          ? "Abgeschlossen"
                          : spiel.ergebnisA != null
                            ? "Erfasst"
                            : "Offen"}
                      </td>
                      <td>
                        {!spiel.ergebnisAbgeschlossen && (
                          <>
                            <button
                              type="button"
                              className="symbol-button"
                              onClick={() => ergebnisSpeichern(spiel)}
                              aria-label="Speichern"
                              title="Speichern"
                            >
                              💾
                            </button>{" "}
                            <button
                              type="button"
                              onClick={() => nichtAngetreten(spiel, "a")}
                              title={`${nameVon(spiel.mannschaftAId)} nicht angetreten`}
                            >
                              A n. a.
                            </button>{" "}
                            <button
                              type="button"
                              onClick={() => nichtAngetreten(spiel, "b")}
                              title={`${nameVon(spiel.mannschaftBId)} nicht angetreten`}
                            >
                              B n. a.
                            </button>{" "}
                            <button
                              type="button"
                              className="symbol-button"
                              onClick={() => abschliessenEinzeln(spiel)}
                              disabled={spiel.ergebnisA == null}
                              aria-label="Abschließen"
                              title="Abschließen"
                            >
                              ✓
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={abschliessenAlle}>
            Alle erfassten Ergebnisse abschließen
          </button>
        </>
      )}

      <h2>Tabelle</h2>
      {tabelle.length === 0 ? (
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
              {tabelle.map((zeile, index) => (
                <tr key={zeile.mannschaftId}>
                  <td>{index + 1}</td>
                  <td>{nameVon(zeile.mannschaftId)}</td>
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

      <h2>Ergebniserfassung ohne Anmeldung</h2>
      <p>
        Wer diesen Link hat, kann Endergebnisse dieses Turniers eintragen - ohne eigenen Account. Sinnvoll, um die
        Ergebniserfassung an die Spielleitung vor Ort weiterzugeben.
      </p>
      {erfassungsLink ? (
        <p>
          <input type="text" readOnly value={erfassungsLink} onFocus={(e) => e.target.select()} />
          <br />
          <button type="button" onClick={() => linkKopieren(erfassungsLink)}>
            Link kopieren
          </button>{" "}
          <button type="button" onClick={linkWiderrufen}>
            Link widerrufen
          </button>
          {linkHinweis && <> {linkHinweis}</>}
        </p>
      ) : (
        <button type="button" onClick={linkErzeugen}>
          Link erzeugen
        </button>
      )}
    </div>
  );
}

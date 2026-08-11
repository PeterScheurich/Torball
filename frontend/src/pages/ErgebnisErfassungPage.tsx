import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ergebnisPerTokenSetzen, getErgebnisErfassung, type ErgebnisErfassungDaten } from "../api";
import { useErgebnisEingaben } from "../useErgebnisEingaben";
import { KontextHilfe } from "../components/KontextHilfe";

/** Intervall fuers automatische Aktualisieren (damit Ergebnisse der jeweils anderen Seite erscheinen). */
const AKTUALISIER_INTERVALL_MS = 10_000;

const NAME_SCHLUESSEL = "torball-erfasser-name";
const GERAET_SCHLUESSEL = "torball-geraet-kennung";

function geladenerName(): string {
  return localStorage.getItem(NAME_SCHLUESSEL) ?? "";
}

function geladeneGeraetKennung(): string {
  let kennung = localStorage.getItem(GERAET_SCHLUESSEL);
  if (!kennung) {
    kennung = crypto.randomUUID();
    localStorage.setItem(GERAET_SCHLUESSEL, kennung);
  }
  return kennung;
}

export function ErgebnisErfassungPage() {
  const { tokenWert } = useParams<{ tokenWert: string }>();
  const [name, setName] = useState(geladenerName);
  const [namenEingabe, setNamenEingabe] = useState("");
  const [daten, setDaten] = useState<ErgebnisErfassungDaten | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const [hinweis, setHinweis] = useState<string | undefined>();
  const [geradeGespeichert, setGeradeGespeichert] = useState<string | null>(null);
  const { eingaben, setFeld, konflikte, uebernehmeServer } = useErgebnisEingaben(daten?.spiele);

  function markiereGespeichert(spielId: string) {
    setGeradeGespeichert(spielId);
    window.setTimeout(() => setGeradeGespeichert((cur) => (cur === spielId ? null : cur)), 2500);
  }

  const laden = useCallback(async () => {
    if (!tokenWert) return;
    try {
      const ergebnis = await getErgebnisErfassung(tokenWert);
      setDaten(ergebnis);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [tokenWert]);

  useEffect(() => {
    laden();
  }, [laden]);

  // Automatisch aktualisieren, damit auf dieser Seite Ergebnisse erscheinen, die zeitgleich in
  // der internen Verwaltung eingetragen werden (und umgekehrt). Nur bei sichtbarer Seite, plus
  // sofortige Aktualisierung beim Zurueckkehren zum Tab/Fenster.
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

  function namenSpeichern(event: React.FormEvent) {
    event.preventDefault();
    if (!namenEingabe.trim()) return;
    localStorage.setItem(NAME_SCHLUESSEL, namenEingabe.trim());
    setName(namenEingabe.trim());
  }

  async function ergebnisSpeichern(spielId: string) {
    if (!tokenWert) return;
    const eingabe = eingaben[spielId];
    const ergebnisA = Number(eingabe?.a);
    const ergebnisB = Number(eingabe?.b);
    if (!Number.isFinite(ergebnisA) || !Number.isFinite(ergebnisB) || ergebnisA < 0 || ergebnisB < 0) {
      setFehler("Bitte gültige Ergebnisse (0 oder größer) für beide Mannschaften eingeben.");
      return;
    }
    setFehler(undefined);
    setHinweis(undefined);
    try {
      await ergebnisPerTokenSetzen(tokenWert, spielId, {
        erfasserName: name,
        geraetKennung: geladeneGeraetKennung(),
        ergebnisA,
        ergebnisB,
      });
      markiereGespeichert(spielId);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
  }

  /**
   * Automatisches Speichern beim Verlassen eines Tore-Feldes (onBlur), sobald beide Werte gültig
   * ausgefüllt und gegenüber dem Server verändert sind. Bei offenem Konflikt wird nicht gespeichert;
   * dann entscheidet die erfassende Person über die beiden Konflikt-Knöpfe.
   */
  function beiVerlassen(spiel: { _id: string; ergebnisAbgeschlossen: boolean; ergebnisA?: number; ergebnisB?: number }) {
    if (spiel.ergebnisAbgeschlossen || konflikte.has(spiel._id)) return;
    const eingabe = eingaben[spiel._id];
    if (!eingabe || eingabe.a === "" || eingabe.b === "") return;
    const a = Number(eingabe.a);
    const b = Number(eingabe.b);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return;
    const unveraendert = (spiel.ergebnisA?.toString() ?? "") === eingabe.a && (spiel.ergebnisB?.toString() ?? "") === eingabe.b;
    if (unveraendert) return;
    ergebnisSpeichern(spiel._id);
  }

  if (!name) {
    return (
      <>
        <h1>Ergebniserfassung</h1>
        <p>Bitte einmalig deinen Namen angeben - er wird bei jeder Eingabe mitprotokolliert.</p>
        <form onSubmit={namenSpeichern}>
          <div className="feld">
            <label htmlFor="name">Name</label>
            <input id="name" required value={namenEingabe} onChange={(e) => setNamenEingabe(e.target.value)} />
          </div>
          <button type="submit">Weiter</button>
        </form>
      </>
    );
  }

  if (fehler && !daten) {
    return <p role="alert">{fehler}</p>;
  }

  if (!daten) {
    return <p>Lädt…</p>;
  }

  const nameVon = (mannschaftId: string) => daten.mannschaften.find((m) => m._id === mannschaftId)?.name ?? mannschaftId;
  const spieleSortiert = [...daten.spiele].sort((a, b) => Number(a.runde ?? 0) - Number(b.runde ?? 0));

  return (
    <>
      <h1>{daten.turnierName}</h1>
      <p>Angemeldet als „{name}".</p>

      <KontextHilfe>
        <p>
          Trage für jedes Spiel die Tore beider Mannschaften ein und speichere die Zeile mit dem 💾-Knopf. Die Liste
          aktualisiert sich automatisch, sodass Eingaben von anderen Geräten von selbst erscheinen.
        </p>
        <p>Dein Name wird bei jeder Eingabe mitprotokolliert.</p>
        <p>Ein bereits abgeschlossenes Ergebnis kann nur noch die Turnierleitung ändern.</p>
      </KontextHilfe>

      {fehler && <p role="alert">{fehler}</p>}
      {hinweis && <p>{hinweis}</p>}

      <div className="tabellen-wrapper">
        <table>
          <caption className="sr-only">Ergebniserfassung</caption>
          <thead>
            <tr>
              <th scope="col">Spiel</th>
              <th scope="col">Mannschaft A</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Mannschaft B</th>
              <th scope="col">Status</th>
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
                    <label className="sr-only" htmlFor={`a-${spiel._id}`}>
                      Tore {nameVon(spiel.mannschaftAId)}
                    </label>
                    <input
                      id={`a-${spiel._id}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="ergebnis-eingabe"
                      disabled={spiel.ergebnisAbgeschlossen}
                      value={eingabe.a}
                      onChange={(e) => setFeld(spiel._id, "a", e.target.value)}
                      onBlur={() => beiVerlassen(spiel)}
                    />
                    {" : "}
                    <label className="sr-only" htmlFor={`b-${spiel._id}`}>
                      Tore {nameVon(spiel.mannschaftBId)}
                    </label>
                    <input
                      id={`b-${spiel._id}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="ergebnis-eingabe"
                      disabled={spiel.ergebnisAbgeschlossen}
                      value={eingabe.b}
                      onChange={(e) => setFeld(spiel._id, "b", e.target.value)}
                      onBlur={() => beiVerlassen(spiel)}
                    />
                    {konflikte.has(spiel._id) && (
                      <>
                        <div className="schiri-warnung" role="alert">
                          ⚠ Zwischenzeitlich wurde anderweitig {spiel.ergebnisA ?? "–"} : {spiel.ergebnisB ?? "–"}{" "}
                          gespeichert.
                        </div>
                        <div className="konflikt-aktionen">
                          <button type="button" onClick={() => uebernehmeServer(spiel._id)}>
                            Vorhandenes übernehmen
                          </button>
                          <button type="button" onClick={() => ergebnisSpeichern(spiel._id)}>
                            Mit meinem Wert überschreiben
                          </button>
                        </div>
                      </>
                    )}
                    {geradeGespeichert === spiel._id && <div className="gespeichert-hinweis">✓ gespeichert</div>}
                  </td>
                  <td>{nameVon(spiel.mannschaftBId)}</td>
                  <td>
                    {spiel.ergebnisAbgeschlossen ? "Abgeschlossen" : spiel.ergebnisA != null ? "Erfasst" : "Offen"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

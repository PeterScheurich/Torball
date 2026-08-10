import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ergebnisPerTokenSetzen, getErgebnisErfassung, type ErgebnisErfassungDaten } from "../api";

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

interface Eingabe {
  a: string;
  b: string;
}

export function ErgebnisErfassungPage() {
  const { tokenWert } = useParams<{ tokenWert: string }>();
  const [name, setName] = useState(geladenerName);
  const [namenEingabe, setNamenEingabe] = useState("");
  const [daten, setDaten] = useState<ErgebnisErfassungDaten | undefined>();
  const [eingaben, setEingaben] = useState<Record<string, Eingabe>>({});
  const [fehler, setFehler] = useState<string | undefined>();
  const [hinweis, setHinweis] = useState<string | undefined>();

  const laden = useCallback(async () => {
    if (!tokenWert) return;
    try {
      const ergebnis = await getErgebnisErfassung(tokenWert);
      setDaten(ergebnis);
      setEingaben((bisherig) => {
        const neu: Record<string, Eingabe> = {};
        for (const spiel of ergebnis.spiele) {
          neu[spiel._id] = bisherig[spiel._id] ?? {
            a: spiel.ergebnisA?.toString() ?? "",
            b: spiel.ergebnisB?.toString() ?? "",
          };
        }
        return neu;
      });
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
    }
  }, [tokenWert]);

  useEffect(() => {
    laden();
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
      setHinweis("Ergebnis gespeichert.");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern");
    }
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
                      onChange={(e) =>
                        setEingaben((bisherig) => ({ ...bisherig, [spiel._id]: { ...eingabe, a: e.target.value } }))
                      }
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
                      onChange={(e) =>
                        setEingaben((bisherig) => ({ ...bisherig, [spiel._id]: { ...eingabe, b: e.target.value } }))
                      }
                    />{" "}
                    <button
                      type="button"
                      onClick={() => ergebnisSpeichern(spiel._id)}
                      disabled={spiel.ergebnisAbgeschlossen}
                    >
                      Speichern
                    </button>
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

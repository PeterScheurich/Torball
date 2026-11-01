import { useCallback, useEffect, useState } from "react";
import type { HinweisStufe, MannschaftImTurnier, Spielfeld } from "@torball/shared";
import {
  aendereModusPlanSpiel,
  erzeugeModusSpiele,
  getModusPlan,
  istModusAnsicht,
  setzeModusVorrang,
  spielAnpassen,
  spielStartzeitAendern,
  type ModusAnsicht,
  type ModusAntwort,
  type PlanSpielAnsicht,
} from "../api";
import { mitNeuerUhrzeit, zeitEingabeWert } from "../format";
import { SpeicherHinweis, useSpeicherHinweis } from "./SpeicherHinweis";

/**
 * Weiterer Ablauf eines Turniermodus (Gruppen, Endrunde, Platzierungsspiele) - Auftraggeber-Konzept
 * 31.10.2026. Zeigt schon bei der Planung, welches Spiel wann und wo stattfinden wird (Platzhalter wie
 * „Sieger Halbfinale 1“), rechnet die Zeiten nach der Spielzeit und lässt die Turnierleitung die Spiele
 * einer Runde erzeugen, sobald die Mannschaften feststehen. Die Turnierleitung entscheidet bei
 * Gleichstand und bei Unentschieden; verschoben wird nur, was davon abhängt. Nichts hier blockiert.
 */

const STUFE_TEXT: Record<HinweisStufe, string> = {
  hinweis: "Hinweis",
  warnung: "Warnung",
  offen: "Offene Stelle",
};

const gruppenName = (g: string) => (g === "" ? "der Tabelle" : `Gruppe ${g}`);

interface Props {
  turnierId: string;
  felder: Spielfeld[];
  mannschaften: MannschaftImTurnier[];
  /** Turnier abgeschlossen oder ausgecheckt. */
  gesperrt: boolean;
  /** Ändert sich, wenn sich Spiele oder Ergebnisse geändert haben - der Ablauf lädt dann neu. */
  signatur: string;
  /** Nach dem Erzeugen von Spielen: die Spieleliste der Seite neu laden. */
  onSpieleGeaendert: () => void;
}

export function ModusAblauf({ turnierId, felder, mannschaften, gesperrt, signatur, onSpieleGeaendert }: Props) {
  const [antwort, setAntwort] = useState<ModusAntwort | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const { hinweis: speicherHinweis, melde: meldeGespeichert } = useSpeicherHinweis();
  // Gewählte Reihenfolge je Gleichstand (Schlüssel = Gruppe + Platzbereich), bis sie übernommen wird.
  const [reihenfolgen, setReihenfolgen] = useState<Record<string, string[]>>({});
  // Paarung von Hand je Plan-Spiel.
  const [handwahl, setHandwahl] = useState<Record<string, { a: string; b: string }>>({});

  const laden = useCallback(async () => {
    try {
      setAntwort(await getModusPlan(turnierId));
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Der Ablauf konnte nicht geladen werden.");
    }
  }, [turnierId]);

  useEffect(() => {
    void laden();
  }, [laden, signatur]);

  // Beim Zurückkehren in den Tab nachladen (Ergebnisse können auf einem anderen Gerät eingegangen sein).
  useEffect(() => {
    const beiFokus = () => {
      if (document.visibilityState === "visible") void laden();
    };
    window.addEventListener("focus", beiFokus);
    document.addEventListener("visibilitychange", beiFokus);
    return () => {
      window.removeEventListener("focus", beiFokus);
      document.removeEventListener("visibilitychange", beiFokus);
    };
  }, [laden]);

  if (!antwort || !istModusAnsicht(antwort)) return fehler ? <p role="alert">{fehler}</p> : null;
  const ansicht: ModusAnsicht = antwort;
  if (ansicht.plan.length === 0 && ansicht.hinweise.length === 0) return null;

  const erzeugbar = ansicht.plan.filter((p) => p.erzeugbar && !p.spielId);

  async function ausfuehren<T>(arbeit: () => Promise<T>, meldung: string): Promise<T | undefined> {
    setFehler(undefined);
    try {
      const ergebnis = await arbeit();
      meldeGespeichert(meldung);
      return ergebnis;
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler");
      void laden();
      return undefined;
    }
  }

  async function erzeugen() {
    const r = await ausfuehren(() => erzeugeModusSpiele(turnierId), "Spiele erzeugt.");
    if (r) {
      if (r.ansicht) setAntwort(r.ansicht);
      onSpieleGeaendert();
    }
  }

  async function vonHandErzeugen(p: PlanSpielAnsicht) {
    const wahl = handwahl[p.planId];
    if (!wahl?.a || !wahl.b) return;
    const r = await ausfuehren(
      () =>
        erzeugeModusSpiele(turnierId, {
          planIds: [p.planId],
          overrides: { [p.planId]: { mannschaftAId: wahl.a, mannschaftBId: wahl.b } },
        }),
      `${p.bezeichnung} erzeugt.`,
    );
    if (r) {
      if (r.ansicht) setAntwort(r.ansicht);
      onSpieleGeaendert();
    }
  }

  // Halle und Startzeit lassen sich fuer jedes Spiel aendern. Ein noch nicht erzeugtes Spiel ist nur ein Plan-Eintrag
  // (Halle wird gemerkt, die Zeit als Verschiebung gespeichert); ein erzeugtes Spiel aendert man direkt am Spiel.
  async function halleAendern(p: PlanSpielAnsicht, feldId: string) {
    if (p.spielId) {
      const spielId = p.spielId;
      const ok = await ausfuehren(() => spielAnpassen(spielId, { feldId }), `${p.bezeichnung}: Halle gespeichert.`);
      if (ok) {
        onSpieleGeaendert();
        void laden();
      }
      return;
    }
    const r = await ausfuehren(
      () => aendereModusPlanSpiel(turnierId, p.planId, { feldId: feldId || null }),
      `${p.bezeichnung}: Halle gespeichert.`,
    );
    if (r) setAntwort(r);
  }

  async function startzeitAendern(p: PlanSpielAnsicht, hhmm: string) {
    if (!p.startzeitGeplant) return;
    const neu = mitNeuerUhrzeit(p.startzeitGeplant, hhmm);
    if (p.spielId) {
      const spielId = p.spielId;
      const ok = await ausfuehren(() => spielStartzeitAendern(spielId, neu), `${p.bezeichnung}: Startzeit gespeichert.`);
      if (ok) {
        onSpieleGeaendert();
        void laden();
      }
      return;
    }
    const r = await ausfuehren(
      () => aendereModusPlanSpiel(turnierId, p.planId, { startzeitGeplant: neu }),
      `${p.bezeichnung}: Startzeit gespeichert.`,
    );
    if (r) setAntwort(r);
  }

  async function automatisch(p: PlanSpielAnsicht) {
    const r = await ausfuehren(
      () => aendereModusPlanSpiel(turnierId, p.planId, { feldId: null, versatzMinuten: null }),
      `${p.bezeichnung}: Halle und Zeit wieder automatisch.`,
    );
    if (r) setAntwort(r);
  }

  async function siegerFestlegen(p: PlanSpielAnsicht, id: string) {
    const r = await ausfuehren(
      () => aendereModusPlanSpiel(turnierId, p.planId, { entscheidung: id || null }),
      `${p.bezeichnung}: Sieger festgelegt.`,
    );
    if (r) setAntwort(r);
  }

  async function reihenfolgeUebernehmen(gruppe: string, ids: string[]) {
    const r = await ausfuehren(() => setzeModusVorrang(turnierId, gruppe, ids), "Reihenfolge übernommen.");
    if (r) {
      setAntwort(r);
      onSpieleGeaendert();
    }
  }

  function verschiebeInReihenfolge(schluessel: string, aktuell: string[], index: number, richtung: -1 | 1) {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= aktuell.length) return;
    const neu = [...aktuell];
    [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
    setReihenfolgen((r) => ({ ...r, [schluessel]: neu }));
  }

  function status(p: PlanSpielAnsicht): string {
    if (p.spielId) return p.ergebnisAbgeschlossen ? `gespielt (${p.ergebnisA}:${p.ergebnisB})` : "erzeugt";
    return p.erzeugbar ? "kann erzeugt werden" : "wartet auf Ergebnisse";
  }

  return (
    <section aria-labelledby="modus-ablauf-titel">
      <h3 id="modus-ablauf-titel">Weiterer Ablauf – {ansicht.vorlage.name}</h3>
      {fehler && <p role="alert">{fehler}</p>}
      <SpeicherHinweis hinweis={speicherHinweis} />
      <p>
        Die Spiele der späteren Runden entstehen erst, wenn die Mannschaften feststehen. Bis dahin zeigt die
        Übersicht Platzhalter und die geplante Zeit nach der Spielzeit.
        {ansicht.zeitenGeschaetzt && " Die Zeiten sind geschätzt, bis der Spielplan der Vorrunde erzeugt ist."}
      </p>

      {ansicht.hinweise.length > 0 && (
        <ul>
          {ansicht.hinweise.map((h, i) => (
            <li key={i}>
              <strong>{STUFE_TEXT[h.stufe]}:</strong> {h.text}
            </li>
          ))}
        </ul>
      )}

      {ansicht.gleichstaende.map((g) => {
        const schluessel = `${g.gruppe}-${g.vonPlatz}`;
        const aktuell = reihenfolgen[schluessel] ?? g.mannschaften.map((m) => m.id);
        const name = (id: string) => g.mannschaften.find((m) => m.id === id)?.name ?? id;
        return (
          <fieldset key={schluessel} disabled={gesperrt}>
            <legend>
              Gleichstand {gruppenName(g.gruppe)}, Plätze {g.vonPlatz}–{g.bisPlatz}
            </legend>
            <p>
              Diese Mannschaften sind nach allen Tabellenkriterien gleichauf. Lege die Reihenfolge fest – die
              Endrunde wird danach aufgelöst.
            </p>
            <ol>
              {aktuell.map((id, i) => (
                <li key={id}>
                  {name(id)}{" "}
                  <button
                    type="button"
                    className="symbol-button"
                    onClick={() => verschiebeInReihenfolge(schluessel, aktuell, i, -1)}
                    disabled={i === 0}
                    aria-label={`${name(id)} nach oben`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="symbol-button"
                    onClick={() => verschiebeInReihenfolge(schluessel, aktuell, i, 1)}
                    disabled={i === aktuell.length - 1}
                    aria-label={`${name(id)} nach unten`}
                  >
                    ▼
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => reihenfolgeUebernehmen(g.gruppe, aktuell)}>
              Reihenfolge übernehmen
            </button>
          </fieldset>
        );
      })}

      {ansicht.plan.length > 0 && (
        <>
          <p>
            <button type="button" onClick={erzeugen} disabled={gesperrt || erzeugbar.length === 0}>
              Erzeugbare Spiele erzeugen ({erzeugbar.length})
            </button>
          </p>
          <div className="tabellen-wrapper">
            <table className="spielplan-tabelle">
              <caption className="sr-only">
                Geplante Spiele der späteren Runden mit Platzhaltern, Zeit, Feld und Status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nr.</th>
                  <th scope="col">Spiel</th>
                  <th scope="col">Paarung</th>
                  <th scope="col">Start</th>
                  <th scope="col">Feld</th>
                  <th scope="col">Status</th>
                  <th scope="col">Anpassen</th>
                </tr>
              </thead>
              <tbody>
                {ansicht.plan.map((p, i) => {
                  const wahl = handwahl[p.planId] ?? { a: "", b: "" };
                  return (
                    <tr key={p.planId}>
                      <td>{p.spielNr ?? i + 1}</td>
                      <td>{p.bezeichnung}</td>
                      <td>
                        {p.textA} – {p.textB}
                        {p.unentschieden && (
                          <>
                            <br />
                            <label htmlFor={`sieger-${p.planId}`}>Unentschieden – Sieger festlegen: </label>
                            <select
                              id={`sieger-${p.planId}`}
                              disabled={gesperrt}
                              value=""
                              onChange={(e) => void siegerFestlegen(p, e.target.value)}
                            >
                              <option value="">– bitte wählen –</option>
                              {[p.mannschaftAId, p.mannschaftBId].map(
                                (id) =>
                                  id && (
                                    <option key={id} value={id}>
                                      {mannschaften.find((m) => m._id === id)?.name ?? id}
                                    </option>
                                  ),
                              )}
                            </select>
                          </>
                        )}
                        {p.entscheidung && (
                          <>
                            <br />
                            Sieger laut Entscheidung der Turnierleitung:{" "}
                            {mannschaften.find((m) => m._id === p.entscheidung)?.name ?? p.entscheidung}
                          </>
                        )}
                      </td>
                      <td>
                        {p.startzeitGeplant ? (
                          <>
                            <label className="sr-only" htmlFor={`start-${p.planId}`}>
                              Startzeit von {p.bezeichnung}
                            </label>
                            <input
                              id={`start-${p.planId}`}
                              type="time"
                              disabled={gesperrt || p.ergebnisAbgeschlossen}
                              // onBlur statt onChange: ein Server-Rundlauf je Tastendruck waere unnoetig.
                              defaultValue={zeitEingabeWert(p.startzeitGeplant)}
                              key={`${p.planId}-${p.startzeitGeplant}`}
                              onBlur={(e) => {
                                if (e.target.value && e.target.value !== zeitEingabeWert(p.startzeitGeplant)) {
                                  void startzeitAendern(p, e.target.value);
                                }
                              }}
                            />
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td>
                        {felder.length > 1 ? (
                          <>
                            <label className="sr-only" htmlFor={`halle-${p.planId}`}>
                              Halle von {p.bezeichnung}
                            </label>
                            <select
                              id={`halle-${p.planId}`}
                              disabled={gesperrt || p.ergebnisAbgeschlossen}
                              value={p.feldId ?? ""}
                              onChange={(e) => void halleAendern(p, e.target.value)}
                            >
                              {felder.map((f) => (
                                <option key={f.feldId} value={f.feldId}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          (felder.find((f) => f.feldId === p.feldId)?.name ?? "–")
                        )}
                      </td>
                      <td>{status(p)}</td>
                      <td>
                        {!p.spielId && (
                          <>
                            {(p.versatzMinuten || p.feldManuell) && (
                              <button type="button" disabled={gesperrt} onClick={() => void automatisch(p)}>
                                Halle und Zeit automatisch
                              </button>
                            )}
                            <details>
                              <summary>Paarung von Hand wählen</summary>
                              <label htmlFor={`hand-a-${p.planId}`}>Mannschaft A </label>
                              <select
                                id={`hand-a-${p.planId}`}
                                disabled={gesperrt}
                                value={wahl.a}
                                onChange={(e) => setHandwahl((h) => ({ ...h, [p.planId]: { ...wahl, a: e.target.value } }))}
                              >
                                <option value="">– wählen –</option>
                                {mannschaften.map((m) => (
                                  <option key={m._id} value={m._id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>{" "}
                              <label htmlFor={`hand-b-${p.planId}`}>Mannschaft B </label>
                              <select
                                id={`hand-b-${p.planId}`}
                                disabled={gesperrt}
                                value={wahl.b}
                                onChange={(e) => setHandwahl((h) => ({ ...h, [p.planId]: { ...wahl, b: e.target.value } }))}
                              >
                                <option value="">– wählen –</option>
                                {mannschaften.map((m) => (
                                  <option key={m._id} value={m._id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>{" "}
                              <button
                                type="button"
                                onClick={() => void vonHandErzeugen(p)}
                                disabled={gesperrt || !wahl.a || !wahl.b || wahl.a === wahl.b}
                              >
                                Dieses Spiel erzeugen
                              </button>
                            </details>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

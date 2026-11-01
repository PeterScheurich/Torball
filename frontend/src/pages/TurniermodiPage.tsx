import { useCallback, useEffect, useState } from "react";
import type { TurniermodusVorlage } from "@torball/shared";
import { MOEGLICHE_ENDRUNDEN_GROESSEN, baueModusPlan, quelleText, standardModusEinstellungen } from "@torball/shared";
import { aendereTurniermodus, getTurniermodi, kopiereTurniermodus, loescheTurniermodus } from "../api";
import { SpeicherHinweis, useSpeicherHinweis } from "../components/SpeicherHinweis";

/**
 * Admin → „Turniermodi“: die Vorlagen, aus denen die Turnierleitung beim Anlegen eines Turniers wählt
 * (Auftraggeber-Konzept 31.10.2026). Die mitgelieferten Vorlagen sind schreibgeschützt, lassen sich aber
 * KOPIEREN (Auftraggeber 01.11.2026): Die Kopie ist eine eigene Vorlage mit eigenem Namen und eigenen Standardwerten
 * (mögliche Endrundengrößen, Platz 3, Platzierungsspiele, Hin-/Rückspiel). Die Gruppenzahl bleibt die der Quelle -
 * sie ist ein Baustein mit Code. Vorlagen anzulegen ist Sache der Administration - die Turnierleitung wählt nur aus.
 * Eine lokal angelegte Vorlage wird bewusst NICHT mit der Internet-Instanz synchronisiert; ein Turnier trägt eine
 * Kopie seiner Vorlage und läuft deshalb überall - und eine spätere Änderung oder das Löschen einer Vorlage
 * verändert kein laufendes Turnier. Ein Editor mit Export/Import als Datei folgt in einer weiteren Ausbaustufe.
 */

/** Beispielzahlen für den Beispielablauf: zwei Gruppen mit 5 und 6 Mannschaften bzw. eine Gruppe mit 8. */
function beispielGroessen(v: TurniermodusVorlage): number[] {
  return v.gruppen === 2 ? [5, 6] : [8];
}

const endrundeText = (g: number) => (g === 0 ? "keine Endrunde" : `${g} Mannschaften`);

interface FormularProps {
  vorlage: TurniermodusVorlage;
  onGespeichert: (v: TurniermodusVorlage) => void;
}

/** Änderbare Felder einer eigenen Vorlage. Speichern ausdrücklich per Knopf: mehrere Felder gehören zusammen
 *  (die Standard-Endrunde muss zu den möglichen Endrunden passen). */
function VorlagenFormular({ vorlage, onGespeichert }: FormularProps) {
  const [name, setName] = useState(vorlage.name);
  const [beschreibung, setBeschreibung] = useState(vorlage.beschreibung);
  const [doppelt, setDoppelt] = useState(vorlage.doppeltWaehlbar);
  const [groessen, setGroessen] = useState<number[]>(vorlage.endrundeGroessen);
  const [standard, setStandard] = useState(vorlage.standardEndrunde);
  const [platz3, setPlatz3] = useState(vorlage.platz3Standard);
  const [platzierung, setPlatzierung] = useState(vorlage.platzierungsspieleStandard);
  const [fehler, setFehler] = useState<string | undefined>();
  const id = vorlage.id;

  function groesseUmschalten(g: number, an: boolean) {
    const neu = an ? [...groessen, g].sort((a, b) => a - b) : groessen.filter((x) => x !== g);
    setGroessen(neu);
    // Die Standard-Endrunde muss eine der möglichen sein - fällt sie weg, nimmt die kleinste.
    if (!neu.includes(standard)) setStandard(neu[0] ?? 0);
  }

  async function speichern(event: React.FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    try {
      onGespeichert(
        await aendereTurniermodus(vorlage.id, {
          name,
          beschreibung,
          doppeltWaehlbar: doppelt,
          endrundeGroessen: groessen,
          standardEndrunde: standard,
          platz3Standard: platz3,
          platzierungsspieleStandard: platzierung,
        }),
      );
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Die Vorlage konnte nicht gespeichert werden.");
    }
  }

  return (
    <form onSubmit={(e) => void speichern(e)} className="stammdaten-formular">
      <div className="tabellen-wrapper">
        <table className="uebersicht-tabelle">
          <tbody>
            <tr>
              <th scope="row">
                <label htmlFor={`${id}-name`}>Name</label>
              </th>
              <td>
                <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor={`${id}-beschreibung`}>Beschreibung</label>
              </th>
              <td>
                <textarea
                  id={`${id}-beschreibung`}
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  maxLength={600}
                  rows={3}
                />
              </td>
            </tr>
            <tr>
              <th scope="row">Vorrunde</th>
              <td>
                <label>
                  <input type="checkbox" checked={doppelt} onChange={(e) => setDoppelt(e.target.checked)} /> doppelt
                  (Hin- und Rückspiel) wählbar
                </label>
              </td>
            </tr>
            <tr>
              <th scope="row">Mögliche Endrunden</th>
              <td>
                <fieldset>
                  <legend className="sr-only">Mögliche Endrunden</legend>
                  {MOEGLICHE_ENDRUNDEN_GROESSEN.map((g) => (
                    <label key={g} style={{ marginRight: "1rem" }}>
                      <input type="checkbox" checked={groessen.includes(g)} onChange={(e) => groesseUmschalten(g, e.target.checked)} />{" "}
                      {endrundeText(g)}
                    </label>
                  ))}
                </fieldset>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor={`${id}-standard`}>Standard-Endrunde</label>
              </th>
              <td>
                <select id={`${id}-standard`} value={standard} onChange={(e) => setStandard(Number(e.target.value))}>
                  {groessen.map((g) => (
                    <option key={g} value={g}>
                      {endrundeText(g)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <th scope="row">Standard</th>
              <td>
                <label>
                  <input type="checkbox" checked={platz3} onChange={(e) => setPlatz3(e.target.checked)} /> Spiel um Platz 3
                </label>{" "}
                <label>
                  <input type="checkbox" checked={platzierung} onChange={(e) => setPlatzierung(e.target.checked)} />{" "}
                  Platzierungsspiele
                </label>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {fehler && <p role="alert">{fehler}</p>}
      <button type="submit" disabled={groessen.length === 0 || name.trim() === ""}>
        Vorlage speichern
      </button>
    </form>
  );
}

export function TurniermodiPage() {
  const [vorlagen, setVorlagen] = useState<TurniermodusVorlage[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const [fokusId, setFokusId] = useState<string | undefined>();
  const { hinweis, melde } = useSpeicherHinweis();

  const laden = useCallback(async () => {
    try {
      setVorlagen(await getTurniermodi());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Die Turniermodi konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Nach dem Anlegen einer Kopie geht es an ihrer Überschrift weiter - dort stehen ihre Bedienelemente.
  useEffect(() => {
    if (!fokusId) return;
    document.getElementById(`modus-${fokusId}`)?.focus();
    setFokusId(undefined);
  }, [fokusId, vorlagen]);

  async function kopieren(v: TurniermodusVorlage) {
    setFehler(undefined);
    try {
      const kopie = await kopiereTurniermodus(v.id);
      await laden();
      melde(`Kopie „${kopie.name}“ angelegt.`);
      setFokusId(kopie.id);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Die Kopie konnte nicht angelegt werden.");
    }
  }

  async function loeschen(v: TurniermodusVorlage) {
    if (!window.confirm(`Die Vorlage „${v.name}“ löschen? Bestehende Turniere behalten ihren Ablauf.`)) return;
    setFehler(undefined);
    try {
      await loescheTurniermodus(v.id);
      await laden();
      melde(`Vorlage „${v.name}“ gelöscht.`);
      document.getElementById("modi-ueberschrift")?.focus();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Die Vorlage konnte nicht gelöscht werden.");
    }
  }

  return (
    <>
      <h1 id="modi-ueberschrift" tabIndex={-1}>
        Turniermodi
      </h1>
      {fehler && <p role="alert">{fehler}</p>}
      <SpeicherHinweis hinweis={hinweis} />
      <p>
        Ein Turniermodus legt den Ablauf eines Turniers fest – Vorrunde, Gruppen, Endrunde. Die Zahlen (Mannschaften
        je Gruppe, Größe der Endrunde) stellt die Turnierleitung je Turnier selbst ein. Die mitgelieferten Vorlagen
        sind schreibgeschützt; mit „Kopie anlegen“ entsteht eine eigene Vorlage, deren Name und Standardwerte du
        anpassen kannst. Die Zahl der Gruppen bleibt die der Quelle. Ein Turnier trägt eine Kopie seiner Vorlage – eine
        spätere Änderung oder das Löschen einer Vorlage verändert kein laufendes Turnier.
      </p>

      {vorlagen.map((v) => {
        const einstellungen = standardModusEinstellungen(v);
        const groessen = beispielGroessen(v);
        const plan = baueModusPlan(v, einstellungen, groessen);
        return (
          <section key={v.id} aria-labelledby={`modus-${v.id}`}>
            <h2 id={`modus-${v.id}`} tabIndex={-1}>
              {v.name}
            </h2>
            <p>{v.beschreibung}</p>
            <dl>
              <dt>Gruppen in der Vorrunde</dt>
              <dd>{v.gruppen === 2 ? "Zwei (A und B), jeder gegen jeden in der Gruppe" : "Eine, jeder gegen jeden"}</dd>
              <dt>Vorrunde</dt>
              <dd>{v.doppeltWaehlbar ? "einfach oder doppelt wählbar" : "einfach"}</dd>
              <dt>Mögliche Endrunden</dt>
              <dd>
                {v.endrundeGroessen.map((g) => (g === 0 ? "keine" : `${g} Mannschaften`)).join(", ")} (Standard:{" "}
                {v.standardEndrunde === 0 ? "keine" : `${v.standardEndrunde} Mannschaften`})
              </dd>
              <dt>Spiel um Platz 3</dt>
              <dd>Standard: {v.platz3Standard ? "ja" : "nein"}</dd>
              <dt>Platzierungsspiele</dt>
              <dd>Standard: {v.platzierungsspieleStandard ? "ja" : "nein"}</dd>
              <dt>Eigenschaften</dt>
              <dd>
                {v.eingebaut ? "mitgeliefert, schreibgeschützt" : "eigene Vorlage"}
                {v.endrundeTeilnehmerGerade && "; die Endrunde hat immer eine gerade Zahl von Mannschaften"}
              </dd>
            </dl>

            <p>
              <button type="button" className="button-sekundaer" onClick={() => void kopieren(v)}>
                Kopie anlegen
              </button>{" "}
              {!v.eingebaut && (
                <button type="button" className="button-loeschen" onClick={() => void loeschen(v)}>
                  Vorlage löschen
                </button>
              )}
            </p>

            {!v.eingebaut && (
              <details>
                <summary>Vorlage bearbeiten</summary>
                <VorlagenFormular
                  vorlage={v}
                  onGespeichert={(neu) => {
                    setVorlagen((alle) => alle.map((x) => (x.id === neu.id ? neu : x)));
                    melde(`Vorlage „${neu.name}“ gespeichert.`);
                  }}
                />
              </details>
            )}

            {plan.spiele.length > 0 && (
              <details>
                <summary>
                  Beispielablauf mit Standardeinstellungen (
                  {v.gruppen === 2
                    ? `Gruppe A: ${groessen[0]}, Gruppe B: ${groessen[1]} Mannschaften`
                    : `${groessen[0]} Mannschaften`}
                  )
                </summary>
                <ol>
                  {plan.spiele.map((s) => (
                    <li key={s.planId}>
                      <strong>{s.bezeichnung}:</strong> {quelleText(s.quelleA, plan.spiele)} –{" "}
                      {quelleText(s.quelleB, plan.spiele)}
                    </li>
                  ))}
                </ol>
                {plan.hinweise.length > 0 && (
                  <ul>
                    {plan.hinweise.map((h, i) => (
                      <li key={i}>{h.text}</li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}

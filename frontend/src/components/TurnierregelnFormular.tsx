import { useEffect, useState } from "react";
import type { TabellenKriterium, Turnierregeln } from "@torball/shared";

const KRITERIUM_LABEL: Record<TabellenKriterium, string> = {
  punkte: "Punkte",
  tordifferenz: "Tordifferenz",
  tore: "Tore",
  direkter_vergleich: "Direkter Vergleich",
  freiwuerfe: "Freiwürfe",
};

const ALLE_KRITERIEN: TabellenKriterium[] = ["punkte", "tordifferenz", "tore", "direkter_vergleich", "freiwuerfe"];

interface Props {
  werte: Turnierregeln;
  onSpeichern: (regeln: Turnierregeln) => Promise<void> | void;
  /** Hinweis oberhalb des Speichern-Knopfs (z.B. Auswirkung der Aenderung). */
  hinweis?: string;
  /**
   * Wenn gesetzt, erscheint ein „Auf Standardwerte zurücksetzen"-Knopf, der diese Werte in das
   * Formular uebernimmt (noch nicht speichert). Gedacht fuer den Turnier-Kontext: liefert die
   * aktuellen Standardregeln (aus der Systemkonfiguration bei Serververbindung; spaeter offline
   * die zuletzt synchronisierten bzw. vorgegebenen Werte).
   */
  standardWerte?: () => Promise<Turnierregeln>;
}

/**
 * Bearbeitungsformular fuer die Turnierregeln - wiederverwendet fuer ein einzelnes Turnier
 * (Reiter „Regeln") und fuer die zentralen Standardwerte (Systemkonfiguration). Haelt einen
 * lokalen Bearbeitungsstand und speichert erst auf Knopfdruck.
 */
/** Altbestaende (vor Einfuehrung von forfaitErgebnis angelegt) haben das Feld noch nicht -
 *  fuer die Anzeige mit dem Standard „3:0" auffuellen. */
function mitFeldDefaults(w: Turnierregeln): Turnierregeln {
  return { ...w, forfaitErgebnis: w.forfaitErgebnis || "3:0" };
}

export function TurnierregelnFormular({ werte, onSpeichern, hinweis, standardWerte }: Props) {
  const [r, setR] = useState<Turnierregeln>(() => mitFeldDefaults(werte));
  const [gespeichert, setGespeichert] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [resetFehler, setResetFehler] = useState<string | undefined>();

  // Uebernimmt einen frisch geladenen Serverstand (z.B. nach dem Speichern) in den lokalen Stand.
  useEffect(() => {
    setR(mitFeldDefaults(werte));
  }, [werte]);

  function zahl<K extends keyof Turnierregeln>(feld: K, wert: string) {
    setR((p) => ({ ...p, [feld]: Number(wert) }));
    setGespeichert(false);
  }
  function text<K extends keyof Turnierregeln>(feld: K, wert: string) {
    setR((p) => ({ ...p, [feld]: wert }));
    setGespeichert(false);
  }
  function schalter<K extends keyof Turnierregeln>(feld: K, wert: boolean) {
    setR((p) => ({ ...p, [feld]: wert }));
    setGespeichert(false);
  }
  function kriteriumVerschieben(index: number, richtung: -1 | 1) {
    setR((p) => {
      const neu = [...p.tabellenKriterien];
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= neu.length) return p;
      [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
      return { ...p, tabellenKriterien: neu };
    });
    setGespeichert(false);
  }

  async function zuruecksetzen() {
    if (!standardWerte) return;
    if (
      !window.confirm(
        "Wirklich auf die Standardwerte zurücksetzen? Deine aktuellen Eingaben im Formular werden dabei überschrieben " +
          "(gespeichert wird erst danach über den Speichern-Knopf).",
      )
    ) {
      return;
    }
    setResetFehler(undefined);
    try {
      const standard = await standardWerte();
      setR(standard);
      setGespeichert(false);
    } catch (err) {
      setResetFehler(err instanceof Error ? err.message : "Standardwerte konnten nicht geladen werden.");
    }
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setSpeichert(true);
    try {
      await onSpeichern(r);
      setGespeichert(true);
    } finally {
      setSpeichert(false);
    }
  }

  // tabellenKriterien kann in Altbestaenden fehlen - dann alle in Standardreihenfolge anbieten.
  const kriterien = r.tabellenKriterien?.length ? r.tabellenKriterien : ALLE_KRITERIEN;

  return (
    <form onSubmit={speichern} className="regeln-formular">
      <h3>Spielzeit</h3>
      <div className="tabellen-wrapper">
        <table className="uebersicht-tabelle regeln-tabelle">
          <caption className="sr-only">Spielzeit</caption>
          <tbody>
            <tr>
              <th scope="row"><label htmlFor="spielzeitMinuten">Spielzeit je Halbzeit (Minuten)</label></th>
              <td>
                <input id="spielzeitMinuten" type="number" min={1} required value={r.spielzeitMinuten}
                  onChange={(e) => zahl("spielzeitMinuten", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="anzahlHalbzeiten">Anzahl Halbzeiten</label></th>
              <td>
                <input id="anzahlHalbzeiten" type="number" min={1} required value={r.anzahlHalbzeiten}
                  onChange={(e) => zahl("anzahlHalbzeiten", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="pauseMinuten">Pause zwischen Halbzeiten (Minuten)</label></th>
              <td>
                <input id="pauseMinuten" type="number" min={0} required value={r.pauseMinuten}
                  onChange={(e) => zahl("pauseMinuten", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="seitenwechsel">Seitenwechsel zur Halbzeit</label></th>
              <td>
                <input id="seitenwechsel" type="checkbox" checked={r.seitenwechsel}
                  onChange={(e) => schalter("seitenwechsel", e.target.checked)} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Timeouts &amp; Wechsel</h3>
      <div className="tabellen-wrapper">
        <table className="uebersicht-tabelle regeln-tabelle">
          <caption className="sr-only">Timeouts &amp; Wechsel</caption>
          <tbody>
            <tr>
              <th scope="row"><label htmlFor="timeoutsJeHalbzeit">Timeouts je Halbzeit</label></th>
              <td>
                <input id="timeoutsJeHalbzeit" type="number" min={0} required value={r.timeoutsJeHalbzeit}
                  onChange={(e) => zahl("timeoutsJeHalbzeit", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="timeoutDauerSekunden">Timeout-Dauer (Sekunden)</label></th>
              <td>
                <input id="timeoutDauerSekunden" type="number" min={0} required value={r.timeoutDauerSekunden}
                  onChange={(e) => zahl("timeoutDauerSekunden", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="auswechslungenJeHalbzeit">Auswechslungen je Halbzeit</label></th>
              <td>
                <input id="auswechslungenJeHalbzeit" type="number" min={0} required value={r.auswechslungenJeHalbzeit}
                  onChange={(e) => zahl("auswechslungenJeHalbzeit", e.target.value)} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Abbruch &amp; Verlängerung</h3>
      <div className="tabellen-wrapper">
        <table className="uebersicht-tabelle regeln-tabelle">
          <caption className="sr-only">Abbruch &amp; Verlängerung</caption>
          <tbody>
            <tr>
              <th scope="row"><label htmlFor="tordifferenzAbbruch">Abbruch bei hoher Tordifferenz</label></th>
              <td>
                <input id="tordifferenzAbbruch" type="checkbox" checked={r.tordifferenzAbbruch}
                  onChange={(e) => schalter("tordifferenzAbbruch", e.target.checked)} />
              </td>
            </tr>
            <tr className="regeln-abhaengig-zeile">
              <th scope="row"><label htmlFor="tordifferenzLimit">Tordifferenz-Grenze</label></th>
              <td>
                <input id="tordifferenzLimit" type="number" min={1} required value={r.tordifferenzLimit}
                  onChange={(e) => zahl("tordifferenzLimit", e.target.value)} disabled={!r.tordifferenzAbbruch} />
              </td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="verlaengerungAktiv">Verlängerung bei Unentschieden</label></th>
              <td>
                <input id="verlaengerungAktiv" type="checkbox" checked={r.verlaengerungAktiv}
                  onChange={(e) => schalter("verlaengerungAktiv", e.target.checked)} />
              </td>
            </tr>
            <tr className="regeln-abhaengig-zeile">
              <th scope="row"><label htmlFor="silbernesTor">Silbernes Tor in der Verlängerung</label></th>
              <td>
                <input id="silbernesTor" type="checkbox" checked={r.silbernesTor}
                  onChange={(e) => schalter("silbernesTor", e.target.checked)} disabled={!r.verlaengerungAktiv} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Weitere Regeln</h3>
      <div className="tabellen-wrapper">
        <table className="uebersicht-tabelle regeln-tabelle regeln-tabelle-breit">
          <caption className="sr-only">Weitere Regeln</caption>
          <tbody>
            <tr>
              <th scope="row"><label htmlFor="maxSehendeSpieler">Max. sehende Spieler je Mannschaft</label></th>
              <td>
                <input id="maxSehendeSpieler" type="number" min={0} required value={r.maxSehendeSpieler}
                  onChange={(e) => zahl("maxSehendeSpieler", e.target.value)} />
              </td>
              <td></td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="einstelligeTrikotnummern">Nur einstellige Trikotnummern</label></th>
              <td>
                <input id="einstelligeTrikotnummern" type="checkbox" checked={r.einstelligeTrikotnummern}
                  onChange={(e) => schalter("einstelligeTrikotnummern", e.target.checked)} />
              </td>
              <td></td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="bundeslandBeruecksichtigen">Bundesland-Regel bei der Spielplan-Erstellung</label></th>
              <td>
                <input id="bundeslandBeruecksichtigen" type="checkbox" checked={r.bundeslandBeruecksichtigen}
                  onChange={(e) => schalter("bundeslandBeruecksichtigen", e.target.checked)} />
              </td>
              <td className="feld-hinweis-spalte">
                Mannschaften desselben Bundeslands möglichst früh gegeneinander einplanen – nachrangig zur Vermeidung
                von Direkt-Folgespielen. Eigenheit für Wettbewerbe mit festem Regionalbezug (Bundesliga, Deutsche
                Meisterschaft), deshalb standardmäßig aus.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Wertung</h3>
      <div className="tabellen-wrapper">
        <table className="uebersicht-tabelle regeln-tabelle regeln-tabelle-breit">
          <caption className="sr-only">Wertung</caption>
          <tbody>
            <tr>
              <th scope="row"><label htmlFor="punkteSieg">Punkte für Sieg</label></th>
              <td>
                <input id="punkteSieg" type="number" min={0} required value={r.punkteSieg}
                  onChange={(e) => zahl("punkteSieg", e.target.value)} />
              </td>
              <td></td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="punkteUnentschieden">Punkte für Unentschieden</label></th>
              <td>
                <input id="punkteUnentschieden" type="number" min={0} required value={r.punkteUnentschieden}
                  onChange={(e) => zahl("punkteUnentschieden", e.target.value)} />
              </td>
              <td></td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="punkteNiederlage">Punkte für Niederlage</label></th>
              <td>
                <input id="punkteNiederlage" type="number" min={0} required value={r.punkteNiederlage}
                  onChange={(e) => zahl("punkteNiederlage", e.target.value)} />
              </td>
              <td></td>
            </tr>
            <tr>
              <th scope="row"><label htmlFor="forfaitErgebnis">Wertung bei Nichtantreten (Sieger:Verlierer)</label></th>
              <td>
                <input id="forfaitErgebnis" type="text" inputMode="numeric" pattern="\d+:\d+" placeholder="3:0" required
                  value={r.forfaitErgebnis} onChange={(e) => text("forfaitErgebnis", e.target.value)} />
              </td>
              <td className="feld-hinweis-spalte">Wird bei „nicht angetreten" gesetzt (z.B. 3:0 für die angetretene Mannschaft).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Tabellen-Kriterien (Reihenfolge bei Gleichstand)</h3>
      <ol className="kriterien-liste">
        {kriterien.map((k, i) => (
          <li key={k}>
            <span>{KRITERIUM_LABEL[k]}</span>
            <span className="kriterien-aktionen">
              <button type="button" className="symbol-button" aria-label={`${KRITERIUM_LABEL[k]} nach oben`}
                disabled={i === 0} onClick={() => kriteriumVerschieben(i, -1)}>▲</button>
              <button type="button" className="symbol-button" aria-label={`${KRITERIUM_LABEL[k]} nach unten`}
                disabled={i === kriterien.length - 1} onClick={() => kriteriumVerschieben(i, 1)}>▼</button>
            </span>
          </li>
        ))}
      </ol>

      {hinweis && <p className="feld-hinweis">{hinweis}</p>}
      {resetFehler && <p role="alert">{resetFehler}</p>}
      <p className="regeln-knoepfe">
        <button type="submit" disabled={speichert}>Regeln speichern</button>
        {standardWerte && (
          <button type="button" className="button-sekundaer" onClick={zuruecksetzen}>
            Auf Standardwerte zurücksetzen
          </button>
        )}
        {gespeichert && <span className="gespeichert-hinweis"> ✓ gespeichert</span>}
      </p>
      {standardWerte && (
        <p className="feld-hinweis">
          „Zurücksetzen" übernimmt die aktuellen Standardregeln (bei Serververbindung aus den zentralen Standardwerten).
          Danach noch speichern.
        </p>
      )}
    </form>
  );
}

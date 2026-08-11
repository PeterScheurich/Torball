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
      <div className="regeln-gruppe">
        <div className="feld">
          <label htmlFor="spielzeitMinuten">Spielzeit je Halbzeit (Minuten)</label>
          <input id="spielzeitMinuten" type="number" min={1} required value={r.spielzeitMinuten}
            onChange={(e) => zahl("spielzeitMinuten", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="anzahlHalbzeiten">Anzahl Halbzeiten</label>
          <input id="anzahlHalbzeiten" type="number" min={1} required value={r.anzahlHalbzeiten}
            onChange={(e) => zahl("anzahlHalbzeiten", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="pauseMinuten">Pause zwischen Halbzeiten (Minuten)</label>
          <input id="pauseMinuten" type="number" min={0} required value={r.pauseMinuten}
            onChange={(e) => zahl("pauseMinuten", e.target.value)} />
        </div>
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={r.seitenwechsel} onChange={(e) => schalter("seitenwechsel", e.target.checked)} />
          Seitenwechsel zur Halbzeit
        </label>
      </div>

      <h3>Timeouts &amp; Wechsel</h3>
      <div className="regeln-gruppe">
        <div className="feld">
          <label htmlFor="timeoutsJeHalbzeit">Timeouts je Halbzeit</label>
          <input id="timeoutsJeHalbzeit" type="number" min={0} required value={r.timeoutsJeHalbzeit}
            onChange={(e) => zahl("timeoutsJeHalbzeit", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="timeoutDauerSekunden">Timeout-Dauer (Sekunden)</label>
          <input id="timeoutDauerSekunden" type="number" min={0} required value={r.timeoutDauerSekunden}
            onChange={(e) => zahl("timeoutDauerSekunden", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="auswechslungenJeHalbzeit">Auswechslungen je Halbzeit</label>
          <input id="auswechslungenJeHalbzeit" type="number" min={0} required value={r.auswechslungenJeHalbzeit}
            onChange={(e) => zahl("auswechslungenJeHalbzeit", e.target.value)} />
        </div>
      </div>

      <h3>Abbruch &amp; Verlängerung</h3>
      <div className="regeln-gruppe">
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={r.tordifferenzAbbruch} onChange={(e) => schalter("tordifferenzAbbruch", e.target.checked)} />
          Abbruch bei hoher Tordifferenz
        </label>
        <div className="feld regeln-abhaengig">
          <label htmlFor="tordifferenzLimit">Tordifferenz-Grenze</label>
          <input id="tordifferenzLimit" type="number" min={1} required value={r.tordifferenzLimit}
            onChange={(e) => zahl("tordifferenzLimit", e.target.value)} disabled={!r.tordifferenzAbbruch} />
        </div>
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={r.verlaengerungAktiv} onChange={(e) => schalter("verlaengerungAktiv", e.target.checked)} />
          Verlängerung bei Unentschieden
        </label>
        <label className="schiedsrichter-lizenz regeln-abhaengig">
          <input type="checkbox" checked={r.silbernesTor} onChange={(e) => schalter("silbernesTor", e.target.checked)} disabled={!r.verlaengerungAktiv} />
          Silbernes Tor in der Verlängerung
        </label>
      </div>

      <h3>Weitere Regeln</h3>
      <div className="regeln-gruppe">
        <div className="feld">
          <label htmlFor="maxSehendeSpieler">Max. sehende Spieler je Mannschaft</label>
          <input id="maxSehendeSpieler" type="number" min={0} required value={r.maxSehendeSpieler}
            onChange={(e) => zahl("maxSehendeSpieler", e.target.value)} />
        </div>
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={r.einstelligeTrikotnummern} onChange={(e) => schalter("einstelligeTrikotnummern", e.target.checked)} />
          Nur einstellige Trikotnummern
        </label>
      </div>

      <h3>Wertung</h3>
      <div className="regeln-gruppe">
        <div className="feld">
          <label htmlFor="punkteSieg">Punkte für Sieg</label>
          <input id="punkteSieg" type="number" min={0} required value={r.punkteSieg}
            onChange={(e) => zahl("punkteSieg", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="punkteUnentschieden">Punkte für Unentschieden</label>
          <input id="punkteUnentschieden" type="number" min={0} required value={r.punkteUnentschieden}
            onChange={(e) => zahl("punkteUnentschieden", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="punkteNiederlage">Punkte für Niederlage</label>
          <input id="punkteNiederlage" type="number" min={0} required value={r.punkteNiederlage}
            onChange={(e) => zahl("punkteNiederlage", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="forfaitErgebnis">Wertung bei Nichtantreten (Sieger:Verlierer)</label>
          <input id="forfaitErgebnis" type="text" inputMode="numeric" pattern="\d+:\d+" placeholder="3:0" required
            className="forfait-eingabe" value={r.forfaitErgebnis} onChange={(e) => text("forfaitErgebnis", e.target.value)} />
          <span className="feld-hinweis">Wird bei „nicht angetreten" gesetzt (z.B. 3:0 für die angetretene Mannschaft).</span>
        </div>
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

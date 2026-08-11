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
}

/**
 * Bearbeitungsformular fuer die Turnierregeln - wiederverwendet fuer ein einzelnes Turnier
 * (Reiter „Regeln") und fuer die zentralen Standardwerte (Systemkonfiguration). Haelt einen
 * lokalen Bearbeitungsstand und speichert erst auf Knopfdruck.
 */
export function TurnierregelnFormular({ werte, onSpeichern, hinweis }: Props) {
  const [r, setR] = useState<Turnierregeln>(werte);
  const [gespeichert, setGespeichert] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  // Uebernimmt einen frisch geladenen Serverstand (z.B. nach dem Speichern) in den lokalen Stand.
  useEffect(() => {
    setR(werte);
  }, [werte]);

  function zahl<K extends keyof Turnierregeln>(feld: K, wert: string) {
    setR((p) => ({ ...p, [feld]: Number(wert) }));
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
          <input id="spielzeitMinuten" type="number" min={1} value={r.spielzeitMinuten}
            onChange={(e) => zahl("spielzeitMinuten", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="anzahlHalbzeiten">Anzahl Halbzeiten</label>
          <input id="anzahlHalbzeiten" type="number" min={1} value={r.anzahlHalbzeiten}
            onChange={(e) => zahl("anzahlHalbzeiten", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="pauseMinuten">Pause zwischen Halbzeiten (Minuten)</label>
          <input id="pauseMinuten" type="number" min={0} value={r.pauseMinuten}
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
          <input id="timeoutsJeHalbzeit" type="number" min={0} value={r.timeoutsJeHalbzeit}
            onChange={(e) => zahl("timeoutsJeHalbzeit", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="timeoutDauerSekunden">Timeout-Dauer (Sekunden)</label>
          <input id="timeoutDauerSekunden" type="number" min={0} value={r.timeoutDauerSekunden}
            onChange={(e) => zahl("timeoutDauerSekunden", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="auswechslungenJeHalbzeit">Auswechslungen je Halbzeit</label>
          <input id="auswechslungenJeHalbzeit" type="number" min={0} value={r.auswechslungenJeHalbzeit}
            onChange={(e) => zahl("auswechslungenJeHalbzeit", e.target.value)} />
        </div>
      </div>

      <h3>Abbruch &amp; Verlängerung</h3>
      <div className="regeln-gruppe">
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={r.tordifferenzAbbruch} onChange={(e) => schalter("tordifferenzAbbruch", e.target.checked)} />
          Abbruch bei hoher Tordifferenz
        </label>
        <div className="feld">
          <label htmlFor="tordifferenzLimit">Tordifferenz-Grenze</label>
          <input id="tordifferenzLimit" type="number" min={1} value={r.tordifferenzLimit}
            onChange={(e) => zahl("tordifferenzLimit", e.target.value)} disabled={!r.tordifferenzAbbruch} />
        </div>
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={r.verlaengerungAktiv} onChange={(e) => schalter("verlaengerungAktiv", e.target.checked)} />
          Verlängerung bei Unentschieden
        </label>
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={r.silbernesTor} onChange={(e) => schalter("silbernesTor", e.target.checked)} disabled={!r.verlaengerungAktiv} />
          Silbernes Tor in der Verlängerung
        </label>
      </div>

      <h3>Weitere Regeln</h3>
      <div className="regeln-gruppe">
        <div className="feld">
          <label htmlFor="maxSehendeSpieler">Max. sehende Spieler je Mannschaft</label>
          <input id="maxSehendeSpieler" type="number" min={0} value={r.maxSehendeSpieler}
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
          <input id="punkteSieg" type="number" min={0} value={r.punkteSieg}
            onChange={(e) => zahl("punkteSieg", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="punkteUnentschieden">Punkte für Unentschieden</label>
          <input id="punkteUnentschieden" type="number" min={0} value={r.punkteUnentschieden}
            onChange={(e) => zahl("punkteUnentschieden", e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="punkteNiederlage">Punkte für Niederlage</label>
          <input id="punkteNiederlage" type="number" min={0} value={r.punkteNiederlage}
            onChange={(e) => zahl("punkteNiederlage", e.target.value)} />
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
      <p>
        <button type="submit" disabled={speichert}>Regeln speichern</button>
        {gespeichert && <span className="gespeichert-hinweis"> ✓ gespeichert</span>}
      </p>
    </form>
  );
}

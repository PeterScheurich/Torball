import { useCallback, useEffect, useRef, useState } from "react";
import type { Klassifizierung, Spieler, SpielerStatus } from "@torball/shared";
import { createSpieler, deleteSpieler, getSpieler, updateSpieler, type SpielerAktualisierung } from "../api";

const KLASSIFIZIERUNG_OPTIONEN: { wert: Klassifizierung; label: string }[] = [
  { wert: "B1", label: "B1" },
  { wert: "B2", label: "B2" },
  { wert: "B3", label: "B3" },
  { wert: "sehend", label: "Sehend" },
  { wert: "AB", label: "AB (Attest)" },
];

const STATUS_OPTIONEN: { wert: SpielerStatus; label: string }[] = [
  { wert: "aktiv", label: "Aktiv" },
  { wert: "gesperrt", label: "Gesperrt" },
];

interface Bearbeitung {
  name: string;
  vorname: string;
  trikotnummer: string;
  klassifizierung: Klassifizierung;
  status: SpielerStatus;
}

function ausSpieler(s: Spieler): Bearbeitung {
  return {
    name: s.name,
    vorname: s.vorname ?? "",
    trikotnummer: s.trikotnummer,
    klassifizierung: s.klassifizierung,
    status: s.status,
  };
}

interface Props {
  mannschaftId: string;
  /** Wird nach jedem Laden/Aendern mit der aktuellen Spielerzahl aufgerufen (z.B. fuer die Kopfzeile). */
  onAnzahlGeaendert?: (anzahl: number) => void;
  /** Turnier-Regel: erlaubte Anzahl sehender Spieler je Mannschaft. Bei Ueberschreitung erscheint
   *  ein Hinweis (nicht blockierend) - siehe Kommentar am Hinweis. */
  maxSehendeSpieler?: number;
}

/**
 * Kader einer Mannschaft (ausklappbar innerhalb der Mannschaftsliste): Spieler mit Nummer, Name,
 * Vorname, Klassifizierung und Status - direkt editierbar (Textfelder onBlur, Auswahl sofort) plus
 * Anlege-Formular. Meldet die Spielerzahl ueber onAnzahlGeaendert nach oben; bei zu vielen sehenden
 * Spielern (maxSehendeSpieler) erscheint ein nicht blockierender Hinweis.
 */
export function SpielerKader({ mannschaftId, onAnzahlGeaendert, maxSehendeSpieler }: Props) {
  const [spieler, setSpieler] = useState<Spieler[]>([]);
  const [bearbeitung, setBearbeitung] = useState<Record<string, Bearbeitung>>({});
  const [fehler, setFehler] = useState<string | undefined>();

  const [neuName, setNeuName] = useState("");
  const [neuVorname, setNeuVorname] = useState("");
  const [neuTrikotnummer, setNeuTrikotnummer] = useState("");
  const [neuKlassifizierung, setNeuKlassifizierung] = useState<Klassifizierung>("B1");
  const nummerRef = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    try {
      const geladen = await getSpieler(mannschaftId);
      setSpieler(geladen);
      onAnzahlGeaendert?.(geladen.length);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden des Kaders");
    }
    // onAnzahlGeaendert bewusst nicht in den Dependencies (wie bei den uebrigen Listen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mannschaftId]);

  useEffect(() => {
    laden();
  }, [laden]);

  useEffect(() => {
    setBearbeitung((bisherig) => {
      const naechste: Record<string, Bearbeitung> = {};
      for (const s of spieler) {
        naechste[s._id] = bisherig[s._id] ?? ausSpieler(s);
      }
      return naechste;
    });
  }, [spieler]);

  /** Speichert die (ggf. um `aenderung` ergaenzten) aktuellen Bearbeitungswerte eines Spielers,
   * sofern sich gegenueber dem geladenen Stand etwas geaendert hat. */
  async function speichern(s: Spieler, aenderung: Partial<Bearbeitung> = {}) {
    const basis = bearbeitung[s._id] ?? ausSpieler(s);
    const werte = { ...basis, ...aenderung };
    const name = werte.name.trim();
    const trikotnummer = werte.trikotnummer.trim();

    if (name === "") {
      setFehler("Name darf nicht leer sein");
      setBearbeitung((b) => ({ ...b, [s._id]: { ...werte, name: s.name } }));
      return;
    }
    if (trikotnummer === "") {
      setFehler("Trikotnummer darf nicht leer sein");
      setBearbeitung((b) => ({ ...b, [s._id]: { ...werte, trikotnummer: s.trikotnummer } }));
      return;
    }

    // Leeren Vornamen als null senden (nicht undefined), damit ein gesetzter Vorname wirklich
    // zurueckgesetzt werden kann (siehe CLAUDE.md "Optionale Textfelder leeren").
    const payload: SpielerAktualisierung = {
      name,
      vorname: werte.vorname.trim() || null,
      trikotnummer,
      klassifizierung: werte.klassifizierung,
      status: werte.status,
    };

    const unveraendert =
      name === s.name &&
      trikotnummer === s.trikotnummer &&
      (payload.vorname ?? null) === (s.vorname ?? null) &&
      payload.klassifizierung === s.klassifizierung &&
      payload.status === s.status;
    if (unveraendert) return;

    try {
      await updateSpieler(s._id, payload);
      await laden();
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Spielers");
    }
  }

  function feldAendern(id: string, aenderung: Partial<Bearbeitung>) {
    setBearbeitung((b) => ({ ...b, [id]: { ...b[id], ...aenderung } }));
  }

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createSpieler({
        mannschaftId,
        name: neuName.trim(),
        vorname: neuVorname.trim() || null,
        trikotnummer: neuTrikotnummer.trim(),
        klassifizierung: neuKlassifizierung,
      });
      setNeuName("");
      setNeuVorname("");
      setNeuTrikotnummer("");
      setNeuKlassifizierung("B1");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen des Spielers");
    } finally {
      nummerRef.current?.focus();
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteSpieler(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen des Spielers");
    }
  }

  const spielerSortiert = [...spieler].sort(
    (a, b) => a.trikotnummer.localeCompare(b.trikotnummer, undefined, { numeric: true }) || a.name.localeCompare(b.name),
  );

  const sehendeAnzahl = spieler.filter((s) => s.klassifizierung === "sehend").length;
  // Bewusst nur ein Hinweis, KEINE Sperre: Zum Zeitpunkt der Kader-Anlage ist die Klassifizierung
  // nicht immer bekannt, und am Spieltag kann ein anwesender Arzt neu klassifizieren - dann wird
  // nur der Spieler-Status/die Klassifizierung geaendert, ohne den Kader neu aufsetzen zu muessen.
  const zuVieleSehende = maxSehendeSpieler != null && sehendeAnzahl > maxSehendeSpieler;

  return (
    <div className="kader">
      {fehler && <p role="alert">{fehler}</p>}

      {zuVieleSehende && (
        <p className="kader-warnung">
          ⚠ {sehendeAnzahl} sehende Spieler im Kader – erlaubt sind laut Turnierregeln{" "}
          {maxSehendeSpieler}. Das lässt sich speichern; bitte die Klassifizierungen prüfen (ggf. wird am
          Spieltag neu klassifiziert).
        </p>
      )}

      {spielerSortiert.length === 0 ? (
        <p>Noch keine Spieler im Kader.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Kader der Mannschaft, alle Felder bearbeitbar</caption>
            <thead>
              <tr>
                <th scope="col">
                  Nr. <span className="pflicht-stern" title="Pflichtfeld">*</span>
                </th>
                <th scope="col">
                  Name <span className="pflicht-stern" title="Pflichtfeld">*</span>
                </th>
                <th scope="col">Vorname</th>
                <th scope="col">Klassifizierung</th>
                <th scope="col">Status</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {spielerSortiert.map((s) => (
                <tr key={s._id}>
                  <td>
                    <label className="sr-only" htmlFor={`spieler-nr-${s._id}`}>
                      Trikotnummer von {s.name}
                    </label>
                    <input
                      id={`spieler-nr-${s._id}`}
                      inputMode="numeric"
                      className="trikot-eingabe"
                      value={bearbeitung[s._id]?.trikotnummer ?? ""}
                      onChange={(e) => feldAendern(s._id, { trikotnummer: e.target.value })}
                      onBlur={() => speichern(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`spieler-name-${s._id}`}>
                      Name von {s.name}
                    </label>
                    <input
                      id={`spieler-name-${s._id}`}
                      value={bearbeitung[s._id]?.name ?? ""}
                      onChange={(e) => feldAendern(s._id, { name: e.target.value })}
                      onBlur={() => speichern(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`spieler-vorname-${s._id}`}>
                      Vorname von {s.name}
                    </label>
                    <input
                      id={`spieler-vorname-${s._id}`}
                      value={bearbeitung[s._id]?.vorname ?? ""}
                      onChange={(e) => feldAendern(s._id, { vorname: e.target.value })}
                      onBlur={() => speichern(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`spieler-klasse-${s._id}`}>
                      Klassifizierung von {s.name}
                    </label>
                    <select
                      id={`spieler-klasse-${s._id}`}
                      value={bearbeitung[s._id]?.klassifizierung ?? s.klassifizierung}
                      onChange={(e) => {
                        const klassifizierung = e.target.value as Klassifizierung;
                        feldAendern(s._id, { klassifizierung });
                        speichern(s, { klassifizierung });
                      }}
                    >
                      {KLASSIFIZIERUNG_OPTIONEN.map((o) => (
                        <option key={o.wert} value={o.wert}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`spieler-status-${s._id}`}>
                      Status von {s.name}
                    </label>
                    <select
                      id={`spieler-status-${s._id}`}
                      value={bearbeitung[s._id]?.status ?? s.status}
                      onChange={(e) => {
                        const status = e.target.value as SpielerStatus;
                        feldAendern(s._id, { status });
                        speichern(s, { status });
                      }}
                    >
                      {STATUS_OPTIONEN.map((o) => (
                        <option key={o.wert} value={o.wert}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="symbol-button button-loeschen"
                      onClick={() => loeschen(s._id)}
                      aria-label={`${s.name} aus dem Kader entfernen`}
                      title="Entfernen"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={anlegen} className="kader-formular">
        <div className="feld">
          <label htmlFor={`neu-nr-${mannschaftId}`}>Nr.</label>
          <input
            id={`neu-nr-${mannschaftId}`}
            ref={nummerRef}
            inputMode="numeric"
            className="trikot-eingabe"
            required
            value={neuTrikotnummer}
            onChange={(e) => setNeuTrikotnummer(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor={`neu-name-${mannschaftId}`}>Name</label>
          <input
            id={`neu-name-${mannschaftId}`}
            required
            value={neuName}
            onChange={(e) => setNeuName(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor={`neu-vorname-${mannschaftId}`}>Vorname (optional)</label>
          <input
            id={`neu-vorname-${mannschaftId}`}
            value={neuVorname}
            onChange={(e) => setNeuVorname(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor={`neu-klasse-${mannschaftId}`}>Klassifizierung</label>
          <select
            id={`neu-klasse-${mannschaftId}`}
            value={neuKlassifizierung}
            onChange={(e) => setNeuKlassifizierung(e.target.value as Klassifizierung)}
          >
            {KLASSIFIZIERUNG_OPTIONEN.map((o) => (
              <option key={o.wert} value={o.wert}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Spieler hinzufügen</button>
      </form>
    </div>
  );
}

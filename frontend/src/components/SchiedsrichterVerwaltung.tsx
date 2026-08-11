import { useCallback, useEffect, useRef, useState } from "react";
import type { MannschaftImTurnier, SchiedsrichterImTurnier } from "@torball/shared";
import {
  createSchiedsrichter,
  deleteSchiedsrichter,
  getMannschaften,
  getSchiedsrichter,
  updateSchiedsrichter,
  type SchiedsrichterAktualisierung,
} from "../api";

interface TextBearbeitung {
  name: string;
  vorname: string;
  telefon: string;
  email: string;
}

function ausText(s: SchiedsrichterImTurnier): TextBearbeitung {
  return { name: s.name, vorname: s.vorname ?? "", telefon: s.telefon ?? "", email: s.email ?? "" };
}

interface Props {
  turnierId: string;
  /** Turnier abgeschlossen: alle Eingaben sperren (nur Ansicht). */
  gesperrt?: boolean;
}

/**
 * Schiedsrichter-Tab eines Turniers: Tabelle mit direkt editierbaren Feldern (Textfelder
 * speichern beim Verlassen, Auswahl/Checkbox sofort) plus Anlege-Formular. Genau eine Person
 * ist per Radio-Auswahl Turnierleitung; die Mannschaftszuordnung dient spaeter der
 * Schiedsrichter-Einteilung (kein Pfeifen der eigenen Mannschaft).
 */
export function SchiedsrichterVerwaltung({ turnierId, gesperrt = false }: Props) {
  const [schiedsrichter, setSchiedsrichter] = useState<SchiedsrichterImTurnier[]>([]);
  const [mannschaften, setMannschaften] = useState<MannschaftImTurnier[]>([]);
  const [bearbeitung, setBearbeitung] = useState<Record<string, TextBearbeitung>>({});
  const [fehler, setFehler] = useState<string | undefined>();

  const [neuName, setNeuName] = useState("");
  const [neuVorname, setNeuVorname] = useState("");
  const [neuTelefon, setNeuTelefon] = useState("");
  const [neuEmail, setNeuEmail] = useState("");
  const [neuLizenz, setNeuLizenz] = useState(false);
  const [neuMannschaftId, setNeuMannschaftId] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Laedt Schiedsrichter und Mannschaften (letztere fuer die Zuordnungs-Auswahl) parallel.
  const laden = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([getSchiedsrichter(turnierId), getMannschaften(turnierId)]);
      setSchiedsrichter(s);
      setMannschaften(m);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Schiedsrichter");
    }
  }, [turnierId]);

  useEffect(() => {
    laden();
  }, [laden]);

  // Text-Bearbeitungszustand je Zeile mit der geladenen Liste synchron halten, ohne bereits
  // begonnene Eingaben zu ueberschreiben (vorhandener Eintrag hat Vorrang).
  useEffect(() => {
    setBearbeitung((bisherig) => {
      const naechste: Record<string, TextBearbeitung> = {};
      for (const s of schiedsrichter) {
        naechste[s._id] = bisherig[s._id] ?? ausText(s);
      }
      return naechste;
    });
  }, [schiedsrichter]);

  /** Baut das vollstaendige Aktualisierungs-Payload aus Text-Bearbeitung + gespeicherten
   * Nicht-Text-Feldern, optional mit gezieltem Override einzelner Felder. */
  function payloadVon(s: SchiedsrichterImTurnier, override: Partial<SchiedsrichterAktualisierung> = {}): SchiedsrichterAktualisierung {
    const b = bearbeitung[s._id] ?? ausText(s);
    return {
      name: b.name.trim() || s.name,
      vorname: b.vorname.trim() || null,
      telefon: b.telefon.trim() || null,
      email: b.email.trim() || null,
      lizenzVorhanden: s.lizenzVorhanden,
      mannschaftId: s.mannschaftId ?? null,
      istTurnierleitung: s.istTurnierleitung,
      ...override,
    };
  }

  /** Speichert einen Schiedsrichter, wenn sich gegenueber dem geladenen Stand etwas geaendert hat. */
  async function speichern(s: SchiedsrichterImTurnier, override: Partial<SchiedsrichterAktualisierung> = {}) {
    const b = bearbeitung[s._id] ?? ausText(s);
    if (b.name.trim() === "") {
      setFehler("Name darf nicht leer sein");
      setBearbeitung((z) => ({ ...z, [s._id]: { ...b, name: s.name } }));
      return;
    }
    const payload = payloadVon(s, override);
    const unveraendert =
      payload.name === s.name &&
      (payload.vorname ?? null) === (s.vorname ?? null) &&
      (payload.telefon ?? null) === (s.telefon ?? null) &&
      (payload.email ?? null) === (s.email ?? null) &&
      payload.lizenzVorhanden === s.lizenzVorhanden &&
      (payload.mannschaftId ?? null) === (s.mannschaftId ?? null) &&
      payload.istTurnierleitung === s.istTurnierleitung;
    if (unveraendert) return;

    try {
      await updateSchiedsrichter(s._id, payload);
      await laden();
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Schiedsrichters");
    }
  }

  /** Genau eine Person je Turnier ist Turnierleitung (Abschnitt 5.4): den bisherigen Traeger
   * zuruecksetzen und den gewaehlten setzen. */
  async function turnierleitungSetzen(s: SchiedsrichterImTurnier) {
    if (s.istTurnierleitung) return;
    try {
      const bisherige = schiedsrichter.filter((x) => x.istTurnierleitung && x._id !== s._id);
      for (const alt of bisherige) {
        await updateSchiedsrichter(alt._id, payloadVon(alt, { istTurnierleitung: false }));
      }
      await updateSchiedsrichter(s._id, payloadVon(s, { istTurnierleitung: true }));
      await laden();
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Setzen der Turnierleitung");
    }
  }

  function textAendern(id: string, aenderung: Partial<TextBearbeitung>) {
    setBearbeitung((b) => ({ ...b, [id]: { ...b[id], ...aenderung } }));
  }

  // Legt einen neuen Schiedsrichter an, leert das Formular und fokussiert wieder das Namensfeld.
  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createSchiedsrichter({
        turnierId,
        name: neuName.trim(),
        vorname: neuVorname.trim() || undefined,
        telefon: neuTelefon.trim() || undefined,
        email: neuEmail.trim() || undefined,
        lizenzVorhanden: neuLizenz,
        mannschaftId: neuMannschaftId || undefined,
      });
      setNeuName("");
      setNeuVorname("");
      setNeuTelefon("");
      setNeuEmail("");
      setNeuLizenz(false);
      setNeuMannschaftId("");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen des Schiedsrichters");
    } finally {
      nameRef.current?.focus();
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteSchiedsrichter(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen des Schiedsrichters");
    }
  }

  const schiedsrichterSortiert = [...schiedsrichter].sort(
    (a, b) => a.name.localeCompare(b.name) || (a.vorname ?? "").localeCompare(b.vorname ?? ""),
  );

  return (
    <div>
      <h2>Schiedsrichter</h2>
      <p>
        Ein Schiedsrichter darf grundsätzlich nicht das Spiel seiner eigenen Mannschaft leiten (die Software warnt
        später bei der Spielplan-Generierung). Genau eine Person ist Turnierleitung.
      </p>
      {fehler && <p role="alert">{fehler}</p>}

      {/* Bei abgeschlossenem Turnier sind alle Eingaben ueber das disabled-<fieldset> gesperrt
          (Tabelle + Anlege-Formular) - zum Bearbeiten erst wieder oeffnen. */}
      <fieldset className="blank-fieldset" disabled={gesperrt}>
      {schiedsrichterSortiert.length === 0 ? (
        <p>Noch keine Schiedsrichter erfasst.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Schiedsrichter, alle Felder bearbeitbar</caption>
            <thead>
              <tr>
                <th scope="col">
                  Name <span className="pflicht-stern" title="Pflichtfeld">*</span>
                </th>
                <th scope="col">Vorname</th>
                <th scope="col">Telefon</th>
                <th scope="col">E-Mail</th>
                <th scope="col">Lizenz</th>
                <th scope="col">Mannschaft</th>
                <th scope="col">Turnierleitung</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {schiedsrichterSortiert.map((s) => (
                <tr key={s._id}>
                  <td>
                    <label className="sr-only" htmlFor={`sr-name-${s._id}`}>
                      Name von {s.name}
                    </label>
                    <input
                      id={`sr-name-${s._id}`}
                      value={bearbeitung[s._id]?.name ?? ""}
                      onChange={(e) => textAendern(s._id, { name: e.target.value })}
                      onBlur={() => speichern(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`sr-vorname-${s._id}`}>
                      Vorname von {s.name}
                    </label>
                    <input
                      id={`sr-vorname-${s._id}`}
                      value={bearbeitung[s._id]?.vorname ?? ""}
                      onChange={(e) => textAendern(s._id, { vorname: e.target.value })}
                      onBlur={() => speichern(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`sr-telefon-${s._id}`}>
                      Telefon von {s.name}
                    </label>
                    <input
                      id={`sr-telefon-${s._id}`}
                      type="tel"
                      value={bearbeitung[s._id]?.telefon ?? ""}
                      onChange={(e) => textAendern(s._id, { telefon: e.target.value })}
                      onBlur={() => speichern(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`sr-email-${s._id}`}>
                      E-Mail von {s.name}
                    </label>
                    <input
                      id={`sr-email-${s._id}`}
                      type="email"
                      className="sr-email-eingabe"
                      value={bearbeitung[s._id]?.email ?? ""}
                      onChange={(e) => textAendern(s._id, { email: e.target.value })}
                      onBlur={() => speichern(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`sr-lizenz-${s._id}`}>
                      Lizenz vorhanden bei {s.name}
                    </label>
                    <input
                      id={`sr-lizenz-${s._id}`}
                      type="checkbox"
                      checked={s.lizenzVorhanden}
                      onChange={(e) => speichern(s, { lizenzVorhanden: e.target.checked })}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`sr-mannschaft-${s._id}`}>
                      Mannschaft von {s.name}
                    </label>
                    <select
                      id={`sr-mannschaft-${s._id}`}
                      value={s.mannschaftId ?? ""}
                      onChange={(e) => speichern(s, { mannschaftId: e.target.value || null })}
                    >
                      <option value="">— keine —</option>
                      {mannschaften.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`sr-leitung-${s._id}`}>
                      {s.name} als Turnierleitung
                    </label>
                    <input
                      id={`sr-leitung-${s._id}`}
                      type="radio"
                      name={`turnierleitung-${turnierId}`}
                      checked={s.istTurnierleitung}
                      onChange={() => turnierleitungSetzen(s)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="symbol-button"
                      onClick={() => loeschen(s._id)}
                      aria-label={`${s.name} löschen`}
                      title="Löschen"
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

      <form onSubmit={anlegen} className="schiedsrichter-formular">
        <div className="feld">
          <label htmlFor="sr-neu-name">Name</label>
          <input id="sr-neu-name" ref={nameRef} required value={neuName} onChange={(e) => setNeuName(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="sr-neu-vorname">Vorname (optional)</label>
          <input id="sr-neu-vorname" value={neuVorname} onChange={(e) => setNeuVorname(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="sr-neu-telefon">Telefon (optional)</label>
          <input id="sr-neu-telefon" type="tel" value={neuTelefon} onChange={(e) => setNeuTelefon(e.target.value)} />
        </div>
        <div className="feld">
          <label htmlFor="sr-neu-email">E-Mail (optional)</label>
          <input
            id="sr-neu-email"
            type="email"
            className="sr-email-eingabe"
            value={neuEmail}
            onChange={(e) => setNeuEmail(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="sr-neu-mannschaft">Mannschaft (optional)</label>
          <select id="sr-neu-mannschaft" value={neuMannschaftId} onChange={(e) => setNeuMannschaftId(e.target.value)}>
            <option value="">— keine —</option>
            {mannschaften.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <label className="schiedsrichter-lizenz">
          <input type="checkbox" checked={neuLizenz} onChange={(e) => setNeuLizenz(e.target.checked)} /> Lizenz vorhanden
        </label>
        <button type="submit">Schiedsrichter hinzufügen</button>
      </form>
      </fieldset>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { Schiedsrichter, Verein } from "@torball/shared";
import {
  createSchiedsrichterStammdaten,
  deleteSchiedsrichterStammdaten,
  getSchiedsrichterStammdaten,
  updateSchiedsrichterStammdaten,
  type SchiedsrichterStammdatenAktualisierung,
} from "../api";
import { useAuth } from "../auth";
import { SpeicherHinweis, useSpeicherHinweis } from "./SpeicherHinweis";

const LEERES_FORMULAR: SchiedsrichterStammdatenAktualisierung = {
  name: "",
  vorname: "",
  telefon: "",
  email: "",
  lizenzVorhanden: false,
  vereinId: "",
};

interface Props {
  vereine: Verein[];
  /** Steuert das disabled-<fieldset> um Tabelle + Anlege-Formular (Backend erzwingt es ohnehin). */
  darfBearbeiten: boolean;
}

/**
 * Schiedsrichter-Stammdaten (unterer Teil der Stammdaten-Seite, analog VereineVerwaltung).
 * Dient als turnieruebergreifende Vorlage - die Uebernahme in ein konkretes Turnier (siehe
 * SchiedsrichterVerwaltung) kopiert die Werte, statt sie live zu verknuepfen. Referenziert einen
 * Verein statt einer Mannschaft (Stammdaten kennen keinen Turnier-/Mannschaftskontext).
 */
export function SchiedsrichterStammdatenVerwaltung({ vereine, darfBearbeiten }: Props) {
  const { benutzer } = useAuth();
  const [liste, setListe] = useState<Schiedsrichter[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const { hinweis: speicherHinweis, melde: meldeGespeichert } = useSpeicherHinweis();
  const [neu, setNeu] = useState<SchiedsrichterStammdatenAktualisierung>(LEERES_FORMULAR);
  const [bearbeitung, setBearbeitung] = useState<Record<string, SchiedsrichterStammdatenAktualisierung>>({});
  // Default zu (analog VereineVerwaltung): der haeufigere Fall (Seite erneut aufgerufen, Eintraege
  // existieren schon) zeigt das Formular dann nie kurz auf, um gleich darauf wieder zuzuklappen.
  const [formularOffen, setFormularOffen] = useState(false);
  const [erstLadungFertig, setErstLadungFertig] = useState(false);
  const autoEntschieden = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    try {
      const geladen = await getSchiedsrichterStammdaten();
      setListe(geladen);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Schiedsrichter-Stammdaten");
    } finally {
      setErstLadungFertig(true);
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  useEffect(() => {
    setBearbeitung((bisherig) => {
      const naechste: Record<string, SchiedsrichterStammdatenAktualisierung> = {};
      for (const s of liste) {
        naechste[s._id] = bisherig[s._id] ?? {
          name: s.name,
          vorname: s.vorname ?? "",
          telefon: s.telefon ?? "",
          email: s.email ?? "",
          lizenzVorhanden: s.lizenzVorhanden ?? false,
          vereinId: s.vereinId ?? "",
        };
      }
      return naechste;
    });
  }, [liste]);

  // Anlege-Formular nur bei der allerersten, echten Ersterfassung automatisch aufklappen -
  // gleiches Muster wie VereineVerwaltung (siehe dort fuer die Begruendung des Default-zu).
  useEffect(() => {
    if (erstLadungFertig && !autoEntschieden.current) {
      autoEntschieden.current = true;
      if (liste.length === 0) setFormularOffen(true);
    }
  }, [erstLadungFertig, liste]);

  const listeSortiert = [...liste].sort(
    (a, b) => a.name.localeCompare(b.name) || (a.vorname ?? "").localeCompare(b.vorname ?? ""),
  );

  function bereinigt(daten: SchiedsrichterStammdatenAktualisierung): SchiedsrichterStammdatenAktualisierung {
    return {
      name: daten.name.trim(),
      vorname: daten.vorname?.trim() || null,
      telefon: daten.telefon?.trim() || null,
      email: daten.email?.trim() || null,
      lizenzVorhanden: daten.lizenzVorhanden ?? false,
      vereinId: daten.vereinId || null,
    };
  }

  /** Fuellt das Anlege-Formular mit den Stammdaten des angemeldeten Benutzers vor - gleiches
   *  Muster wie "Meine Profildaten übernehmen" in der turnierbezogenen Schiedsrichter-Erfassung. */
  function profildatenUebernehmen() {
    if (!benutzer) return;
    setNeu({
      name: benutzer.name ?? "",
      vorname: benutzer.vorname ?? "",
      telefon: benutzer.telefon ?? "",
      email: benutzer.email ?? "",
      lizenzVorhanden: benutzer.lizenzVorhanden ?? false,
      vereinId: "",
    });
    setFehler(undefined);
    nameRef.current?.focus();
  }

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createSchiedsrichterStammdaten(bereinigt(neu));
      setNeu(LEERES_FORMULAR);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen des Schiedsrichters");
    } finally {
      nameRef.current?.focus();
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteSchiedsrichterStammdaten(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen des Schiedsrichters");
    }
  }

  async function feldVerlassen(s: Schiedsrichter) {
    const werte = bearbeitung[s._id];
    if (!werte) return;

    if (werte.name.trim() === "") {
      setFehler("Name darf nicht leer sein");
      return;
    }

    const neueWerte = bereinigt(werte);
    const bisherige = bereinigt({
      name: s.name,
      vorname: s.vorname,
      telefon: s.telefon,
      email: s.email,
      lizenzVorhanden: s.lizenzVorhanden,
      vereinId: s.vereinId,
    });
    if (JSON.stringify(neueWerte) === JSON.stringify(bisherige)) return;

    try {
      await updateSchiedsrichterStammdaten(s._id, neueWerte);
      await laden();
      meldeGespeichert("Schiedsrichter gespeichert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Schiedsrichters");
    }
  }

  /** Verein- und Lizenz-Auswahl speichern sofort, nicht erst per onBlur. */
  async function sofortSpeichern(s: Schiedsrichter, aenderung: Partial<SchiedsrichterStammdatenAktualisierung>) {
    const werte = { ...(bearbeitung[s._id] ?? {}), ...aenderung } as SchiedsrichterStammdatenAktualisierung;
    setBearbeitung((b) => ({ ...b, [s._id]: werte }));
    try {
      await updateSchiedsrichterStammdaten(s._id, bereinigt(werte));
      await laden();
      meldeGespeichert("Schiedsrichter gespeichert.");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Schiedsrichters");
    }
  }

  return (
    <div>
      <h2>Schiedsrichter</h2>
      <p>
        Turnierübergreifende Schiedsrichter-Vorlagen. Beim Erfassen eines Schiedsrichters in einem Turnier lassen
        sich diese Daten übernehmen, statt sie erneut einzutippen.
      </p>
      {fehler && <p role="alert">{fehler}</p>}
      <SpeicherHinweis hinweis={speicherHinweis} />

      <fieldset className="blank-fieldset" disabled={!darfBearbeiten}>
        {liste.length === 0 ? (
          <p>Noch keine Schiedsrichter-Stammdaten angelegt.</p>
        ) : (
          <div className="tabellen-wrapper">
            <table>
              <caption className="sr-only">Schiedsrichter-Stammdaten, alle Felder bearbeitbar</caption>
              <thead>
                <tr>
                  <th scope="col">
                    Name <span className="pflicht-stern" title="Pflichtfeld">*</span>
                  </th>
                  <th scope="col">Vorname</th>
                  <th scope="col">Telefon</th>
                  <th scope="col">E-Mail</th>
                  <th scope="col">Lizenz</th>
                  <th scope="col">Verein</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {listeSortiert.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <label className="sr-only" htmlFor={`sstamm-name-${s._id}`}>
                        Name von {s.name}
                      </label>
                      <input
                        id={`sstamm-name-${s._id}`}
                        value={bearbeitung[s._id]?.name ?? ""}
                        onChange={(e) =>
                          setBearbeitung((b) => ({ ...b, [s._id]: { ...b[s._id], name: e.target.value } }))
                        }
                        onBlur={() => feldVerlassen(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`sstamm-vorname-${s._id}`}>
                        Vorname von {s.name}
                      </label>
                      <input
                        id={`sstamm-vorname-${s._id}`}
                        value={bearbeitung[s._id]?.vorname ?? ""}
                        onChange={(e) =>
                          setBearbeitung((b) => ({ ...b, [s._id]: { ...b[s._id], vorname: e.target.value } }))
                        }
                        onBlur={() => feldVerlassen(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`sstamm-telefon-${s._id}`}>
                        Telefon von {s.name}
                      </label>
                      <input
                        id={`sstamm-telefon-${s._id}`}
                        type="tel"
                        value={bearbeitung[s._id]?.telefon ?? ""}
                        onChange={(e) =>
                          setBearbeitung((b) => ({ ...b, [s._id]: { ...b[s._id], telefon: e.target.value } }))
                        }
                        onBlur={() => feldVerlassen(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`sstamm-email-${s._id}`}>
                        E-Mail von {s.name}
                      </label>
                      <input
                        id={`sstamm-email-${s._id}`}
                        type="email"
                        className="sr-email-eingabe"
                        value={bearbeitung[s._id]?.email ?? ""}
                        onChange={(e) =>
                          setBearbeitung((b) => ({ ...b, [s._id]: { ...b[s._id], email: e.target.value } }))
                        }
                        onBlur={() => feldVerlassen(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`sstamm-lizenz-${s._id}`}>
                        Lizenz vorhanden bei {s.name}
                      </label>
                      <input
                        id={`sstamm-lizenz-${s._id}`}
                        type="checkbox"
                        checked={s.lizenzVorhanden ?? false}
                        onChange={(e) => sofortSpeichern(s, { lizenzVorhanden: e.target.checked })}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`sstamm-verein-${s._id}`}>
                        Verein von {s.name}
                      </label>
                      <select
                        id={`sstamm-verein-${s._id}`}
                        value={bearbeitung[s._id]?.vereinId ?? ""}
                        onChange={(e) => sofortSpeichern(s, { vereinId: e.target.value })}
                      >
                        <option value="">— keine (neutral) —</option>
                        {vereine.map((v) => (
                          <option key={v._id} value={v._id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="symbol-button button-loeschen"
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

        <p>
          <button
            type="button"
            className="button-link"
            aria-expanded={formularOffen}
            aria-controls="sstamm-anlegen"
            onClick={() => setFormularOffen((o) => !o)}
          >
            Neuen Schiedsrichter anlegen {formularOffen ? "▾" : "▸"}
          </button>
        </p>
        {formularOffen && (
          <>
            {benutzer && (
              <p>
                <button type="button" onClick={profildatenUebernehmen}>
                  Meine Profildaten übernehmen
                </button>{" "}
                <span className="feld-hinweis">Füllt das Formular mit deinen Stammdaten aus „Mein Profil“ vor.</span>
              </p>
            )}
            <form id="sstamm-anlegen" onSubmit={anlegen} className="stammdaten-formular">
              <div className="tabellen-wrapper">
                <table className="uebersicht-tabelle">
                  <caption className="sr-only">Neuen Schiedsrichter anlegen</caption>
                  <tbody>
                    <tr>
                      <th scope="row">
                        <label htmlFor="sstammNeuName">Name</label>
                      </th>
                      <td>
                        <input
                          id="sstammNeuName"
                          ref={nameRef}
                          required
                          value={neu.name}
                          onChange={(e) => setNeu((n) => ({ ...n, name: e.target.value }))}
                        />
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <label htmlFor="sstammNeuVorname">Vorname</label>
                      </th>
                      <td>
                        <input
                          id="sstammNeuVorname"
                          value={neu.vorname ?? ""}
                          onChange={(e) => setNeu((n) => ({ ...n, vorname: e.target.value }))}
                        />
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <label htmlFor="sstammNeuTelefon">Telefon</label>
                      </th>
                      <td>
                        <input
                          id="sstammNeuTelefon"
                          type="tel"
                          value={neu.telefon ?? ""}
                          onChange={(e) => setNeu((n) => ({ ...n, telefon: e.target.value }))}
                        />
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <label htmlFor="sstammNeuEmail">E-Mail</label>
                      </th>
                      <td>
                        <input
                          id="sstammNeuEmail"
                          type="email"
                          className="sr-email-eingabe"
                          value={neu.email ?? ""}
                          onChange={(e) => setNeu((n) => ({ ...n, email: e.target.value }))}
                        />
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <label htmlFor="sstammNeuVerein">Verein</label>
                      </th>
                      <td>
                        <select
                          id="sstammNeuVerein"
                          value={neu.vereinId ?? ""}
                          onChange={(e) => setNeu((n) => ({ ...n, vereinId: e.target.value }))}
                        >
                          <option value="">— keine (neutral) —</option>
                          {vereine.map((v) => (
                            <option key={v._id} value={v._id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <label htmlFor="sstammNeuLizenz">Lizenz vorhanden</label>
                      </th>
                      <td>
                        <input
                          id="sstammNeuLizenz"
                          type="checkbox"
                          checked={neu.lizenzVorhanden ?? false}
                          onChange={(e) => setNeu((n) => ({ ...n, lizenzVorhanden: e.target.checked }))}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button type="submit">Schiedsrichter anlegen</button>
            </form>
          </>
        )}
      </fieldset>
    </div>
  );
}

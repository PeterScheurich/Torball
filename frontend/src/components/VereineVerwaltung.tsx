import { useCallback, useEffect, useRef, useState } from "react";
import type { Verein } from "@torball/shared";
import { createVerein, deleteVerein, getVereine, updateVerein, type VereinAktualisierung } from "../api";
import { BUNDESLAENDER } from "../bundeslaender";

const LEERES_FORMULAR: VereinAktualisierung = {
  name: "",
  logo: "",
  bundesland: "",
  ansprechpartnerName: "",
  ansprechpartnerTelefon: "",
  ansprechpartnerEmail: "",
};

interface Props {
  /** Wird nach jedem Laden mit der aktuellen Liste aufgerufen (z.B. fuer die Verein-Auswahl bei Teams). */
  onGeaendert?: (vereine: Verein[]) => void;
  /** Steuert das disabled-<fieldset> um Tabelle + Anlege-Formular (Backend erzwingt es ohnehin). */
  darfBearbeiten: boolean;
}

/**
 * Vereins-Stammdaten (oberer Teil der Stammdaten-Seite). Tabelle mit direkt editierbaren
 * Feldern plus ein Anlege-Formular. Meldet die aktuelle Liste ueber onGeaendert nach oben
 * (die Teams-Verwaltung braucht sie fuer ihre Verein-Auswahl). Ein Verein laesst sich erst
 * loeschen, wenn kein Team mehr auf ihn verweist (das Backend antwortet sonst mit 409).
 */
export function VereineVerwaltung({ onGeaendert, darfBearbeiten }: Props) {
  const [vereine, setVereine] = useState<Verein[]>([]);
  const [fehler, setFehler] = useState<string | undefined>();
  const [neu, setNeu] = useState<VereinAktualisierung>(LEERES_FORMULAR);
  const [bearbeitung, setBearbeitung] = useState<Record<string, VereinAktualisierung>>({});
  // Default zu: der haeufigere Fall (Seite erneut aufgerufen, Vereine existieren schon) zeigt das
  // Formular dann nie kurz auf, um gleich darauf wieder zuzuklappen. Nur die einmalige Ersterfassung
  // (unten, erstLadungFertig-Effekt) klappt es bei Bedarf wieder auf.
  const [formularOffen, setFormularOffen] = useState(false);
  const [erstLadungFertig, setErstLadungFertig] = useState(false);
  const autoEntschieden = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    try {
      const geladen = await getVereine();
      setVereine(geladen);
      onGeaendert?.(geladen);
      setFehler(undefined);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Vereine");
    } finally {
      setErstLadungFertig(true);
    }
    // onGeaendert absichtlich nicht in den Dependencies: soll bei jedem Laden aufgerufen werden,
    // aber kein Neuladen ausloesen, wenn der Elternteil eine neue Funktionsreferenz uebergibt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  useEffect(() => {
    setBearbeitung((bisherig) => {
      const naechste: Record<string, VereinAktualisierung> = {};
      for (const v of vereine) {
        naechste[v._id] = bisherig[v._id] ?? {
          name: v.name,
          logo: v.logo ?? "",
          bundesland: v.bundesland ?? "",
          ansprechpartnerName: v.ansprechpartnerName ?? "",
          ansprechpartnerTelefon: v.ansprechpartnerTelefon ?? "",
          ansprechpartnerEmail: v.ansprechpartnerEmail ?? "",
        };
      }
      return naechste;
    });
  }, [vereine]);

  // Anlege-Formular nur bei der allerersten, echten Ersterfassung (noch gar keine Vereine
  // vorhanden) automatisch aufklappen - sonst bleibt es beim Default zu (siehe oben). Erst nach
  // erstLadungFertig entscheiden, sonst wuerde das leere Array vor dem ersten Laden faelschlich
  // schon als "keine Vereine" durchgehen. Nur einmal automatisch; danach entscheidet der Nutzer
  // per Umschalter.
  useEffect(() => {
    if (erstLadungFertig && !autoEntschieden.current) {
      autoEntschieden.current = true;
      if (vereine.length === 0) setFormularOffen(true);
    }
  }, [erstLadungFertig, vereine]);

  const vereineSortiert = [...vereine].sort((a, b) => a.name.localeCompare(b.name));

  // Leere optionale Felder als null senden (nicht undefined), damit ein zuvor gesetzter Wert
  // beim Speichern wirklich zurueckgesetzt wird - undefined fiele via JSON.stringify aus dem
  // Body und das Backend behielte den alten Wert bei.
  function bereinigt(daten: VereinAktualisierung): VereinAktualisierung {
    return {
      name: daten.name.trim(),
      logo: daten.logo?.trim() || null,
      bundesland: daten.bundesland?.trim() || null,
      ansprechpartnerName: daten.ansprechpartnerName?.trim() || null,
      ansprechpartnerTelefon: daten.ansprechpartnerTelefon?.trim() || null,
      ansprechpartnerEmail: daten.ansprechpartnerEmail?.trim() || null,
    };
  }

  async function anlegen(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createVerein(bereinigt(neu));
      setNeu(LEERES_FORMULAR);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen des Vereins");
    } finally {
      nameRef.current?.focus();
    }
  }

  async function loeschen(id: string) {
    try {
      await deleteVerein(id);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Löschen des Vereins");
    }
  }

  /** Speichert automatisch beim Verlassen des Feldes - konsistent zu Mannschaften-Stammdaten. */
  async function feldVerlassen(v: Verein) {
    const werte = bearbeitung[v._id];
    if (!werte) return;

    if (werte.name.trim() === "") {
      setFehler("Vereinsname darf nicht leer sein");
      return;
    }

    const neueWerte = bereinigt(werte);
    const bisherige = bereinigt({
      name: v.name,
      logo: v.logo,
      bundesland: v.bundesland,
      ansprechpartnerName: v.ansprechpartnerName,
      ansprechpartnerTelefon: v.ansprechpartnerTelefon,
      ansprechpartnerEmail: v.ansprechpartnerEmail,
    });
    if (JSON.stringify(neueWerte) === JSON.stringify(bisherige)) return;

    try {
      await updateVerein(v._id, neueWerte);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern des Vereins");
    }
  }

  return (
    <div>
      <h2>Vereine</h2>
      {fehler && <p role="alert">{fehler}</p>}

      {/* Ohne Bearbeitungsrecht werden alle Eingaben nativ ueber das disabled-<fieldset>
          deaktiviert (Tabelle + Anlege-Formular) - das Backend erzwingt es ohnehin serverseitig. */}
      <fieldset className="blank-fieldset" disabled={!darfBearbeiten}>
      {vereine.length === 0 ? (
        <p>Noch keine Vereine angelegt.</p>
      ) : (
        <div className="tabellen-wrapper">
          <table>
            <caption className="sr-only">Vereins-Stammdaten, alle Felder bearbeitbar</caption>
            <thead>
              <tr>
                <th scope="col">
                  Name <span className="pflicht-stern" title="Pflichtfeld">*</span>
                </th>
                <th scope="col">Bundesland</th>
                <th scope="col">Ansprechpartner</th>
                <th scope="col">Telefon</th>
                <th scope="col">E-Mail</th>
                <th scope="col">Logo-URL</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {vereineSortiert.map((v) => (
                <tr key={v._id}>
                  <td>
                    <label className="sr-only" htmlFor={`verein-name-${v._id}`}>
                      Name von {v.name}
                    </label>
                    <input
                      id={`verein-name-${v._id}`}
                      value={bearbeitung[v._id]?.name ?? ""}
                      onChange={(e) =>
                        setBearbeitung((b) => ({ ...b, [v._id]: { ...b[v._id], name: e.target.value } }))
                      }
                      onBlur={() => feldVerlassen(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`verein-bundesland-${v._id}`}>
                      Bundesland von {v.name}
                    </label>
                    <input
                      id={`verein-bundesland-${v._id}`}
                      list="bundeslaender-liste"
                      value={bearbeitung[v._id]?.bundesland ?? ""}
                      onChange={(e) =>
                        setBearbeitung((b) => ({ ...b, [v._id]: { ...b[v._id], bundesland: e.target.value } }))
                      }
                      onBlur={() => feldVerlassen(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`verein-ansprechpartner-${v._id}`}>
                      Ansprechpartner von {v.name}
                    </label>
                    <input
                      id={`verein-ansprechpartner-${v._id}`}
                      value={bearbeitung[v._id]?.ansprechpartnerName ?? ""}
                      onChange={(e) =>
                        setBearbeitung((b) => ({
                          ...b,
                          [v._id]: { ...b[v._id], ansprechpartnerName: e.target.value },
                        }))
                      }
                      onBlur={() => feldVerlassen(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`verein-telefon-${v._id}`}>
                      Ansprechpartner-Telefon von {v.name}
                    </label>
                    <input
                      id={`verein-telefon-${v._id}`}
                      type="tel"
                      value={bearbeitung[v._id]?.ansprechpartnerTelefon ?? ""}
                      onChange={(e) =>
                        setBearbeitung((b) => ({
                          ...b,
                          [v._id]: { ...b[v._id], ansprechpartnerTelefon: e.target.value },
                        }))
                      }
                      onBlur={() => feldVerlassen(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`verein-email-${v._id}`}>
                      Ansprechpartner-E-Mail von {v.name}
                    </label>
                    <input
                      id={`verein-email-${v._id}`}
                      type="email"
                      value={bearbeitung[v._id]?.ansprechpartnerEmail ?? ""}
                      onChange={(e) =>
                        setBearbeitung((b) => ({
                          ...b,
                          [v._id]: { ...b[v._id], ansprechpartnerEmail: e.target.value },
                        }))
                      }
                      onBlur={() => feldVerlassen(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`verein-logo-${v._id}`}>
                      Logo-URL von {v.name}
                    </label>
                    <input
                      id={`verein-logo-${v._id}`}
                      type="url"
                      value={bearbeitung[v._id]?.logo ?? ""}
                      onChange={(e) =>
                        setBearbeitung((b) => ({ ...b, [v._id]: { ...b[v._id], logo: e.target.value } }))
                      }
                      onBlur={() => feldVerlassen(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="symbol-button button-loeschen"
                      onClick={() => loeschen(v._id)}
                      aria-label={`${v.name} löschen`}
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

      <datalist id="bundeslaender-liste">
        {BUNDESLAENDER.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <p>
        <button
          type="button"
          className="button-link"
          aria-expanded={formularOffen}
          aria-controls="verein-anlegen"
          onClick={() => setFormularOffen((o) => !o)}
        >
          Neuen Verein anlegen {formularOffen ? "▾" : "▸"}
        </button>
      </p>
      {formularOffen && (
      <form id="verein-anlegen" onSubmit={anlegen} className="stammdaten-formular">
        <div className="tabellen-wrapper">
          <table className="uebersicht-tabelle">
            <caption className="sr-only">Neuen Verein anlegen</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="vereinName">Vereinsname</label>
                </th>
                <td>
                  <input
                    id="vereinName"
                    ref={nameRef}
                    required
                    value={neu.name}
                    onChange={(e) => setNeu((n) => ({ ...n, name: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="vereinBundesland">Bundesland</label>
                </th>
                <td>
                  <input
                    id="vereinBundesland"
                    list="bundeslaender-liste"
                    value={neu.bundesland ?? ""}
                    onChange={(e) => setNeu((n) => ({ ...n, bundesland: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="vereinAnsprechpartner">Ansprechpartner</label>
                </th>
                <td>
                  <input
                    id="vereinAnsprechpartner"
                    value={neu.ansprechpartnerName ?? ""}
                    onChange={(e) => setNeu((n) => ({ ...n, ansprechpartnerName: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="vereinTelefon">Ansprechpartner-Telefon</label>
                </th>
                <td>
                  <input
                    id="vereinTelefon"
                    type="tel"
                    value={neu.ansprechpartnerTelefon ?? ""}
                    onChange={(e) => setNeu((n) => ({ ...n, ansprechpartnerTelefon: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="vereinEmail">Ansprechpartner-E-Mail</label>
                </th>
                <td>
                  <input
                    id="vereinEmail"
                    type="email"
                    value={neu.ansprechpartnerEmail ?? ""}
                    onChange={(e) => setNeu((n) => ({ ...n, ansprechpartnerEmail: e.target.value }))}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="vereinLogo">Logo-URL</label>
                </th>
                <td>
                  <input
                    id="vereinLogo"
                    type="url"
                    value={neu.logo ?? ""}
                    onChange={(e) => setNeu((n) => ({ ...n, logo: e.target.value }))}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="submit">Verein anlegen</button>
      </form>
      )}
      </fieldset>
    </div>
  );
}

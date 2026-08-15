import { useCallback, useEffect, useRef, useState } from "react";
import type { Schiedsrichter, SchiedsrichterImTurnier, Verein } from "@torball/shared";
import {
  createSchiedsrichter,
  deleteSchiedsrichter,
  getSchiedsrichter,
  getSchiedsrichterStammdaten,
  getVereine,
  updateSchiedsrichter,
  type SchiedsrichterAktualisierung,
} from "../api";
import { useAuth } from "../auth";

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
 * ist per Radio-Auswahl Turnierleitung; die Vereinszuordnung dient spaeter der
 * Schiedsrichter-Einteilung (kein Pfeifen einer Mannschaft des eigenen Vereins).
 */
export function SchiedsrichterVerwaltung({ turnierId, gesperrt = false }: Props) {
  const { benutzer } = useAuth();
  const [schiedsrichter, setSchiedsrichter] = useState<SchiedsrichterImTurnier[]>([]);
  const [vereine, setVereine] = useState<Verein[]>([]);
  const [stammdaten, setStammdaten] = useState<Schiedsrichter[]>([]);
  const [bearbeitung, setBearbeitung] = useState<Record<string, TextBearbeitung>>({});
  const [fehler, setFehler] = useState<string | undefined>();

  const [neuName, setNeuName] = useState("");
  const [neuVorname, setNeuVorname] = useState("");
  const [neuTelefon, setNeuTelefon] = useState("");
  const [neuEmail, setNeuEmail] = useState("");
  const [neuLizenz, setNeuLizenz] = useState(false);
  const [neuVereinId, setNeuVereinId] = useState("");
  const [neuHerkunftId, setNeuHerkunftId] = useState<string | undefined>();
  const [stammdatenAuswahl, setStammdatenAuswahl] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Laedt Schiedsrichter dieses Turniers, alle Vereine (fuer die Zuordnungs-Auswahl) und die
  // Schiedsrichter-Stammdaten (fuer "aus Stammdaten übernehmen") parallel.
  const laden = useCallback(async () => {
    try {
      const [s, v, st] = await Promise.all([getSchiedsrichter(turnierId), getVereine(), getSchiedsrichterStammdaten()]);
      setSchiedsrichter(s);
      setVereine(v);
      setStammdaten(st);
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
      vereinId: s.vereinId ?? null,
      istTurnierleitung: s.istTurnierleitung,
      nurTurnierleitung: s.nurTurnierleitung ?? false,
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
      (payload.vereinId ?? null) === (s.vereinId ?? null) &&
      payload.istTurnierleitung === s.istTurnierleitung &&
      (payload.nurTurnierleitung ?? false) === (s.nurTurnierleitung ?? false);
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

  /** Fuellt das Anlege-Formular mit den Stammdaten des angemeldeten Benutzers vor (einmal im Profil
   *  gepflegt, hier uebernehmbar). Danach kann die Person noch angepasst und per "hinzufügen"
   *  gespeichert werden - Turnierleitung wird bewusst nicht automatisch gesetzt (per Radio waehlbar). */
  function profildatenUebernehmen() {
    if (!benutzer) return;
    setNeuName(benutzer.name ?? "");
    setNeuVorname(benutzer.vorname ?? "");
    setNeuTelefon(benutzer.telefon ?? "");
    setNeuEmail(benutzer.email ?? "");
    setNeuLizenz(benutzer.lizenzVorhanden ?? false);
    setNeuVereinId("");
    setNeuHerkunftId(undefined);
    setStammdatenAuswahl("");
    setFehler(undefined);
    nameRef.current?.focus();
  }

  /** Fuellt das Anlege-Formular mit einem ausgewaehlten Schiedsrichter aus den Stammdaten vor -
   *  analog "Meine Profildaten übernehmen", nur mit einer beliebigen Person statt der eigenen. */
  function ausStammdatenUebernehmen(id: string) {
    setStammdatenAuswahl(id);
    if (!id) return;
    const gewaehlt = stammdaten.find((s) => s._id === id);
    if (!gewaehlt) return;
    setNeuName(gewaehlt.name);
    setNeuVorname(gewaehlt.vorname ?? "");
    setNeuTelefon(gewaehlt.telefon ?? "");
    setNeuEmail(gewaehlt.email ?? "");
    setNeuLizenz(gewaehlt.lizenzVorhanden ?? false);
    setNeuVereinId(gewaehlt.vereinId ?? "");
    setNeuHerkunftId(gewaehlt._id);
    setFehler(undefined);
    nameRef.current?.focus();
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
        vereinId: neuVereinId || undefined,
        importiertAusStammdatenSchiedsrichterId: neuHerkunftId,
      });
      setNeuName("");
      setNeuVorname("");
      setNeuTelefon("");
      setNeuEmail("");
      setNeuLizenz(false);
      setNeuVereinId("");
      setNeuHerkunftId(undefined);
      setStammdatenAuswahl("");
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
        Ein Schiedsrichter darf grundsätzlich nicht das Spiel einer Mannschaft seines eigenen Vereins leiten (die
        Software warnt später bei der Spielplan-Generierung). Genau eine Person ist Turnierleitung.
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
                <th scope="col">Verein</th>
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
                    <label className="sr-only" htmlFor={`sr-verein-${s._id}`}>
                      Verein von {s.name}
                    </label>
                    <select
                      id={`sr-verein-${s._id}`}
                      value={s.vereinId ?? ""}
                      onChange={(e) => speichern(s, { vereinId: e.target.value || null })}
                    >
                      <option value="">— keine —</option>
                      {vereine.map((v) => (
                        <option key={v._id} value={v._id}>
                          {v.name}
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
                    {/* Nur relevant fuer die Turnierleitung: pfeift diese Person selbst nicht,
                        wird sie bei der Schiedsrichter-Einteilung nicht als Kandidat vorgeschlagen. */}
                    {s.istTurnierleitung && (
                      <label className="sr-nur-leitung">
                        <input
                          type="checkbox"
                          checked={s.nurTurnierleitung ?? false}
                          onChange={(e) => speichern(s, { nurTurnierleitung: e.target.checked })}
                        />{" "}
                        pfeift nicht
                      </label>
                    )}
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
        {stammdaten.length > 0 && (
          <>
            <label htmlFor="sr-aus-stammdaten" className="sr-only">
              Aus Schiedsrichter-Stammdaten übernehmen
            </label>
            <select
              id="sr-aus-stammdaten"
              value={stammdatenAuswahl}
              onChange={(e) => ausStammdatenUebernehmen(e.target.value)}
            >
              <option value="">Aus Stammdaten übernehmen …</option>
              {[...stammdaten]
                .sort((a, b) => a.name.localeCompare(b.name) || (a.vorname ?? "").localeCompare(b.vorname ?? ""))
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.vorname ? `${s.vorname} ${s.name}` : s.name}
                  </option>
                ))}
            </select>{" "}
          </>
        )}
        {benutzer && (
          <button type="button" onClick={profildatenUebernehmen}>
            Meine Profildaten übernehmen
          </button>
        )}
      </p>
      <p className="feld-hinweis">
        Füllt das Formular vor - aus den Schiedsrichter-Stammdaten (Verwaltung unter „Stammdaten“) oder mit deinen
        eigenen Daten aus „Mein Profil“.
      </p>

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
          <label htmlFor="sr-neu-verein">Verein (optional)</label>
          <select id="sr-neu-verein" value={neuVereinId} onChange={(e) => setNeuVereinId(e.target.value)}>
            <option value="">— keine —</option>
            {vereine.map((v) => (
              <option key={v._id} value={v._id}>
                {v.name}
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

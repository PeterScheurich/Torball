import { useEffect, useRef, useState } from "react";

export interface ErgebnisEingabe {
  a: string;
  b: string;
}

/** Minimalform eines Spiels fuer die Ergebnis-Erfassung (interne Verwaltung wie Token-Seite). */
interface SpielErgebnis {
  _id: string;
  ergebnisA?: number;
  ergebnisB?: number;
}

const LEER: SpielErgebnis[] = [];

function serverWert(spiel: SpielErgebnis): ErgebnisEingabe {
  return { a: spiel.ergebnisA?.toString() ?? "", b: spiel.ergebnisB?.toString() ?? "" };
}

/**
 * Verwaltet die lokalen Ergebnis-Eingabefelder je Spiel und haelt sie beim (wiederholten,
 * z.B. per Polling) Laden mit dem Server in Sync:
 *
 * - Zeilen OHNE ungespeicherte Eigen-Eingabe uebernehmen automatisch den Serverstand - so
 *   erscheinen Ergebnisse, die auf der jeweils anderen Erfassungs-Seite eingetragen wurden.
 * - Zeilen MIT ungespeicherter Eingabe bleiben erhalten (das Getippte geht nicht verloren).
 *   Wurde ihr Serverwert zwischenzeitlich von anderer Seite geaendert, werden sie als Konflikt
 *   gemeldet (Speichern wuerde den fremden Wert ueberschreiben).
 *
 * Reagiert auf Referenz-Wechsel von `spiele` (jedes Laden liefert ein neues Array).
 */
export function useErgebnisEingaben(spiele: SpielErgebnis[] | undefined) {
  const liste = spiele ?? LEER;
  const [eingaben, setEingaben] = useState<Record<string, ErgebnisEingabe>>({});
  const [konflikte, setKonflikte] = useState<Set<string>>(new Set());
  const eingabenRef = useRef(eingaben);
  eingabenRef.current = eingaben;
  // Serverstand, auf dem die aktuellen Eigen-Eingaben beruhen (Basis fuer die Konflikterkennung).
  const basisRef = useRef<Record<string, ErgebnisEingabe>>({});

  useEffect(() => {
    const bisherig = eingabenRef.current;
    const neu: Record<string, ErgebnisEingabe> = {};
    const neueBasis: Record<string, ErgebnisEingabe> = {};
    const neueKonflikte = new Set<string>();

    for (const spiel of liste) {
      const server = serverWert(spiel);
      const basis = basisRef.current[spiel._id]; // Serverstand, auf den das Feld zuletzt gesetzt war
      const aktuell = bisherig[spiel._id];

      const stimmtMitServer = aktuell !== undefined && aktuell.a === server.a && aktuell.b === server.b;
      // Feld seit dem letzten Sync unveraendert (der Nutzer hat nicht getippt) - auch wenn sich
      // der Serverwert inzwischen geaendert hat: dann den neuen Serverwert uebernehmen.
      const unveraendertSeitSync =
        aktuell !== undefined && basis !== undefined && aktuell.a === basis.a && aktuell.b === basis.b;

      if (aktuell === undefined || stimmtMitServer || unveraendertSeitSync) {
        // Kein offener Eigen-Eintrag -> Serverstand uebernehmen (so erscheinen fremde Ergebnisse).
        neu[spiel._id] = server;
        neueBasis[spiel._id] = server;
      } else {
        // Echte ungespeicherte Eingabe: behalten. Basis NICHT mitziehen, damit ein zwischenzeitlicher
        // Fremd-Speichervorgang (basis != server) als Konflikt sichtbar bleibt.
        neu[spiel._id] = aktuell;
        neueBasis[spiel._id] = basis ?? server;
        if (basis && (basis.a !== server.a || basis.b !== server.b)) neueKonflikte.add(spiel._id);
      }
    }

    basisRef.current = neueBasis;
    setEingaben(neu);
    setKonflikte(neueKonflikte);
    // Bewusst nur von `spiele` abhaengig (Referenz aendert sich je Laden); die uebrigen Werte
    // stehen als Refs aktuell zur Verfuegung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spiele]);

  function setFeld(spielId: string, feld: "a" | "b", wert: string) {
    setEingaben((b) => ({ ...b, [spielId]: { ...(b[spielId] ?? { a: "", b: "" }), [feld]: wert } }));
  }

  /**
   * Konfliktauflösung „Vorhandenes übernehmen": setzt das Feld auf den aktuellen Serverwert und
   * hebt den Konflikt sofort auf (ohne auf den nächsten Poll zu warten). Basis mitziehen, damit
   * die Zeile danach als unverändert gilt.
   */
  function uebernehmeServer(spielId: string) {
    const spiel = liste.find((s) => s._id === spielId);
    if (!spiel) return;
    const server = serverWert(spiel);
    basisRef.current = { ...basisRef.current, [spielId]: server };
    setEingaben((b) => ({ ...b, [spielId]: server }));
    setKonflikte((k) => {
      if (!k.has(spielId)) return k;
      const n = new Set(k);
      n.delete(spielId);
      return n;
    });
  }

  return { eingaben, setFeld, konflikte, uebernehmeServer };
}

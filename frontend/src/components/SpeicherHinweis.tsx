import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rueckmeldung fuer Felder, die beim Verlassen automatisch gespeichert werden.
 *
 * Hintergrund (Nutzer-Vorgabe 22.08.2026): Ohne Speichern-Knopf fehlt jedes wahrnehmbare
 * Ereignis - man weiss schlicht nicht, ob die Aenderung angekommen ist. Sichtbar war das
 * bisher nur in der Ergebniserfassung; alle uebrigen automatisch speichernden Listen
 * (Vereine, Teams, Mannschaften, Kader, Schiedsrichter, Spielplan, Turnier-Uebersicht)
 * speicherten stillschweigend. Fuer die Zielgruppe dieser Anwendung ist das der
 * entscheidende Punkt: Der Hinweis muss nicht nur sichtbar, sondern auch ANGESAGT werden.
 *
 * Zwei Feinheiten, die leicht uebersehen werden:
 *  - Die Live-Region muss schon VOR der Meldung im Dokument stehen. Ein Element, das erst
 *    zusammen mit seinem Text erscheint, sagen viele Screenreader nicht an. Deshalb rendert
 *    `SpeicherHinweis` die Zeile immer (leer, mit reservierter Hoehe per CSS).
 *  - Zweimal derselbe Text hintereinander (z.B. dasselbe Feld zweimal geaendert) gilt als
 *    "unveraendert" und wird ebenfalls nicht erneut angesagt. `melde` leert die Region
 *    deshalb erst und setzt den Text unmittelbar danach neu.
 */

/** Wie lange die Meldung sichtbar bleibt. Lang genug zum Lesen, kurz genug, um nicht zu stoeren. */
const ANZEIGE_MS = 4000;

export function useSpeicherHinweis(): { hinweis: string; melde: (text?: string) => void } {
  const [hinweis, setHinweis] = useState("");
  const versteckTimer = useRef<number | undefined>(undefined);
  const neuTimer = useRef<number | undefined>(undefined);

  const melde = useCallback((text = "Gespeichert.") => {
    window.clearTimeout(versteckTimer.current);
    window.clearTimeout(neuTimer.current);
    setHinweis("");
    // Bewusst ein Timer und NICHT requestAnimationFrame: dessen Rueckruf laeuft nur, solange
    // die Seite tatsaechlich gezeichnet wird. In einem Hintergrund-Tab (oder einer nicht
    // sichtbaren Vorschau) bliebe die Meldung sonst dauerhaft aus.
    neuTimer.current = window.setTimeout(() => {
      setHinweis(text);
      versteckTimer.current = window.setTimeout(() => setHinweis(""), ANZEIGE_MS);
    }, 0);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(versteckTimer.current);
      window.clearTimeout(neuTimer.current);
    },
    [],
  );

  return { hinweis, melde };
}

/** Die Live-Region selbst - einmal je Liste/Formular rendern, moeglichst nahe der Fehleranzeige. */
export function SpeicherHinweis({ hinweis }: { hinweis: string }) {
  return (
    <p className="speicher-status" role="status">
      {hinweis ? `✓ ${hinweis}` : ""}
    </p>
  );
}

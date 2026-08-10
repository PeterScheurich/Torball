import { PASSWORT_REGELN } from "./passwortAnforderungen";

/** Passwort-Anforderungen als Live-Checkliste (rot = offen, grün + Haken = erfüllt). */
export function PasswortRegeln({ passwort }: { passwort: string }) {
  return (
    <div className="passwort-regeln">
      <p className="passwort-regeln-titel">Für ein neues Passwort:</p>
      <ul aria-label="Passwort-Anforderungen">
        {PASSWORT_REGELN.map((regel) => {
          const ok = regel.erfuellt(passwort);
          return (
            <li key={regel.label} className={ok ? "regel-erfuellt" : "regel-offen"}>
              <span className="regel-marker" aria-hidden="true">
                {ok ? "✓" : "○"}
              </span>
              {regel.label}
              <span className="sr-only">{ok ? " – erfüllt" : " – noch offen"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

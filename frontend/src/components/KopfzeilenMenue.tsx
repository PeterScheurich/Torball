import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  label: ReactNode;
  ariaLabel?: string;
  aktiv?: boolean;
  children: ReactNode;
}

/** Kleines Dropdown-Menue fuer die Kopfzeile (z.B. "Stammdaten", Benutzermenue) - schliesst
 * bei Klick ausserhalb, Escape oder Klick auf einen Eintrag (Event-Bubbling reicht dafuer,
 * ohne dass jeder Eintrag einzeln einen Schliessen-Callback bekommen muesste). */
export function KopfzeilenMenue({ label, ariaLabel, aktiv, children }: Props) {
  const [offen, setOffen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;
    function aufKlickAussen(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOffen(false);
      }
    }
    function aufEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOffen(false);
    }
    document.addEventListener("mousedown", aufKlickAussen);
    document.addEventListener("keydown", aufEscape);
    return () => {
      document.removeEventListener("mousedown", aufKlickAussen);
      document.removeEventListener("keydown", aufEscape);
    };
  }, [offen]);

  return (
    <div className="kopfzeile-menue" ref={wrapperRef}>
      <button
        type="button"
        className={aktiv ? "kopfzeile-menue-knopf kopfzeile-link-aktiv" : "kopfzeile-menue-knopf"}
        aria-haspopup="true"
        aria-expanded={offen}
        aria-label={ariaLabel}
        onClick={() => setOffen((o) => !o)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {offen && (
        <div className="kopfzeile-menue-liste" role="menu" onClick={() => setOffen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

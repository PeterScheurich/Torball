import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

interface Props {
  label: ReactNode;
  ariaLabel?: string;
  aktiv?: boolean;
  children: ReactNode;
}

/** Kleines Dropdown-Menue fuer die Kopfzeile (z.B. "Stammdaten", Benutzermenue) - schliesst
 * bei Klick ausserhalb, Escape oder Klick auf einen Eintrag (Event-Bubbling reicht dafuer,
 * ohne dass jeder Eintrag einzeln einen Schliessen-Callback bekommen muesste).
 *
 * Tastatur-Bedienung nach dem ARIA-Menue-Muster (role="menu" kuendigt Screenreadern genau
 * diese Bedienung an): Pfeil-hoch/-runter oeffnet das Menue bzw. bewegt den Fokus zwischen
 * den Eintraegen (mit Umlauf), Home/End springen zum ersten/letzten Eintrag, Escape schliesst
 * und setzt den Fokus zurueck auf den Menue-Knopf. Enter/Space auf dem Knopf (natives
 * Button-Verhalten) und Tab (verlaesst das Menue normal) bleiben unveraendert.
 */
export function KopfzeilenMenue({ label, ariaLabel, aktiv, children }: Props) {
  const [offen, setOffen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const knopfRef = useRef<HTMLButtonElement>(null);
  // Beim Oeffnen per Pfeiltaste soll direkt der erste/letzte Eintrag fokussiert werden -
  // die Eintraege existieren aber erst nach dem Rendern, daher als "Wunsch" vorgemerkt.
  const fokusNachOeffnen = useRef<"erster" | "letzter" | null>(null);

  function eintraege(): HTMLElement[] {
    return [...(wrapperRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  }

  useEffect(() => {
    if (!offen) return;
    if (fokusNachOeffnen.current) {
      const items = eintraege();
      (fokusNachOeffnen.current === "erster" ? items[0] : items[items.length - 1])?.focus();
      fokusNachOeffnen.current = null;
    }
    function aufKlickAussen(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOffen(false);
      }
    }
    function aufEscape(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOffen(false);
      // Fokus zurueck zum Knopf, wenn er gerade im Menue stand - sonst ginge er beim
      // Entfernen der Eintraege aus dem DOM an den Dokumentanfang verloren.
      if (wrapperRef.current?.contains(document.activeElement)) knopfRef.current?.focus();
    }
    document.addEventListener("mousedown", aufKlickAussen);
    document.addEventListener("keydown", aufEscape);
    return () => {
      document.removeEventListener("mousedown", aufKlickAussen);
      document.removeEventListener("keydown", aufEscape);
    };
  }, [offen]);

  function aufTastendruck(e: KeyboardEvent<HTMLDivElement>) {
    const richtungen = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!richtungen.includes(e.key)) return;
    e.preventDefault();

    if (!offen) {
      fokusNachOeffnen.current = e.key === "ArrowUp" || e.key === "End" ? "letzter" : "erster";
      setOffen(true);
      return;
    }

    const items = eintraege();
    if (items.length === 0) return;
    const aktuell = items.indexOf(document.activeElement as HTMLElement);
    let ziel: number;
    if (e.key === "Home") ziel = 0;
    else if (e.key === "End") ziel = items.length - 1;
    else if (e.key === "ArrowDown") ziel = aktuell < 0 ? 0 : (aktuell + 1) % items.length;
    else ziel = aktuell < 0 ? items.length - 1 : (aktuell - 1 + items.length) % items.length;
    items[ziel].focus();
  }

  return (
    <div className="kopfzeile-menue" ref={wrapperRef} onKeyDown={aufTastendruck}>
      <button
        ref={knopfRef}
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

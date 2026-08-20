import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabEintrag {
  id: string;
  label: ReactNode;
}

interface Props {
  /** Beschriftung der Tab-Leiste fuer Screenreader (aria-label des tablist). */
  ariaLabel: string;
  tabs: TabEintrag[];
  /** id des aktuell aktiven Tabs. */
  aktiv: string;
  onWechsel: (id: string) => void;
  /** Zusaetzliche CSS-Klasse der Leiste (z.B. "feld-tabs", "unter-tablist"). */
  className?: string;
}

/**
 * Wiederverwendbare Tab-Leiste nach dem ARIA-Tabs-Muster: Roving-Tabindex (nur der aktive Tab
 * liegt in der Tab-Reihenfolge) plus Pfeiltasten-/Home-/End-Bedienung innerhalb der Leiste -
 * dasselbe Muster, das die Haupt-Reiter in TurnierVerwaltenPage.tsx bereits von Hand umsetzen.
 * Vorher hatten die kleineren Tab-Gruppen (Feld-Auswahl, Spielplan-Sicht, oeffentliche Seite)
 * zwar role="tab"/aria-selected, aber weder Roving-Tabindex noch Pfeiltasten - fuer
 * Screenreader-Nutzer kuendigt role="tab" genau diese Bedienung aber an.
 *
 * Bewusst ohne aria-controls/tabpanel-Verdrahtung: die Inhalte dieser Tab-Gruppen sind keine
 * klar abgegrenzten Panel-Elemente (z.B. filtert die Feld-Auswahl nur dieselbe Tabelle um).
 * Wo echte Panels existieren (Haupt-Reiter der TurnierVerwaltenPage), bleibt die dortige
 * vollstaendige Umsetzung mit aria-controls bestehen.
 */
export function TabListe({ ariaLabel, tabs, aktiv, onWechsel, className }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function aufTastendruck(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const letzte = tabs.length - 1;
    let ziel: number | undefined;
    if (e.key === "ArrowRight") ziel = index === letzte ? 0 : index + 1;
    else if (e.key === "ArrowLeft") ziel = index === 0 ? letzte : index - 1;
    else if (e.key === "Home") ziel = 0;
    else if (e.key === "End") ziel = letzte;
    if (ziel === undefined) return;
    e.preventDefault();
    const zielId = tabs[ziel].id;
    onWechsel(zielId);
    refs.current[zielId]?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={className}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          ref={(el) => {
            refs.current[tab.id] = el;
          }}
          role="tab"
          aria-selected={aktiv === tab.id}
          tabIndex={aktiv === tab.id ? 0 : -1}
          className={aktiv === tab.id ? "tab tab-aktiv" : "tab"}
          onClick={() => onWechsel(tab.id)}
          onKeyDown={(e) => aufTastendruck(e, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

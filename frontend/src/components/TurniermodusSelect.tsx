import type { Spielmodus, TurniermodusVorlage } from "@torball/shared";

/**
 * EINE Auswahl für den ganzen Ablauf des Turniers (Auftraggeber 01.11.2026): bisher gab es daneben noch
 * ein eigenes Feld „Spielmodus“ (einfach/doppelt), und beide Begriffe überschnitten sich. Jetzt wählt man
 * je Turniermodus gleich dazu, ob die Vorrunde einmal oder als Hin- und Rückspiel gespielt wird.
 * Gespeichert bleiben unverändert zwei Werte (Vorlage und `spielplanModus`) - das hier ist nur die
 * gemeinsame Oberfläche dafür.
 */

interface Props {
  id: string;
  vorlagen: TurniermodusVorlage[];
  vorlageId: string;
  spielmodus: Spielmodus;
  disabled?: boolean;
  onChange: (vorlageId: string, spielmodus: Spielmodus) => void;
}

const SEPARATOR = "|";

/** Text unter der Auswahl: was die gewählte Kombination bedeutet. */
function spielmodusErklaerung(vorlage: TurniermodusVorlage, spielmodus: Spielmodus): string {
  if (spielmodus !== "doppelt") return "";
  return vorlage.gruppen === 2 || vorlage.endrundeGroessen.some((g) => g > 0)
    ? "Hin- und Rückspiel gilt nur für die Vorrunde (bei zwei Gruppen innerhalb jeder Gruppe) – die Spiele der Endrunde werden einmal gespielt."
    : "Jede Mannschaft spielt zweimal gegen jede andere (Hin- und Rückspiel).";
}

export function TurniermodusSelect({ id, vorlagen, vorlageId, spielmodus, disabled, onChange }: Props) {
  const aktuell = vorlagen.find((v) => v.id === vorlageId);
  // Eine Vorlage ohne Hin-/Rückspiel kann nicht "doppelt" sein - der Wert fällt dann auf einfach zurück.
  const wirksam: Spielmodus = spielmodus === "doppelt" && aktuell?.doppeltWaehlbar ? "doppelt" : "einfach";

  return (
    <>
    <select
      id={id}
      disabled={disabled}
      value={`${vorlageId}${SEPARATOR}${wirksam}`}
      aria-describedby={`${id}-beschreibung`}
      onChange={(e) => {
        const [neueVorlage, modus] = e.target.value.split(SEPARATOR);
        onChange(neueVorlage, modus === "doppelt" ? "doppelt" : "einfach");
      }}
    >
      {vorlagen.map((v) =>
        v.doppeltWaehlbar ? (
          <optgroup key={v.id} label={v.name}>
            <option value={`${v.id}${SEPARATOR}einfach`}>{v.name} – Vorrunde einfach (jede Paarung einmal)</option>
            <option value={`${v.id}${SEPARATOR}doppelt`}>{v.name} – Vorrunde doppelt (Hin- und Rückspiel)</option>
          </optgroup>
        ) : (
          <option key={v.id} value={`${v.id}${SEPARATOR}einfach`}>
            {v.name}
          </option>
        ),
      )}
    </select>
    <p id={`${id}-beschreibung`} className="feld-hinweis">
      {aktuell?.beschreibung} {aktuell ? spielmodusErklaerung(aktuell, wirksam) : ""}
    </p>
    </>
  );
}

import type { MannschaftImTurnier, Spielmodus, Turnier } from "@torball/shared";

function modusLabel(m: Spielmodus): string {
  return m === "doppelt" ? "Jeder zweimal gegen Jeden" : "Jeder gegen Jeden";
}

/**
 * Vergleicht die aktuelle spielplan-relevante Konfiguration mit dem Schnappschuss, der bei der
 * letzten Spielplan-Erzeugung gespeichert wurde (`turnier.spielplanBasis`), und liefert eine
 * lesbare Liste der Unterschiede. Leer, wenn es keinen Schnappschuss gibt oder nichts abweicht.
 */
export function spielplanBasisAenderungen(turnier: Turnier, mannschaften: MannschaftImTurnier[]): string[] {
  const basis = turnier.spielplanBasis;
  if (!basis) return [];
  const aenderungen: string[] = [];

  if (basis.spielplanModus !== turnier.spielplanModus) {
    aenderungen.push(`Spielmodus: ${modusLabel(basis.spielplanModus)} → ${modusLabel(turnier.spielplanModus)}`);
  }

  const felderVorher = basis.felder.map((f) => f.name).join(", ");
  const felderJetzt = turnier.felder.map((f) => f.name).join(", ");
  if (felderVorher !== felderJetzt) {
    aenderungen.push(`Spielfelder: ${felderVorher || "—"} → ${felderJetzt || "—"}`);
  }

  const vorherIds = new Set(basis.mannschaften.map((m) => m.id));
  const jetztIds = new Set(mannschaften.map((m) => m._id));
  const entfernt = basis.mannschaften.filter((m) => !jetztIds.has(m.id)).map((m) => m.name);
  const hinzugefuegt = mannschaften.filter((m) => !vorherIds.has(m._id)).map((m) => m.name);
  if (entfernt.length) aenderungen.push(`Entfernte Mannschaften: ${entfernt.join(", ")}`);
  if (hinzugefuegt.length) aenderungen.push(`Neue Mannschaften: ${hinzugefuegt.join(", ")}`);

  if (basis.spielzeitMinuten !== turnier.spielzeitMinuten) {
    aenderungen.push(`Spielzeit: ${basis.spielzeitMinuten} → ${turnier.spielzeitMinuten} min`);
  }
  if (basis.pauseMinuten !== turnier.pauseMinuten) {
    aenderungen.push(`Pause: ${basis.pauseMinuten} → ${turnier.pauseMinuten} min`);
  }
  if (basis.anzahlHalbzeiten !== turnier.anzahlHalbzeiten) {
    aenderungen.push(`Halbzeiten: ${basis.anzahlHalbzeiten} → ${turnier.anzahlHalbzeiten}`);
  }
  if ((basis.startzeit ?? "") !== (turnier.startzeit ?? "")) {
    aenderungen.push(`Startzeit: ${basis.startzeit ?? "—"} → ${turnier.startzeit ?? "—"}`);
  }
  if (basis.bundeslandBeruecksichtigen !== turnier.bundeslandBeruecksichtigen) {
    aenderungen.push(
      `Bundesland-Regel: ${basis.bundeslandBeruecksichtigen ? "ein" : "aus"} → ${turnier.bundeslandBeruecksichtigen ? "ein" : "aus"}`,
    );
  }

  return aenderungen;
}

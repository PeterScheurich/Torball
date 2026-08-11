import type { MannschaftImTurnier, SchiedsrichterImTurnier, Spiel, Spieler, Turnier } from "@torball/shared";
import { spielplanBasisAenderungen } from "./spielplanBasisDiff";

export type PruefStatus = "ok" | "hinweis" | "fehler" | "info";

export interface PruefErgebnis {
  titel: string;
  status: PruefStatus;
  text: string;
}

export interface PruefDaten {
  turnier: Turnier;
  mannschaften: MannschaftImTurnier[];
  /** Spielerliste je Mannschafts-Id. */
  spielerProMannschaft: Record<string, Spieler[]>;
  spiele: Spiel[];
  schiedsrichter: SchiedsrichterImTurnier[];
}

/**
 * Prueft ein Turnier gegen die (bewusst nicht erzwungenen) Regeln und liefert eine Liste von
 * Ergebnissen. Nichts wird blockiert - die Turnierleitung sieht auf einen Blick, was noch zu
 * pruefen ist. Status: „ok" erfuellt, „hinweis" auffaellig (kann gewollt sein), „fehler"
 * verhindert einen sinnvollen Ablauf, „info" reine Information.
 */
export function turnierPruefen(daten: PruefDaten): PruefErgebnis[] {
  const { turnier, mannschaften, spielerProMannschaft, spiele, schiedsrichter } = daten;
  const ergebnisse: PruefErgebnis[] = [];

  // Spielfelder
  ergebnisse.push(
    turnier.felder.length >= 1
      ? { titel: "Spielfelder", status: "ok", text: `${turnier.felder.length} Feld(er) definiert.` }
      : { titel: "Spielfelder", status: "fehler", text: "Kein Spielfeld definiert." },
  );

  // Mannschaften
  ergebnisse.push(
    mannschaften.length >= 2
      ? { titel: "Mannschaften", status: "ok", text: `${mannschaften.length} Mannschaften.` }
      : { titel: "Mannschaften", status: "fehler", text: `Nur ${mannschaften.length} – mindestens 2 nötig.` },
  );

  const nameVon = (id: string) => mannschaften.find((m) => m._id === id)?.name ?? id;

  // Sehende Spieler je Mannschaft
  const zuVieleSehende = mannschaften
    .map((m) => ({ m, anzahl: (spielerProMannschaft[m._id] ?? []).filter((s) => s.klassifizierung === "sehend").length }))
    .filter((x) => x.anzahl > turnier.maxSehendeSpieler);
  ergebnisse.push(
    zuVieleSehende.length === 0
      ? { titel: "Sehende Spieler", status: "ok", text: `Höchstens ${turnier.maxSehendeSpieler} je Mannschaft.` }
      : {
          titel: "Sehende Spieler",
          status: "hinweis",
          text: `Über dem Limit (${turnier.maxSehendeSpieler}): ${zuVieleSehende
            .map((x) => `${x.m.name} (${x.anzahl})`)
            .join(", ")}.`,
        },
  );

  // Doppelte Trikotnummern je Mannschaft
  const mitDoppelten = mannschaften.filter((m) => {
    const nummern = (spielerProMannschaft[m._id] ?? []).map((s) => s.trikotnummer);
    return new Set(nummern).size !== nummern.length;
  });
  ergebnisse.push(
    mitDoppelten.length === 0
      ? { titel: "Trikotnummern (eindeutig)", status: "ok", text: "Keine doppelten Nummern je Mannschaft." }
      : {
          titel: "Trikotnummern (eindeutig)",
          status: "hinweis",
          text: `Doppelte Nummern: ${mitDoppelten.map((m) => m.name).join(", ")}.`,
        },
  );

  // Einstellige Trikotnummern (falls Regel aktiv)
  if (turnier.einstelligeTrikotnummern) {
    const mitMehrstelligen = mannschaften.filter((m) =>
      (spielerProMannschaft[m._id] ?? []).some((s) => !/^\d$/.test(s.trikotnummer)),
    );
    ergebnisse.push(
      mitMehrstelligen.length === 0
        ? { titel: "Einstellige Trikotnummern", status: "ok", text: "Alle Nummern einstellig." }
        : {
            titel: "Einstellige Trikotnummern",
            status: "hinweis",
            text: `Mehrstellige/ungültige Nummern: ${mitMehrstelligen.map((m) => m.name).join(", ")}.`,
          },
    );
  }

  // Spielplan vorhanden
  ergebnisse.push(
    spiele.length > 0
      ? { titel: "Spielplan", status: "ok", text: `${spiele.length} Spiele geplant.` }
      : { titel: "Spielplan", status: "hinweis", text: "Noch kein Spielplan erzeugt." },
  );

  // Spielplan passt zur Basiskonfiguration
  if (spiele.length > 0) {
    const aenderungen = spielplanBasisAenderungen(turnier, mannschaften);
    ergebnisse.push(
      aenderungen.length === 0
        ? { titel: "Spielplan aktuell", status: "ok", text: "Passt zur aktuellen Konfiguration." }
        : {
            titel: "Spielplan aktuell",
            status: "hinweis",
            text: `Basiskonfiguration seit Erzeugung geändert: ${aenderungen.join("; ")}. Neu erzeugen empfohlen.`,
          },
    );
  }

  // Back-to-Back-Spiele (Mannschaft zwei Spiele direkt hintereinander) je Feld
  const back = spiele.length > 0 ? findeBackToBack(spiele, nameVon) : [];
  if (spiele.length > 0) {
    ergebnisse.push(
      back.length === 0
        ? { titel: "Keine Spiele hintereinander", status: "ok", text: "Keine Mannschaft spielt zweimal direkt nacheinander." }
        : { titel: "Keine Spiele hintereinander", status: "hinweis", text: back.join("; ") + "." },
    );
  }

  // Schiedsrichter - immer als Punkt, auch wenn nicht geplant
  if (!turnier.schiedsrichterPlanung) {
    ergebnisse.push({ titel: "Schiedsrichter", status: "info", text: "Schiedsrichter-Planung nicht aktiviert." });
  } else {
    const turnierleitung = schiedsrichter.filter((s) => s.istTurnierleitung).length;
    ergebnisse.push(
      turnierleitung === 1
        ? { titel: "Schiedsrichter / Turnierleitung", status: "ok", text: `${schiedsrichter.length} Schiedsrichter, Turnierleitung festgelegt.` }
        : {
            titel: "Schiedsrichter / Turnierleitung",
            status: "hinweis",
            text:
              turnierleitung === 0
                ? "Keine Turnierleitung festgelegt."
                : `${turnierleitung} Personen als Turnierleitung markiert (genau eine erwartet).`,
          },
    );
  }

  return ergebnisse;
}

/** Findet Mannschaften, die je Feld in aufeinanderfolgenden Runden spielen (Back-to-Back). */
function findeBackToBack(spiele: Spiel[], nameVon: (id: string) => string): string[] {
  const sortiert = [...spiele].sort((a, b) => Number(a.runde) - Number(b.runde));
  const treffer = new Set<string>();
  for (let i = 1; i < sortiert.length; i += 1) {
    const vorher = sortiert[i - 1];
    const jetzt = sortiert[i];
    if (Number(jetzt.runde) !== Number(vorher.runde) + 1) continue;
    for (const team of [jetzt.mannschaftAId, jetzt.mannschaftBId]) {
      if (team === vorher.mannschaftAId || team === vorher.mannschaftBId) {
        treffer.add(`${nameVon(team)} spielt in Runde ${vorher.runde} und ${jetzt.runde} direkt hintereinander`);
      }
    }
  }
  return [...treffer];
}

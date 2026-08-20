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

  // Doppelbelegung (Mannschaft zweimal im selben Zeit-Slot) und Back-to-Back-Spiele
  // (zwei Spiele in direkt aufeinanderfolgenden Slots) - beide muessen auch fuer den
  // gespeicherten, manuell geaenderten Spielplan gelten, nicht nur fuer den Vorschlag.
  if (spiele.length > 0) {
    const doppelt = findeDoppelteSlotBelegung(spiele, nameVon);
    ergebnisse.push(
      doppelt.length === 0
        ? { titel: "Keine Doppelbelegung", status: "ok", text: "Keine Mannschaft ist in derselben Runde mehrfach eingeplant." }
        : { titel: "Keine Doppelbelegung", status: "hinweis", text: doppelt.join("; ") + "." },
    );

    const back = findeBackToBack(spiele, nameVon);
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

/** Mannschaften je Zeit-Slot (runde), ueber alle Felder hinweg. */
function teamsProSlot(spiele: Spiel[]): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const s of spiele) {
    const slot = Number(s.runde);
    const set = map.get(slot) ?? new Set<string>();
    set.add(s.mannschaftAId);
    set.add(s.mannschaftBId);
    map.set(slot, set);
  }
  return map;
}

/**
 * Findet Mannschaften, die in direkt aufeinanderfolgenden Zeit-Slots spielen (Back-to-Back).
 * Gleiche Slot-Mengen-Logik wie slotWarnungen() in SpielplanVerwaltung.tsx: verglichen wird
 * die echte Slot-Nachbarschaft, nicht benachbarte Listeneintraege - bei mehreren Feldern
 * teilen sich zwei Spiele denselben Slot, ein Folgespiel kann auch auf dem anderen Feld liegen.
 */
function findeBackToBack(spiele: Spiel[], nameVon: (id: string) => string): string[] {
  const proSlot = teamsProSlot(spiele);
  const treffer = new Set<string>();
  for (const spiel of spiele) {
    const slot = Number(spiel.runde);
    const vorSlot = proSlot.get(slot - 1);
    if (!vorSlot) continue;
    for (const team of [spiel.mannschaftAId, spiel.mannschaftBId]) {
      if (vorSlot.has(team)) {
        treffer.add(`${nameVon(team)} spielt in Runde ${slot - 1} und ${slot} direkt hintereinander`);
      }
    }
  }
  return [...treffer];
}

/** Findet Mannschaften, die im selben Zeit-Slot mehrfach eingeplant sind (harte Regel,
 *  ueber die manuelle Runden-Aenderung trotzdem herstellbar - deshalb hier pruefen). */
function findeDoppelteSlotBelegung(spiele: Spiel[], nameVon: (id: string) => string): string[] {
  const gesehen = new Set<string>();
  const treffer = new Set<string>();
  for (const spiel of spiele) {
    const slot = Number(spiel.runde);
    for (const team of [spiel.mannschaftAId, spiel.mannschaftBId]) {
      const schluessel = `${slot}:${team}`;
      if (gesehen.has(schluessel)) {
        treffer.add(`${nameVon(team)} ist in Runde ${slot} mehrfach eingeplant`);
      }
      gesehen.add(schluessel);
    }
  }
  return [...treffer];
}

import type { MannschaftImTurnier, Spiel, TabellenKriterium, Turnier } from "@torball/shared";

/** Abschnitt 9.2, aktuell hartkodiert - die Systemkonfiguration hat noch keine CRUD-Routen. */
const FORFAIT_PUNKTABZUG = 2;

export interface TabellenZeile {
  mannschaftId: string;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  toreFuer: number;
  toreGegen: number;
  tordifferenz: number;
  punkte: number;
}

/**
 * Abschnitt 9.1/14: Tabelle wird aus allen Spielen mit erfasstem Ergebnis
 * berechnet, unabhaengig vom Abschluss-Status ("Eine Bestaetigung durch die
 * Turnierleitung vor Einfliessen in die Tabelle ist zunaechst nicht
 * erforderlich"). Sortierkriterium "Freiwuerfe" (Abschnitt 9.1, Punkt 5)
 * ist ohne das noch nicht umgesetzte Live-Protokoll nicht erfassbar und
 * wirkt hier als No-Op (immer gleich).
 *
 * "direkter_vergleich" vergleicht nur paarweise - bei einem Gleichstand
 * zwischen mehr als zwei Mannschaften mit zirkulaeren Ergebnissen
 * (A schlaegt B, B schlaegt C, C schlaegt A) liefert das keine eindeutige
 * Reihenfolge; eine vollstaendige Mini-Tabelle unter den betroffenen
 * Mannschaften ist hier bewusst nicht umgesetzt (seltener Randfall).
 */
export function berechneTabelle(
  turnier: Turnier,
  mannschaften: MannschaftImTurnier[],
  spiele: Spiel[],
): TabellenZeile[] {
  const zeilenNachId = new Map<string, TabellenZeile>();
  for (const m of mannschaften) {
    zeilenNachId.set(m._id, {
      mannschaftId: m._id,
      spiele: 0,
      siege: 0,
      unentschieden: 0,
      niederlagen: 0,
      toreFuer: 0,
      toreGegen: 0,
      tordifferenz: 0,
      punkte: 0,
    });
  }

  const gewertete = spiele.filter((s) => s.ergebnisA != null && s.ergebnisB != null);

  for (const spiel of gewertete) {
    const a = zeilenNachId.get(spiel.mannschaftAId);
    const b = zeilenNachId.get(spiel.mannschaftBId);
    if (!a || !b) continue; // Mannschaft nicht (mehr) im Turnier - defensiv, sollte nicht vorkommen.

    const torA = spiel.ergebnisA!;
    const torB = spiel.ergebnisB!;
    a.spiele++;
    b.spiele++;
    a.toreFuer += torA;
    a.toreGegen += torB;
    b.toreFuer += torB;
    b.toreGegen += torA;

    if (torA > torB) {
      a.siege++;
      b.niederlagen++;
      a.punkte += turnier.punkteSieg;
      b.punkte += turnier.punkteNiederlage;
    } else if (torA < torB) {
      b.siege++;
      a.niederlagen++;
      b.punkte += turnier.punkteSieg;
      a.punkte += turnier.punkteNiederlage;
    } else {
      a.unentschieden++;
      b.unentschieden++;
      a.punkte += turnier.punkteUnentschieden;
      b.punkte += turnier.punkteUnentschieden;
    }

    // Abschnitt 9.2 "Nichterscheinen": zusaetzlich 2 Punkte Abzug fuer die nicht angetretene
    // Mannschaft. Das Spiel-Dokument haelt nicht separat fest, WER nicht angetreten ist -
    // bei einem Forfait-Ergebnis ist das aber immer die Seite mit dem niedrigeren Ergebnis.
    if (spiel.istForfait) {
      const forfaitSeite = torA < torB ? a : torB < torA ? b : undefined;
      if (forfaitSeite) {
        forfaitSeite.punkte -= FORFAIT_PUNKTABZUG;
      }
    }
  }

  for (const zeile of zeilenNachId.values()) {
    zeile.tordifferenz = zeile.toreFuer - zeile.toreGegen;
  }

  const zeilen = [...zeilenNachId.values()];
  zeilen.sort((x, y) => vergleicheZeilen(x, y, turnier.tabellenKriterien, gewertete));
  return zeilen;
}

function vergleicheZeilen(
  x: TabellenZeile,
  y: TabellenZeile,
  kriterien: TabellenKriterium[],
  gewertete: Spiel[],
): number {
  for (const kriterium of kriterien) {
    const diff = vergleicheKriterium(kriterium, x, y, gewertete);
    if (diff !== 0) return diff;
  }
  return 0;
}

function vergleicheKriterium(kriterium: TabellenKriterium, x: TabellenZeile, y: TabellenZeile, gewertete: Spiel[]): number {
  switch (kriterium) {
    case "punkte":
      return y.punkte - x.punkte;
    case "tordifferenz":
      return y.tordifferenz - x.tordifferenz;
    case "tore":
      return y.toreFuer - x.toreFuer;
    case "direkter_vergleich":
      return direkterVergleich(x, y, gewertete);
    case "freiwuerfe":
      return 0;
  }
}

/** Summiert alle direkten Begegnungen zwischen x und y (bei "doppelt" ggf. mehrere). */
function direkterVergleich(x: TabellenZeile, y: TabellenZeile, gewertete: Spiel[]): number {
  let torX = 0;
  let torY = 0;
  for (const spiel of gewertete) {
    if (spiel.mannschaftAId === x.mannschaftId && spiel.mannschaftBId === y.mannschaftId) {
      torX += spiel.ergebnisA!;
      torY += spiel.ergebnisB!;
    } else if (spiel.mannschaftAId === y.mannschaftId && spiel.mannschaftBId === x.mannschaftId) {
      torX += spiel.ergebnisB!;
      torY += spiel.ergebnisA!;
    }
  }
  return torY - torX;
}

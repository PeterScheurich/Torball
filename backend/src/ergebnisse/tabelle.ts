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
  /** Gruppe der Vorrunde (Turniermodus mit zwei Gruppen); fehlt sonst. */
  gruppe?: string;
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

  // Nur Vorrundenspiele zaehlen in die Tabelle: Spiele spaeterer Runden (Turniermodus mit Endrunde,
  // `planId` gesetzt) entscheiden ueber den Weiterweg, nicht ueber die Gruppen-/Turniertabelle.
  const gewertete = spiele.filter((s) => !s.planId && s.ergebnisA != null && s.ergebnisB != null);

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

/**
 * Tabellen eines Turniermodus mit Gruppen: je Gruppe eine eigene Tabelle (jede Zeile traegt ihre Gruppe),
 * Gruppe A vor Gruppe B. Die von der Turnierleitung festgelegte Rangentscheidung bei Gleichstand wirkt mit.
 * Ohne Gruppen-Modus: die normale Tabelle.
 */
export function berechneTabellen(turnier: Turnier, mannschaften: MannschaftImTurnier[], spiele: Spiel[]): TabellenZeile[] {
  if (turnier.modus?.vorlage.gruppen !== 2) return berechneTabelle(turnier, mannschaften, spiele);
  const zeilen: TabellenZeile[] = [];
  for (const g of ["A", "B"]) {
    const gruppe = mannschaften.filter((m) => m.gruppe === g);
    const ids = new Set(gruppe.map((m) => m._id));
    const gruppenSpiele = spiele.filter((s) => ids.has(s.mannschaftAId) && ids.has(s.mannschaftBId));
    const r = berechneRangfolge(turnier, gruppe, gruppenSpiele, turnier.modus.vorrang?.[g]);
    zeilen.push(...r.zeilen.map((z) => ({ ...z, gruppe: g })));
  }
  return zeilen;
}

/** Mannschaften, die nach ALLEN Tabellenkriterien gleichauf liegen (Plaetze von-bis, 1-basiert). */
export interface Gleichstand {
  vonPlatz: number;
  bisPlatz: number;
  mannschaftIds: string[];
}

export interface Rangfolge {
  zeilen: TabellenZeile[];
  /** Nur UNAUFGELOESTE Gleichstaende - die Turnierleitung entscheidet (Auftraggeber 31.10.2026). */
  gleichstaende: Gleichstand[];
}

/**
 * Tabelle plus Erkennung echter Gleichstaende (Turniermodus mit Endrunde: wer Platz 2 und 3 belegt,
 * entscheidet ueber die Paarungen). Zuerst gilt die festgelegte Entscheidungsreihenfolge
 * (`turnier.tabellenKriterien`); bleibt eine Gruppe gleichauf, wirkt die von der Turnierleitung
 * festgelegte Reihenfolge `vorrang` (Mannschafts-IDs) - aber nur, wenn sie ALLE gleichauf liegenden
 * Mannschaften nennt. Sonst bleibt der Gleichstand offen und wird gemeldet.
 */
export function berechneRangfolge(
  turnier: Turnier,
  mannschaften: MannschaftImTurnier[],
  spiele: Spiel[],
  vorrang?: string[],
): Rangfolge {
  const zeilen = berechneTabelle(turnier, mannschaften, spiele);
  const gewertete = spiele.filter((s) => !s.planId && s.ergebnisA != null && s.ergebnisB != null);
  const gleichstaende: Gleichstand[] = [];
  let i = 0;
  while (i < zeilen.length) {
    let j = i;
    while (j + 1 < zeilen.length && vergleicheZeilen(zeilen[j], zeilen[j + 1], turnier.tabellenKriterien, gewertete) === 0) {
      j++;
    }
    if (j > i) {
      const lauf = zeilen.slice(i, j + 1);
      const ids = lauf.map((z) => z.mannschaftId);
      if (vorrang && ids.every((id) => vorrang.includes(id))) {
        lauf.sort((a, b) => vorrang.indexOf(a.mannschaftId) - vorrang.indexOf(b.mannschaftId));
        zeilen.splice(i, lauf.length, ...lauf);
      } else {
        gleichstaende.push({ vonPlatz: i + 1, bisPlatz: j + 1, mannschaftIds: ids });
      }
    }
    i = j + 1;
  }
  return { zeilen, gleichstaende };
}

/**
 * Gesamttabelle ueber mehrere Spieltag-Turniere eines Wettbewerbs (Datenuebernahme, Hin-/Rueck-
 * spieltag). Dieselbe Mannschaft tritt an jedem Spieltag als eigenes Dokument an; die Zuordnung
 * laeuft ueber die gemeinsame Herkunfts-Wurzel (importiertAusMannschaftId bis zum ersten Spieltag).
 * Alle Spiele werden auf die Mannschaften des ANZEIGE-Turniers abgebildet - so summieren sich
 * Punkte/Tore ueber alle Tage, und die Tabelle ist mit den (Namen der) Mannschaften des gerade
 * betrachteten Turniers aufloesbar.
 */
export function berechneGesamttabelle(
  anzeigeTurnier: Turnier,
  anzeigeMannschaften: MannschaftImTurnier[],
  alleMannschaften: MannschaftImTurnier[],
  alleSpiele: Spiel[],
): TabellenZeile[] {
  const byId = new Map(alleMannschaften.map((m) => [m._id, m]));
  const wurzel = (id: string): string => {
    let cur = byId.get(id);
    const gesehen = new Set<string>();
    while (cur?.importiertAusMannschaftId && byId.has(cur.importiertAusMannschaftId) && !gesehen.has(cur._id)) {
      gesehen.add(cur._id);
      cur = byId.get(cur.importiertAusMannschaftId);
    }
    return cur ? cur._id : id;
  };
  // Wurzel-Mannschaft -> Mannschaft im Anzeige-Turnier (die die Tabellenzeile stellt).
  const wurzelZuAnzeige = new Map<string, string>();
  for (const m of anzeigeMannschaften) {
    wurzelZuAnzeige.set(wurzel(m._id), m._id);
  }
  const abbilden = (id: string): string => wurzelZuAnzeige.get(wurzel(id)) ?? id;
  const abgebildeteSpiele = alleSpiele.map((s) => ({
    ...s,
    mannschaftAId: abbilden(s.mannschaftAId),
    mannschaftBId: abbilden(s.mannschaftBId),
  }));
  return berechneTabelle(anzeigeTurnier, anzeigeMannschaften, abgebildeteSpiele);
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

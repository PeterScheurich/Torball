/**
 * Plausibilitaetspruefung der Regelwerte (Turnier und Standardregeln). Die Turnier-Routen haben kein
 * Body-Schema fuer die Regelfelder (unbekannte Felder laufen durch, siehe CLAUDE.md), deshalb prueft diese
 * Funktion von Hand. Bis dahin liess sich eine Spielzeit von -5 Minuten, 0 Halbzeiten oder "viele" Punkte
 * je Sieg speichern - der Spielplan und die Tabelle rechneten danach mit Unsinn (Simulationslauf 2026-11-01).
 * Die Grenzen sind bewusst weit: sie fangen Tippfehler und kaputte Eingaben ab, keine ungewoehnlichen Regeln.
 */
const GRENZEN: Record<string, { min: number; max: number; label: string }> = {
  spielzeitMinuten: { min: 1, max: 90, label: "Spielzeit" },
  anzahlHalbzeiten: { min: 1, max: 4, label: "Anzahl der Halbzeiten" },
  pauseMinuten: { min: 0, max: 60, label: "Halbzeitpause" },
  pauseZwischenSpielenMinuten: { min: 0, max: 180, label: "Pause zwischen den Spielen" },
  timeoutsJeHalbzeit: { min: 0, max: 10, label: "Auszeiten je Halbzeit" },
  timeoutDauerSekunden: { min: 0, max: 600, label: "Dauer einer Auszeit" },
  auswechslungenJeHalbzeit: { min: 0, max: 50, label: "Auswechslungen je Halbzeit" },
  tordifferenzLimit: { min: 1, max: 99, label: "Tordifferenz-Limit" },
  maxSehendeSpieler: { min: 0, max: 20, label: "Sehende Spieler" },
  maxSpielerJeMannschaft: { min: 1, max: 50, label: "Spieler je Mannschaft" },
  punkteSieg: { min: -10, max: 100, label: "Punkte für einen Sieg" },
  punkteUnentschieden: { min: -10, max: 100, label: "Punkte für ein Unentschieden" },
  punkteNiederlage: { min: -10, max: 100, label: "Punkte für eine Niederlage" },
};

/** Liefert eine Fehlermeldung (fuer 400) oder `undefined`. Fehlende, `null` oder `undefined` Werte werden uebersprungen. */
export function pruefeRegelWerte(body: object): string | undefined {
  const w = body as Record<string, unknown>;
  for (const [feld, g] of Object.entries(GRENZEN)) {
    const wert = w[feld];
    if (wert === undefined || wert === null) continue;
    if (typeof wert !== "number" || !Number.isInteger(wert)) return `${g.label}: bitte eine ganze Zahl angeben.`;
    if (wert < g.min || wert > g.max) return `${g.label}: der Wert muss zwischen ${g.min} und ${g.max} liegen.`;
  }
  const forfait = w.forfaitErgebnis;
  if (forfait !== undefined && forfait !== null && (typeof forfait !== "string" || !/^\d{1,2}:\d{1,2}$/.test(forfait))) {
    return 'Ergebnis bei Nichtantreten: bitte im Format "3:0" angeben.';
  }
  return undefined;
}

/**
 * Regelfelder, die eine AELTERE gespeicherte Systemkonfiguration noch nicht kennt (spaeter hinzugekommene
 * Felder wie `pauseZwischenSpielenMinuten`), kommen aus den fest verdrahteten Standardregeln. Ohne das
 * erbte jedes neue Turnier `undefined` - die Spiele liefen dann ohne Pause zwischen den Spielen (12 statt
 * 25 Minuten je Slot), ohne dass es jemandem aufgefallen waere (Simulationslauf 2026-11-01).
 */
export function fuelleFehlendeAuf<T extends object>(regeln: T, standard: T): T {
  const ergebnis: Record<string, unknown> = { ...(standard as Record<string, unknown>) };
  for (const [feld, wert] of Object.entries(regeln)) if (wert !== undefined) ergebnis[feld] = wert;
  return ergebnis as T;
}

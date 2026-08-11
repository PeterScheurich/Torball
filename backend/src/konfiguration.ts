import type { Systemkonfiguration, TabellenKriterium, Turnierregeln } from "@torball/shared";
import { findAllBySelector } from "./repository";

/**
 * Fest verdrahtete Ausgangs-Standardregeln (Gesamtspezifikation Abschnitt 20.5). Dienen als
 * Fallback, solange noch keine Systemkonfiguration angelegt wurde, und als Startwerte beim
 * erstmaligen Anlegen einer Systemkonfiguration. Bewusst hier im Backend (nicht in `shared`):
 * `shared` ist CommonJS, das Frontend koennte daraus nur Typen, keine Laufzeit-Konstante ziehen.
 */
const STANDARD_TABELLEN_KRITERIEN: TabellenKriterium[] = [
  "punkte",
  "tordifferenz",
  "tore",
  "direkter_vergleich",
  "freiwuerfe",
];

export const STANDARD_TURNIERREGELN: Turnierregeln = {
  spielzeitMinuten: 5,
  anzahlHalbzeiten: 2,
  pauseMinuten: 2,
  seitenwechsel: true,
  timeoutsJeHalbzeit: 1,
  timeoutDauerSekunden: 30,
  auswechslungenJeHalbzeit: 3,
  tordifferenzAbbruch: true,
  tordifferenzLimit: 10,
  verlaengerungAktiv: true,
  silbernesTor: true,
  maxSehendeSpieler: 1,
  einstelligeTrikotnummern: true,
  punkteSieg: 2,
  punkteUnentschieden: 1,
  punkteNiederlage: 0,
  tabellenKriterien: STANDARD_TABELLEN_KRITERIEN,
};

/** Die Namen aller Regelfelder - fuer das Herauskopieren aus einem Turnier/einer Konfiguration. */
const REGEL_FELDER = Object.keys(STANDARD_TURNIERREGELN) as (keyof Turnierregeln)[];

/** Extrahiert nur die Regelfelder aus einem Objekt, das sie (unter anderem) enthaelt. */
export function nurRegeln(quelle: Turnierregeln): Turnierregeln {
  const regeln: Record<string, unknown> = {};
  for (const feld of REGEL_FELDER) {
    regeln[feld] = quelle[feld];
  }
  return regeln as unknown as Turnierregeln;
}

/** Die aktuell gueltige Systemkonfiguration (genau ein Datensatz mit istAktuell=true), falls vorhanden. */
export async function aktuelleSystemkonfiguration(): Promise<Systemkonfiguration | undefined> {
  const treffer = await findAllBySelector<Systemkonfiguration>({
    docType: "systemkonfiguration",
    istAktuell: true,
  });
  return treffer[0];
}

/**
 * Die aktuell als Standard gueltigen Turnierregeln: aus der aktuellen Systemkonfiguration, sonst
 * die fest verdrahteten Standardregeln. Zusaetzlich die Version (fuer Turnier.erstelltMitKonfigVersion).
 */
export async function aktuelleTurnierregeln(): Promise<{ regeln: Turnierregeln; version?: number }> {
  const konfig = await aktuelleSystemkonfiguration();
  if (!konfig) return { regeln: STANDARD_TURNIERREGELN };
  return { regeln: nurRegeln(konfig), version: konfig.version };
}

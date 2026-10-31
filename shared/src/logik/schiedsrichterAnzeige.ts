import type { SchiedsrichterAnzeigeOptionen } from "../types";

/**
 * Welche Zusatzelemente die Anzeige am Spielfeld (zweiter Bildschirm fuer den Schiedsrichter) zeigt.
 * Spielstand und Foulzaehler sind bewusst NICHT abschaltbar (Nutzer-Vorgabe 31.10.2026: so wie die
 * Tafel auf dem Protokollantentisch) - alles hier ist optional und je Turnier einstellbar.
 *
 * Eine Liste statt einzelner Konstanten, damit Oberflaeche, Pruefung im Backend und die Anzeige
 * selbst dieselbe Quelle benutzen: ein neues Element ist eine Zeile hier plus eine Stelle in der
 * Anzeige.
 */
export const SCHIEDSRICHTER_ANZEIGE_ELEMENTE: ReadonlyArray<{
  schluessel: keyof SchiedsrichterAnzeigeOptionen;
  bezeichnung: string;
}> = [
  { schluessel: "restzeit", bezeichnung: "Restzeit" },
  { schluessel: "auszeiten", bezeichnung: "Auszeiten je Mannschaft" },
  { schluessel: "wurfzaehler", bezeichnung: "Wurfzähler (ab dem 3. Wurf in Folge)" },
  { schluessel: "achtSekunden", bezeichnung: "8-Sekunden-Anzeige (nach Wurf und Kontrolle)" },
  { schluessel: "strafwurf", bezeichnung: "Strafwurf und Penalty (mit 8-Sekunden-Anzeige für den Werfer)" },
];

/** Fehlt ein Wert (oder das ganze Objekt, wie bei bestehenden Turnieren), ist das Element sichtbar. */
export function schiedsrichterAnzeigeOptionen(
  gespeichert: SchiedsrichterAnzeigeOptionen | undefined,
): Required<SchiedsrichterAnzeigeOptionen> {
  const ergebnis = {} as Required<SchiedsrichterAnzeigeOptionen>;
  for (const { schluessel } of SCHIEDSRICHTER_ANZEIGE_ELEMENTE) {
    ergebnis[schluessel] = gespeichert?.[schluessel] !== false;
  }
  return ergebnis;
}

/**
 * Prueft einen Wert aus einer Anfrage: ein Objekt, dessen Schluessel alle bekannt und deren Werte
 * Wahrheitswerte sind. Liefert die Fehlermeldung oder `undefined`, wenn alles in Ordnung ist.
 */
export function pruefeSchiedsrichterAnzeige(wert: unknown): string | undefined {
  if (typeof wert !== "object" || wert === null || Array.isArray(wert)) {
    return "Die Einstellung der Schiedsrichter-Anzeige muss ein Objekt sein.";
  }
  const bekannt = new Set<string>(SCHIEDSRICHTER_ANZEIGE_ELEMENTE.map((e) => e.schluessel));
  for (const [schluessel, v] of Object.entries(wert)) {
    if (!bekannt.has(schluessel)) return `Unbekanntes Element der Schiedsrichter-Anzeige: ${schluessel}.`;
    if (typeof v !== "boolean") return `Das Element „${schluessel}“ muss ein Wahrheitswert sein.`;
  }
  return undefined;
}

/**
 * Datum/Uhrzeit-Anzeige folgt den Systemeinstellungen des Geraets (kein festes
 * Locale wie "de-DE"): `undefined` als Locale-Parameter laesst den Browser die
 * eigene Spracheinstellung verwenden.
 */
export function formatiereDatum(datumIso: string): string {
  const [jahr, monat, tag] = datumIso.split("-").map(Number);
  // Explizit 2-stellig statt dem Locale-Default (das laesst bei manchen Systemeinstellungen
  // fuehrende Nullen weg, z.B. "5.1.2026") - Reihenfolge/Trennzeichen bleiben systemabhaengig.
  return new Date(jahr, monat - 1, tag).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Formatiert einen Zeitstempel als Uhrzeit (Stunde:Minute, systemabhaengig); "–" ohne Wert. */
export function formatiereUhrzeit(zeitstempelIso: string | undefined): string {
  if (!zeitstempelIso) return "–";
  return new Date(zeitstempelIso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Voll-ISO-Zeitstempel (Datum + Uhrzeit, 2-stellig, systemabhaengig) - anders als
 *  formatiereDatum() fuer echte Zeitstempel gedacht (erstelltAm, letzterKontaktAm, ...), nicht fuer
 *  reine Datumsfelder (YYYY-MM-DD ohne Uhrzeitanteil). */
export function formatiereZeitstempel(zeitstempelIso: string): string {
  return new Date(zeitstempelIso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

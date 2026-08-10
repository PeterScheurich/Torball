/**
 * Datum/Uhrzeit-Anzeige folgt den Systemeinstellungen des Geraets (kein festes
 * Locale wie "de-DE"): `undefined` als Locale-Parameter laesst den Browser die
 * eigene Spracheinstellung verwenden.
 */
export function formatiereDatum(datumIso: string): string {
  const [jahr, monat, tag] = datumIso.split("-").map(Number);
  return new Date(jahr, monat - 1, tag).toLocaleDateString();
}

export function formatiereUhrzeit(zeitstempelIso: string | undefined): string {
  if (!zeitstempelIso) return "–";
  return new Date(zeitstempelIso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

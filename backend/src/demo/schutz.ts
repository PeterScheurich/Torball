/**
 * Gemeinsamer Schutzschalter fuer alle Demo-Werkzeuge (Beispieldaten-Erzeugung + Snapshot/Restore).
 * Bewusst ein einziges Flag statt mehrerer, damit es an genau einer Stelle im laufenden Betrieb
 * gesetzt wird (deploy/demo-snapshot-einrichten.sh) und niemals versehentlich gegen die
 * Produktivdatenbank ausgefuehrt werden kann - diese Befehle loeschen/ersetzen ganze Datenbestaende.
 */
export function pruefeDemoErlaubt(): void {
  if (process.env.DEMO_SNAPSHOT_ERLAUBT !== "true") {
    throw new Error(
      'Demo-Werkzeuge sind deaktiviert (DEMO_SNAPSHOT_ERLAUBT ist nicht "true" in backend/.env) - ' +
        "nur fuer die Demo-Instanz gedacht, niemals gegen Produktivdaten ausfuehren.",
    );
  }
}

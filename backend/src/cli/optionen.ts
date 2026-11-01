export type Optionen = Record<string, string>;

/**
 * --schluessel=wert und Schalter ohne Wert (--ersetzen, --ueberschreiben). Ein Schalter steht danach mit leerem Wert in
 * den Optionen; die Befehle pruefen ihn mit `"name" in optionen`. Frueher wurden Schalter ohne "=" stillschweigend
 * verworfen - `demo:beispieldaten --ersetzen` und `sicherung:einspielen --ueberschreiben` taten dadurch nichts.
 * Keine Bibliothek noetig.
 */
export function parseOptionen(argv: string[]): Optionen {
  const optionen: Optionen = {};
  for (const arg of argv) {
    const mitWert = /^--([^=]+)=(.*)$/.exec(arg);
    if (mitWert) {
      optionen[mitWert[1]] = mitWert[2];
      continue;
    }
    const schalter = /^--([^=]+)$/.exec(arg);
    if (schalter) optionen[schalter[1]] = "";
  }
  return optionen;
}

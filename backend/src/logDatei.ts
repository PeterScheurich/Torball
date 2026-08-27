import fs from "node:fs";
import path from "node:path";

/**
 * Zusaetzliche Ausgabe der Server-Protokollierung in eine Datei.
 *
 * Warum (Nutzer-Vorgabe 26.08.2026): Der Server schrieb ausschliesslich auf den Bildschirm - und
 * dieses Fenster laeuft bei der lokalen Installation absichtlich minimiert. Wurde es geschlossen
 * oder der Rechner neu gestartet, war jede Spur weg. Bei einer Rueckmeldung aus dem Betrieb
 * ("es hat gestern nicht funktioniert") gab es damit nichts zum Nachsehen.
 *
 * Bewusst ueber die Umgebungsvariable LOG_DATEI gesteuert und standardmaessig AUS: Auf dem
 * Debian-Server faengt systemd die Bildschirmausgabe ohnehin im Journal auf, dort waere eine
 * zweite Datei nur Ballast. Der Windows-Installer setzt den Wert dagegen.
 */

/** Ab dieser Groesse wird beim naechsten Start umbenannt (eine Vorgaenger-Generation bleibt). */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Haelt die Datei klein: Beim Start wird eine zu grosse Datei zur ".1" umbenannt, eine aeltere
 * ".1" faellt dabei weg. Bewusst nur beim Start und nicht laufend - der Server wird bei der
 * lokalen Installation ohnehin je Sitzung frisch gestartet, und eine Rotation im laufenden
 * Betrieb muesste den offenen Schreibstrom umhaengen (mehr Teile, die klemmen koennen).
 */
function rotiereWennZuGross(pfad: string): void {
  try {
    if (fs.statSync(pfad).size <= MAX_BYTES) return;
    fs.rmSync(`${pfad}.1`, { force: true });
    fs.renameSync(pfad, `${pfad}.1`);
  } catch {
    /* Datei existiert noch nicht - nichts zu tun. */
  }
}

/**
 * Liefert ein Ausgabeziel fuer den Logger, das jede Zeile GLEICHZEITIG auf die Konsole und in
 * die Datei schreibt - das Server-Fenster bleibt also unveraendert nutzbar.
 *
 * Gibt `undefined` zurueck, wenn keine Datei konfiguriert ist oder sie sich nicht oeffnen laesst
 * (fehlende Rechte, voller Datentraeger). Ein Protokollierungsproblem darf den Server nie am
 * Starten hindern - dann eben nur Konsole wie bisher.
 */
export function logZiel(): { write(zeile: string): void } | undefined {
  const pfad = process.env.LOG_DATEI?.trim();
  if (!pfad) return undefined;

  try {
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    rotiereWennZuGross(pfad);
    const datei = fs.createWriteStream(pfad, { flags: "a" });
    datei.on("error", (fehler) => console.error("Schreiben der Logdatei fehlgeschlagen:", fehler));
    return {
      write(zeile: string) {
        process.stdout.write(zeile);
        datei.write(zeile);
      },
    };
  } catch (fehler) {
    console.error(`Logdatei "${pfad}" konnte nicht geoeffnet werden - es wird nur auf die Konsole geschrieben.`, fehler);
    return undefined;
  }
}

/** Die letzten Zeilen der Logdatei - fuer den Diagnose-Bericht (siehe cli/torball.ts). */
export function letzteLogZeilen(anzahl: number): string[] {
  const pfad = process.env.LOG_DATEI?.trim();
  if (!pfad) return [];
  try {
    const zeilen = fs.readFileSync(pfad, "utf8").split(/\r?\n/).filter(Boolean);
    return zeilen.slice(-anzahl);
  } catch {
    return [];
  }
}

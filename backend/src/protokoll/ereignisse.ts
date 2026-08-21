import type { Event, Mannschaftsseite } from "@torball/shared";

/**
 * Reine Event-Auswertung der digitalen Protokollierung (Abschnitt 22, Design:
 * docs/digitales-protokoll-konzept.md Abschnitt 3/4). Bewusst OHNE Datenbankzugriff, damit sie im
 * normalen `npm test` laeuft. Der Server braucht aus dem Event-Strom nur das Ergebnis (Tore je
 * Seite) - der vollstaendige Live-Zustand (Uhr, Timer, Zaehler, Feldbesetzung) wird
 * ausschliesslich im Frontend berechnet (frontend/src/protokoll/stand.ts), weil alle
 * Spez.-Pruefungen Warnungen sind, keine Blockaden. Die Annullierungs-Logik hier und dort muss
 * inhaltlich uebereinstimmen (kleines, bewusstes Duplikat - CommonJS-Regel, siehe CLAUDE.md).
 */

/** Nach der server-vergebenen Sequenz sortierte Kopie (aelteste zuerst). Tie-Break ueber
 *  Zeitstempel + _id: zwei praktisch gleichzeitige Requests koennen dieselbe Sequenz erwischt
 *  haben (kein CouchDB-Konflikt, da verschiedene _ids) - die Reihenfolge bleibt so trotzdem
 *  ueberall deterministisch gleich. */
export function sortiertNachSequenz(events: Event[]): Event[] {
  return [...events].sort(
    (a, b) => a.sequenz - b.sequenz || a.zeitstempel.localeCompare(b.zeitstempel) || a._id.localeCompare(b._id),
  );
}

/**
 * Filtert annullierte Events heraus (Korrektur-Semantik, Konzept Abschnitt 3.1):
 * - Ein Korrektur-Event (istKorrektur + korrigiertEventId) annulliert das referenzierte Event.
 * - Ausnahme PROT: eine Nicht-ANNULLIERT-Korrektur auf ein PROT-Event ist eine ERGAENZUNG
 *   (Turnierleitungs-Entscheidung) - das PROT-Event bleibt wirksam.
 * - Ein annulliertes Korrektur-Event annulliert selbst nichts mehr (Korrektur der Korrektur
 *   laesst das urspruengliche Event wieder aufleben).
 * - eventTyp "ANNULLIERT" (ersatzlose Streichung) zaehlt selbst nie als Ereignis und fehlt
 *   deshalb auch im Ergebnis dieser Funktion; jede andere Korrektur zaehlt als Ersatz normal.
 *
 * Korrekturen referenzieren immer ein aelteres Event (der Server prueft das beim Anhaengen) -
 * die Rueckwaerts-Iteration reicht deshalb, um den Annullierungs-Status aufzuloesen.
 */
export function wirksameEvents(events: Event[]): Event[] {
  const sortiert = sortiertNachSequenz(events);
  const proId = new Map(sortiert.map((e) => [e._id, e]));
  const annulliert = new Set<string>();

  for (let i = sortiert.length - 1; i >= 0; i--) {
    const e = sortiert[i];
    if (annulliert.has(e._id)) continue;
    if (!e.istKorrektur || !e.korrigiertEventId) continue;
    const ziel = proId.get(e.korrigiertEventId);
    if (!ziel) continue;
    if (ziel.eventTyp === "PROT" && e.eventTyp !== "ANNULLIERT") continue; // Ergaenzung
    annulliert.add(ziel._id);
  }

  return sortiert.filter((e) => !annulliert.has(e._id) && e.eventTyp !== "ANNULLIERT");
}

export function gegenseite(seite: Mannschaftsseite): Mannschaftsseite {
  return seite === "A" ? "B" : "A";
}

/**
 * Ergebnis (Tore je Seite) aus dem Event-Strom: wirksame G-Events zaehlen; beim Eigentor
 * (istEigentor) benennt `mannschaft` die handelnde Mannschaft, die Gutschrift geht an die
 * Gegenseite (Spez. 6.10). G-Events ohne Mannschaftsangabe werden ignoriert (technisch
 * unvollstaendig - der Server nimmt sie gar nicht erst an).
 */
export function ergebnisAusEvents(events: Event[]): { ergebnisA: number; ergebnisB: number } {
  let ergebnisA = 0;
  let ergebnisB = 0;
  for (const e of wirksameEvents(events)) {
    if (e.eventTyp !== "G" || !e.mannschaft) continue;
    const gutschrift = e.istEigentor ? gegenseite(e.mannschaft) : e.mannschaft;
    if (gutschrift === "A") ergebnisA++;
    else ergebnisB++;
  }
  return { ergebnisA, ergebnisB };
}

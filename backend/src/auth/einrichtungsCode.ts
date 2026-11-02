import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Einrichtungs-Code fuer die Ersteinrichtung im Browser (Auftraggeber, 02.11.2026). Auf einem Server, der schon aus dem
 * Internet erreichbar ist, aber noch kein Konto hat, koennte sonst jede Person zuerst "Ersteinrichtung starten" druecken
 * und Admin werden. Das Deploy-Skript erzeugt deshalb beim ersten Deploy einen Zufallscode (ERSTEINRICHTUNGS_CODE in
 * backend/.env) und zeigt ihn im Terminal; die Ersteinrichtung verlangt ihn. Ohne gesetzten Code (Entwicklung, lokale
 * Installation - dort legt der Installer das Konto selbst an) gilt die Ersteinrichtung wie bisher.
 */

/** Gross-/Kleinschreibung, Bindestriche und Leerzeichen sind beim Abtippen egal. */
export function normalisiereEinrichtungsCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Der konfigurierte Code oder undefined, wenn keiner gesetzt ist. Wird bei jeder Anfrage frisch gelesen. */
export function konfigurierterEinrichtungsCode(): string | undefined {
  const roh = process.env.ERSTEINRICHTUNGS_CODE?.trim();
  return roh ? roh : undefined;
}

/** Zeitkonstanter Vergleich (ueber Hashes gleicher Laenge, damit auch die Laenge nichts verraet). */
export function einrichtungsCodeStimmt(eingabe: string | undefined, erwartet: string): boolean {
  const hash = (s: string) => createHash("sha256").update(normalisiereEinrichtungsCode(s)).digest();
  return timingSafeEqual(hash(eingabe ?? ""), hash(erwartet));
}

import type { KanbanKarte, MailNachricht } from "@torball/shared";
import type { Klassifikationsergebnis } from "./klassifikation";

// Reine Transformationslogik aus mail/bericht.ts, bewusst in einem eigenen Modul OHNE Import von
// repository.ts/db.ts - so bleibt sie ohne CouchDB-Konfiguration testbar (siehe
// mail/bericht.test.ts; ein direkter Import von bericht.ts wuerde transitiv db.ts nach sich
// ziehen, das ohne COUCHDB_*-Umgebungsvariablen beim Modul-Load hart wirft).

/** Naechste freie Reihenfolge am Ende der Spalte "offen" (gleiche Logik wie routes/kanban.ts). */
export function naechsteReihenfolgeOffen(karten: KanbanKarte[]): number {
  const inSpalte = karten.filter((k) => k.spalte === "offen");
  if (inSpalte.length === 0) return 0;
  return Math.max(...inSpalte.map((k) => k.reihenfolge)) + 1;
}

export function kanbanKategorieFuer(ergebnis: Klassifikationsergebnis): KanbanKarte["kategorie"] {
  return ergebnis.kategorie === "fehlermeldung" ? "bug" : "wunsch";
}

/** Aufbewahrungsfrist (Nutzer-Vorgabe): erledigte/ignorierte Mails duerfen danach automatisch
 *  geraeumt werden - die Ursprungsmail bleibt im echten Postfach erhalten (siehe MailNachricht-
 *  Dokumentation), hier geht nur die lokale Kopie/Klassifikation verloren. */
export const AUFBEWAHRUNG_TAGE = 7;

/** Ob eine Mail die Aufbewahrungsfrist ueberschritten hat: nur erledigte/ignorierte Mails
 *  veralten ueberhaupt (ein "offener" Eintrag bleibt unbegrenzt liegen), gemessen ab dem
 *  letzten aktualisiertAm - das faellt fuer eine bereits klassifizierte Mail mit dem Zeitpunkt
 *  zusammen, an dem der manuelle Status gesetzt wurde (siehe PUT /mail-postfach/nachrichten/:id). */
export function istVeraltet(mail: MailNachricht, jetzt: Date): boolean {
  if (!mail.manuellerStatus) return false;
  const alterMs = jetzt.getTime() - new Date(mail.aktualisiertAm).getTime();
  return alterMs >= AUFBEWAHRUNG_TAGE * 24 * 60 * 60 * 1000;
}

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

/** Fallback, solange in den Mail-Postfach-Einstellungen (Oberflaeche, MailPostfachEinstellungen.
 *  aufbewahrungTage) noch kein eigener Wert hinterlegt ist - z.B. bei einem Dokument von vor der
 *  Einfuehrung dieses Felds. Die Frist selbst ist also konfigurierbar (Nutzer-Vorgabe), dieser
 *  Wert ist nur der Ausgangswert dafuer. */
export const STANDARD_AUFBEWAHRUNG_TAGE = 7;

/** Ob eine Mail die Aufbewahrungsfrist (aufbewahrungTage Tage) ueberschritten hat: nur Mails mit
 *  gesetztem manuellerStatus (erledigt/ignoriert/kanban) veralten ueberhaupt (ein "offener"
 *  Eintrag bleibt unbegrenzt liegen), gemessen ab dem letzten aktualisiertAm - das faellt fuer
 *  eine bereits klassifizierte Mail mit dem Zeitpunkt zusammen, an dem der Status gesetzt wurde
 *  (manuell ueber PUT /mail-postfach/nachrichten/:id oder automatisch beim Anlegen einer
 *  Kanban-Karte, siehe mail/bericht.ts). Die Ursprungsmail bleibt im echten Postfach erhalten
 *  (siehe MailNachricht-Dokumentation), hier geht nur die lokale Kopie/Klassifikation verloren. */
export function istVeraltet(mail: MailNachricht, jetzt: Date, aufbewahrungTage: number): boolean {
  if (!mail.manuellerStatus) return false;
  const alterMs = jetzt.getTime() - new Date(mail.aktualisiertAm).getTime();
  return alterMs >= aufbewahrungTage * 24 * 60 * 60 * 1000;
}

import type { KanbanKarte } from "@torball/shared";
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

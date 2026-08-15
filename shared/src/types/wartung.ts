import { BenutzerId, CouchMeta, Zeitstempel } from "./common";

/**
 * Wartungsmodus (Singleton-Dokument, feste ID - siehe backend/src/wartung.ts). Zwei bewusst
 * unabhaengige, manuell gesetzte Schalter statt einer Automatik: die Ankuendigung (Zeitfenster,
 * fuer einen Warnhinweis vorab) und die tatsaechliche Sperre (`aktiv`), die die Turnierleitung
 * genau dann umlegt, wenn die Wartung wirklich beginnt/endet.
 */
export interface Wartung extends CouchMeta {
  docType: "wartung";
  /** Sperrt waehrend true die gesamte App (Frontend + Backend) fuer alle ausser Admins - Admins
   *  bleiben ausgenommen, sonst koennte niemand mehr den Schalter zurueckdrehen. */
  aktiv: boolean;
  /** Angekuendigtes Zeitfenster, nur fuer den Warnhinweis auf der Startseite bzw. den
   *  Kurzfristhinweis fuer angemeldete Personen - loest fuer sich genommen KEINE Sperre aus. */
  angekuendigtAb?: Zeitstempel;
  angekuendigtBis?: Zeitstempel;
  geaendertVon?: BenutzerId;
  geaendertAm?: Zeitstempel;
}

/** Oeffentliche Sicht auf Wartung (ohne CouchDB-/Audit-Metadaten) - bewusst komplett unkritisch,
 *  daher ohne Filterung ueber GET /wartung/status abrufbar (auch fuer nicht angemeldete Besucher,
 *  die den Warnhinweis auf der Startseite sehen sollen). */
export interface WartungStatus {
  aktiv: boolean;
  angekuendigtAb?: Zeitstempel;
  angekuendigtBis?: Zeitstempel;
}

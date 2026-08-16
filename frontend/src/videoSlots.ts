export interface VideoSlot {
  schluessel: string;
  label: string;
  beschreibung: string;
}

/** Fester Schluessel fuer das Einfuehrungsvideo auf der oeffentlichen Gaeste-Startseite -
 *  eigene Konstante statt eines Literals an beiden Verwendungsstellen (Admin-Formular +
 *  OeffentlicheStartseitePage), damit ein Tippfehler nicht stillschweigend die Zuordnung kappt. */
export const VIDEO_SLOT_STARTSEITE_INTRO = "startseite-intro";

/** Bekannte Einbindungsstellen fuer konfigurierbare Video-URLs (Admin -> Systemeinstellungen).
 *  Eine neue Einbindungsstelle braucht nur einen neuen Eintrag hier (erscheint dann automatisch
 *  als Zeile im Admin-Formular) plus die passende Stelle im UI, die ihre URL per `schluessel`
 *  nachschlaegt (siehe getOeffentlicheVideos in api.ts) - keine weiteren Schema-/Typ-Aenderungen
 *  noetig, die Speicherung ist bereits ein generisches Array. */
export const VIDEO_SLOTS: VideoSlot[] = [
  {
    schluessel: VIDEO_SLOT_STARTSEITE_INTRO,
    label: "Einführungsvideo (öffentliche Startseite)",
    beschreibung: "Erscheint oben rechts auf der öffentlichen Gäste-Startseite (/), neben Titel und Text.",
  },
];

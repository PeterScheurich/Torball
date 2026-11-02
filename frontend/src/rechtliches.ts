/**
 * Angaben fuer Impressum und Datenschutzerklaerung - vom Betreiber auszufuellen (bewusst NICHT von der KI vorbelegt, siehe auch
 * entwicklerKontakt.ts). Die Seiten /impressum und /datenschutz lesen nur diese Datei. VOR dem Ausrollen auf eine oeffentlich
 * erreichbare Instanz pruefen:
 *  - anschrift: ladungsfaehige Anschrift (Zeilen). Leer = die Seite weist sichtbar darauf hin, dass die Angabe noch fehlt.
 *  - logAufbewahrungTage: wie lange Server-Protokolle (mit IP-Adressen) hoechstens aufbewahrt werden. Die Zahl darf nur stehen,
 *    wenn der Server tatsaechlich so eingestellt ist (journald MaxRetentionSec, nginx logrotate) - sonst steht in der Erklaerung
 *    etwas Falsches.
 *  - aufsichtsbehoerde: zustaendige Datenschutz-Aufsichtsbehoerde (nach dem Wohnsitz bzw. Sitz des Verantwortlichen).
 *  - entwurf: solange true, zeigen Impressum und Datenschutzerklaerung oben einen sichtbaren Entwurfshinweis. Erst auf false
 *    setzen, wenn Anschrift, Fristen und Texte geprueft sind (ggf. rechtlich).
 *  - mailVersandAnbieter: wer die E-Mails technisch versendet (Mail-Server aus den Systemeinstellungen), leer = allgemeiner Satz.
 */
export const BETREIBER = {
  entwurf: true,
  stand: "02.11.2026",
  name: "Peter Scheurich",
  anschrift: [] as string[],
  email: "software@blindentorball.de",
  telefon: "",
  logAufbewahrungTage: 14,
  aufsichtsbehoerde: "Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg (www.baden-wuerttemberg.datenschutz.de)",
  mailVersandAnbieter: "",
};

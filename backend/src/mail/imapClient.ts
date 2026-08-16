import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { MailAnhang } from "@torball/shared";

// IMAP-Abruf des zentralen Feedback-Postfachs. Die Zugangsdaten kommen als Parameter (aus den
// per Oberflaeche gepflegten MailPostfachEinstellungen, siehe mail/postfach.ts) - bewusst NICHT
// aus process.env, das Feature ist komplett .env-frei konfigurierbar.

export interface ImapVerbindung {
  host: string;
  port?: number;
  user: string;
  passwort: string;
}

export interface AbgerufeneMail {
  imapUid: number;
  von: string;
  betreff: string;
  empfangenAm: string;
  text: string;
  anhaenge: MailAnhang[];
}

/** Textlaenge pro Mail begrenzen (Speicher in CouchDB + Prompt-Groesse bei der KI-Klassifikation). */
const MAX_TEXTLAENGE = 20_000;

/** Anhaenge einer Mail duerfen in Summe hoechstens so gross sein (Base64-kodiert direkt am
 *  MailNachricht-Dokument gespeichert, analog Turnier.logoDataUrl) - schuetzt vor unnoetigem
 *  Aufblaehen der CouchDB durch grosse Anhaenge/Spam. Passt ein Anhang nicht mehr hinein, wird er
 *  uebersprungen (kleinere, noch passende Anhaenge derselben Mail bleiben erhalten), nicht die
 *  ganze Mail verworfen. */
const MAX_ANHANG_GESAMT_BYTES = 5 * 1024 * 1024;

/** Nur echte Anhaenge (contentDisposition "attachment"), keine inline eingebetteten Bilder aus
 *  Signaturen o.ae. (contentDisposition "inline") - das waere fuer die Fehlerbericht-Auswertung
 *  nur Rauschen. */
function baueAnhaenge(geparst: ParsedMail): MailAnhang[] {
  const anhaenge: MailAnhang[] = [];
  let summe = 0;
  for (const a of geparst.attachments ?? []) {
    if (a.contentDisposition !== "attachment") continue;
    if (summe + a.size > MAX_ANHANG_GESAMT_BYTES) continue;
    summe += a.size;
    anhaenge.push({
      dateiname: a.filename ?? "anhang",
      contentType: a.contentType,
      dataUrl: `data:${a.contentType};base64,${a.content.toString("base64")}`,
    });
  }
  return anhaenge;
}

function baueClient(verbindung: ImapVerbindung): ImapFlow {
  return new ImapFlow({
    host: verbindung.host,
    port: verbindung.port || 993,
    secure: true,
    auth: { user: verbindung.user, pass: verbindung.passwort },
    logger: false,
  });
}

/** Verbindet sich nur kurz und trennt wieder - fuer den "Verbindung testen"-Knopf in den
 *  Einstellungen. Wirft mit einer Fehlermeldung, wenn Verbindung/Login fehlschlagen. */
export async function testeImapVerbindung(verbindung: ImapVerbindung): Promise<void> {
  const client = baueClient(verbindung);
  await client.connect();
  await client.logout();
}

/** Holt alle Mails mit einer hoeheren UID als `letzteUid` aus dem Posteingang (INBOX), aeltestes
 *  zuerst, und markiert sie dabei im selben IMAP-Aufruf als gelesen (\Seen) - der Berichtslauf
 *  hat die Mail damit "bearbeitet" (gelesen + zusammengefasst), unabhaengig davon, ob die
 *  anschliessende KI-Klassifikation gelingt (Nutzer-Vorgabe). Wirft, wenn die Verbindung
 *  fehlschlaegt. */
export async function holeNeueMails(letzteUid: number, verbindung: ImapVerbindung): Promise<AbgerufeneMail[]> {
  const client = baueClient(verbindung);

  const ergebnisse: AbgerufeneMail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const bereich = `${letzteUid + 1}:*`;
      for await (const nachricht of client.fetch(bereich, { uid: true, envelope: true, source: true }, { uid: true })) {
        // Ein UID-Bereich, der ueber die letzte Mail hinausgeht, liefert bei manchen Servern die
        // letzte vorhandene Mail erneut zurueck - sicherheitshalber nochmal filtern.
        if (nachricht.uid <= letzteUid || !nachricht.source) continue;
        const geparst = await simpleParser(nachricht.source);
        ergebnisse.push({
          imapUid: nachricht.uid,
          von: geparst.from?.text ?? "unbekannt",
          betreff: geparst.subject ?? "(kein Betreff)",
          empfangenAm: (geparst.date ?? new Date()).toISOString(),
          text: (geparst.text ?? "").slice(0, MAX_TEXTLAENGE),
          anhaenge: baueAnhaenge(geparst),
        });
      }
      if (ergebnisse.length > 0) {
        await client.messageFlagsAdd(
          ergebnisse.map((m) => m.imapUid),
          ["\\Seen"],
          { uid: true },
        );
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return ergebnisse.sort((a, b) => a.imapUid - b.imapUid);
}

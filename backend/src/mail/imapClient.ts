import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

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
}

/** Textlaenge pro Mail begrenzen (Speicher in CouchDB + Prompt-Groesse bei der KI-Klassifikation). */
const MAX_TEXTLAENGE = 20_000;

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
 *  zuerst. Wirft, wenn die Verbindung fehlschlaegt. */
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
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return ergebnisse.sort((a, b) => a.imapUid - b.imapUid);
}

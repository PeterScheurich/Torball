import nodemailer from "nodemailer";

// E-Mail-Versand (SMTP) fuer Einladungen und Passwort-Reset. Zugangsdaten kommen als Parameter
// (aus den per Oberflaeche gepflegten Systemeinstellungen, siehe ../systemeinstellungen.ts) -
// bewusst NICHT aus process.env, analog zum bereits .env-freien Mail-Postfach (imapClient.ts).

export interface SmtpVerbindung {
  host: string;
  port: number;
  user: string;
  passwort: string;
  absender?: string;
}

interface MailOptionen {
  an: string;
  betreff: string;
  text: string;
}

function baueTransporter(verbindung: SmtpVerbindung) {
  return nodemailer.createTransport({
    host: verbindung.host,
    port: verbindung.port,
    secure: verbindung.port === 465,
    auth: { user: verbindung.user, pass: verbindung.passwort },
  });
}

/** Verschickt eine Text-Mail. Wirft bei einem SMTP-Fehler (Aufrufer faengt das ab). */
export async function sendeMail(verbindung: SmtpVerbindung, optionen: MailOptionen): Promise<void> {
  await baueTransporter(verbindung).sendMail({
    from: verbindung.absender || verbindung.user,
    to: optionen.an,
    subject: optionen.betreff,
    text: optionen.text,
  });
}

/** Verbindet sich nur kurz und prueft Login/Erreichbarkeit - fuer den "Verbindung testen"-Knopf
 *  in den Systemeinstellungen. Wirft mit einer Fehlermeldung, wenn das fehlschlaegt. */
export async function testeSmtpVerbindung(verbindung: SmtpVerbindung): Promise<void> {
  await baueTransporter(verbindung).verify();
}

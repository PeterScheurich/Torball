import nodemailer, { type Transporter } from "nodemailer";

// E-Mail-Versand (SMTP) fuer Einladungen und Passwort-Reset. Komplett optional: ohne SMTP_*-
// Variablen fallen die Aufrufstellen auf die Link-in-der-Antwort-Loesung zurueck.
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;

/** Ohne diese Variablen fallen die Aufrufstellen (Einladung, Passwort-Reset) auf die alte Loesung zurueck (Link in der Antwort bzw. im Server-Log). */
export function mailKonfiguriert(): boolean {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASSWORD);
}

let transporter: Transporter | undefined;

/** Baut den Nodemailer-Transporter beim ersten Bedarf und cached ihn danach (Port 465 = TLS). */
function holeTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
  }
  return transporter;
}

interface MailOptionen {
  an: string;
  betreff: string;
  text: string;
}

/** Verschickt eine Text-Mail. Wirft, wenn SMTP nicht konfiguriert ist (Aufrufer faengt das ab). */
export async function sendeMail(optionen: MailOptionen): Promise<void> {
  if (!mailKonfiguriert()) {
    throw new Error("E-Mail-Versand ist nicht konfiguriert (SMTP_* fehlt in .env)");
  }
  await holeTransporter().sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: optionen.an,
    subject: optionen.betreff,
    text: optionen.text,
  });
}

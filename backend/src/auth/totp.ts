import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Torball-Turniere";

/** Abschnitt 21.5: TOTP-Secret fuer die 2FA-Einrichtung. Noch nicht aktiv, bis erfolgreich bestaetigt (siehe /benutzer/2fa/bestaetigen). */
export function erzeugeTotpSecret(): string {
  return generateSecret();
}

export function erzeugeOtpAuthUri(email: string, secret: string): string {
  return generateURI({ strategy: "totp", issuer: ISSUER, label: email, secret });
}

/** Fuer Nutzer ohne Kamerazugriff/App-Scan bleibt der Secret-Text ohnehin sichtbar - das QR-Bild ist nur eine zusaetzliche, rein visuelle Abkuerzung. */
export async function erzeugeQrCodeDataUri(otpAuthUri: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUri);
}

export async function totpCodeGueltig(secret: string, code: string): Promise<boolean> {
  const ergebnis = await verify({ secret, token: code });
  return ergebnis.valid;
}

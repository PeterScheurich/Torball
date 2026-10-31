import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Torball-Turniere";

/** Abschnitt 21.5: TOTP-Secret fuer die 2FA-Einrichtung. Noch nicht aktiv, bis erfolgreich bestaetigt (siehe /benutzer/2fa/bestaetigen). */
export function erzeugeTotpSecret(): string {
  return generateSecret();
}

/** Baut die otpauth://-URI (Issuer + E-Mail + Secret), die als QR-Code fuer die
 *  Authenticator-App codiert wird. */
export function erzeugeOtpAuthUri(email: string, secret: string): string {
  return generateURI({ strategy: "totp", issuer: ISSUER, label: email, secret });
}

/** Fuer Nutzer ohne Kamerazugriff/App-Scan bleibt der Secret-Text ohnehin sichtbar - das QR-Bild ist nur eine zusaetzliche, rein visuelle Abkuerzung. */
export async function erzeugeQrCodeDataUri(otpAuthUri: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUri);
}

export type TotpPruefung = { gueltig: true; zeitschritt: number } | { gueltig: false };

/**
 * Prueft einen Code und liefert den Zeitschritt, in dem er gilt. Mit `nachZeitschritt` werden Codes
 * aus diesem oder einem frueheren Schritt abgewiesen (Schutz vor Wiederverwendung): der Aufrufer
 * merkt sich den Zeitschritt des zuletzt angenommenen Codes und reicht ihn hier wieder herein.
 *
 * otplib wirft bei formal ungueltigen Codes (z.B. falsche Laenge) statt {valid:false} zurueckzugeben -
 * beides muss hier als "falscher Code" behandelt werden, nicht als Serverfehler.
 */
export async function pruefeTotpCode(secret: string, code: string, nachZeitschritt?: number): Promise<TotpPruefung> {
  try {
    const ergebnis = await verify({
      secret,
      token: code,
      ...(nachZeitschritt !== undefined ? { afterTimeStep: nachZeitschritt } : {}),
    });
    if (!ergebnis.valid) return { gueltig: false };
    // otplib liefert den Zeitschritt zur Laufzeit mit, fuehrt ihn aber nicht in allen Typdefinitionen.
    // Fehlt er trotzdem, wird er aus der Abweichung abgeleitet - nie ein Wert, der den Schutz aushebelt.
    const geliefert = (ergebnis as { timeStep?: unknown }).timeStep;
    const zeitschritt =
      typeof geliefert === "number" ? geliefert : Math.floor(Date.now() / 1000 / 30) + ergebnis.delta;
    return { gueltig: true, zeitschritt };
  } catch {
    return { gueltig: false };
  }
}

/** Nur "stimmt der Code?" - ohne Wiederverwendungsschutz (z. B. beim Bestaetigen der Einrichtung). */
export async function totpCodeGueltig(secret: string, code: string): Promise<boolean> {
  return (await pruefeTotpCode(secret, code)).gueltig;
}

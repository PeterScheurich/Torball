import type { Benutzer } from "@torball/shared";
import { aendereBenutzerAtomar } from "./benutzerAenderung";

/**
 * Brute-Force-Schutz: ab dieser Anzahl falscher Passwoerter in Folge greift eine ZEITBASIERTE
 * Login-Sperre (`loginKontoGesperrtBis`), keine dauerhafte Konto-Sperre mehr. Frueher wurde das
 * Konto nach 10 Fehlversuchen dauerhaft `gesperrt` - das war selbst ein DoS-Vektor: wer eine
 * E-Mail-Adresse kannte, konnte das zugehoerige Konto gezielt und dauerhaft aussperren (nur Admin/
 * Reset hob das auf). Jetzt kuehlt die Sperre nach kurzer Zeit von selbst wieder ab.
 */
export const FEHLVERSUCHE_SCHWELLE = 5;

/** Eskalierende Abkuehlzeit ab der Schwelle (in Millisekunden), gedeckelt bei 30 Minuten. Jeder
 *  weitere Fehlversuch verlaengert das Fenster - ein Brute-Force-Versuch wird so auf wenige
 *  Versuche pro (wachsendem) Zeitfenster gedrosselt, ein legitimer Nutzer wartet es einfach ab. */
export function abkuehlzeitMs(versuche: number): number {
  const minuten = Math.min(30, (versuche - FEHLVERSUCHE_SCHWELLE + 1) * 2);
  return minuten * 60 * 1000;
}

/** Liegt das Konto gerade in der Abkuehlzeit? */
export function inAbkuehlung(benutzer: Pick<Benutzer, "loginKontoGesperrtBis">): boolean {
  return Boolean(benutzer.loginKontoGesperrtBis && new Date(benutzer.loginKontoGesperrtBis).getTime() > Date.now());
}

/** Zaehlt einen gescheiterten Versuch (falsches Passwort ODER falscher 2FA-Code - beim Login wie bei
 *  der erneuten Bestaetigung sensibler Aktionen) und setzt ab der Schwelle die Abkuehlzeit. Atomar,
 *  damit auch gleichzeitig gesendete Versuche mitzaehlen. */
export async function registriereFehlversuch(benutzerId: string): Promise<void> {
  await aendereBenutzerAtomar(benutzerId, (b) => {
    const versuche = (b.fehlgeschlageneLoginVersuche ?? 0) + 1;
    return {
      ...b,
      fehlgeschlageneLoginVersuche: versuche,
      ...(versuche >= FEHLVERSUCHE_SCHWELLE
        ? { loginKontoGesperrtBis: new Date(Date.now() + abkuehlzeitMs(versuche)).toISOString() }
        : {}),
    };
  });
}

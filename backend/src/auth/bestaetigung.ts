import type { Benutzer } from "@torball/shared";
import { aendereBenutzerAtomar } from "./benutzerAenderung";
import { inAbkuehlung, registriereFehlversuch } from "./loginZaehler";
import { passwortStimmt } from "./passwort";
import { pruefeTotpCode } from "./totp";

export type BestaetigungsErgebnis = { ok: true } | { ok: false; status: 401 | 429; fehler: string };

/**
 * Erneute Bestaetigung vor einer sensiblen Aktion am EIGENEN Konto (2FA aendern, Kopplungscode
 * erzeugen): aktuelles Passwort und - wenn 2FA aktiv ist und `mitCode` gilt - ein aktueller Code.
 * Warum nicht einfach "ist angemeldet": Eine gestohlene oder offen gelassene Sitzung darf den
 * zweiten Faktor nicht austauschen oder ein dauerhaftes Instanz-Token erzeugen koennen.
 *
 * Falsche Eingaben zaehlen auf DENSELBEN Zaehler wie beim Login (gleiche Abkuehlzeit) - sonst waere
 * dieser Weg ein ungebremstes Orakel fuer Passwort und Code. Zurueckgesetzt wird der Zaehler hier
 * bewusst NICHT; das bleibt einem vollstaendig gelungenen Login vorbehalten. Ein Code gilt auch hier
 * nur einmal (gleicher Zeitschritt-Speicher wie beim Login).
 */
export async function pruefeBestaetigung(
  benutzer: Benutzer,
  eingabe: { passwort?: string; code?: string },
  mitCode: boolean,
): Promise<BestaetigungsErgebnis> {
  if (inAbkuehlung(benutzer)) {
    return { ok: false, status: 429, fehler: "Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen." };
  }
  if (!eingabe.passwort || !benutzer.passwortHash || !(await passwortStimmt(eingabe.passwort, benutzer.passwortHash))) {
    await registriereFehlversuch(benutzer._id);
    return { ok: false, status: 401, fehler: "Passwort ist falsch." };
  }
  if (mitCode && benutzer.zweiFaAktiv) {
    const pruefung =
      eingabe.code && benutzer.zweiFaSecret
        ? await pruefeTotpCode(benutzer.zweiFaSecret, eingabe.code, benutzer.zweiFaLetzterZeitschritt)
        : ({ gueltig: false } as const);
    const verbraucht = pruefung.gueltig
      ? await aendereBenutzerAtomar(benutzer._id, (b) =>
          (b.zweiFaLetzterZeitschritt ?? -1) >= pruefung.zeitschritt
            ? undefined
            : { ...b, zweiFaLetzterZeitschritt: pruefung.zeitschritt },
        )
      : undefined;
    if (!verbraucht) {
      await registriereFehlversuch(benutzer._id);
      return { ok: false, status: 401, fehler: "Der Bestätigungscode ist ungültig." };
    }
  }
  return { ok: true };
}

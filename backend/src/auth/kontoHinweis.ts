import { randomUUID } from "node:crypto";
import type { Benutzer, KontoHinweis, KontoHinweisArt } from "@torball/shared";
import { fuegeKontoHinweisHinzu, kontoHinweisText } from "@torball/shared";
import { sendeMail } from "../mail/transport";
import { aktuelleSystemeinstellungen, smtpVerbindungAus } from "../systemeinstellungen";
import { aendereBenutzerAtomar } from "./benutzerAenderung";

/**
 * Meldet eine sicherheitsrelevante Aenderung an einem Konto auf ZWEI Wegen (Auftraggeber, 02.11.2026,
 * Vorbild: Google): als Hinweis am Konto (sichtbar beim naechsten Aufruf - funktioniert auch auf einer
 * lokalen Installation ohne Mailversand) UND per Mail, soweit der Versand eingerichtet ist.
 *
 * Bestenfalls: ein Fehler hier darf die eigentliche Aktion nie verhindern oder rueckgaengig machen, er
 * wird nur geloggt. Der Aufruf kommt deshalb NACH dem Speichern der Aenderung.
 *
 * `selbst: true` = die Person hat es in ihrer laufenden Sitzung selbst getan (Passwort geaendert, 2FA
 * umgeschaltet ...): der Hinweis ist dann sofort "gelesen" und drängt sich nicht in den Weg, bleibt aber
 * in der Liste der letzten Aenderungen im Profil stehen - und die Mail geht trotzdem hinaus, damit auch
 * eine uebernommene Sitzung nicht unbemerkt bleibt.
 */
export interface KontoMeldung {
  art: KontoHinweisArt;
  /** Name der ANDEREN Person, die gehandelt hat (Admin/Manager). */
  durch?: string;
  detail?: string;
  selbst?: boolean;
  /** false = nur der Hinweis am Konto, keine Mail (z. B. wenn der Reset-Link ohnehin per Mail kommt). */
  mail?: boolean;
  /** Zusaetzliche Mailadresse, an die die Mail geht (z. B. die ALTE Adresse bei einer Adressaenderung). */
  zusaetzlicheMailAn?: string;
}

export async function meldeKontoAenderung(benutzerId: string, meldung: KontoMeldung): Promise<void> {
  try {
    const hinweis: KontoHinweis = {
      id: randomUUID(),
      art: meldung.art,
      zeitpunkt: new Date().toISOString(),
      ...(meldung.durch ? { durch: meldung.durch } : {}),
      ...(meldung.detail ? { detail: meldung.detail } : {}),
      gelesen: Boolean(meldung.selbst),
    };
    const konto = await aendereBenutzerAtomar(benutzerId, (b: Benutzer) => ({
      ...b,
      kontoHinweise: fuegeKontoHinweisHinzu(b.kontoHinweise, hinweis),
    }));
    if (!konto || meldung.mail === false) return;

    const smtp = smtpVerbindungAus(await aktuelleSystemeinstellungen());
    if (!smtp) return;
    const adressen = [...new Set([konto.email, meldung.zusaetzlicheMailAn].filter((a): a is string => Boolean(a)))];
    const zeit = new Date(hinweis.zeitpunkt).toLocaleString("de-DE", { timeZone: process.env.TZ || undefined });
    for (const an of adressen) {
      try {
        await sendeMail(smtp, {
          an,
          betreff: "Änderung an deinem Konto - Torball-Turniere",
          text:
            `Hallo ${konto.name},\n\n` +
            `an deinem Konto bei Torball-Turniere wurde etwas geändert (${zeit}):\n\n` +
            `${kontoHinweisText(hinweis)}\n\n` +
            `Falls du das nicht selbst veranlasst hast, wende dich bitte umgehend an die Turnierleitung ` +
            `oder einen Administrator und ändere dein Passwort.`,
        });
      } catch (err) {
        console.error("Konto-Benachrichtigung konnte nicht per Mail versendet werden", err);
      }
    }
  } catch (err) {
    console.error("Konto-Hinweis konnte nicht gespeichert werden", err);
  }
}

/** Markiert alle Hinweise eines Kontos als gelesen. */
export async function markiereKontoHinweiseGelesen(benutzerId: string): Promise<Benutzer | undefined> {
  return aendereBenutzerAtomar(benutzerId, (b) => {
    if (!b.kontoHinweise?.some((h) => !h.gelesen)) return undefined;
    return { ...b, kontoHinweise: b.kontoHinweise.map((h) => ({ ...h, gelesen: true })) };
  });
}

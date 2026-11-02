import type { Benutzer } from "@torball/shared";
import { findAllByType } from "../repository";
import { aendereBenutzerAtomar } from "./benutzerAenderung";
import { meldeKontoAenderung } from "./kontoHinweis";
import { erzeugeToken } from "./token";
import { waehleNotzugangKonto } from "./notzugangWahl";

export { kontoZeile, waehleNotzugangKonto, type KontoAuswahl } from "./notzugangWahl";

/**
 * Notzugang fuer Administratoren (Auftraggeber, 02.11.2026): Sind ALLE Zugangsdaten vergessen, gibt es von der Webseite
 * aus bewusst keinen Weg zurueck - jede solche Tuer koennte auch ein Angreifer nutzen. Stattdessen hilft sich selbst, wer
 * Zugriff auf den Rechner hat, auf dem die Anwendung laeuft (Konsolenbefehl `admin:notzugang`): Er erzeugt einen
 * einmaligen Link, ueber den die Person im Browser ein neues Passwort waehlt. Das Passwort selbst taucht nirgends in
 * Terminal, Umgebungsvariable oder Verlauf auf. Der Link nutzt die vorhandene Passwort-Zuruecksetzen-Seite - mit allen
 * Folgen (beendet alle Sitzungen, hebt die zeitbasierte Anmeldesperre auf, Konto-Hinweis) - und gilt nur 60 Minuten statt 24 Stunden.
 */
export const NOTZUGANG_GUELTIG_MS = 60 * 60 * 1000;

export type NotzugangErgebnis =
  | { ok: true; konto: Benutzer; token: string; gueltigBis: string; zweiFaZurueckgesetzt: boolean }
  | { ok: false; meldung: string };

/**
 * Erzeugt den einmaligen Link-Token fuer das gewaehlte Konto und setzt auf Wunsch die Zwei-Faktor-Anmeldung zurueck.
 * `hinweis` meldet das ANSCHLIESSEND ans Konto (Hinweis + ggf. Mail) - getrennt aufrufbar, damit die Konsole den Link
 * schon anzeigen kann, bevor ein langsamer Mailversand abgewartet wird.
 */
export async function erzeugeNotzugang(optionen: {
  email?: string;
  zweiFaZuruecksetzen?: boolean;
}): Promise<NotzugangErgebnis> {
  const alle = await findAllByType<Benutzer>("benutzer");
  const wahl = waehleNotzugangKonto(alle, optionen.email);
  if (wahl.art === "fehler") return { ok: false, meldung: wahl.meldung };

  const { token, hash } = erzeugeToken();
  const gueltigBis = new Date(Date.now() + NOTZUGANG_GUELTIG_MS).toISOString();
  const zweiFa = Boolean(optionen.zweiFaZuruecksetzen) && wahl.konto.zweiFaAktiv;
  const gespeichert = await aendereBenutzerAtomar(wahl.konto._id, (b) => ({
    ...b,
    resetTokenHash: hash,
    resetAblauf: gueltigBis,
    ...(zweiFa
      ? { zweiFaAktiv: false, zweiFaSecret: undefined, zweiFaLetzterZeitschritt: undefined }
      : {}),
  }));
  if (!gespeichert) return { ok: false, meldung: "Das Konto konnte nicht geaendert werden (gleichzeitige Aenderung?). Bitte erneut versuchen." };
  return { ok: true, konto: gespeichert, token, gueltigBis, zweiFaZurueckgesetzt: zweiFa };
}

/** Meldet den Notzugang am Konto (Hinweis, plus Mail falls der Versand eingerichtet ist). Bestenfalls, wirft nicht. */
export async function meldeNotzugang(konto: Benutzer, zweiFaZurueckgesetzt: boolean): Promise<void> {
  const durch = "Notzugang auf dem Server (Konsolenbefehl)";
  await meldeKontoAenderung(konto._id, { art: "passwort-zuruecksetzen-ausgeloest", durch });
  if (zweiFaZurueckgesetzt) await meldeKontoAenderung(konto._id, { art: "zwei-fa-deaktiviert", durch });
}

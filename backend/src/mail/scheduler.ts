import type { FastifyBaseLogger } from "fastify";
import { insertDoc } from "../repository";
import { erstelleMailBericht } from "./bericht";
import { aktuelleMailPostfachEinstellungen, MAIL_POSTFACH_EINSTELLUNGEN_ID, mailPostfachAktiv } from "./postfach";

/**
 * Taeglicher automatischer Berichtslauf zur konfigurierten Uhrzeit (`berichtszeit`, ueber die
 * Oberflaeche einstellbar). Es gibt noch keine Cron-Abstraktion im Projekt - wie beim
 * Turnier-Sync-Checkin (sync/checkin.ts) ein simpler setInterval, hier mit einem
 * Uhrzeit-des-Tages-Vergleich statt einem festen Intervall. Der Vergleich ist bewusst ">=" statt
 * "===": eine kurze Verzoegerung (Prozess unter Last, Minute knapp verpasst) darf den Lauf nicht
 * fuer den ganzen Tag ausfallen lassen.
 */
const PRUEF_INTERVALL_MS = 60_000;

export function starteMailBerichtTimer(logger: FastifyBaseLogger): void {
  setInterval(() => {
    fuehreAusFallsFaellig(logger).catch((err) =>
      logger.error(err, "Mail-Postfach: automatischer Berichtslauf fehlgeschlagen"),
    );
  }, PRUEF_INTERVALL_MS);
}

async function fuehreAusFallsFaellig(logger: FastifyBaseLogger): Promise<void> {
  if (!mailPostfachAktiv()) return;

  const einstellungen = await aktuelleMailPostfachEinstellungen();
  const jetzt = new Date();
  // heute UND aktuelleZeit bewusst beide aus LOKALEN Gettern - sonst (heute per toISOString() = UTC)
  // laufen Datumsgrenze und Uhrzeit-Trigger bei einem Zeitzonen-Offset auseinander (Doppellauf oder
  // falscher Tag rund um Mitternacht), v.a. bei frueher berichtszeit (Backend-Review 2026-08-20).
  const pad = (n: number) => String(n).padStart(2, "0");
  const heute = `${jetzt.getFullYear()}-${pad(jetzt.getMonth() + 1)}-${pad(jetzt.getDate())}`;
  const aktuelleZeit = `${pad(jetzt.getHours())}:${pad(jetzt.getMinutes())}`;

  if (einstellungen.letzterAutomatischerLaufDatum === heute) return;
  if (aktuelleZeit < einstellungen.berichtszeit) return;

  await erstelleMailBericht("automatisch");

  await insertDoc({
    ...(await aktuelleMailPostfachEinstellungen()),
    _id: MAIL_POSTFACH_EINSTELLUNGEN_ID,
    docType: "mailPostfachEinstellungen",
    letzterAutomatischerLaufDatum: heute,
  });
  logger.info("Mail-Postfach: automatischer Bericht erstellt");
}

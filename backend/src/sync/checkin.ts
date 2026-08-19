import type { FastifyBaseLogger } from "fastify";
import type { Turnier } from "@torball/shared";
import { findAllBySelector, findById, insertDoc } from "../repository";
import { aktuelleLokaleSyncKonfiguration } from "../lokaleSyncKonfiguration";
import { importiereTurnierExport } from "./import";
import { sammleTurnierExport, type TurnierExportPaket } from "./export";

/**
 * Turnier-Sync (Grundlage, Abschnitt 21.3/23): periodischer Herzschlag DIESER Installation zu
 * einem gekoppelten Zentralen-Plattform-Server (siehe routes/instanzSync.ts, POST
 * /instanzen/checkin). Backend-seitig (nicht an einen offenen Browser-Tab gebunden), damit ein
 * angestossener Download tatsaechlich ankommt und Aenderungen weiterlaufen, auch wenn gerade
 * niemand die Anwendung offen hat. Netzwerkfehler werden bewusst still uebersprungen - das ist
 * der ganze Zweck dieses Mechanismus (Resilienz gegen Verbindungsausfaelle).
 *
 * Ueberträgt bei jedem Check-in den VOLLSTAENDIGEN Stand jedes ausgecheckten Turniers (nicht nur
 * Ergebnisse wie zuvor, 2026-08-19 umgestellt - Nutzer-Vorgabe): waehrend eines aktiven Checkouts
 * ist die lokale Installation der alleinige fuehrende Stand (1:1-Beziehung, kein Merge), ein
 * vollstaendiges Ueberschreiben pro Check-in haelt den Server-Stand automatisch "relativ aktuell",
 * ohne in einen echten bidirektionalen Konfliktabgleich investieren zu muessen. "Freigabe
 * aufheben" bleibt der bewusste manuelle Notausstieg (z.B. bei Verlust/Defekt des lokalen
 * Rechners) - dann gilt der letzte erfolgreich uebertragene Stand.
 */
const CHECKIN_INTERVALL_MS = 45_000;

// Checkout-IDs empfangener, aber noch nicht bestaetigter Downloads - werden im naechsten Check-in
// mitgeschickt. Rein In-Memory: geht bei einem Neustart verloren, dann schickt der Server das
// Paket beim naechsten Check-in einfach erneut (importiereTurnierExport ist idempotent).
let unbestaetigteCheckoutIds: string[] = [];

export function starteCheckinTimer(logger: FastifyBaseLogger): void {
  setInterval(() => {
    fuehreCheckinAus(logger).catch((err) => logger.error(err, "Check-in fehlgeschlagen"));
  }, CHECKIN_INTERVALL_MS);
}

async function fuehreCheckinAus(logger: FastifyBaseLogger): Promise<void> {
  const konfiguration = await aktuelleLokaleSyncKonfiguration();
  if (!konfiguration) return; // nicht gekoppelt - nichts zu tun

  const ausgecheckteTurniere = await findAllBySelector<Turnier>({
    docType: "turnier",
    lokalerSyncCheckoutId: { $exists: true },
  });

  const vollstaendigeUebertragung = await Promise.all(
    ausgecheckteTurniere.map(async (turnier) => ({
      turnierId: turnier._id,
      export: await sammleTurnierExport(turnier._id, { stammdatenMitnehmen: true }),
    })),
  );

  let antwort: Response;
  try {
    // Der Zentrale-Plattform-Server laeuft im Regelfall als eigener Prozess hinter nginx (nicht im
    // SERVE_FRONTEND-Einzelprozess-Modus dieser Installation) - dessen Backend-Routen liegen intern
    // an der Wurzel, sind von aussen aber nur unter dem von nginx durchgereichten "/api"-Praefix
    // erreichbar (siehe deploy-instanz.sh, location /api/). Ohne dieses Praefix landet die Anfrage
    // stattdessen bei nginx' SPA-Auslieferung (HTML statt JSON) - live erlebt, siehe kopplung-
    // einloesen in routes/sync.ts fuer denselben Fix.
    antwort = await fetch(`${konfiguration.serverUrl}/api/instanzen/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${konfiguration.instanzToken}` },
      body: JSON.stringify({ vollstaendigeUebertragung, bestaetigteCheckoutIds: unbestaetigteCheckoutIds }),
    });
  } catch {
    return; // Server nicht erreichbar - naechster Versuch beim naechsten Intervall
  }
  if (!antwort.ok) {
    logger.warn(`Check-in beim Server abgelehnt (Status ${antwort.status})`);
    return;
  }

  unbestaetigteCheckoutIds = [];
  const body = (await antwort.json()) as {
    ausstehendeDownloads: { checkoutId: string; turnierId: string; export: TurnierExportPaket }[];
  };

  for (const download of body.ausstehendeDownloads) {
    await importiereTurnierExport(download.export, { ersetzen: false });
    const importiertesTurnier = await findById<Turnier>(download.turnierId);
    if (importiertesTurnier) {
      await insertDoc({ ...importiertesTurnier, lokalerSyncCheckoutId: download.checkoutId });
    }
    unbestaetigteCheckoutIds.push(download.checkoutId);
  }
}

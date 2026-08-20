import type { FastifyInstance } from "fastify";
import type { Benutzer, TurnierCheckout, VerbundeneInstanz } from "@torball/shared";
import { findAllByType, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { erzeugeToken, hashe } from "../auth/token";
import { sammleTurnierExport, type TurnierExportPaket } from "../sync/export";
import { importiereTurnierExport } from "../sync/import";
import { findeAktivesCheckout, findeInstanzPerToken, liesInstanzToken } from "../sync/instanz";
import { pruefeTurnierExportPaket } from "../sync/validierung";

/**
 * Turnier-Sync (Grundlage, Abschnitt 21.3/23): oeffentliche Routen fuer die Kommunikation
 * ZWISCHEN zwei Backend-Instanzen (Server <-> gekoppelte lokale Installation) - kein
 * Cookie-/Session-Mechanismus, Auth ausschliesslich ueber das Instanz-Bearer-Token (siehe
 * sync/instanz.ts). Die lokale Instanz meldet sich hier regelmaessig ("Check-in"); das ist auch
 * der einzige Weg, wie der Server serverseitig angestossene Downloads tatsaechlich zustellt (die
 * lokale Installation ist hinter NAT/Firewall in der Regel nicht direkt erreichbar).
 */

interface KopplungEinloesenBody {
  kopplungscode: string;
  bezeichnung?: string;
}

const kopplungEinloesenSchema = {
  type: "object",
  required: ["kopplungscode"],
  properties: {
    kopplungscode: { type: "string", minLength: 1 },
    bezeichnung: { type: "string" },
  },
} as const;

interface CheckinBody {
  vollstaendigeUebertragung?: { turnierId: string; export: TurnierExportPaket }[];
  bestaetigteCheckoutIds?: string[];
}

// Flaches Body-Schema: begrenzt die aeussere Struktur (bisher fehlte hier jedes Schema), laesst den
// inneren Aufbau des Exportpakets aber bewusst offen (additionalProperties) - dessen inhaltliche
// Pruefung uebernimmt pruefeTurnierExportPaket, nicht eine hier haendisch gepflegte, leicht
// veraltende Schema-Kopie.
const checkinSchema = {
  type: "object",
  properties: {
    bestaetigteCheckoutIds: { type: "array", items: { type: "string" } },
    vollstaendigeUebertragung: {
      type: "array",
      items: {
        type: "object",
        required: ["turnierId", "export"],
        properties: {
          turnierId: { type: "string", minLength: 1 },
          export: { type: "object", additionalProperties: true },
        },
      },
    },
  },
} as const;

export async function instanzSyncRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: KopplungEinloesenBody }>(
    "/instanzen/kopplung-einloesen",
    { schema: { body: kopplungEinloesenSchema } },
    async (req, reply) => {
      const hash = hashe(req.body.kopplungscode);
      const alle = await findAllByType<Benutzer>("benutzer");
      const benutzer = alle.find((b) => b.instanzKopplungscodeHash === hash);
      if (
        !benutzer ||
        !benutzer.instanzKopplungscodeAblauf ||
        new Date(benutzer.instanzKopplungscodeAblauf).getTime() < Date.now()
      ) {
        return reply.code(404).send({ error: "Kopplungscode ist ungültig oder abgelaufen." });
      }

      // Einmal-Code - nach dem Einloesen sofort entwerten.
      await insertDoc({ ...benutzer, instanzKopplungscodeHash: undefined, instanzKopplungscodeAblauf: undefined });

      const { token, hash: tokenHash } = erzeugeToken();
      const instanzId = newId("verbundeneInstanz");
      const instanz: VerbundeneInstanz = {
        _id: instanzId,
        docType: "verbundeneInstanz",
        instanzId,
        benutzerId: benutzer._id,
        instanzTokenHash: tokenHash,
        bezeichnung: req.body.bezeichnung,
        erstelltAm: new Date().toISOString(),
        widerrufen: false,
      };
      await insertDoc(instanz);

      return reply.code(201).send({ instanzToken: token, instanzId, serverBenutzer: benutzer.name });
    },
  );

  app.post<{ Body: CheckinBody }>("/instanzen/checkin", { schema: { body: checkinSchema } }, async (req, reply) => {
    const tokenWert = liesInstanzToken(req);
    if (!tokenWert) return reply.code(401).send({ error: "Instanz-Token fehlt." });
    const instanz = await findeInstanzPerToken(tokenWert);
    if (!instanz) return reply.code(401).send({ error: "Instanz-Token ist ungültig oder widerrufen." });

    await insertDoc({ ...instanz, letzterKontaktAm: new Date().toISOString() });

    // Bestaetigte Downloads: "angefordert" -> "aktiv".
    for (const checkoutId of req.body.bestaetigteCheckoutIds ?? []) {
      const checkout = await findById<TurnierCheckout>(checkoutId);
      if (checkout && checkout.instanzId === instanz.instanzId && checkout.status === "angefordert") {
        await insertDoc({ ...checkout, status: "aktiv", uebertragenAm: new Date().toISOString() });
      }
    }

    // Vollstaendige Turnierdaten-Uebernahme: nur fuer Turniere entgegennehmen, die tatsaechlich
    // aktiv an DIESE Instanz ausgecheckt sind (kein Ueberschreiben eines fremden/nicht
    // ausgechecktes Turniers moeglich). ersetzen:true, weil die lokale Instanz waehrend eines
    // aktiven Checkouts der alleinige fuehrende Stand ist (1:1-Beziehung, kein Merge) - ersetzt bei
    // jedem Check-in konsequent den kompletten Turnierstand auf dem Server, nicht nur Ergebnisse
    // wie zuvor (2026-08-19 umgestellt, siehe Kommentar in sync/checkin.ts).
    for (const eintrag of req.body.vollstaendigeUebertragung ?? []) {
      const checkout = await findeAktivesCheckout(eintrag.turnierId);
      if (!checkout || checkout.instanzId !== instanz.instanzId || checkout.status !== "aktiv") continue;
      // Inhaltliche Pruefung des Pakets, bevor es geschrieben wird: nur Dokumente, die tatsaechlich
      // zu genau diesem ausgecheckten Turnier gehoeren, duerfen ersetzt werden. Ein manipuliertes
      // Paket wird verworfen (nicht die ganze Anfrage abgebrochen - der Rest laeuft weiter), damit
      // ein einzelner fehlerhafter Eintrag den Check-in nicht komplett scheitern laesst.
      const fehler = pruefeTurnierExportPaket(eintrag.export, eintrag.turnierId);
      if (fehler) {
        req.log.warn({ turnierId: eintrag.turnierId, instanzId: instanz.instanzId, fehler }, "Ungültiges Sync-Paket im Check-in verworfen");
        continue;
      }
      await importiereTurnierExport(eintrag.export, { ersetzen: true, erwarteteTurnierId: eintrag.turnierId });
    }

    // Ausstehende Downloads: alle noch nicht bestaetigten ("angefordert") Checkouts dieser
    // Instanz, jeweils mit dem kompletten Exportpaket - kein zweiter Roundtrip noetig.
    const angefordert = await findAllBySelector<TurnierCheckout>({
      docType: "turnierCheckout",
      instanzId: instanz.instanzId,
      status: "angefordert",
    });
    const ausstehendeDownloads = await Promise.all(
      angefordert.map(async (checkout) => ({
        checkoutId: checkout._id,
        turnierId: checkout.turnierId,
        stammdatenMitnehmen: checkout.stammdatenMitnehmen,
        export: await sammleTurnierExport(checkout.turnierId, { stammdatenMitnehmen: checkout.stammdatenMitnehmen }),
      })),
    );

    return { ausstehendeDownloads };
  });
}

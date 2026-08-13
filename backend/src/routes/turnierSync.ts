import type { FastifyInstance } from "fastify";
import type { Benutzer, Turnier, TurnierCheckout, VerbundeneInstanz } from "@torball/shared";
import { findById, insertDoc, newId } from "../repository";
import { requireZugriff } from "../auth/plugin";
import { hatMindestens } from "../auth/turnierZugriff";
import { findeAktivesCheckout, findeInstanzPerToken, liesInstanzToken } from "../sync/instanz";
import { importiereTurnierExport } from "../sync/import";
import { sammleTurnierExport, type TurnierExportPaket } from "../sync/export";
import { aktuelleLokaleSyncKonfiguration } from "../lokaleSyncKonfiguration";

/**
 * Turnier-Sync (Grundlage, Abschnitt 21.3/23): Download-Anforderung/-Freigabe leben hier
 * (turnierbezogen, ueber die normale Session/Turnier-Code-Berechtigung - `requireZugriff` +
 * `hatMindestens`, wie die anderen turnierbezogenen Routen). Der eigentliche Datentransfer
 * passiert asynchron ueber den Check-in der lokalen Instanz (siehe routes/instanzSync.ts).
 * `sync-import` (Upload/Neu-Verknuepfen) ist dagegen KEIN Session-Endpunkt, sondern - wie
 * `/instanzen/checkin` - ausschliesslich per Instanz-Bearer-Token erreichbar, da er von der
 * fremden Backend-Instanz aufgerufen wird, nicht aus einem eingeloggten Browser.
 */

interface DownloadAnfordernBody {
  instanzId: string;
  stammdatenMitnehmen?: boolean;
}

const downloadAnfordernSchema = {
  type: "object",
  required: ["instanzId"],
  properties: {
    instanzId: { type: "string", minLength: 1 },
    stammdatenMitnehmen: { type: "boolean" },
  },
} as const;

interface SyncImportBody {
  export: TurnierExportPaket;
  ersetzen?: boolean;
}

export async function turnierSyncRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: DownloadAnfordernBody }>(
    "/turniere/:id/download-anfordern",
    { schema: { body: downloadAnfordernSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.id);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }

      const instanz = await findById<VerbundeneInstanz>(req.body.instanzId);
      if (!instanz || instanz.widerrufen || !req.benutzer || instanz.benutzerId !== req.benutzer._id) {
        return reply.code(404).send({ error: "Verbundene Instanz nicht gefunden" });
      }
      if (await findeAktivesCheckout(turnier._id)) {
        return reply.code(409).send({ error: "Turnier wird bereits lokal verwaltet - zuerst Freigabe aufheben." });
      }

      const checkoutId = newId("turnierCheckout");
      const checkout: TurnierCheckout = {
        _id: checkoutId,
        docType: "turnierCheckout",
        checkoutId,
        turnierId: turnier._id,
        instanzId: instanz.instanzId,
        status: "angefordert",
        stammdatenMitnehmen: req.body.stammdatenMitnehmen ?? false,
        angefordertVon: req.benutzer._id,
        angefordertAm: new Date().toISOString(),
      };
      await insertDoc(checkout);
      return reply.code(201).send(checkout);
    },
  );

  app.get<{ Params: { id: string } }>("/turniere/:id/checkout-status", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "lesen"))) {
      return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    }

    const checkout = await findeAktivesCheckout(turnier._id);
    if (!checkout) return { ausgecheckt: false };
    const instanz = await findById<VerbundeneInstanz>(checkout.instanzId);
    return {
      ausgecheckt: true,
      status: checkout.status,
      bezeichnung: instanz?.bezeichnung,
      seit: checkout.angefordertAm,
    };
  });

  app.post<{ Params: { id: string } }>("/turniere/:id/checkout-freigeben", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }

    const checkout = await findeAktivesCheckout(turnier._id);
    if (!checkout) return reply.code(404).send({ error: "Turnier ist aktuell nicht ausgecheckt." });
    await insertDoc({ ...checkout, status: "freigegeben", freigegebenAm: new Date().toISOString() });
    return reply.code(204).send();
  });

  // Upload: client-initiiert - diese (lokale) Instanz ruft aktiv den gekoppelten Server auf.
  // Nur sinnvoll auf einer Installation, die per Kopplungscode verbunden ist (siehe
  // sync/checkin.ts / EinstellungenPage).
  app.post<{ Params: { id: string }; Body: { ersetzen?: boolean } }>(
    "/turniere/:id/sync-upload",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.id);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }

      const konfiguration = await aktuelleLokaleSyncKonfiguration();
      if (!konfiguration) {
        return reply.code(400).send({ error: "Diese Installation ist nicht mit einem Server verbunden." });
      }

      const exportPaket = await sammleTurnierExport(turnier._id, { stammdatenMitnehmen: true });
      let antwort: Response;
      try {
        antwort = await fetch(`${konfiguration.serverUrl}/turniere/sync-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${konfiguration.instanzToken}` },
          body: JSON.stringify({ export: exportPaket, ersetzen: req.body?.ersetzen ?? false }),
        });
      } catch {
        return reply.code(502).send({ error: "Server ist gerade nicht erreichbar." });
      }
      const antwortKoerper = (await antwort.json().catch(() => ({}))) as {
        checkoutId?: string;
        warnung?: string;
        error?: string;
      };
      if (!antwort.ok) return reply.code(antwort.status).send(antwortKoerper);

      // Ab jetzt gilt dieses Turnier hier als ausgecheckt - der periodische Check-in
      // (sync/checkin.ts) pusht ab jetzt automatisch Ergebnisse fuer dieses Turnier.
      await insertDoc({ ...turnier, lokalerSyncCheckoutId: antwortKoerper.checkoutId });
      return reply.send(antwortKoerper);
    },
  );

  // --- Instanz-zu-Instanz, kein Session-Endpunkt (siehe Modul-Kommentar) ---

  app.post<{ Body: SyncImportBody }>("/turniere/sync-import", async (req, reply) => {
    const tokenWert = liesInstanzToken(req);
    if (!tokenWert) return reply.code(401).send({ error: "Instanz-Token fehlt." });
    const instanz = await findeInstanzPerToken(tokenWert);
    if (!instanz) return reply.code(401).send({ error: "Instanz-Token ist ungültig oder widerrufen." });

    const paket = req.body.export;
    const turnierId = paket.turnier._id;
    const bestehendesTurnier = await findById<Turnier>(turnierId);

    if (bestehendesTurnier) {
      if (!req.body.ersetzen) {
        return reply.code(409).send({ error: "Ein Turnier mit dieser ID existiert bereits auf diesem Server." });
      }
      if (await findeAktivesCheckout(turnierId)) {
        return reply.code(409).send({ error: "Turnier wird gerade aktiv verwaltet - zuerst Freigabe aufheben." });
      }
      const instanzBenutzer = await findById<Benutzer>(instanz.benutzerId);
      if (!instanzBenutzer || instanzBenutzer.globaleRolle !== "admin") {
        return reply.code(403).send({ error: "Nur ein Admin darf ein bestehendes Turnier auf diese Weise ersetzen." });
      }
      const { warnung } = await importiereTurnierExport(paket, { ersetzen: true });
      const checkoutId = await legeAktivesCheckoutAn(turnierId, instanz.instanzId, paket);
      return reply.send({ turnierId, checkoutId, warnung });
    }

    const { warnung } = await importiereTurnierExport(paket, { ersetzen: false });
    const checkoutId = await legeAktivesCheckoutAn(turnierId, instanz.instanzId, paket);
    return reply.code(201).send({ turnierId, checkoutId, warnung });
  });
}

async function legeAktivesCheckoutAn(
  turnierId: string,
  instanzId: string,
  paket: TurnierExportPaket,
): Promise<string> {
  const checkoutId = newId("turnierCheckout");
  await insertDoc<TurnierCheckout>({
    _id: checkoutId,
    docType: "turnierCheckout",
    checkoutId,
    turnierId,
    instanzId,
    status: "aktiv",
    stammdatenMitnehmen: paket.vereine.length > 0 || paket.teams.length > 0,
    angefordertAm: new Date().toISOString(),
    uebertragenAm: new Date().toISOString(),
  });
  return checkoutId;
}

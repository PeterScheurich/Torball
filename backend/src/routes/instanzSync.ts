import type { FastifyInstance } from "fastify";
import type { Benutzer, Spiel, TurnierCheckout, VerbundeneInstanz } from "@torball/shared";
import { findAllByType, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { erzeugeToken, hashe } from "../auth/token";
import { sammleTurnierExport } from "../sync/export";
import { findeAktivesCheckout, findeInstanzPerToken, liesInstanzToken } from "../sync/instanz";

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
  ergebnisPush?: { turnierId: string; spiele: Partial<Spiel>[] }[];
  bestaetigteCheckoutIds?: string[];
}

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

  app.post<{ Body: CheckinBody }>("/instanzen/checkin", async (req, reply) => {
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

    // Ergebnis-Push: nur fuer Turniere entgegennehmen, die tatsaechlich aktiv an DIESE Instanz
    // ausgecheckt sind (kein Push auf ein fremdes/nicht ausgechecktes Turnier moeglich).
    for (const eintrag of req.body.ergebnisPush ?? []) {
      const checkout = await findeAktivesCheckout(eintrag.turnierId);
      if (!checkout || checkout.instanzId !== instanz.instanzId || checkout.status !== "aktiv") continue;
      for (const spielUpdate of eintrag.spiele) {
        if (!spielUpdate._id) continue;
        const bestehend = await findById<Spiel>(spielUpdate._id);
        if (!bestehend || bestehend.turnierId !== eintrag.turnierId) continue;
        await insertDoc({
          ...bestehend,
          ergebnisA: spielUpdate.ergebnisA,
          ergebnisB: spielUpdate.ergebnisB,
          ergebnisAbgeschlossen: spielUpdate.ergebnisAbgeschlossen ?? bestehend.ergebnisAbgeschlossen,
          status: spielUpdate.status ?? bestehend.status,
          istForfait: spielUpdate.istForfait ?? bestehend.istForfait,
          runde: spielUpdate.runde ?? bestehend.runde,
          feldId: spielUpdate.feldId ?? bestehend.feldId,
          startzeitGeplant: spielUpdate.startzeitGeplant ?? bestehend.startzeitGeplant,
          schiedsrichterId: spielUpdate.schiedsrichterId ?? bestehend.schiedsrichterId,
        });
      }
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

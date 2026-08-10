import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ErgebnisAenderung, ErgebnisToken, MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import { findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireAuth } from "../auth/plugin";
import { hatMindestens } from "../auth/turnierZugriff";

/**
 * Abschnitt 14/20.14: Der Token-Wert selbst wird - anders als Einladungs-/
 * Passwort-Reset-Tokens - im Klartext gespeichert, nicht gehasht. Er ist
 * bewusst zum Weitergeben gedacht (Turnierleitung "erzeugt einen Link"),
 * jederzeit ueber GET wieder abrufbar/anzeigbar, und sein Missbrauchspotential
 * ist eng begrenzt (nur Endergebnisse *dieses* Turniers, revoke-/audit-bar
 * über Ergebnis-Aenderung) - anders als Einladungs-/Reset-Tokens, die ein
 * Passwort setzen und damit einen vollen Account-Zugriff eroeffnen.
 */
function neuerTokenWert(): string {
  return randomBytes(24).toString("hex");
}

async function findeAktivenToken(turnierId: string): Promise<ErgebnisToken | undefined> {
  const tokens = await findAllBySelector<ErgebnisToken>({ docType: "ergebnisToken", turnierId, widerrufen: false });
  return tokens[0];
}

export async function ergebnisTokenRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/turniere/:id/ergebnis-token", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req.benutzer, "schreiben"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    const aktiver = await findeAktivenToken(turnier._id);
    return { tokenWert: aktiver?.tokenWert ?? null };
  });

  /** Erzeugt einen neuen Token; ein zuvor aktiver Token fuer dieses Turnier wird automatisch widerrufen. */
  app.post<{ Params: { id: string } }>("/turniere/:id/ergebnis-token", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req.benutzer, "schreiben"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }

    const bestehender = await findeAktivenToken(turnier._id);
    if (bestehender) {
      await insertDoc({ ...bestehender, widerrufen: true, widerrufenAm: new Date().toISOString() });
    }

    const id = newId("ergebnisToken");
    const token: ErgebnisToken = {
      _id: id,
      docType: "ergebnisToken",
      tokenId: id,
      turnierId: turnier._id,
      tokenWert: neuerTokenWert(),
      erstelltVon: req.benutzer!._id,
      erstelltAm: new Date().toISOString(),
      widerrufen: false,
    };
    const gespeichert = await insertDoc(token);
    return reply.code(201).send({ tokenWert: gespeichert.tokenWert });
  });

  app.post<{ Params: { id: string } }>("/turniere/:id/ergebnis-token/widerrufen", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req.benutzer, "schreiben"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    const aktiver = await findeAktivenToken(turnier._id);
    if (aktiver) {
      await insertDoc({ ...aktiver, widerrufen: true, widerrufenAm: new Date().toISOString() });
    }
    return reply.code(204).send();
  });

  // --- Oeffentlich, kein Login (Abschnitt 14: "kein Login, keine Registrierung") ---

  app.get<{ Params: { tokenWert: string } }>("/ergebnis-erfassung/:tokenWert", async (req, reply) => {
    const tokens = await findAllBySelector<ErgebnisToken>({
      docType: "ergebnisToken",
      tokenWert: req.params.tokenWert,
      widerrufen: false,
    });
    const token = tokens[0];
    if (!token) return reply.code(404).send({ error: "Link ist ungültig oder wurde widerrufen." });

    const turnier = await findById<Turnier>(token.turnierId);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

    const [mannschaften, spiele] = await Promise.all([
      findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id }),
      findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id }),
    ]);

    return {
      turnierName: turnier.name,
      mannschaften: mannschaften.map((m) => ({ _id: m._id, name: m.name })),
      spiele: spiele.map((s) => ({
        _id: s._id,
        runde: s.runde,
        feldId: s.feldId,
        mannschaftAId: s.mannschaftAId,
        mannschaftBId: s.mannschaftBId,
        ergebnisA: s.ergebnisA,
        ergebnisB: s.ergebnisB,
        istForfait: s.istForfait,
        ergebnisAbgeschlossen: s.ergebnisAbgeschlossen,
      })),
    };
  });

  app.put<{
    Params: { tokenWert: string; spielId: string };
    Body: { erfasserName: string; geraetKennung?: string; ergebnisA: number; ergebnisB: number; istForfait?: boolean };
  }>(
    "/ergebnis-erfassung/:tokenWert/spiele/:spielId",
    {
      schema: {
        body: {
          type: "object",
          required: ["erfasserName", "ergebnisA", "ergebnisB"],
          properties: {
            erfasserName: { type: "string", minLength: 1 },
            geraetKennung: { type: "string" },
            ergebnisA: { type: "number", minimum: 0 },
            ergebnisB: { type: "number", minimum: 0 },
            istForfait: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const tokens = await findAllBySelector<ErgebnisToken>({
        docType: "ergebnisToken",
        tokenWert: req.params.tokenWert,
        widerrufen: false,
      });
      const token = tokens[0];
      if (!token) return reply.code(404).send({ error: "Link ist ungültig oder wurde widerrufen." });

      const spiel = await findById<Spiel>(req.params.spielId);
      if (!spiel || spiel.turnierId !== token.turnierId) {
        return reply.code(404).send({ error: "Spiel nicht gefunden" });
      }
      if (spiel.ergebnisAbgeschlossen) {
        return reply.code(409).send({
          error: "Das Ergebnis ist bereits abgeschlossen. Änderungen sind nur noch durch die Turnierleitung möglich.",
        });
      }

      const aenderungId = newId("ergebnisAenderung");
      const aenderung: ErgebnisAenderung = {
        _id: aenderungId,
        docType: "ergebnisAenderung",
        aenderungId,
        spielId: spiel._id,
        erfasserName: req.body.erfasserName,
        geraetKennung: req.body.geraetKennung,
        alterWertA: spiel.ergebnisA,
        alterWertB: spiel.ergebnisB,
        neuerWertA: req.body.ergebnisA,
        neuerWertB: req.body.ergebnisB,
        zeitstempel: new Date().toISOString(),
      };
      await insertDoc(aenderung);

      const aktualisiert = await insertDoc({
        ...spiel,
        ergebnisA: req.body.ergebnisA,
        ergebnisB: req.body.ergebnisB,
        istForfait: req.body.istForfait ?? spiel.istForfait,
        status: spiel.status === "geplant" ? "beendet" : spiel.status,
      });

      return {
        _id: aktualisiert._id,
        ergebnisA: aktualisiert.ergebnisA,
        ergebnisB: aktualisiert.ergebnisB,
        istForfait: aktualisiert.istForfait,
        ergebnisAbgeschlossen: aktualisiert.ergebnisAbgeschlossen,
      };
    },
  );
}

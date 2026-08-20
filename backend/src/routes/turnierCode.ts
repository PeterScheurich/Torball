import type { FastifyInstance } from "fastify";
import type { Turnier } from "@torball/shared";
import { findById, insertDoc } from "../repository";
import { requireZugriff, setzeSessionCookie } from "../auth/plugin";
import { hatMindestens, turnierAusgecheckt, TURNIER_AUSGECHECKT_FEHLER } from "../auth/turnierZugriff";
import { hashePasswort, passwortStimmt } from "../auth/passwort";
import { erstelleCodeSession } from "../auth/session";
import { CODE_ANMELDUNG_RATE_LIMIT } from "../rateLimit";

/**
 * Turnier-Codes (Abschnitt 21.3, Betriebsmodus "Lokales Netzwerk"): ein Rechner hostet Backend +
 * CouchDB lebend im LAN, weitere Geraete/Personen greifen ueber einen geteilten Code statt eines
 * eigenen Kontos auf GENAU dieses eine Turnier zu. Setzen/Aendern der Codes braucht vollen
 * Schreibzugriff (echtes Konto oder bereits ein Turnierleitung-Code); die Anmeldung per Code ist
 * oeffentlich, analog zum bestehenden ErgebnisToken-Muster (routes/ergebnisToken.ts).
 */

interface CodesSetzenBody {
  turnierleitungCode?: string | null;
  spielleitungCode?: string | null;
}

const codesSetzenSchema = {
  type: "object",
  properties: {
    // null loescht den jeweiligen Code (Konvention siehe CLAUDE.md: null statt undefined, damit
    // JSON.stringify das Feld nicht komplett aus dem Body fallen laesst).
    turnierleitungCode: { type: ["string", "null"] },
    spielleitungCode: { type: ["string", "null"] },
  },
} as const;

interface CodeAnmeldungBody {
  code: string;
}

const codeAnmeldungSchema = {
  type: "object",
  required: ["code"],
  properties: {
    code: { type: "string", minLength: 1 },
  },
} as const;

export async function turnierCodeRoutes(app: FastifyInstance): Promise<void> {
  // Codes setzen/aendern/loeschen - nur mit vollem Schreibzugriff (Turnierleitung).
  app.put<{ Params: { id: string }; Body: CodesSetzenBody }>(
    "/turniere/:id/codes",
    { schema: { body: codesSetzenSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.id);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }
      // Bei einem an eine lokale Installation ausgecheckten Turnier ist auch das Setzen/Aendern der
      // Codes gesperrt (wie alle anderen turnierbezogenen Schreib-Routen): der Code-Hash haengt am
      // Turnier-Dokument und wuerde beim naechsten Check-in ohnehin vom lokalen Stand ueberschrieben.
      // Bewusst NUR turnierAusgecheckt, nicht turnierGesperrt - bei einem bloss abgeschlossenen
      // Turnier bleibt das Vergeben von Codes/Freigaben moeglich (aendert nichts am Turnier selbst).
      if (await turnierAusgecheckt(turnier._id)) {
        return reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
      }

      const patch: Pick<Turnier, "turnierleitungCodeHash" | "spielleitungCodeHash"> = {
        turnierleitungCodeHash: turnier.turnierleitungCodeHash,
        spielleitungCodeHash: turnier.spielleitungCodeHash,
      };
      if ("turnierleitungCode" in req.body) {
        patch.turnierleitungCodeHash = req.body.turnierleitungCode
          ? await hashePasswort(req.body.turnierleitungCode)
          : undefined;
      }
      if ("spielleitungCode" in req.body) {
        patch.spielleitungCodeHash = req.body.spielleitungCode
          ? await hashePasswort(req.body.spielleitungCode)
          : undefined;
      }

      const gespeichert = await insertDoc({ ...turnier, ...patch });
      // Nie die Hashes an den Client zurueckgeben - nur, ob ein Code jeweils aktiv ist.
      return {
        turnierleitungCodeAktiv: Boolean(gespeichert.turnierleitungCodeHash),
        spielleitungCodeAktiv: Boolean(gespeichert.spielleitungCodeHash),
      };
    },
  );

  app.get<{ Params: { id: string } }>("/turniere/:id/codes", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    return {
      turnierleitungCodeAktiv: Boolean(turnier.turnierleitungCodeHash),
      spielleitungCodeAktiv: Boolean(turnier.spielleitungCodeHash),
    };
  });

  // --- Oeffentlich, kein Login (analog zu /ergebnis-erfassung/:tokenWert) ---

  /** Meldet ein Geraet per Turnier-Code an (kein Konto noetig) - legt eine Code-Session an. */
  app.post<{ Params: { id: string }; Body: CodeAnmeldungBody }>(
    "/turniere/:id/code-anmeldung",
    { schema: { body: codeAnmeldungSchema }, config: { rateLimit: CODE_ANMELDUNG_RATE_LIMIT } },
    async (req, reply) => {
      const turnier = await findById<Turnier>(req.params.id);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

      const passtTurnierleitung =
        turnier.turnierleitungCodeHash && (await passwortStimmt(req.body.code, turnier.turnierleitungCodeHash));
      const passtSpielleitung =
        !passtTurnierleitung &&
        turnier.spielleitungCodeHash &&
        (await passwortStimmt(req.body.code, turnier.spielleitungCodeHash));

      if (!passtTurnierleitung && !passtSpielleitung) {
        return reply.code(401).send({ error: "Code ist ungültig." });
      }

      const rolle = passtTurnierleitung ? "turnierleitung" : "spielleitung";
      const { token } = await erstelleCodeSession(turnier._id, rolle);
      setzeSessionCookie(reply, token);
      return { rolle, turnierName: turnier.name };
    },
  );

  /** Pendant zu GET /auth/me fuer Code-Sessions - authPreHandler hat req.turnierCode bereits
   *  gesetzt. 401 wenn keine Code-Session aktiv ist, analog zu /auth/me. */
  app.get("/turnier-code/me", async (req, reply) => {
    if (!req.turnierCode) return reply.code(401).send({ error: "Nicht per Turnier-Code angemeldet" });
    const turnier = await findById<Turnier>(req.turnierCode.turnierId);
    if (!turnier) return reply.code(401).send({ error: "Nicht per Turnier-Code angemeldet" });
    return { turnierId: turnier._id, turnierName: turnier.name, rolle: req.turnierCode.rolle };
  });
}

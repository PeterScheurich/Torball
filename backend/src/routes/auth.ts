import type { FastifyInstance } from "fastify";
import type { Benutzer } from "@torball/shared";
import { findAllByType, insertDoc, newId } from "../repository";
import { oeffentlichesProfil } from "../auth/benutzerProfil";
import { hashePasswort, passwortRegelVerstoss, passwortStimmt } from "../auth/passwort";
import { loescheSessionCookie, SESSION_COOKIE_NAME, setzeSessionCookie } from "../auth/plugin";
import { erstelleSession, loescheSessionPerToken } from "../auth/session";
import { totpCodeGueltig } from "../auth/totp";

interface LoginBody {
  email: string;
  passwort: string;
  totpCode?: string;
}

const loginSchema = {
  type: "object",
  required: ["email", "passwort"],
  properties: {
    email: { type: "string", minLength: 1 },
    passwort: { type: "string", minLength: 1 },
    totpCode: { type: "string" },
  },
} as const;

interface BootstrapAdminBody {
  email: string;
  passwort: string;
  name: string;
}

const bootstrapAdminSchema = {
  type: "object",
  required: ["email", "passwort", "name"],
  properties: {
    email: { type: "string", minLength: 1 },
    passwort: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
  },
} as const;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>("/auth/login", { schema: { body: loginSchema } }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase();
    const alle = await findAllByType<Benutzer>("benutzer");
    const benutzer = alle.find((b) => b.email.toLowerCase() === email);

    // Bewusst dieselbe generische Fehlermeldung fuer "kein solcher Account" und "falsches
    // Passwort" - sonst liesse sich ueber das Login-Formular ausprobieren, welche
    // E-Mail-Adressen ueberhaupt existieren.
    const ANMELDE_FEHLER = "E-Mail oder Passwort ist falsch.";
    if (!benutzer || !benutzer.passwortHash) {
      return reply.code(401).send({ error: ANMELDE_FEHLER });
    }
    if (benutzer.gesperrt) {
      return reply.code(403).send({ error: "Dieser Account ist gesperrt." });
    }
    if (!(await passwortStimmt(req.body.passwort, benutzer.passwortHash))) {
      return reply.code(401).send({ error: ANMELDE_FEHLER });
    }

    if (benutzer.zweiFaAktiv) {
      if (!req.body.totpCode) {
        return reply.send({ benoetigtTotp: true });
      }
      if (!benutzer.zweiFaSecret || !(await totpCodeGueltig(benutzer.zweiFaSecret, req.body.totpCode))) {
        return reply.code(401).send({ error: "Der Bestätigungscode ist ungültig." });
      }
    }

    const { token } = await erstelleSession(benutzer._id);
    setzeSessionCookie(reply, token);

    const aktualisiert = await insertDoc({ ...benutzer, letzteAnmeldung: new Date().toISOString() });
    return oeffentlichesProfil(aktualisiert);
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (token) await loescheSessionPerToken(token);
    loescheSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/auth/me", async (req, reply) => {
    if (!req.benutzer) return reply.code(401).send({ error: "Nicht angemeldet" });
    return oeffentlichesProfil(req.benutzer);
  });

  /** Oeffentlich abrufbar (keine Anmeldung noetig), damit die Login-Seite bei einer frischen Installation auf die Ersteinrichtung hinweisen kann. */
  app.get("/auth/bootstrap-verfuegbar", async () => {
    const bestehende = await findAllByType<Benutzer>("benutzer");
    return { verfuegbar: bestehende.length === 0 };
  });

  /**
   * Einmalige Erst-Einrichtung (Huhn-Ei-Problem: ohne bestehenden Benutzer kann niemand
   * einen einladen). Funktioniert nur, solange noch KEIN Benutzer existiert - danach
   * laeuft jede weitere Anlage ausschliesslich ueber den Einladungs-Flow (routes/benutzer.ts).
   */
  app.post<{ Body: BootstrapAdminBody }>(
    "/auth/bootstrap-admin",
    { schema: { body: bootstrapAdminSchema } },
    async (req, reply) => {
      const bestehende = await findAllByType<Benutzer>("benutzer");
      if (bestehende.length > 0) {
        return reply
          .code(409)
          .send({ error: "Es existiert bereits mindestens ein Benutzer - Bootstrap nicht mehr möglich." });
      }

      const verstoss = passwortRegelVerstoss(req.body.passwort);
      if (verstoss) return reply.code(400).send({ error: verstoss });

      const id = newId("benutzer");
      const benutzer: Benutzer = {
        _id: id,
        docType: "benutzer",
        benutzerId: id,
        email: req.body.email.trim().toLowerCase(),
        passwortHash: await hashePasswort(req.body.passwort),
        name: req.body.name,
        globaleRolle: "admin",
        sprache: "de",
        zweiFaAktiv: false,
        gesperrt: false,
        erstelltAm: new Date().toISOString(),
      };
      const gespeichert = await insertDoc(benutzer);
      return reply.code(201).send(oeffentlichesProfil(gespeichert));
    },
  );
}

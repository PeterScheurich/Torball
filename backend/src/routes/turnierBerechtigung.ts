import type { FastifyInstance } from "fastify";
import type { Benutzer, Turnier, TurnierBerechtigung, TurnierRolle } from "@torball/shared";
import { deleteDoc, findAllBySelector, findAllByType, findById, insertDoc, newId } from "../repository";
import { SENSIBEL_RATE_LIMIT } from "../rateLimit";
import { requireZugriff } from "../auth/plugin";
import { hatMindestens, turnierZugriffsstufe, zuschreibung } from "../auth/turnierZugriff";

// Vergabe/Entzug turnierbezogener Zugriffsrechte (TurnierBerechtigung) an andere Benutzer -
// die Datenbasis fuer das Berechtigungsmodell (siehe turnierZugriff.ts). UI: TurnierFreigabe.

interface BerechtigungVergebenBody {
  benutzerId: string;
  rolle: TurnierRolle;
}

const berechtigungVergebenSchema = {
  type: "object",
  required: ["benutzerId", "rolle"],
  properties: {
    benutzerId: { type: "string", minLength: 1 },
    rolle: { type: "string", enum: ["turnierleitung", "spielleitung", "lesen"] },
  },
} as const;

const benutzerSucheSchema = {
  type: "object",
  required: ["email"],
  properties: { email: { type: "string", minLength: 3, maxLength: 254 } },
} as const;

export async function turnierBerechtigungRoutes(app: FastifyInstance): Promise<void> {
  // Alle fuer ein Turnier vergebenen Berechtigungen (nur mit Schreibzugriff einsehbar).
  app.get<{ Params: { turnierId: string } }>("/turniere/:turnierId/berechtigungen", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.turnierId);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    const berechtigungen = await findAllBySelector<TurnierBerechtigung>({
      docType: "turnierBerechtigung",
      turnierId: turnier._id,
    });
    // Der Name wird hier mitgeliefert, damit die Freigabe-Oberflaeche KEINE Benutzerliste braucht
    // (Datenschutz: siehe die Suche unten). Bewusst nur der Name, keine E-Mail-Adresse.
    return Promise.all(
      berechtigungen.map(async (b) => ({
        ...b,
        benutzerName: (await findById<Benutzer>(b.benutzerId))?.name,
      })),
    );
  });

  /**
   * Findet eine Person fuer die Freigabe ueber ihre GENAUE E-Mail-Adresse und liefert nur ID und
   * Namen zurueck. Ersetzt die frueher angebotene Auswahl aus der Liste ALLER Benutzer (mit
   * Adresse): Die kam ueber GET /benutzer, das jede Manager-Rolle mit dem VOLLEN Profil aller
   * Konten beliefert (Telefon, Adresse, Verein/Verband) - Hinweis eines Testers, 2026-10-06.
   * Es gibt bewusst keine Teilsuche und keine Liste: Wer die Adresse nicht kennt, findet niemanden.
   * Die Antwort verraet, ob eine Adresse registriert ist; das ist hier hinnehmbar (die Person soll
   * ja gefunden werden), deshalb nur mit eigener Berechtigung auf das Turnier und mit dem strengen
   * Rate-Limit. POST statt GET, damit die Adresse nicht in der URL (Logs, Verlauf) landet.
   */
  app.post<{ Params: { turnierId: string }; Body: { email: string } }>(
    "/turniere/:turnierId/berechtigungen/suche",
    { schema: { body: benutzerSucheSchema }, config: { rateLimit: SENSIBEL_RATE_LIMIT } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await turnierZugriffsstufe(turnier, req))) {
        return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
      }
      const email = req.body.email.trim().toLowerCase();
      const alle = await findAllByType<Benutzer>("benutzer");
      const treffer = alle.find((b) => b.email.toLowerCase() === email && !b.gesperrt);
      if (!treffer) {
        return reply.code(404).send({ error: "Zu dieser E-Mail-Adresse gibt es kein Konto." });
      }
      return { benutzerId: treffer._id, name: treffer.name };
    },
  );

  /**
   * Abschnitt 21.2: Wer Schreibrecht hat, kann Schreib- oder Leserecht vergeben; wer nur
   * Leserecht hat, kann nur Leserecht weitergeben. Eine bestehende Berechtigung desselben
   * Benutzers fuer dieses Turnier wird ersetzt statt dupliziert.
   */
  app.post<{ Params: { turnierId: string }; Body: BerechtigungVergebenBody }>(
    "/turniere/:turnierId/berechtigungen",
    { schema: { body: berechtigungVergebenSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

      const eigeneStufe = await turnierZugriffsstufe(turnier, req);
      if (!eigeneStufe) return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
      // Abschnitt 21.2 (dreistufig): nur mit vollem Schreibzugriff duerfen die beiden
      // Schreibrollen (turnierleitung/spielleitung) vergeben werden - wer nur Spielbetrieb- oder
      // Leserecht hat, kann ausschliesslich Leserecht weitergeben.
      if (eigeneStufe !== "schreiben_voll" && req.body.rolle !== "lesen") {
        return reply.code(403).send({ error: "Nur mit vollem Schreibzugriff können Schreibrechte vergeben werden." });
      }

      const zielBenutzer = await findById(req.body.benutzerId);
      if (!zielBenutzer) return reply.code(400).send({ error: "Referenzierter Benutzer existiert nicht" });

      const bestehende = await findAllBySelector<TurnierBerechtigung>({
        docType: "turnierBerechtigung",
        turnierId: turnier._id,
        benutzerId: req.body.benutzerId,
      });
      for (const alt of bestehende) {
        await deleteDoc(alt._id, alt._rev!);
      }

      const id = newId("turnierBerechtigung");
      const berechtigung: TurnierBerechtigung = {
        _id: id,
        docType: "turnierBerechtigung",
        berechtigungId: id,
        turnierId: turnier._id,
        benutzerId: req.body.benutzerId,
        rolle: req.body.rolle,
        vergebenVon: zuschreibung(req).benutzerId,
        vergebenAm: new Date().toISOString(),
      };
      const gespeichert = await insertDoc(berechtigung);
      return reply.code(201).send(gespeichert);
    },
  );

  /** Abschnitt 21.2: "Schreibrechte koennen von jedem mit Schreibrecht entzogen werden." */
  app.delete<{ Params: { id: string } }>("/berechtigungen/:id", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const bestehend = await findById<TurnierBerechtigung>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Berechtigung nicht gefunden" });

    const turnier = await findById<Turnier>(bestehend.turnierId);
    if (!turnier || !(await hatMindestens(turnier, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }

    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

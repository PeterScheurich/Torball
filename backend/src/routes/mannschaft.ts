import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MannschaftImTurnier, Spieler, Turnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireZugriff } from "../auth/plugin";
import {
  hatMindestens,
  istAbgeleitet,
  MANNSCHAFTEN_ABGELEITET_FEHLER,
  turnierAusgecheckt,
  TURNIER_AUSGECHECKT_FEHLER,
  TURNIER_GESPERRT_FEHLER,
  turnierGesperrt,
} from "../auth/turnierZugriff";
import { markiereTurnierBearbeitet } from "../turnier/bearbeitet";
import { IDENTITAETS_FELDER, ohneFelder } from "../eingabe";

// Server-kontrollierte Felder, die nie aus dem Body uebernommen werden (siehe eingabe.ts):
// Identitaet + die denormalisierte mannschaftId + die serverseitig vergebene reihenfolge; beim
// Aendern zusaetzlich turnierId (eine Mannschaft wechselt ihr Turnier nicht).
const NUR_SERVER_POST = [...IDENTITAETS_FELDER, "mannschaftId", "reihenfolge"] as const;
const NUR_SERVER_PUT = [...IDENTITAETS_FELDER, "mannschaftId", "turnierId", "reihenfolge"] as const;

interface MannschaftBody {
  turnierId: string;
  teamId?: string;
  vereinId?: string;
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
  betreuer1Name?: string;
  betreuer1IstSchiedsrichter?: boolean;
  betreuer2Name?: string;
  betreuer2IstSchiedsrichter?: boolean;
  betreuer3Name?: string;
  betreuer3IstSchiedsrichter?: boolean;
}

const mannschaftBodySchema = {
  type: "object",
  required: ["turnierId", "name"],
  properties: {
    turnierId: { type: "string", minLength: 1 },
    teamId: { type: "string" },
    vereinId: { type: "string" },
    name: { type: "string", minLength: 1 },
    logo: { type: "string" },
    bundesland: { type: "string" },
    ansprechpartnerName: { type: "string" },
    ansprechpartnerTelefon: { type: "string" },
    ansprechpartnerEmail: { type: "string" },
    betreuer1Name: { type: "string" },
    betreuer1IstSchiedsrichter: { type: "boolean" },
    betreuer2Name: { type: "string" },
    betreuer2IstSchiedsrichter: { type: "boolean" },
    betreuer3Name: { type: "string" },
    betreuer3IstSchiedsrichter: { type: "boolean" },
  },
} as const;

interface MannschaftAktualisierungBody {
  teamId?: string;
  vereinId?: string;
  name: string;
  logo?: string;
  bundesland?: string;
  ansprechpartnerName?: string;
  ansprechpartnerTelefon?: string;
  ansprechpartnerEmail?: string;
  betreuer1Name?: string;
  betreuer1IstSchiedsrichter?: boolean;
  betreuer2Name?: string;
  betreuer2IstSchiedsrichter?: boolean;
  betreuer3Name?: string;
  betreuer3IstSchiedsrichter?: boolean;
}

// Optionale Freitextfelder akzeptieren beim Aktualisieren bewusst auch null, damit ein
// bereits gesetztes Feld (z.B. Bundesland) gezielt geleert werden kann - undefined wuerde
// via JSON.stringify aus dem Body fallen und der Merge liesse den alten Wert stehen.
const mannschaftAktualisierungSchema = {
  type: "object",
  required: ["name"],
  properties: {
    teamId: { type: ["string", "null"] },
    vereinId: { type: ["string", "null"] },
    name: { type: "string", minLength: 1 },
    logo: { type: ["string", "null"] },
    bundesland: { type: ["string", "null"] },
    ansprechpartnerName: { type: ["string", "null"] },
    ansprechpartnerTelefon: { type: ["string", "null"] },
    ansprechpartnerEmail: { type: ["string", "null"] },
    betreuer1Name: { type: ["string", "null"] },
    betreuer1IstSchiedsrichter: { type: "boolean" },
    betreuer2Name: { type: ["string", "null"] },
    betreuer2IstSchiedsrichter: { type: "boolean" },
    betreuer3Name: { type: ["string", "null"] },
    betreuer3IstSchiedsrichter: { type: "boolean" },
  },
} as const;

interface ReihenfolgeBody {
  mannschaftIds: string[];
}

const reihenfolgeSchema = {
  type: "object",
  required: ["mannschaftIds"],
  properties: {
    mannschaftIds: { type: "array", items: { type: "string" }, minItems: 1 },
  },
} as const;

/** Lesehilfe: Mannschaft laden und pruefen, ob req.benutzer mindestens Lesezugriff auf deren Turnier hat. */
async function ladeMitLesezugriff(
  id: string,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<MannschaftImTurnier | undefined> {
  if (!requireZugriff(req, reply)) return undefined;
  const mannschaft = await findById<MannschaftImTurnier>(id);
  if (!mannschaft) {
    reply.code(404).send({ error: "Mannschaft nicht gefunden" });
    return undefined;
  }
  const turnier = await findById<Turnier>(mannschaft.turnierId);
  if (!turnier || !(await hatMindestens(turnier, req, "lesen"))) {
    reply.code(403).send({ error: "Kein Zugriff auf das zugehörige Turnier" });
    return undefined;
  }
  return mannschaft;
}

/** Ein Team darf in einem Turnier nur einmal als Mannschaft auftreten - ausgenommenId beim
 * Aendern einer bestehenden Mannschaft mitgeben, damit sie sich nicht selbst blockiert. */
async function teamBereitsVerwendet(turnierId: string, teamId: string, ausgenommenId?: string): Promise<boolean> {
  const bestehende = await findAllBySelector<MannschaftImTurnier>({
    docType: "mannschaftImTurnier",
    turnierId,
    teamId,
  });
  return bestehende.some((m) => m._id !== ausgenommenId);
}

/** Wie ladeMitLesezugriff, aber verlangt Schreibzugriff (fuer Aendern/Loeschen). */
async function ladeMitSchreibzugriff(
  id: string,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<MannschaftImTurnier | undefined> {
  if (!requireZugriff(req, reply)) return undefined;
  const mannschaft = await findById<MannschaftImTurnier>(id);
  if (!mannschaft) {
    reply.code(404).send({ error: "Mannschaft nicht gefunden" });
    return undefined;
  }
  const turnier = await findById<Turnier>(mannschaft.turnierId);
  if (!turnier || !(await hatMindestens(turnier, req, "schreiben_voll"))) {
    reply.code(403).send({ error: "Kein Schreibzugriff auf das zugehörige Turnier" });
    return undefined;
  }
  if (turnierGesperrt(turnier)) {
    reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
    return undefined;
  }
  if (await turnierAusgecheckt(turnier._id)) {
    reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
    return undefined;
  }
  // Mannschaften eines abgeleiteten Turniers (zweiter Spieltag) sind hart gesperrt - kein
  // Aendern/Loeschen/Umsortieren, kein Entsperren (fachlich: gleiche Teams ueber beide Spieltage).
  if (istAbgeleitet(turnier)) {
    reply.code(409).send({ error: MANNSCHAFTEN_ABGELEITET_FEHLER });
    return undefined;
  }
  return mannschaft;
}

export async function mannschaftRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { turnierId: string } }>("/turniere/:turnierId/mannschaften", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.turnierId);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "lesen"))) {
      return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    }
    return findAllBySelector<MannschaftImTurnier>({
      docType: "mannschaftImTurnier",
      turnierId: req.params.turnierId,
    });
  });

  app.get<{ Params: { id: string } }>("/mannschaften/:id", async (req, reply) => {
    return ladeMitLesezugriff(req.params.id, req, reply);
  });

  app.post<{ Body: MannschaftBody }>(
    "/mannschaften",
    { schema: { body: mannschaftBodySchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.body.turnierId);
      if (!turnier) {
        return reply.code(400).send({ error: "Referenziertes Turnier existiert nicht" });
      }
      if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }
      if (turnierGesperrt(turnier)) {
        return reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
      }
      if (await turnierAusgecheckt(turnier._id)) {
        return reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
      }
      if (istAbgeleitet(turnier)) {
        return reply.code(409).send({ error: MANNSCHAFTEN_ABGELEITET_FEHLER });
      }

      // Neue Mannschaft wird immer ans Ende der bisherigen Reihenfolge angehaengt.
      const bestehende = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: req.body.turnierId,
      });

      if (req.body.teamId && bestehende.some((m) => m.teamId === req.body.teamId)) {
        return reply
          .code(409)
          .send({ error: "Dieses Team ist in diesem Turnier bereits als Mannschaft angemeldet" });
      }

      const naechsteReihenfolge = bestehende.reduce((max, m) => Math.max(max, m.reihenfolge ?? 0), -1) + 1;

      const id = newId("mannschaftImTurnier");
      const mannschaft: MannschaftImTurnier = {
        _id: id,
        docType: "mannschaftImTurnier",
        mannschaftId: id,
        reihenfolge: naechsteReihenfolge,
        // Zusatzfelder (_id/docType/…) aus dem Body entfernen, damit sie die oben gesetzten
        // Server-Felder nicht ueberschreiben koennen (sonst z.B. Anlage eines Fremd-Dokuments).
        ...ohneFelder(req.body, NUR_SERVER_POST),
      };
      const gespeichert = await insertDoc(mannschaft);
      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: MannschaftAktualisierungBody }>(
    "/mannschaften/:id",
    { schema: { body: mannschaftAktualisierungSchema } },
    async (req, reply) => {
      const bestehend = await ladeMitSchreibzugriff(req.params.id, req, reply);
      if (!bestehend) return;

      if (req.body.teamId && (await teamBereitsVerwendet(bestehend.turnierId, req.body.teamId, bestehend._id))) {
        return reply
          .code(409)
          .send({ error: "Dieses Team ist in diesem Turnier bereits als Mannschaft angemeldet" });
      }

      const aktualisiert: MannschaftImTurnier = { ...bestehend, ...ohneFelder(req.body, NUR_SERVER_PUT) };
      const gespeichert = await insertDoc(aktualisiert);
      await markiereTurnierBearbeitet(bestehend.turnierId, req.benutzer);
      return gespeichert;
    },
  );

  /** Reihenfolge der Mannschaften aendern - wirkt sich auf kuenftig erzeugte Spielplan-Vorschlaege aus. */
  app.put<{ Params: { turnierId: string }; Body: ReihenfolgeBody }>(
    "/turniere/:turnierId/mannschaften/reihenfolge",
    { schema: { body: reihenfolgeSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }
      if (await turnierAusgecheckt(turnier._id)) {
        return reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
      }

      const bestehende = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: req.params.turnierId,
      });

      const bestehendeIds = new Set(bestehende.map((m) => m._id));
      const { mannschaftIds } = req.body;
      const passtZusammen =
        mannschaftIds.length === bestehende.length && mannschaftIds.every((id) => bestehendeIds.has(id));
      if (!passtZusammen) {
        return reply
          .code(400)
          .send({ error: "mannschaftIds muss exakt alle Mannschaften dieses Turniers enthalten, je einmal" });
      }

      const mannschaftenNachId = new Map(bestehende.map((m) => [m._id, m]));
      const aktualisiert: MannschaftImTurnier[] = [];
      for (const [index, id] of mannschaftIds.entries()) {
        const mannschaft = mannschaftenNachId.get(id)!;
        aktualisiert.push(await insertDoc({ ...mannschaft, reihenfolge: index }));
      }

      await markiereTurnierBearbeitet(req.params.turnierId, req.benutzer);
      return aktualisiert;
    },
  );

  app.delete<{ Params: { id: string } }>("/mannschaften/:id", async (req, reply) => {
    const bestehend = await ladeMitSchreibzugriff(req.params.id, req, reply);
    if (!bestehend) return;

    // Kader haengt am mannschaftId und hat keine Existenz ausserhalb der Mannschaft
    // (ON DELETE CASCADE) - vor der Mannschaft mitloeschen, sonst blieben verwaiste
    // Spieler-Dokumente zurueck.
    const spieler = await findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: bestehend._id });
    for (const s of spieler) {
      await deleteDoc(s._id, s._rev!);
    }

    // Schiedsrichter referenzieren seit der Umstellung auf vereinId (2026-08-14) keine
    // turnierlokale Mannschaft mehr, sondern den (turnieruebergreifenden) Verein - eine
    // Kaskade auf die Mannschaft ist deshalb nicht mehr noetig.
    await deleteDoc(bestehend._id, bestehend._rev!);
    await markiereTurnierBearbeitet(bestehend.turnierId, req.benutzer);
    return reply.code(204).send();
  });
}

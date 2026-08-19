import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SchiedsrichterImTurnier, Turnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireZugriff } from "../auth/plugin";
import {
  hatMindestens,
  turnierAusgecheckt,
  TURNIER_AUSGECHECKT_FEHLER,
  TURNIER_GESPERRT_FEHLER,
  turnierGesperrt,
  type Zugriffsstufe,
} from "../auth/turnierZugriff";
import { markiereTurnierBearbeitet } from "../turnier/bearbeitet";

// CRUD fuer turnierbezogene Schiedsrichter (SchiedsrichterImTurnier haengt am turnierId).
// Zugriff laeuft ueber das Turnier (turnierZugriff); genau eine Person je Turnier ist
// istTurnierleitung (das Frontend erzwingt die Einzelauswahl). vereinId ist ein reiner
// Herkunftsverweis (kein Live-Join, analog MannschaftImTurnier.vereinId) - das Loeschen einer
// Mannschaft oder eines Vereins wirkt sich deshalb NICHT auf bestehende Schiedsrichter-
// Eintraege aus (anders als frueher bei der mannschaftId-Referenz, die eine turnierlokale
// Entitaet traf und beim Mannschaft-Loeschen extra geloest werden musste).

interface SchiedsrichterBody {
  turnierId: string;
  name: string;
  vorname?: string;
  telefon?: string;
  email?: string;
  lizenzVorhanden?: boolean;
  vereinId?: string;
  istTurnierleitung?: boolean;
  nurTurnierleitung?: boolean;
  /** Gesetzt, wenn das Anlege-Formular aus den Schiedsrichter-Stammdaten vorbefuellt wurde
   *  (siehe SchiedsrichterVerwaltung.tsx "aus Stammdaten übernehmen") - reiner Herkunftsverweis,
   *  keine Live-Verknuepfung (analog teamId/vereinId bei MannschaftImTurnier). */
  importiertAusStammdatenSchiedsrichterId?: string;
}

const schiedsrichterBodySchema = {
  type: "object",
  required: ["turnierId", "name"],
  properties: {
    turnierId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    vorname: { type: "string" },
    telefon: { type: "string" },
    email: { type: "string" },
    lizenzVorhanden: { type: "boolean" },
    vereinId: { type: "string" },
    istTurnierleitung: { type: "boolean" },
    nurTurnierleitung: { type: "boolean" },
    importiertAusStammdatenSchiedsrichterId: { type: "string" },
  },
} as const;

interface SchiedsrichterAktualisierungBody {
  name: string;
  vorname?: string;
  telefon?: string;
  email?: string;
  lizenzVorhanden: boolean;
  vereinId?: string;
  istTurnierleitung: boolean;
  nurTurnierleitung?: boolean;
}

// Optionale Freitextfelder (inkl. vereinId) akzeptieren beim Aktualisieren bewusst auch
// null, damit sie gezielt geleert werden koennen - undefined fiele via JSON.stringify aus dem
// Body und der Merge liesse den alten Wert stehen (siehe CLAUDE.md).
const schiedsrichterAktualisierungSchema = {
  type: "object",
  required: ["name", "lizenzVorhanden", "istTurnierleitung"],
  properties: {
    name: { type: "string", minLength: 1 },
    vorname: { type: ["string", "null"] },
    telefon: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    lizenzVorhanden: { type: "boolean" },
    vereinId: { type: ["string", "null"] },
    istTurnierleitung: { type: "boolean" },
    nurTurnierleitung: { type: "boolean" },
  },
} as const;

/** Turnier laden und pruefen, ob req.benutzer die geforderte Zugriffsstufe hat. */
async function ladeTurnierMitZugriff(
  turnierId: string,
  stufe: Zugriffsstufe,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<Turnier | undefined> {
  const turnier = await findById<Turnier>(turnierId);
  if (!turnier) {
    reply.code(404).send({ error: "Turnier nicht gefunden" });
    return undefined;
  }
  if (!(await hatMindestens(turnier, req, stufe))) {
    reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    return undefined;
  }
  if (stufe !== "lesen" && turnierGesperrt(turnier)) {
    reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
    return undefined;
  }
  if (stufe !== "lesen" && (await turnierAusgecheckt(turnier._id))) {
    reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
    return undefined;
  }
  return turnier;
}

/** Schiedsrichter laden und Zugriff ueber dessen Turnier pruefen. */
async function ladeSchiedsrichterMitZugriff(
  id: string,
  stufe: Zugriffsstufe,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<SchiedsrichterImTurnier | undefined> {
  const schiedsrichter = await findById<SchiedsrichterImTurnier>(id);
  if (!schiedsrichter) {
    reply.code(404).send({ error: "Schiedsrichter nicht gefunden" });
    return undefined;
  }
  const turnier = await ladeTurnierMitZugriff(schiedsrichter.turnierId, stufe, req, reply);
  if (!turnier) return undefined;
  return schiedsrichter;
}

export async function schiedsrichterRoutes(app: FastifyInstance): Promise<void> {
  // Alle Schiedsrichter eines Turniers (Leserecht genuegt).
  app.get<{ Params: { turnierId: string } }>(
    "/turniere/:turnierId/schiedsrichter",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await ladeTurnierMitZugriff(req.params.turnierId, "lesen", req, reply);
      if (!turnier) return;
      return findAllBySelector<SchiedsrichterImTurnier>({
        docType: "schiedsrichterImTurnier",
        turnierId: turnier._id,
      });
    },
  );

  // Neuen Schiedsrichter zum Turnier anlegen (Schreibrecht noetig).
  app.post<{ Body: SchiedsrichterBody }>(
    "/schiedsrichter",
    { schema: { body: schiedsrichterBodySchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await ladeTurnierMitZugriff(req.body.turnierId, "schreiben_voll", req, reply);
      if (!turnier) return;

      const id = newId("schiedsrichterImTurnier");
      const schiedsrichter: SchiedsrichterImTurnier = {
        _id: id,
        docType: "schiedsrichterImTurnier",
        schiedsrichterId: id,
        turnierId: turnier._id,
        name: req.body.name,
        vorname: req.body.vorname ?? undefined,
        telefon: req.body.telefon ?? undefined,
        email: req.body.email ?? undefined,
        lizenzVorhanden: req.body.lizenzVorhanden ?? false,
        vereinId: req.body.vereinId ?? undefined,
        istTurnierleitung: req.body.istTurnierleitung ?? false,
        // "nur Turnierleitung" ist nur sinnvoll, wenn die Person auch Turnierleitung ist.
        nurTurnierleitung: (req.body.istTurnierleitung ?? false) && (req.body.nurTurnierleitung ?? false),
        importiertAusStammdatenSchiedsrichterId: req.body.importiertAusStammdatenSchiedsrichterId ?? undefined,
      };
      const gespeichert = await insertDoc(schiedsrichter);
      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      return reply.code(201).send(gespeichert);
    },
  );

  // Schiedsrichter aktualisieren (Merge; optionale Felder per null leerbar).
  app.put<{ Params: { id: string }; Body: SchiedsrichterAktualisierungBody }>(
    "/schiedsrichter/:id",
    { schema: { body: schiedsrichterAktualisierungSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const bestehend = await ladeSchiedsrichterMitZugriff(req.params.id, "schreiben_voll", req, reply);
      if (!bestehend) return;

      const aktualisiert: SchiedsrichterImTurnier = { ...bestehend, ...req.body };
      // "nur Turnierleitung" ohne Turnierleitung ist bedeutungslos - konsequent zuruecksetzen.
      if (!aktualisiert.istTurnierleitung) aktualisiert.nurTurnierleitung = false;
      const gespeichert = await insertDoc(aktualisiert);
      await markiereTurnierBearbeitet(bestehend.turnierId, req.benutzer);
      return gespeichert;
    },
  );

  // Schiedsrichter loeschen.
  app.delete<{ Params: { id: string } }>("/schiedsrichter/:id", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const bestehend = await ladeSchiedsrichterMitZugriff(req.params.id, "schreiben_voll", req, reply);
    if (!bestehend) return;
    await deleteDoc(bestehend._id, bestehend._rev!);
    await markiereTurnierBearbeitet(bestehend.turnierId, req.benutzer);
    return reply.code(204).send();
  });
}

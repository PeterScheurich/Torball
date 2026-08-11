import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  MannschaftImTurnier,
  Protokollierungsart,
  SchiedsrichterImTurnier,
  Spiel,
  Spieler,
  Turnier,
  Turnierregeln,
  TurnierStatus,
} from "@torball/shared";
import { deleteDoc, findAllByType, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireAuth, requireRolle } from "../auth/plugin";
import { hatMindestens } from "../auth/turnierZugriff";
import { aktuelleTurnierregeln } from "../konfiguration";

/** Felder, die der Client beim Anlegen setzen kann; alles andere bekommt einen Default (Abschnitt 20.5). */
type TurnierBody = Partial<Omit<Turnier, "_id" | "_rev" | "docType" | "turnierId">> &
  Pick<Turnier, "name" | "datum">;

const turnierBodySchema = {
  type: "object",
  required: ["name", "datum"],
  properties: {
    name: { type: "string", minLength: 1 },
    datum: { type: "string", minLength: 1 },
    status: { type: "string", enum: ["entwurf", "aktiv", "abgeschlossen", "archiviert"] },
    protokollierungsart: { type: "string", enum: ["digital", "manuell"] },
    spielplanModus: { type: "string", enum: ["einfach", "doppelt"] },
  },
  // Weitere Turnier-Felder sind ueber die TypeScript-Typen abgedeckt; hier nur die
  // Pflichtfelder und die beiden Enum-Felder strikt validiert.
  additionalProperties: true,
} as const;

/** Standardwerte laut Gesamtspezifikation Abschnitt 20.5. Die Regelfelder kommen als `regeln`
 * herein (aus der aktuellen Systemkonfiguration bzw. den fest verdrahteten Standardregeln). */
function turnierDefaults(
  regeln: Turnierregeln,
): Omit<Turnier, "_id" | "docType" | "turnierId" | "name" | "datum" | "erstelltAm"> {
  const status: TurnierStatus = "entwurf";
  const protokollierungsart: Protokollierungsart = "digital";

  return {
    status,
    felder: [],
    protokollierungsart,
    spielplanModus: "einfach",
    ...regeln,
    spielernamenOeffentlich: false,
    spielplanFreigegeben: false,
    spielplanVersion: 0,
    oeffentlichTurnierinfos: false,
    oeffentlichAnfahrtDokumente: false,
    oeffentlichSpielplan: false,
    oeffentlichErgebnisse: false,
  };
}

/** Fehlende Felder aelterer, vor deren Einfuehrung angelegter Turnier-Dokumente auffuellen. */
function mitDefaults(turnier: Turnier): Turnier {
  return { ...turnier, spielplanModus: turnier.spielplanModus ?? "einfach" };
}

export async function turnierRoutes(app: FastifyInstance): Promise<void> {
  app.get("/turniere", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const alle = (await findAllByType<Turnier>("turnier")).map(mitDefaults);
    const zugriffe = await Promise.all(alle.map((t) => hatMindestens(t, req.benutzer, "lesen")));
    return alle.filter((_, i) => zugriffe[i]);
  });

  app.get<{ Params: { id: string } }>("/turniere/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req.benutzer, "lesen"))) {
      return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    }
    return mitDefaults(turnier);
  });

  app.post<{ Body: TurnierBody }>(
    "/turniere",
    { schema: { body: turnierBodySchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const id = newId("turnier");
      const { regeln, version } = await aktuelleTurnierregeln();
      const turnier: Turnier = {
        _id: id,
        docType: "turnier",
        turnierId: id,
        erstelltAm: new Date().toISOString(),
        erstelltVon: req.benutzer!._id,
        erstelltMitKonfigVersion: version,
        ...turnierDefaults(regeln),
        ...req.body,
      };
      const gespeichert = await insertDoc(turnier);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<TurnierBody> }>(
    "/turniere/:id",
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const bestehend = await findById<Turnier>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(bestehend, req.benutzer, "schreiben"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }
      const aktualisiert: Turnier = {
        ...bestehend,
        ...req.body,
        geaendertAm: new Date().toISOString(),
      };
      return insertDoc(aktualisiert);
    },
  );

  // Turnier abschliessen bzw. wieder oeffnen. Bewusst eigene Endpunkte statt eines rohen
  // Status-PUT: nur die klar definierten Uebergaenge sind moeglich, und die Absicht ist im
  // Aufruf ersichtlich. Erlaubt fuer Schreibzugriff (= "Turnierleitung": Admin,
  // Manager-Ersteller oder vergebene turnierleitung/spielleitung-Berechtigung, siehe
  // turnierZugriff.ts). Der Wechsel setzt nur das Status-Feld, alles andere bleibt erhalten.
  async function statusUmschalten(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
    neuerStatus: TurnierStatus,
  ) {
    if (!requireAuth(req, reply)) return;
    const bestehend = await findById<Turnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(bestehend, req.benutzer, "schreiben"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    return insertDoc({ ...bestehend, status: neuerStatus, geaendertAm: new Date().toISOString() });
  }

  // Beendet das Turnier: erscheint in der Uebersicht danach unter "Abgeschlossen".
  app.post<{ Params: { id: string } }>("/turniere/:id/abschliessen", (req, reply) =>
    statusUmschalten(req, reply, "abgeschlossen"),
  );

  // Macht ein abgeschlossenes Turnier wieder zu einem laufenden ("aktiv") - reversibel,
  // nicht destruktiv, damit ein versehentlicher Abschluss korrigierbar bleibt.
  app.post<{ Params: { id: string } }>("/turniere/:id/wieder-oeffnen", (req, reply) =>
    statusUmschalten(req, reply, "aktiv"),
  );

  app.delete<{ Params: { id: string } }>("/turniere/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const bestehend = await findById<Turnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(bestehend, req.benutzer, "schreiben"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }

    // Turnier-Unterobjekte (Mannschaft-im-Turnier, Spiel) haben laut Datenmodell keine
    // eigenstaendige Existenz ausserhalb ihres Turniers (ON DELETE CASCADE) - werden hier
    // deshalb vor dem Turnier selbst mitgeloescht, sonst blieben verwaiste Dokumente zurueck.
    const mannschaften = await findAllBySelector<MannschaftImTurnier>({
      docType: "mannschaftImTurnier",
      turnierId: bestehend._id,
    });
    for (const mannschaft of mannschaften) {
      // Kader der Mannschaft (Spieler haengen am mannschaftId, nicht am turnierId) vor der
      // Mannschaft selbst mitloeschen - sonst blieben verwaiste Spieler-Dokumente zurueck.
      const spieler = await findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: mannschaft._id });
      for (const s of spieler) {
        await deleteDoc(s._id, s._rev!);
      }
      await deleteDoc(mannschaft._id, mannschaft._rev!);
    }

    const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: bestehend._id });
    for (const spiel of spiele) {
      await deleteDoc(spiel._id, spiel._rev!);
    }

    // Schiedsrichter-im-Turnier haengen direkt am turnierId (ON DELETE CASCADE).
    const schiedsrichter = await findAllBySelector<SchiedsrichterImTurnier>({
      docType: "schiedsrichterImTurnier",
      turnierId: bestehend._id,
    });
    for (const s of schiedsrichter) {
      await deleteDoc(s._id, s._rev!);
    }

    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

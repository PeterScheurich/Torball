import type { FastifyInstance } from "fastify";
import type { Turnier, TurnierStatus, Protokollierungsart, TabellenKriterium } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";

/** Felder, die der Client beim Anlegen setzen kann; alles andere bekommt einen Default (Abschnitt 20.5). */
type TurnierBody = Partial<Omit<Turnier, "_id" | "_rev" | "docType" | "turnierId">> &
  Pick<Turnier, "name" | "datum">;

const turnierBodySchema = {
  type: "object",
  required: ["name", "datum"],
  properties: {
    name: { type: "string", minLength: 1 },
    datum: { type: "string", minLength: 1 },
    status: { type: "string", enum: ["entwurf", "aktiv", "archiviert"] },
    protokollierungsart: { type: "string", enum: ["digital", "manuell"] },
  },
  // Weitere Turnier-Felder sind ueber die TypeScript-Typen abgedeckt; hier nur die
  // Pflichtfelder und die beiden Enum-Felder strikt validiert.
  additionalProperties: true,
} as const;

/** Standardwerte laut Gesamtspezifikation Abschnitt 20.5. */
function turnierDefaults(): Omit<Turnier, "_id" | "docType" | "turnierId" | "name" | "datum" | "erstelltAm"> {
  const status: TurnierStatus = "entwurf";
  const protokollierungsart: Protokollierungsart = "digital";
  const tabellenKriterien: TabellenKriterium[] = [
    "punkte",
    "tordifferenz",
    "tore",
    "direkter_vergleich",
    "freiwuerfe",
  ];

  return {
    status,
    felder: [],
    protokollierungsart,
    spielzeitMinuten: 5,
    anzahlHalbzeiten: 2,
    pauseMinuten: 2,
    seitenwechsel: true,
    timeoutsJeHalbzeit: 1,
    timeoutDauerSekunden: 30,
    auswechslungenJeHalbzeit: 3,
    tordifferenzAbbruch: true,
    tordifferenzLimit: 10,
    verlaengerungAktiv: true,
    silbernesTor: true,
    maxSehendeSpieler: 1,
    einstelligeTrikotnummern: true,
    punkteSieg: 2,
    punkteUnentschieden: 1,
    punkteNiederlage: 0,
    tabellenKriterien,
    spielernamenOeffentlich: false,
    spielplanFreigegeben: false,
    spielplanVersion: 0,
    oeffentlichTurnierinfos: false,
    oeffentlichAnfahrtDokumente: false,
    oeffentlichSpielplan: false,
    oeffentlichErgebnisse: false,
  };
}

export async function turnierRoutes(app: FastifyInstance): Promise<void> {
  app.get("/turniere", async () => {
    return findAllByType<Turnier>("turnier");
  });

  app.get<{ Params: { id: string } }>("/turniere/:id", async (req, reply) => {
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    return turnier;
  });

  app.post<{ Body: TurnierBody }>(
    "/turniere",
    { schema: { body: turnierBodySchema } },
    async (req, reply) => {
      const id = newId("turnier");
      const turnier: Turnier = {
        _id: id,
        docType: "turnier",
        turnierId: id,
        erstelltAm: new Date().toISOString(),
        ...turnierDefaults(),
        ...req.body,
      };
      const gespeichert = await insertDoc(turnier);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<TurnierBody> }>(
    "/turniere/:id",
    async (req, reply) => {
      const bestehend = await findById<Turnier>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      const aktualisiert: Turnier = {
        ...bestehend,
        ...req.body,
        geaendertAm: new Date().toISOString(),
      };
      return insertDoc(aktualisiert);
    },
  );

  app.delete<{ Params: { id: string } }>("/turniere/:id", async (req, reply) => {
    const bestehend = await findById<Turnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    await deleteDoc(bestehend._id, bestehend._rev!);
    return reply.code(204).send();
  });
}

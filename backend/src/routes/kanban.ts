import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { KanbanKarte, KanbanKategorie, KanbanNotiz, KanbanPrioritaet, KanbanSpalte } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";
import { requireRolle } from "../auth/plugin";

const KANBAN_SPALTEN: KanbanSpalte[] = ["offen", "inArbeit", "testen", "erledigt"];
const KANBAN_KATEGORIEN: KanbanKategorie[] = ["bug", "feature", "wunsch", "aufgabe", "sonstiges"];
const KANBAN_PRIORITAETEN: KanbanPrioritaet[] = ["hoch", "mittel", "niedrig"];

/**
 * Entwicklungs-Kanban-Board (nur Admins). Eigenstaendige Entitaet ohne Bezug zum
 * Torball-Fachmodell - dient der Organisation der Weiterentwicklung.
 *
 * Nur auf der Entwicklungsinstanz sichtbar (`KANBAN_BOARD_AKTIV=true` in backend/.env,
 * analog `MAIL_POSTFACH_AKTIV`) - Feedback/Fehlermeldungen von Prod/Demo laufen inzwischen
 * ueber das Mail-Postfach (das erkannte Anforderungen ohnehin automatisch als Kanban-Karte
 * anlegt), ein instanzuebergreifender Karten-Abgleich (frueher: JSON-Export/-Import, siehe
 * Git-Historie) ist damit ueberfluessig geworden.
 */
function kanbanBoardAktiv(): boolean {
  return process.env.KANBAN_BOARD_AKTIV === "true";
}

const vorbedingung = (req: FastifyRequest, reply: FastifyReply): boolean => {
  if (!requireRolle(req, reply, ["admin"])) return false;
  if (!kanbanBoardAktiv()) {
    reply.code(403).send({ error: "Entwicklungs-Board ist auf dieser Instanz nicht freigeschaltet (nur Dev)." });
    return false;
  }
  return true;
};

const SPALTEN = KANBAN_SPALTEN;

interface KanbanBody {
  titel: string;
  beschreibung?: string | null;
  spalte: KanbanSpalte;
  kategorie: KanbanKategorie;
  prioritaet: KanbanPrioritaet;
}

const kanbanBodySchema = {
  type: "object",
  required: ["titel", "spalte", "kategorie", "prioritaet"],
  properties: {
    titel: { type: "string", minLength: 1 },
    // beschreibung darf null sein, um sie gezielt zu leeren (siehe CLAUDE.md zu null vs. undefined).
    beschreibung: { type: ["string", "null"] },
    spalte: { type: "string", enum: KANBAN_SPALTEN },
    kategorie: { type: "string", enum: KANBAN_KATEGORIEN },
    prioritaet: { type: "string", enum: KANBAN_PRIORITAETEN },
  },
} as const;

/** Sortiert stabil nach Spaltenreihenfolge und dann nach reihenfolge innerhalb der Spalte. */
function sortiere(karten: KanbanKarte[]): KanbanKarte[] {
  return [...karten].sort((a, b) => {
    const spalteDiff = SPALTEN.indexOf(a.spalte) - SPALTEN.indexOf(b.spalte);
    if (spalteDiff !== 0) return spalteDiff;
    return a.reihenfolge - b.reihenfolge;
  });
}

/** Naechste freie reihenfolge am Ende der Zielspalte (Karten werden unten angehaengt). */
function naechsteReihenfolge(karten: KanbanKarte[], spalte: KanbanSpalte): number {
  const inSpalte = karten.filter((k) => k.spalte === spalte);
  if (inSpalte.length === 0) return 0;
  return Math.max(...inSpalte.map((k) => k.reihenfolge)) + 1;
}

export async function kanbanRoutes(app: FastifyInstance): Promise<void> {
  // Oeffentlich (kein Login), analog GET /mail-postfach/verfuegbar - damit das Frontend den
  // Admin-Menuepunkt ausblenden kann, ohne vorher als Admin eingeloggt sein zu muessen.
  app.get("/kanban/verfuegbar", async () => {
    return { verfuegbar: kanbanBoardAktiv() };
  });

  app.get("/kanban", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    const karten = await findAllByType<KanbanKarte>("kanbanKarte");
    return { karten: sortiere(karten) };
  });

  app.post<{ Body: KanbanBody }>(
    "/kanban/karten",
    { schema: { body: kanbanBodySchema } },
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const alle = await findAllByType<KanbanKarte>("kanbanKarte");
      const jetzt = new Date().toISOString();
      const id = newId("kanbanKarte");
      const karte: KanbanKarte = {
        _id: id,
        docType: "kanbanKarte",
        kanbanId: id,
        titel: req.body.titel,
        beschreibung: req.body.beschreibung ?? undefined,
        spalte: req.body.spalte,
        kategorie: req.body.kategorie,
        prioritaet: req.body.prioritaet,
        reihenfolge: naechsteReihenfolge(alle, req.body.spalte),
        erstelltVon: req.benutzer!._id,
        erstelltVonName: req.benutzer!.name,
        erstelltVonEmail: req.benutzer!.email,
        erstelltAm: jetzt,
        aktualisiertAm: jetzt,
      };
      const gespeichert = await insertDoc(karte);
      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: KanbanBody }>(
    "/kanban/karten/:id",
    { schema: { body: kanbanBodySchema } },
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const bestehend = await findById<KanbanKarte>(req.params.id);
      if (!bestehend || bestehend.docType !== "kanbanKarte") {
        return reply.code(404).send({ error: "Karte nicht gefunden" });
      }
      const alle = await findAllByType<KanbanKarte>("kanbanKarte");
      // Wechselt die Spalte, wandert die Karte ans Ende der Zielspalte.
      const spalteGewechselt = req.body.spalte !== bestehend.spalte;
      const aktualisiert: KanbanKarte = {
        ...bestehend,
        titel: req.body.titel,
        beschreibung: req.body.beschreibung ?? undefined,
        spalte: req.body.spalte,
        kategorie: req.body.kategorie,
        prioritaet: req.body.prioritaet,
        reihenfolge: spalteGewechselt
          ? naechsteReihenfolge(
              alle.filter((k) => k._id !== bestehend._id),
              req.body.spalte,
            )
          : bestehend.reihenfolge,
        aktualisiertAm: new Date().toISOString(),
      };
      return insertDoc(aktualisiert);
    },
  );

  // Ergaenzung zur Karte anhaengen (Aktionen/Gedanken/Aenderungsvorschlaege) - bewusst nur
  // anhaengbar (kein Bearbeiten/Loeschen einzelner Notizen, analog einem Kommentarverlauf).
  // Eigener Endpunkt statt ueber das generische PUT, damit ein Race zwischen zwei gleichzeitig
  // hinzugefuegten Notizen nicht die jeweils andere ueberschreibt.
  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/kanban/karten/:id/notizen",
    {
      schema: {
        body: {
          type: "object",
          required: ["text"],
          properties: { text: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const karte = await findById<KanbanKarte>(req.params.id);
      if (!karte || karte.docType !== "kanbanKarte") {
        return reply.code(404).send({ error: "Karte nicht gefunden" });
      }
      const notiz: KanbanNotiz = {
        text: req.body.text,
        erstelltAm: new Date().toISOString(),
        erstelltVonName: req.benutzer!.name,
      };
      return insertDoc({
        ...karte,
        notizen: [...(karte.notizen ?? []), notiz],
        aktualisiertAm: new Date().toISOString(),
      });
    },
  );

  // Innerhalb der Spalte um eine Position verschieben (Tausch mit dem Nachbarn).
  // Barrierefreie Alternative zu Drag & Drop (siehe CLAUDE.md).
  app.put<{ Params: { id: string }; Body: { richtung: "hoch" | "runter" } }>(
    "/kanban/karten/:id/position",
    {
      schema: {
        body: {
          type: "object",
          required: ["richtung"],
          properties: { richtung: { type: "string", enum: ["hoch", "runter"] } },
        },
      },
    },
    async (req, reply) => {
      if (!vorbedingung(req, reply)) return;
      const karte = await findById<KanbanKarte>(req.params.id);
      if (!karte || karte.docType !== "kanbanKarte") {
        return reply.code(404).send({ error: "Karte nicht gefunden" });
      }
      const alle = await findAllByType<KanbanKarte>("kanbanKarte");
      const geschwister = sortiere(alle.filter((k) => k.spalte === karte.spalte));
      const index = geschwister.findIndex((k) => k._id === karte._id);
      const zielIndex = req.body.richtung === "hoch" ? index - 1 : index + 1;
      if (zielIndex < 0 || zielIndex >= geschwister.length) {
        // Schon ganz oben/unten - nichts zu tun, aktuellen Stand zurueckgeben.
        return sortiere(alle);
      }
      const nachbar = geschwister[zielIndex];
      const jetzt = new Date().toISOString();
      await insertDoc({ ...karte, reihenfolge: nachbar.reihenfolge, aktualisiertAm: jetzt });
      await insertDoc({ ...nachbar, reihenfolge: karte.reihenfolge, aktualisiertAm: jetzt });
      const neu = await findAllByType<KanbanKarte>("kanbanKarte");
      return sortiere(neu);
    },
  );

  app.delete<{ Params: { id: string } }>("/kanban/karten/:id", async (req, reply) => {
    if (!vorbedingung(req, reply)) return;
    const karte = await findById<KanbanKarte>(req.params.id);
    if (!karte || karte.docType !== "kanbanKarte") {
      return reply.code(404).send({ error: "Karte nicht gefunden" });
    }
    await deleteDoc(karte._id, karte._rev!);
    return reply.code(204).send();
  });
}

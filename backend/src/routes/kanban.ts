import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { KanbanKarte, KanbanKategorie, KanbanPrioritaet, KanbanSpalte } from "@torball/shared";
import { deleteDoc, findAllByType, findById, insertDoc, newId } from "../repository";
import { requireRolle } from "../auth/plugin";
import {
  KANBAN_KATEGORIEN,
  KANBAN_PRIORITAETEN,
  KANBAN_SPALTEN,
  loeseKonflikte,
  planeImport,
  type KonfliktWahl,
} from "../kanban/importMerge";

/**
 * Entwicklungs-Kanban-Board (nur Admins). Eigenstaendige Entitaet ohne Bezug zum
 * Torball-Fachmodell - dient der Organisation der Weiterentwicklung.
 *
 * Sync ueber JSON-Export/-Import (kein zusaetzlicher Server, keine Replikation noetig):
 * Export ist auf jeder Instanz erlaubt (reines Herunterladen der eigenen Karten). Der
 * schreibende Import/Merge ist bewusst nur dort freigeschaltet, wo `KANBAN_SYNC=true`
 * gesetzt ist - laut Vorgabe nur auf der Dev-Instanz, damit dort zentral zusammengefuehrt
 * wird (dieselbe Rolle, die spaeter eine CouchDB-Replikation initiieren wuerde). Siehe
 * docs/kanban-board.md.
 */
const SYNC_AKTIV = process.env.KANBAN_SYNC === "true";

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
  // Board laden. syncAktiv steuert im Frontend, ob der Import-Bereich sichtbar ist.
  app.get("/kanban", async (req, reply) => {
    if (!requireRolle(req, reply, ["admin"])) return;
    const karten = await findAllByType<KanbanKarte>("kanbanKarte");
    return { karten: sortiere(karten), syncAktiv: SYNC_AKTIV };
  });

  app.post<{ Body: KanbanBody }>(
    "/kanban/karten",
    { schema: { body: kanbanBodySchema } },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin"])) return;
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
      if (!requireRolle(req, reply, ["admin"])) return;
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
      if (!requireRolle(req, reply, ["admin"])) return;
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
    if (!requireRolle(req, reply, ["admin"])) return;
    const karte = await findById<KanbanKarte>(req.params.id);
    if (!karte || karte.docType !== "kanbanKarte") {
      return reply.code(404).send({ error: "Karte nicht gefunden" });
    }
    await deleteDoc(karte._id, karte._rev!);
    return reply.code(204).send();
  });

  /**
   * Import ist bewusst ZWEISTUFIG (nur auf der Dev-Instanz, KANBAN_SYNC=true):
   *
   *  1. /vorschau ermittelt, was passieren wuerde, OHNE zu schreiben - insbesondere die
   *     Konflikte (gleiche kanbanId, abweichender Inhalt). Es gibt KEIN automatisches
   *     Last-Write-Wins; bei Konflikten muss der Nutzer je Karte entscheiden (Vorgabe).
   *  2. /anwenden schreibt: fügt neue Karten ein und wendet die getroffenen Konflikt-
   *     Entscheidungen an ("eingehend" ueberschreibt lokal unter Beibehaltung von _id/_rev).
   *
   * Der eingehende _rev wird stets verworfen (gehoert zur Quell-DB).
   */
  const importVorbedingung = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (!requireRolle(req, reply, ["admin"])) return false;
    if (!SYNC_AKTIV) {
      reply.code(403).send({ error: "Import ist auf dieser Instanz nicht freigeschaltet (nur Dev)." });
      return false;
    }
    return true;
  };

  app.post<{ Body: { karten?: unknown } }>(
    "/kanban/import/vorschau",
    { schema: { body: { type: "object", additionalProperties: true } } },
    async (req, reply) => {
      if (!importVorbedingung(req, reply)) return;
      const eingehend = Array.isArray(req.body.karten) ? (req.body.karten as unknown[]) : null;
      if (!eingehend) {
        return reply.code(400).send({ error: "Ungueltiges Format: 'karten'-Liste fehlt." });
      }
      const bestehende = await findAllByType<KanbanKarte>("kanbanKarte");
      const plan = planeImport(bestehende, eingehend);
      return {
        neu: plan.neu,
        identisch: plan.identisch,
        konflikte: plan.konflikte,
        uebersprungen: plan.uebersprungen,
      };
    },
  );

  app.post<{ Body: { karten?: unknown; wahlen?: Record<string, KonfliktWahl> } }>(
    "/kanban/import/anwenden",
    { schema: { body: { type: "object", additionalProperties: true } } },
    async (req, reply) => {
      if (!importVorbedingung(req, reply)) return;
      const eingehend = Array.isArray(req.body.karten) ? (req.body.karten as unknown[]) : null;
      if (!eingehend) {
        return reply.code(400).send({ error: "Ungueltiges Format: 'karten'-Liste fehlt." });
      }
      const wahlen = (req.body.wahlen ?? {}) as Record<string, KonfliktWahl>;

      // Plan am Anwendungs-Zeitpunkt neu berechnen (der lokale Stand kann sich seit der
      // Vorschau geaendert haben) - so wird nie etwas ueberschrieben, das inzwischen anders ist.
      const bestehende = await findAllByType<KanbanKarte>("kanbanKarte");
      const plan = planeImport(bestehende, eingehend);
      const aufloesung = loeseKonflikte(plan.konflikte, wahlen);

      for (const karte of plan.neu) await insertDoc(karte);
      for (const karte of aufloesung.upserts) await insertDoc(karte);

      return {
        eingefuegt: plan.neu.length,
        ueberschrieben: aufloesung.upserts.length,
        lokalBehalten: aufloesung.lokalBehalten,
        identisch: plan.identisch,
        offen: aufloesung.offen,
        uebersprungen: plan.uebersprungen,
      };
    },
  );
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Event, EventTyp, Halbzeit, Mannschaftsseite, Spiel, Spielprotokoll, Turnier } from "@torball/shared";
import { findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireZugriff } from "../auth/plugin";
import {
  darfProtokollieren,
  hatMindestens,
  turnierAusgecheckt,
  TURNIER_AUSGECHECKT_FEHLER,
  turnierGesperrt,
  TURNIER_GESPERRT_FEHLER,
  zuschreibung,
} from "../auth/turnierZugriff";
import { ergebnisAusEvents, sortiertNachSequenz } from "../protokoll/ereignisse";

/**
 * Digitale Protokollierung (Abschnitt 22, Design: docs/digitales-protokoll-konzept.md): je Spiel
 * ein Spielprotokoll-Dokument plus ein append-only Event-Strom. Events werden NIE geaendert oder
 * geloescht (Spez. 7.1) - dieser Endpunkt kann ausschliesslich anhaengen; Korrekturen sind neue
 * Events (istKorrektur + korrigiertEventId, Semantik in protokoll/ereignisse.ts). Der Server
 * pflegt bei jedem Schreiben die bestehenden Spiel-Felder (status/ergebnisA/B/
 * ergebnisAbgeschlossen), damit Tabelle/oeffentliche Seite/PDFs unveraendert funktionieren -
 * die einzige Verzahnung mit dem manuell-Pfad. Bewusst KEIN markiereTurnierBearbeitet():
 * Protokollieren ist Ergebnis-Erfassung im Sinne der bestehenden Ausnahme (CLAUDE.md).
 */

const EVENT_TYPEN: EventTyp[] = [
  "GO",
  "STOP",
  "B",
  "VB",
  "End",
  "Fin",
  "W",
  "K",
  "G",
  "F",
  "P",
  "PA",
  "T",
  "TT",
  "E",
  "FW",
  "HANDOVER",
  "PROT",
  "ANNULLIERT",
];

interface ProtokollAnlegenBody {
  ersterProtokollantName: string;
}

const protokollAnlegenSchema = {
  type: "object",
  required: ["ersterProtokollantName"],
  properties: {
    ersterProtokollantName: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

interface EventBody {
  eventTyp: EventTyp;
  mannschaft?: Mannschaftsseite;
  spielerId?: string;
  spielerRausId?: string;
  istEigentor?: boolean;
  istKorrektur?: boolean;
  korrigiertEventId?: string;
  /** Spielzeit in Sekunden im aktuellen Abschnitt - berechnet der Client aus seiner Uhr. */
  spielzeit?: number;
  halbzeit?: Halbzeit;
  zusatz?: Record<string, unknown>;
  erstelltVonName?: string;
}

const eventSchema = {
  type: "object",
  required: ["eventTyp"],
  properties: {
    eventTyp: { type: "string", enum: EVENT_TYPEN },
    mannschaft: { type: "string", enum: ["A", "B"] },
    spielerId: { type: "string" },
    spielerRausId: { type: "string" },
    istEigentor: { type: "boolean" },
    istKorrektur: { type: "boolean" },
    korrigiertEventId: { type: "string" },
    spielzeit: { type: "number", minimum: -3600, maximum: 36000 },
    halbzeit: { type: "string", enum: ["1", "2", "V1", "V2", "FW"] },
    zusatz: { type: "object" },
    erstelltVonName: { type: "string", maxLength: 200 },
  },
} as const;

interface UnterschreibenBody {
  name: string;
}

const unterschreibenSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

interface AnzeigeBody {
  seiteAVertauscht: boolean;
}

const anzeigeSchema = {
  type: "object",
  required: ["seiteAVertauscht"],
  properties: {
    seiteAVertauscht: { type: "boolean" },
  },
} as const;

async function ladeProtokollEvents(protokollId: string): Promise<Event[]> {
  return sortiertNachSequenz(await findAllBySelector<Event>({ docType: "event", protokollId }));
}

/**
 * Laedt Protokoll + Spiel + Turnier und prueft die gemeinsamen Schreib-Vorbedingungen
 * (digital-Gate, Turnier abgeschlossen/ausgecheckt). Die Zugriffspruefung selbst macht die
 * jeweilige Route (darfProtokollieren vs. hatMindestens - unterschiedlich je Endpunkt).
 */
async function ladeSchreibKontext(
  protokollId: string,
  reply: FastifyReply,
): Promise<{ protokoll: Spielprotokoll; spiel: Spiel; turnier: Turnier } | null> {
  const protokoll = await findById<Spielprotokoll>(protokollId);
  if (!protokoll) {
    reply.code(404).send({ error: "Protokoll nicht gefunden" });
    return null;
  }
  const spiel = await findById<Spiel>(protokoll.spielId);
  const turnier = spiel ? await findById<Turnier>(spiel.turnierId) : null;
  if (!spiel || !turnier) {
    reply.code(404).send({ error: "Zugehöriges Spiel oder Turnier nicht gefunden" });
    return null;
  }
  if (turnier.protokollierungsart !== "digital") {
    reply.code(400).send({ error: "Dieses Turnier verwendet keine digitale Protokollierung." });
    return null;
  }
  if (turnierGesperrt(turnier)) {
    reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
    return null;
  }
  if (await turnierAusgecheckt(turnier._id)) {
    reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
    return null;
  }
  return { protokoll, spiel, turnier };
}

export async function protokollRoutes(app: FastifyInstance): Promise<void> {
  /** Protokoll + vollstaendiger Event-Strom eines Spiels (auch fuer die reine Ansicht). */
  app.get<{ Params: { spielId: string } }>("/spiele/:spielId/protokoll", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const spiel = await findById<Spiel>(req.params.spielId);
    if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
    const turnier = await findById<Turnier>(spiel.turnierId);
    if (!turnier || !(await hatMindestens(turnier, req, "lesen"))) {
      return reply.code(403).send({ error: "Kein Zugriff auf das zugehörige Turnier" });
    }
    const protokolle = await findAllBySelector<Spielprotokoll>({
      docType: "spielprotokoll",
      spielId: spiel._id,
    });
    if (protokolle.length === 0) {
      return reply.code(404).send({ error: "Für dieses Spiel existiert noch kein Protokoll." });
    }
    const protokoll = protokolle[0];
    return { protokoll, events: await ladeProtokollEvents(protokoll._id) };
  });

  /** Protokoll fuer ein Spiel anlegen (genau eines je Spiel) - fragt den Protokollant-Namen ab. */
  app.post<{ Params: { spielId: string }; Body: ProtokollAnlegenBody }>(
    "/spiele/:spielId/protokoll",
    { schema: { body: protokollAnlegenSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const spiel = await findById<Spiel>(req.params.spielId);
      if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
      const turnier = await findById<Turnier>(spiel.turnierId);
      if (!turnier || !(await darfProtokollieren(turnier, req))) {
        return reply.code(403).send({ error: "Kein Protokoll-Zugriff auf das zugehörige Turnier" });
      }
      if (turnier.protokollierungsart !== "digital") {
        return reply.code(400).send({ error: "Dieses Turnier verwendet keine digitale Protokollierung." });
      }
      if (turnierGesperrt(turnier)) {
        return reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
      }
      if (await turnierAusgecheckt(turnier._id)) {
        return reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
      }
      const vorhandene = await findAllBySelector<Spielprotokoll>({
        docType: "spielprotokoll",
        spielId: spiel._id,
      });
      if (vorhandene.length > 0) {
        return reply.code(409).send({ error: "Für dieses Spiel existiert bereits ein Protokoll." });
      }

      const id = newId("spielprotokoll");
      const protokoll: Spielprotokoll = {
        _id: id,
        docType: "spielprotokoll",
        protokollId: id,
        spielId: spiel._id,
        turnierId: turnier._id,
        status: "offen",
        erstelltVon: req.benutzer?._id,
        ersterProtokollantName: req.body.ersterProtokollantName,
      };
      return insertDoc(protokoll);
    },
  );

  /**
   * Event anhaengen - der einzige Schreibweg in den Event-Strom. Der Server vergibt die Sequenz,
   * setzt den Zeitstempel (Server-Uhr) und pflegt die Spiel-Felder (Konzept Abschnitt 5):
   * erstes GO startet das Spiel, G-Events (und Korrekturen) aktualisieren das Live-Ergebnis,
   * End beendet, Fin schliesst ab (bei protokollBestaetigungErforderlich erst nach der
   * Turnierleitungs-Bestaetigung, siehe /bestaetigen unten).
   */
  app.post<{ Params: { id: string }; Body: EventBody }>(
    "/protokolle/:id/events",
    { schema: { body: eventSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const kontext = await ladeSchreibKontext(req.params.id, reply);
      if (!kontext) return;
      const { protokoll, spiel, turnier } = kontext;
      const body = req.body;

      const events = await ladeProtokollEvents(protokoll._id);
      const korrekturZiel = body.korrigiertEventId
        ? events.find((e) => e._id === body.korrigiertEventId)
        : undefined;

      // Nach dem Abschluss (Fin) nimmt der Server keine Events mehr an - einzige Ausnahme ist die
      // nachtraegliche Protest-ENTSCHEIDUNG der Turnierleitung (Korrektur auf ein PROT-Event,
      // Spez. 7.6), die entsprechend schreiben_voll verlangt.
      const istProtestEntscheidung =
        body.istKorrektur === true && korrekturZiel?.eventTyp === "PROT" && body.eventTyp !== "ANNULLIERT";
      if (protokoll.status === "abgeschlossen") {
        if (!istProtestEntscheidung) {
          return reply.code(409).send({ error: "Das Protokoll ist abgeschlossen." });
        }
        if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
          return reply.code(403).send({ error: "Die Protest-Entscheidung kann nur die Turnierleitung erfassen." });
        }
      } else if (!(await darfProtokollieren(turnier, req))) {
        return reply.code(403).send({ error: "Kein Protokoll-Zugriff auf das zugehörige Turnier" });
      }

      if (body.istKorrektur && (!body.korrigiertEventId || !korrekturZiel)) {
        return reply.code(400).send({ error: "Korrektur-Events müssen ein vorhandenes Event dieses Protokolls referenzieren." });
      }
      if (body.eventTyp === "ANNULLIERT" && !body.istKorrektur) {
        return reply.code(400).send({ error: "ANNULLIERT ist nur als Korrektur-Event gültig." });
      }
      if (body.eventTyp === "G" && !body.mannschaft) {
        return reply.code(400).send({ error: "Ein Tor braucht eine Mannschaftsangabe." });
      }
      if (body.eventTyp === "Fin" && !protokoll.protokollantName) {
        return reply.code(400).send({ error: "Vor dem Abschluss muss das Protokoll unterschrieben werden." });
      }

      const id = newId("event");
      const jetzt = new Date().toISOString();
      const event: Event = {
        _id: id,
        docType: "event",
        eventId: id,
        protokollId: protokoll._id,
        turnierId: turnier._id,
        spielId: spiel._id,
        sequenz: (events[events.length - 1]?.sequenz ?? 0) + 1,
        zeitstempel: jetzt,
        spielzeit: body.spielzeit,
        halbzeit: body.halbzeit,
        eventTyp: body.eventTyp,
        mannschaft: body.mannschaft,
        spielerId: body.spielerId,
        spielerRausId: body.spielerRausId,
        istEigentor: body.istEigentor ?? false,
        istKorrektur: body.istKorrektur ?? false,
        korrigiertEventId: body.korrigiertEventId,
        zusatz: body.zusatz,
        erstelltVon: req.benutzer?._id,
        erstelltVonName: body.erstelltVonName ?? zuschreibung(req).name,
      };
      const gespeichert = await insertDoc(event);
      const alleEvents = [...events, gespeichert];

      // Protokoll-Status fortschreiben (End -> beendet, Fin -> abgeschlossen).
      let aktuellesProtokoll = protokoll;
      if (event.eventTyp === "End" && protokoll.status === "offen") {
        aktuellesProtokoll = await insertDoc({ ...protokoll, status: "beendet" });
      } else if (event.eventTyp === "Fin" && protokoll.status !== "abgeschlossen") {
        aktuellesProtokoll = await insertDoc({ ...protokoll, status: "abgeschlossen" });
      }

      // Spiel-Felder pflegen (Konzept Abschnitt 5) - EIN Update am Ende, nicht mehrere.
      const patch: Partial<Spiel> = {};
      if (event.eventTyp === "GO" && spiel.status === "geplant") {
        patch.status = "laeuft";
        if (!spiel.startzeitTatsaechlich) patch.startzeitTatsaechlich = jetzt;
      }
      const { ergebnisA, ergebnisB } = ergebnisAusEvents(alleEvents);
      // Live-Ergebnis (Nutzer-Entscheidung 21.08.2026): ab dem ersten Tor bei jeder Aenderung
      // sofort ans Spiel schreiben; das anfangs torlose 0:0 dagegen erst beim Spielende - sonst
      // stuende ein gerade erst angepfiffenes Spiel bereits als 0:0-Remis in der Tabelle
      // (berechneTabelle wertet jedes Spiel mit gesetztem Ergebnis).
      const ergebnisSchreiben =
        event.eventTyp === "End" || spiel.ergebnisA != null || ergebnisA + ergebnisB > 0;
      if (ergebnisSchreiben && (spiel.ergebnisA !== ergebnisA || spiel.ergebnisB !== ergebnisB)) {
        patch.ergebnisA = ergebnisA;
        patch.ergebnisB = ergebnisB;
      }
      if (event.eventTyp === "End" && spiel.status !== "beendet" && spiel.status !== "abgeschlossen") {
        patch.status = "beendet";
        if (!spiel.endzeitTatsaechlich) patch.endzeitTatsaechlich = jetzt;
      }
      if (event.eventTyp === "Fin" && !turnier.protokollBestaetigungErforderlich) {
        patch.ergebnisAbgeschlossen = true;
        patch.status = "abgeschlossen";
      }
      const aktuellesSpiel = Object.keys(patch).length > 0 ? await insertDoc({ ...spiel, ...patch }) : spiel;

      return { event: gespeichert, protokoll: aktuellesProtokoll, spiel: aktuellesSpiel };
    },
  );

  /** Digitale "Unterschrift" des Protokollanten nach dem Spielende (Spez. 7.4 Schritt 3). */
  app.post<{ Params: { id: string }; Body: UnterschreibenBody }>(
    "/protokolle/:id/unterschreiben",
    { schema: { body: unterschreibenSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const kontext = await ladeSchreibKontext(req.params.id, reply);
      if (!kontext) return;
      const { protokoll, turnier } = kontext;
      if (!(await darfProtokollieren(turnier, req))) {
        return reply.code(403).send({ error: "Kein Protokoll-Zugriff auf das zugehörige Turnier" });
      }
      if (protokoll.status === "offen") {
        return reply.code(400).send({ error: "Erst nach dem Spielende kann unterschrieben werden." });
      }
      if (protokoll.status === "abgeschlossen") {
        return reply.code(409).send({ error: "Das Protokoll ist bereits abgeschlossen." });
      }
      return insertDoc({
        ...protokoll,
        protokollantName: req.body.name,
        protokollantBestaetigtAm: new Date().toISOString(),
      });
    },
  );

  /**
   * Turnierleitungs-Bestaetigung des Abschlusses - nur beim konfigurierten Vier-Augen-Abschluss
   * (Turnier.protokollBestaetigungErforderlich, Konzept Abschnitt 9). Setzt erst jetzt die
   * finalen Spiel-Felder (ergebnisAbgeschlossen/status).
   */
  app.post<{ Params: { id: string } }>("/protokolle/:id/bestaetigen", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const kontext = await ladeSchreibKontext(req.params.id, reply);
    if (!kontext) return;
    const { protokoll, spiel, turnier } = kontext;
    if (!(await hatMindestens(turnier, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Die Bestätigung kann nur die Turnierleitung erteilen." });
    }
    if (!turnier.protokollBestaetigungErforderlich) {
      return reply.code(400).send({ error: "Dieses Turnier verlangt keine Bestätigung durch die Turnierleitung." });
    }
    if (protokoll.status !== "abgeschlossen") {
      return reply.code(400).send({ error: "Das Protokoll ist noch nicht abgeschlossen." });
    }
    if (protokoll.turnierleitungBestaetigtAm) {
      return reply.code(409).send({ error: "Das Protokoll ist bereits bestätigt." });
    }
    const bestaetigt = await insertDoc({
      ...protokoll,
      turnierleitungBestaetigtAm: new Date().toISOString(),
      turnierleitungBestaetigtVonName: zuschreibung(req).name,
    });
    const aktuellesSpiel = await insertDoc<Spiel>({
      ...spiel,
      ergebnisAbgeschlossen: true,
      status: "abgeschlossen",
    });
    return { protokoll: bestaetigt, spiel: aktuellesSpiel };
  });

  /** Seitenansicht (welches Team links/rechts) umschalten - reine Anzeige, aendert keine Daten. */
  app.put<{ Params: { id: string }; Body: AnzeigeBody }>(
    "/protokolle/:id/anzeige",
    { schema: { body: anzeigeSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const kontext = await ladeSchreibKontext(req.params.id, reply);
      if (!kontext) return;
      const { protokoll, turnier } = kontext;
      if (!(await darfProtokollieren(turnier, req))) {
        return reply.code(403).send({ error: "Kein Protokoll-Zugriff auf das zugehörige Turnier" });
      }
      return insertDoc({ ...protokoll, seiteAVertauscht: req.body.seiteAVertauscht });
    },
  );
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MannschaftImTurnier, SchiedsrichterImTurnier, Spiel, Turnier } from "@torball/shared";
import { findAllBySelector, findById, insertDoc } from "../repository";
import { berechneStartzeit, datumUndStartzeitAus, spieldauerMinuten } from "../spielplan/zeitplanung";
import { schlageSchiedsrichterVor } from "../spielplan/schiedsrichterZuordnung";
import { requireZugriff } from "../auth/plugin";
import {
  hatMindestens,
  turnierAusgecheckt,
  TURNIER_AUSGECHECKT_FEHLER,
  TURNIER_GESPERRT_FEHLER,
  turnierGesperrt,
  zuschreibung,
  type Zugriffsstufe,
} from "../auth/turnierZugriff";
import { markiereTurnierBearbeitet } from "../turnier/bearbeitet";
import { IDENTITAETS_FELDER, ohneFelder } from "../eingabe";

// Nie aus dem Body uebernehmen (siehe eingabe.ts): Identitaet + denormalisierte spielId + turnierId.
// Ergebnis-/Status-Felder bleiben den dedizierten Ergebnis-Routen vorbehalten - der Spielplan-PUT
// aendert bewusst nur runde/feldId/startzeitGeplant/schiedsrichterId (siehe Schema).
const NUR_SERVER_PUT = [...IDENTITAETS_FELDER, "spielId", "turnierId"] as const;

/** Nur diese Felder darf die Turnierleitung nachtraeglich anpassen (Abschnitt 8: "Reihenfolge,
 * Spielfeld und Startzeiten") sowie die Schiedsrichter-Zuordnung (Abschnitt 5.4, manuell aenderbar). */
// schiedsrichterId bewusst als string (nicht string|null) typisiert: das Schema erlaubt zur
// Laufzeit null zum Loesen der Zuordnung, aber der Merge {...bestehend, ...req.body} soll null
// nach Spiel.schiedsrichterId (string|undefined) schreiben duerfen (gleiches Muster wie verein/
// mannschaft/spieler).
interface SpielAnpassungBody {
  runde?: string;
  feldId?: string;
  startzeitGeplant?: string;
  schiedsrichterId?: string;
}

const spielAnpassungSchema = {
  type: "object",
  properties: {
    runde: { type: "string" },
    feldId: { type: "string" },
    startzeitGeplant: { type: "string" },
    // null loest die Schiedsrichter-Zuordnung ("— keiner —").
    schiedsrichterId: { type: ["string", "null"] },
  },
} as const;

interface StartzeitBody {
  startzeitGeplant: string;
}

const startzeitSchema = {
  type: "object",
  required: ["startzeitGeplant"],
  properties: {
    startzeitGeplant: { type: "string" },
  },
} as const;

interface ReihenfolgeBody {
  /** Alle Spiel-IDs des Turniers, in der gewuenschten neuen Reihenfolge. */
  spielIds: string[];
}

const reihenfolgeSchema = {
  type: "object",
  required: ["spielIds"],
  properties: {
    spielIds: { type: "array", items: { type: "string" }, minItems: 1 },
  },
} as const;

/** Laedt das Turnier eines Spiels und prueft die geforderte Zugriffsstufe; schickt bei Fehlschlag selbst die Antwort. */
export async function pruefeSpielZugriff(
  spiel: Spiel,
  req: FastifyRequest,
  reply: FastifyReply,
  mindestens: Zugriffsstufe,
): Promise<boolean> {
  const turnier = await findById<Turnier>(spiel.turnierId);
  if (!turnier || !(await hatMindestens(turnier, req, mindestens))) {
    reply.code(403).send({ error: "Kein Zugriff auf das zugehörige Turnier" });
    return false;
  }
  // Schreibende Zugriffe (Spielplan-Anpassung, Ergebnisse) sind bei abgeschlossenem Turnier gesperrt.
  if (mindestens !== "lesen" && turnierGesperrt(turnier)) {
    reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
    return false;
  }
  // Ebenso bei einem an eine lokale Installation ausgecheckten Turnier (siehe TURNIER_AUSGECHECKT_FEHLER).
  if (mindestens !== "lesen" && (await turnierAusgecheckt(turnier._id))) {
    reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
    return false;
  }
  return true;
}

export async function spielRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { turnierId: string } }>("/turniere/:turnierId/spiele", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.turnierId);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "lesen"))) {
      return reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    }
    return findAllBySelector<Spiel>({ docType: "spiel", turnierId: req.params.turnierId });
  });

  app.get<{ Params: { id: string } }>("/spiele/:id", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const spiel = await findById<Spiel>(req.params.id);
    if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
    if (!(await pruefeSpielZugriff(spiel, req, reply, "lesen"))) return;
    return spiel;
  });

  app.put<{ Params: { id: string }; Body: SpielAnpassungBody }>(
    "/spiele/:id",
    { schema: { body: spielAnpassungSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const bestehend = await findById<Spiel>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Spiel nicht gefunden" });
      if (!(await pruefeSpielZugriff(bestehend, req, reply, "schreiben_spielbetrieb"))) return;
      const aktualisiert: Spiel = { ...bestehend, ...ohneFelder(req.body, NUR_SERVER_PUT) };
      const gespeichert = await insertDoc(aktualisiert);
      await markiereTurnierBearbeitet(bestehend.turnierId, req.benutzer);
      return gespeichert;
    },
  );

  /**
   * Startzeit eines Spiels manuell verschieben - alle NACHFOLGENDEN, noch geplanten
   * Spiele wandern um dieselbe Zeitspanne mit (Abschnitt 8: "Die Turnierleitung darf...
   * Startzeiten nachtraeglich anpassen"). Verschiebung per Delta statt Neuberechnung
   * aus der Spieldauer-Formel, damit bereits bestehende, ggf. abweichende Abstaende
   * zwischen spaeteren Spielen erhalten bleiben.
   */
  app.put<{ Params: { id: string }; Body: StartzeitBody }>(
    "/spiele/:id/startzeit",
    { schema: { body: startzeitSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const spiel = await findById<Spiel>(req.params.id);
      if (!spiel) return reply.code(404).send({ error: "Spiel nicht gefunden" });
      if (!(await pruefeSpielZugriff(spiel, req, reply, "schreiben_spielbetrieb"))) return;
      if (!spiel.startzeitGeplant) {
        return reply.code(400).send({ error: "Spiel hat noch keine geplante Startzeit, die verschoben werden koennte" });
      }

      const alteZeit = new Date(spiel.startzeitGeplant).getTime();
      const neueZeit = new Date(req.body.startzeitGeplant).getTime();
      if (Number.isNaN(neueZeit)) {
        return reply.code(400).send({ error: "Ungueltige Startzeit" });
      }
      const deltaMs = neueZeit - alteZeit;

      const turnier = await findById<Turnier>(spiel.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

      const alleSpiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: spiel.turnierId });
      const eigeneRunde = Number(spiel.runde);

      // Der Kaskaden-Verschub weiter unten haelt den Abstand zu SPAETEREN Spielen auf
      // demselben Feld automatisch ein (die wandern um dasselbe Delta mit). Nur die
      // Grenze zum VORHERIGEN, nicht mitverschobenen Spiel auf demselben Feld kann durch
      // ein Zurueckdatieren neu ueberschnitten werden - das muss hier geprueft werden.
      const vorheriges = alleSpiele
        .filter(
          (s) => s.feldId === spiel.feldId && s._id !== spiel._id && s.startzeitGeplant && Number(s.runde) < eigeneRunde,
        )
        .sort((a, b) => Number(b.runde) - Number(a.runde))[0];
      if (vorheriges?.startzeitGeplant) {
        const vorherigesEnde = new Date(vorheriges.startzeitGeplant).getTime() + spieldauerMinuten(turnier) * 60_000;
        if (neueZeit < vorherigesEnde) {
          return reply.code(409).send({
            error: "Neue Startzeit überschneidet sich mit dem vorherigen Spiel auf diesem Feld",
          });
        }
      }

      const zuVerschieben = alleSpiele.filter(
        (s) => s.status === "geplant" && s.startzeitGeplant && Number(s.runde) >= eigeneRunde,
      );

      const aktualisiert: Spiel[] = [];
      for (const s of zuVerschieben) {
        const neueStartzeit = new Date(new Date(s.startzeitGeplant!).getTime() + deltaMs).toISOString();
        aktualisiert.push(await insertDoc({ ...s, startzeitGeplant: neueStartzeit }));
      }

      // Wird die Startzeit des ERSTEN Spiels verschoben, zieht die Turnier-Startzeit
      // (Uebersicht) automatisch mit - umgekehrte Richtung zur eigentlichen Berechnung
      // (berechneStartzeit leitet die Spiel-Zeiten aus der Turnier-Startzeit ab).
      if (spiel.runde === "1") {
        const { datum, startzeit } = datumUndStartzeitAus(req.body.startzeitGeplant);
        const zuschreiber = zuschreibung(req);
        await insertDoc<Turnier>({
          ...turnier,
          datum,
          startzeit,
          // spielplanBasis.startzeit sonst faelschlich "veraltet" (spielplanBasisAenderungen),
          // obwohl der Verschub oben die Spiele bereits synchron gehalten hat.
          spielplanBasis: turnier.spielplanBasis ? { ...turnier.spielplanBasis, startzeit } : turnier.spielplanBasis,
          geaendertAm: new Date().toISOString(),
          zuletztBearbeitetVon: zuschreiber.benutzerId,
          zuletztBearbeitetVonName: zuschreiber.name,
        });
      }

      await markiereTurnierBearbeitet(spiel.turnierId, req.benutzer);
      return aktualisiert;
    },
  );

  /**
   * Reihenfolge der Spiele aendern (Abschnitt 8: "Die Turnierleitung darf Reihenfolge...
   * nachtraeglich anpassen"). Weist jedem Spiel an seiner neuen Position eine neue
   * Spielnummer (runde) und die daraus berechnete Startzeit zu. Vereinfachung: Jedes
   * Spiel bekommt eine eigene Zeitposition, unabhaengig vom Feld - im Normalfall (1 Feld)
   * ist das exakt richtig; bei 2 Feldern kann das die urspruengliche Parallelitaet zweier
   * Spiele aufheben, was ueber die bestehende Feld-Zuordnung (PUT /spiele/:id) von Hand
   * nachjustierbar bleibt.
   */
  app.put<{ Params: { turnierId: string }; Body: ReihenfolgeBody }>(
    "/turniere/:turnierId/spiele/reihenfolge",
    { schema: { body: reihenfolgeSchema } },
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(turnier, req, "schreiben_spielbetrieb"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }
      if (await turnierAusgecheckt(turnier._id)) {
        return reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
      }

      const bestehende = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
      const gesperrt = bestehende.some((spiel) => spiel.status !== "geplant" || spiel.ergebnisAbgeschlossen);
      if (gesperrt) {
        return reply.code(409).send({
          error: "Reihenfolge kann nicht geaendert werden: es gibt bereits laufende oder abgeschlossene Spiele",
        });
      }

      const bestehendeIds = new Set(bestehende.map((s) => s._id));
      const { spielIds } = req.body;
      const passtZusammen =
        spielIds.length === bestehende.length && spielIds.every((id) => bestehendeIds.has(id));
      if (!passtZusammen) {
        return reply
          .code(400)
          .send({ error: "spielIds muss exakt alle Spiele dieses Turniers enthalten, je einmal" });
      }

      const spieleNachId = new Map(bestehende.map((s) => [s._id, s]));
      const aktualisiert: Spiel[] = [];
      for (const [index, id] of spielIds.entries()) {
        const spiel = spieleNachId.get(id)!;
        aktualisiert.push(
          await insertDoc({
            ...spiel,
            runde: String(index + 1),
            startzeitGeplant: berechneStartzeit(turnier, index),
          }),
        );
      }

      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      return aktualisiert;
    },
  );

  /**
   * Schiedsrichter-Zuordnung als Vorschlag ueber alle Spiele des Turniers (Abschnitt 5.4).
   * Bewusst nur auf ausdrueckliche Anforderung (eigener Button), nicht automatisch bei der
   * Spielplan-Erzeugung. Ueberschreibt bestehende Zuordnungen (es ist ein Neu-Vorschlag);
   * einzelne Spiele bleiben danach ueber PUT /spiele/:id manuell anpassbar.
   */
  app.post<{ Params: { turnierId: string } }>(
    "/turniere/:turnierId/schiedsrichter-zuordnung",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const turnier = await findById<Turnier>(req.params.turnierId);
      if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(turnier, req, "schreiben_spielbetrieb"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }
      if (await turnierAusgecheckt(turnier._id)) {
        return reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
      }

      const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
      const schiedsrichter = await findAllBySelector<SchiedsrichterImTurnier>({
        docType: "schiedsrichterImTurnier",
        turnierId: turnier._id,
      });
      const mannschaften = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: turnier._id,
      });

      const vorschlag = schlageSchiedsrichterVor(spiele, schiedsrichter, mannschaften);
      const aktualisiert: Spiel[] = [];
      for (const spiel of spiele) {
        // undefined faellt beim JSON-Serialisieren aus dem Dokument (= Zuordnung geloest).
        aktualisiert.push(await insertDoc({ ...spiel, schiedsrichterId: vorschlag.get(spiel._id) }));
      }

      await markiereTurnierBearbeitet(turnier._id, req.benutzer);
      return aktualisiert;
    },
  );
}

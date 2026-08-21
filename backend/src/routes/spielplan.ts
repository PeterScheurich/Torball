import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MannschaftImTurnier, Spiel, SpielplanBasis, Spielprotokoll, Turnier } from "@torball/shared";
import { deleteDoc, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { erzeugePaarungen } from "../spielplan/paarungen";
import { erstelleSpielplanVorschlag, type SpielplanEintrag } from "../spielplan/planung";
import { berechneStartzeit } from "../spielplan/zeitplanung";
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

interface SpielplanQuery {
  /** 1 = einfaches Turnier (Jeder-gegen-Jeden), 2 = doppeltes Turnier. Default 1. */
  wiederholungen?: string;
}

interface SpielplanPersistierenBody {
  /**
   * Optional: die im Frontend ggf. manuell umsortierte Vorschau (aus
   * GET .../spielplan-vorschlag). Wenn gesetzt, wird GENAU diese Reihenfolge
   * gespeichert statt den Vorschlag neu zu berechnen - sonst wuerde eine
   * manuelle Umsortierung beim Uebernehmen verworfen.
   */
  eintraege?: SpielplanEintrag[];
}

/** Ordnungs-/feld-unabhaengiger Vergleichsschluessel: gleiche Paarung im gleichen Slot auf demselben Feld. */
function kanonischerSchluessel(s: {
  runde?: string;
  feldId?: string;
  mannschaftAId: string;
  mannschaftBId: string;
}): string {
  const teams = [s.mannschaftAId, s.mannschaftBId].sort().join("|");
  return `${s.runde ?? ""}#${s.feldId ?? ""}#${teams}`;
}

/** Vergleicht als Multiset (Reihenfolge egal), damit z.B. zwei zeitgleiche Spiele auf verschiedenen Feldern nicht faelschlich als "unterschiedlich" gelten. */
function inhaltlichGleich(
  bestehende: Spiel[],
  neu: { runde?: string; feldId?: string; mannschaftAId: string; mannschaftBId: string }[],
): boolean {
  if (bestehende.length !== neu.length) return false;
  const bestehendeSchluessel = bestehende.map(kanonischerSchluessel).sort();
  const neueSchluessel = neu.map(kanonischerSchluessel).sort();
  return bestehendeSchluessel.every((k, i) => k === neueSchluessel[i]);
}

/**
 * Prueft eine (ggf. vom Client manuell umsortierte) Eintragsliste, bevor sie als Spielplan
 * persistiert wird: der `eintraege`-Pfad im POST uebernimmt sie sonst ungeprueft (Backend-Review
 * 2026-08-20). Deckt die harten Regeln ab (Gesamtspezifikation Abschnitt 8, "Turnier-Fachregeln"):
 * jede Mannschaft gehoert zu diesem Turnier, kein Team gegen sich selbst, kein Team zweimal im
 * selben Zeit-Slot. Gibt eine Fehlermeldung zurueck (fuer 400) oder null, wenn alles gueltig ist.
 * Bewusst KEINE Pruefung, ob die Paarungsmenge exakt der erzeugePaarungen-Ausgabe entspricht - das
 * wuerde legitimes manuelles Umsortieren/Anpassen zu eng einschraenken.
 */
function pruefeSpielplanEintraege(eintraege: SpielplanEintrag[], mannschaftIds: Set<string>): string | null {
  const belegtProSlot = new Map<number, Set<string>>();
  for (const e of eintraege) {
    if (!mannschaftIds.has(e.mannschaftAId) || !mannschaftIds.has(e.mannschaftBId)) {
      return "Ein Spiel verweist auf eine Mannschaft, die nicht zu diesem Turnier gehört.";
    }
    if (e.mannschaftAId === e.mannschaftBId) {
      return "Ein Spiel darf nicht dieselbe Mannschaft gegen sich selbst enthalten.";
    }
    const belegt = belegtProSlot.get(e.slot) ?? new Set<string>();
    if (belegt.has(e.mannschaftAId) || belegt.has(e.mannschaftBId)) {
      return "Eine Mannschaft ist im selben Zeit-Slot mehrfach eingeplant.";
    }
    belegt.add(e.mannschaftAId);
    belegt.add(e.mannschaftBId);
    belegtProSlot.set(e.slot, belegt);
  }
  return null;
}

/**
 * Digitale Protokollierung: SOBALD irgendein Spielprotokoll existiert, gilt das Turnier als
 * begonnen - ein Spielprotokoll wird bereits beim Eingeben des Protokollant-Namens angelegt
 * (routes/protokoll.ts), das Spiel bleibt bis zum ersten GO aber auf "geplant". Der reine
 * Spiel-Status-Check unten wuerde in diesem Fenster ein "Spielplan erzeugen" durchlassen, das
 * alle bestehenden Spiele loescht - Protokoll + Events referenzierten dann eine geloeschte
 * spielId (verwaist).
 */
async function hatSpielprotokolle(turnierId: string): Promise<boolean> {
  const protokolle = await findAllBySelector<Spielprotokoll>({ docType: "spielprotokoll", turnierId });
  return protokolle.length > 0;
}

const SPIELPROTOKOLLE_FEHLER =
  "Spielplan kann nicht neu erzeugt werden: es gibt bereits begonnene Spielprotokolle";

interface VorschlagErgebnis {
  turnier: Turnier;
  vorschlag: SpielplanEintrag[];
  wiederholungen: 1 | 2;
}

/** Laedt Turnier + Mannschaften und berechnet den Spielplan-Vorschlag; gemeinsame Basis fuer GET (Vorschau) und POST (Persistierung). */
async function ladeUndBerechneVorschlag(
  turnierId: string,
  query: SpielplanQuery,
  req: FastifyRequest,
  reply: FastifyReply,
  mindestens: Zugriffsstufe,
): Promise<VorschlagErgebnis | undefined> {
  const turnier = await findById<Turnier>(turnierId);
  if (!turnier) {
    reply.code(404).send({ error: "Turnier nicht gefunden" });
    return undefined;
  }
  if (!(await hatMindestens(turnier, req, mindestens))) {
    reply.code(403).send({ error: "Kein Zugriff auf dieses Turnier" });
    return undefined;
  }

  if (turnier.felder.length === 0) {
    reply.code(400).send({ error: "Turnier hat noch keine Spielfelder definiert" });
    return undefined;
  }

  // "Spielplan neu generieren" (Abschnitt 8) ist vorgesehen, darf aber keine bereits
  // laufenden/abgeschlossenen Spiele verwerfen - diese Sperre gilt bereits fuer den
  // Vorschlag (GET), nicht erst beim Persistieren: sonst kann eine Vorschau angezeigt
  // werden, die beim Uebernehmen ohnehin abgelehnt wuerde.
  const bestehendeSpiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
  const gesperrt = bestehendeSpiele.some((spiel) => spiel.status !== "geplant" || spiel.ergebnisAbgeschlossen);
  if (gesperrt) {
    reply.code(409).send({
      error: "Spielplan kann nicht neu erzeugt werden: es gibt bereits laufende oder abgeschlossene Spiele",
    });
    return undefined;
  }
  if (await hatSpielprotokolle(turnier._id)) {
    reply.code(409).send({ error: SPIELPROTOKOLLE_FEHLER });
    return undefined;
  }

  const wiederholungen = query.wiederholungen === "2" ? 2 : 1;

  const mannschaften = (
    await findAllBySelector<MannschaftImTurnier>({
      docType: "mannschaftImTurnier",
      turnierId: turnier._id,
    })
  ).sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));

  if (mannschaften.length < 2) {
    reply.code(400).send({ error: "Mindestens zwei Mannschaften erforderlich, um einen Spielplan zu erstellen" });
    return undefined;
  }

  const paarungen = erzeugePaarungen(mannschaften, wiederholungen, turnier.bundeslandBeruecksichtigen ?? false);
  const vorschlag = erstelleSpielplanVorschlag(paarungen, turnier.felder);

  return { turnier, vorschlag, wiederholungen };
}

export async function spielplanRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: SpielplanQuery }>(
    "/turniere/:id/spielplan-vorschlag",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const ergebnis = await ladeUndBerechneVorschlag(req.params.id, req.query, req, reply, "lesen");
      if (!ergebnis) return;
      const { turnier, vorschlag, wiederholungen } = ergebnis;
      const spiele = vorschlag.map((eintrag) => ({
        ...eintrag,
        startzeitGeplant: berechneStartzeit(turnier, eintrag.slot),
      }));
      return { turnierId: turnier._id, wiederholungen, spiele };
    },
  );

  app.post<{ Params: { id: string }; Querystring: SpielplanQuery; Body: SpielplanPersistierenBody }>(
    "/turniere/:id/spielplan",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      let turnier: Turnier;
      let vorschlag: SpielplanEintrag[];

      if (req.body?.eintraege) {
        // Frontend hat bereits eine (ggf. manuell umsortierte) Vorschau gezeigt - genau
        // diese wird gespeichert, statt sie hier blind neu zu berechnen und die
        // Umsortierung des Nutzers zu verwerfen.
        const geladenesTurnier = await findById<Turnier>(req.params.id);
        if (!geladenesTurnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
        if (!(await hatMindestens(geladenesTurnier, req, "schreiben_voll"))) {
          return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
        }
        turnier = geladenesTurnier;
        vorschlag = req.body.eintraege;
      } else {
        const ergebnis = await ladeUndBerechneVorschlag(req.params.id, req.query, req, reply, "schreiben_voll");
        if (!ergebnis) return;
        turnier = ergebnis.turnier;
        vorschlag = ergebnis.vorschlag;
      }

      // Bei abgeschlossenem Turnier kein Spielplan-Speichern mehr (erst wieder oeffnen).
      if (turnierGesperrt(turnier)) {
        return reply.code(409).send({ error: TURNIER_GESPERRT_FEHLER });
      }
      if (await turnierAusgecheckt(turnier._id)) {
        return reply.code(409).send({ error: TURNIER_AUSGECHECKT_FEHLER });
      }

      // "Spielplan neu generieren" (Abschnitt 8) ist vorgesehen, darf aber keine bereits
      // laufenden/abgeschlossenen Spiele verwerfen.
      const bestehende = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id });
      const gesperrt = bestehende.some((spiel) => spiel.status !== "geplant" || spiel.ergebnisAbgeschlossen);
      if (gesperrt) {
        return reply.code(409).send({
          error: "Spielplan kann nicht neu erzeugt werden: es gibt bereits laufende oder abgeschlossene Spiele",
        });
      }
      if (await hatSpielprotokolle(turnier._id)) {
        return reply.code(409).send({ error: SPIELPROTOKOLLE_FEHLER });
      }

      // Eintragsliste gegen die harten Regeln pruefen, bevor sie gespeichert wird - der
      // eintraege-Pfad (manuell umsortierte Vorschau) uebernaehme sie sonst ungeprueft. Fuer den
      // serverseitig berechneten Vorschlag ist das ein No-Op (er erfuellt die Regeln bereits).
      const mannschaftenFuerPruefung = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: turnier._id,
      });
      const eintragFehler = pruefeSpielplanEintraege(vorschlag, new Set(mannschaftenFuerPruefung.map((m) => m._id)));
      if (eintragFehler) return reply.code(400).send({ error: eintragFehler });

      // Keine neue Version anlegen, wenn sich inhaltlich nichts geaendert hat (z.B. mehrfaches
      // Klicken auf "Spielplan neu erzeugen" ohne zwischenzeitliche Aenderung an Mannschaften
      // oder Reihenfolge) - sonst waechst die Versionsnummer ohne echten Grund.
      if (bestehende.length > 0 && inhaltlichGleich(bestehende, vorschlag.map((e) => ({ ...e, runde: String(e.slot + 1) })))) {
        return reply.code(200).send({
          turnierId: turnier._id,
          spielplanVersion: turnier.spielplanVersion,
          anzahlSpiele: bestehende.length,
          spiele: bestehende,
          unveraendert: true,
        });
      }

      for (const alt of bestehende) {
        await deleteDoc(alt._id, alt._rev!);
      }

      const spiele: Spiel[] = vorschlag.map((eintrag) => {
        const id = newId("spiel");
        return {
          _id: id,
          docType: "spiel",
          spielId: id,
          turnierId: turnier._id,
          runde: String(eintrag.slot + 1),
          feldId: eintrag.feldId,
          startzeitGeplant: berechneStartzeit(turnier, eintrag.slot),
          mannschaftAId: eintrag.mannschaftAId,
          mannschaftBId: eintrag.mannschaftBId,
          status: "geplant",
          istForfait: false,
          ergebnisAbgeschlossen: false,
        };
      });

      for (const spiel of spiele) {
        await insertDoc(spiel);
      }

      // Schnappschuss der spielplan-relevanten Basiskonfiguration festhalten, damit spaeter
      // konkret angezeigt werden kann, was sich seit dieser Erzeugung geaendert hat.
      const mannschaftenBasis = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: turnier._id,
      });
      const spielplanBasis: SpielplanBasis = {
        spielplanModus: turnier.spielplanModus,
        felder: turnier.felder,
        mannschaften: mannschaftenBasis
          .sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0))
          .map((m) => ({ id: m._id, name: m.name })),
        spielzeitMinuten: turnier.spielzeitMinuten,
        pauseMinuten: turnier.pauseMinuten,
        pauseZwischenSpielenMinuten: turnier.pauseZwischenSpielenMinuten,
        anzahlHalbzeiten: turnier.anzahlHalbzeiten,
        startzeit: turnier.startzeit,
        bundeslandBeruecksichtigen: turnier.bundeslandBeruecksichtigen,
      };

      const zuschreiber = zuschreibung(req);
      const aktualisiertesTurnier: Turnier = {
        ...turnier,
        spielplanVersion: turnier.spielplanVersion + 1,
        spielplanGeaendertAm: new Date().toISOString(),
        spielplanBasis,
        zuletztBearbeitetVon: zuschreiber.benutzerId,
        zuletztBearbeitetVonName: zuschreiber.name,
      };
      await insertDoc(aktualisiertesTurnier);

      return reply.code(201).send({
        turnierId: turnier._id,
        spielplanVersion: aktualisiertesTurnier.spielplanVersion,
        anzahlSpiele: spiele.length,
        spiele,
      });
    },
  );
}

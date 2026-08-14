import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  ErgebnisToken,
  MannschaftImTurnier,
  Protokollierungsart,
  SchiedsrichterImTurnier,
  Spiel,
  Spieler,
  SpielplanBasis,
  Turnier,
  Turnierregeln,
  TurnierStatus,
  Wettbewerb,
} from "@torball/shared";
import { deleteDoc, findAllByType, findAllBySelector, findById, insertDoc, newId } from "../repository";
import { requireAuth, requireRolle, requireZugriff } from "../auth/plugin";
import { hatMindestens, REGELN_GESPERRT_FEHLER, turnierGesperrt, zuschreibung } from "../auth/turnierZugriff";
import { aktuelleTurnierregeln } from "../konfiguration";
import { markiereTurnierBearbeitet } from "../turnier/bearbeitet";
import { berechneStartzeit } from "../spielplan/zeitplanung";

// Felder, die auch bei einem abgeschlossenen Turnier noch geaendert werden duerfen (Nutzer-Vorgabe:
// die reine Oeffentlich-Freigabe aendert nichts am Turnier selbst und bleibt moeglich, ohne es erst
// wieder oeffnen zu muessen). Alle uebrigen Felder sind bei Status "abgeschlossen"/"archiviert"
// gesperrt.
const BEI_ABSCHLUSS_ERLAUBTE_FELDER: ReadonlyArray<keyof Turnier> = [
  "oeffentlichTurnierinfos",
  "oeffentlichAnfahrtDokumente",
  "oeffentlichSpielplan",
  "oeffentlichErgebnisse",
  "oeffentlichRegeln",
  "spielernamenOeffentlich",
];

// Regel-/Wertungsfelder (Turnierregeln). Bei einem abgeleiteten Turnier mit regelnGesperrt=true
// sind Aenderungen an diesen Feldern gesperrt, bis die Turnierleitung entsperrt.
const REGEL_FELDER: ReadonlyArray<keyof Turnierregeln> = [
  "spielzeitMinuten",
  "anzahlHalbzeiten",
  "pauseMinuten",
  "seitenwechsel",
  "timeoutsJeHalbzeit",
  "timeoutDauerSekunden",
  "auswechslungenJeHalbzeit",
  "tordifferenzAbbruch",
  "tordifferenzLimit",
  "verlaengerungAktiv",
  "silbernesTor",
  "maxSehendeSpieler",
  "einstelligeTrikotnummern",
  "punkteSieg",
  "punkteUnentschieden",
  "punkteNiederlage",
  "tabellenKriterien",
  "forfaitErgebnis",
];

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
    oeffentlichRegeln: false,
  };
}

/** Fehlende Felder aelterer, vor deren Einfuehrung angelegter Turnier-Dokumente auffuellen. */
function mitDefaults(turnier: Turnier): Turnier {
  return { ...turnier, spielplanModus: turnier.spielplanModus ?? "einfach" };
}

export async function turnierRoutes(app: FastifyInstance): Promise<void> {
  app.get("/turniere", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const alle = (await findAllByType<Turnier>("turnier")).map(mitDefaults);
    const zugriffe = await Promise.all(alle.map((t) => hatMindestens(t, req, "lesen")));
    return alle.filter((_, i) => zugriffe[i]);
  });

  app.get<{ Params: { id: string } }>("/turniere/:id", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(turnier, req, "lesen"))) {
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
        erstelltVonName: req.benutzer!.name,
        erstelltMitKonfigVersion: version,
        ...turnierDefaults(regeln),
        ...req.body,
      };
      const gespeichert = await insertDoc(turnier);

      // Auto-Uebernahme: die anlegende Person wird aus ihrem Benutzerprofil direkt als
      // Turnierleitung in die Schiedsrichter-Liste uebernommen (Vorschlag, danach frei
      // editier-/loeschbar). Bewusst nur hier im normalen Anlege-Pfad - beim Ableiten
      // (/ableiten) werden Schiedsrichter aus dem Vorgaenger kopiert.
      const anleger = req.benutzer!;
      const srId = newId("schiedsrichterImTurnier");
      const leitung: SchiedsrichterImTurnier = {
        _id: srId,
        docType: "schiedsrichterImTurnier",
        schiedsrichterId: srId,
        turnierId: id,
        name: anleger.name,
        vorname: anleger.vorname,
        telefon: anleger.telefon,
        email: anleger.email,
        lizenzVorhanden: anleger.lizenzVorhanden ?? false,
        istTurnierleitung: true,
        nurTurnierleitung: false,
      };
      await insertDoc(leitung);

      return reply.code(201).send(gespeichert);
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<TurnierBody> }>(
    "/turniere/:id",
    async (req, reply) => {
      if (!requireZugriff(req, reply)) return;
      const bestehend = await findById<Turnier>(req.params.id);
      if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
      if (!(await hatMindestens(bestehend, req, "schreiben_voll"))) {
        return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
      }
      // Bei abgeschlossenem Turnier nur noch die Veroeffentlichungs-Felder zulassen (siehe oben);
      // jeder andere Feldwechsel wird abgelehnt, bis das Turnier wieder geoeffnet wird.
      if (turnierGesperrt(bestehend)) {
        const unerlaubt = Object.keys(req.body).filter(
          (k) => !BEI_ABSCHLUSS_ERLAUBTE_FELDER.includes(k as keyof Turnier),
        );
        if (unerlaubt.length > 0) {
          return reply.code(409).send({
            error: "Turnier ist abgeschlossen. Zum Bearbeiten zuerst wieder öffnen (nur die Öffentlich-Freigabe ist änderbar).",
          });
        }
      }
      // Bei abgeleitetem Turnier mit gesperrten Regeln: Regel-Feld-Aenderungen ablehnen, bis
      // ueber /regeln-entsperren entsperrt wurde.
      if (bestehend.regelnGesperrt && Object.keys(req.body).some((k) => (REGEL_FELDER as string[]).includes(k))) {
        return reply.code(409).send({ error: REGELN_GESPERRT_FEHLER });
      }
      const zuschreiber = zuschreibung(req);
      const aktualisiert: Turnier = {
        ...bestehend,
        ...req.body,
        geaendertAm: new Date().toISOString(),
        zuletztBearbeitetVon: zuschreiber.benutzerId,
        zuletztBearbeitetVonName: zuschreiber.name,
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
    if (!requireZugriff(req, reply)) return;
    const bestehend = await findById<Turnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(bestehend, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    // Wiederoeffnen zaehlt als Bearbeitung; die Abschluss-Metadaten werden dabei zurueckgesetzt
    // (bei erneutem Abschliessen neu gesetzt).
    const zuschreiber = zuschreibung(req);
    return insertDoc({
      ...bestehend,
      status: neuerStatus,
      geaendertAm: new Date().toISOString(),
      zuletztBearbeitetVon: zuschreiber.benutzerId,
      zuletztBearbeitetVonName: zuschreiber.name,
      abgeschlossenAm: undefined,
      abgeschlossenVon: undefined,
      abgeschlossenVonName: undefined,
    });
  }

  // Turnier abschliessen. Vorbedingung: jedes Spiel hat ein erfasstes Ergebnis (kein "offenes"
  // Spiel mehr). Danach werden alle noch nicht finalisierten Ergebnisse auf "Fertig"
  // (abgeschlossen) gesetzt und das Turnier abgeschlossen - so ist ein abgeschlossenes Turnier
  // immer ein konsistenter Endstand. Schreibzugriff noetig (= Turnierleitung/Verwalter).
  app.post<{ Params: { id: string } }>("/turniere/:id/abschliessen", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const bestehend = await findById<Turnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(bestehend, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }

    const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: bestehend._id });
    const ohneErgebnis = spiele.filter((s) => s.ergebnisA == null || s.ergebnisB == null);
    if (ohneErgebnis.length > 0) {
      return reply.code(409).send({
        error: `Turnier kann nicht abgeschlossen werden: ${ohneErgebnis.length} Spiel(e) haben noch kein erfasstes Ergebnis.`,
      });
    }

    // Alle erfassten, aber noch nicht finalisierten Ergebnisse auf "Fertig" setzen.
    for (const s of spiele) {
      if (!s.ergebnisAbgeschlossen) {
        await insertDoc({ ...s, ergebnisAbgeschlossen: true, status: "abgeschlossen" });
      }
    }

    // Externen Ergebnis-Erfassungslink zuruecksetzen: fuer ein abgeschlossenes Turnier soll kein
    // aktiver Token-Link mehr existieren (die Token-Erfassung wuerde ohnehin an bereits
    // finalisierten Ergebnissen scheitern, aber der Link soll auch nicht mehr aufloesen).
    const aktiveTokens = await findAllBySelector<ErgebnisToken>({
      docType: "ergebnisToken",
      turnierId: bestehend._id,
      widerrufen: false,
    });
    for (const t of aktiveTokens) {
      await insertDoc({ ...t, widerrufen: true, widerrufenAm: new Date().toISOString() });
    }

    const jetzt = new Date().toISOString();
    const zuschreiber = zuschreibung(req);
    return insertDoc({
      ...bestehend,
      status: "abgeschlossen",
      geaendertAm: jetzt,
      abgeschlossenAm: jetzt,
      abgeschlossenVon: zuschreiber.benutzerId,
      abgeschlossenVonName: zuschreiber.name,
    });
  });

  // Macht ein abgeschlossenes Turnier wieder zu einem laufenden ("aktiv") - reversibel,
  // nicht destruktiv, damit ein versehentlicher Abschluss korrigierbar bleibt.
  app.post<{ Params: { id: string } }>("/turniere/:id/wieder-oeffnen", (req, reply) =>
    statusUmschalten(req, reply, "aktiv"),
  );

  // Regeln eines abgeleiteten Turniers entsperren (Escape-Hatch der Turnierleitung). Danach sind
  // die Regel-Felder wieder aenderbar. Bewusst als eigenstaendige, spaeter leicht entfernbare
  // Funktion angelegt (siehe Datenimport-Spec).
  app.post<{ Params: { id: string } }>("/turniere/:id/regeln-entsperren", async (req, reply) => {
    if (!requireZugriff(req, reply)) return;
    const bestehend = await findById<Turnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(bestehend, req, "schreiben_voll"))) {
      return reply.code(403).send({ error: "Kein Schreibzugriff auf dieses Turnier" });
    }
    const zuschreiber = zuschreibung(req);
    return insertDoc({
      ...bestehend,
      regelnGesperrt: false,
      geaendertAm: new Date().toISOString(),
      zuletztBearbeitetVon: zuschreiber.benutzerId,
      zuletztBearbeitetVonName: zuschreiber.name,
    });
  });

  // Neuen Spieltag aus einem abgeschlossenen Vorgaenger-Turnier ableiten (Datenuebernahme,
  // Hin-/Rueckspieltag). Kopiert Mannschaften + Kader (mit Herkunftsverweisen), uebernimmt die
  // Regeln gesperrt und spiegelt den Spielplan (Heim/Auswaerts getauscht, Ergebnisse
  // zurueckgesetzt). Die beiden Spieltage teilen eine gemeinsame wettbewerbId (Aggregations-
  // Klammer). Anlegen wie ein normales Turnier nur fuer Admin/Manager.
  app.post<{ Params: { id: string }; Body: { name: string; datum: string; startzeit?: string } }>(
    "/turniere/:id/ableiten",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "datum"],
          properties: {
            name: { type: "string", minLength: 1 },
            datum: { type: "string", minLength: 1 },
            startzeit: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      if (!requireRolle(req, reply, ["admin", "manager"])) return;
      const basis = await findById<Turnier>(req.params.id);
      if (!basis) return reply.code(404).send({ error: "Vorgänger-Turnier nicht gefunden" });
      if (!(await hatMindestens(basis, req, "lesen"))) {
        return reply.code(403).send({ error: "Kein Zugriff auf das Vorgänger-Turnier" });
      }
      if (basis.status !== "abgeschlossen" && basis.status !== "archiviert") {
        return reply
          .code(409)
          .send({ error: "Ein neuer Spieltag lässt sich nur aus einem abgeschlossenen Turnier ableiten." });
      }

      const jetzt = new Date().toISOString();

      // Wettbewerbs-Klammer: vorhandene uebernehmen, sonst neu anlegen und den Vorgaenger
      // nachtraeglich damit verknuepfen (rein strukturelle Gruppierung fuer die Aggregation).
      let wettbewerbId = basis.wettbewerbId;
      if (!wettbewerbId) {
        const wId = newId("wettbewerb");
        const wettbewerb: Wettbewerb = {
          _id: wId,
          docType: "wettbewerb",
          wettbewerbId: wId,
          name: basis.name,
          erstelltVon: req.benutzer!._id,
          erstelltAm: jetzt,
        };
        await insertDoc(wettbewerb);
        wettbewerbId = wId;
        await insertDoc({ ...basis, wettbewerbId, spieltagNummer: basis.spieltagNummer ?? 1 });
      }

      // Abgeleitetes Turnier: uebernimmt Regelwerte/Felder/Modus vom Vorgaenger, setzt aber
      // eigene Grunddaten, frische Oeffentlichkeits-/Spielplan-Metadaten und Herkunftsbezuege.
      const neuId = newId("turnier");
      const neuesTurnier: Turnier = {
        ...basis,
        _id: neuId,
        _rev: undefined,
        turnierId: neuId,
        name: req.body.name,
        datum: req.body.datum,
        startzeit: req.body.startzeit,
        status: "entwurf",
        wettbewerbId,
        basisTurnierId: basis._id,
        spieltagNummer: (basis.spieltagNummer ?? 1) + 1,
        regelnGesperrt: true,
        oeffentlichTurnierinfos: false,
        oeffentlichAnfahrtDokumente: false,
        oeffentlichSpielplan: false,
        oeffentlichErgebnisse: false,
        oeffentlichRegeln: false,
        // Pauschale Freigabe fuer alle angemeldeten Benutzer ist eine bewusste Entscheidung der
        // Turnierleitung fuer GENAU dieses Turnier, kein automatisch weitervererbtes Merkmal der
        // Veranstaltungsreihe - die neue Turnierleitung des abgeleiteten Spieltags soll das
        // aktiv neu entscheiden (Nutzer-Vorgabe 2026-08-14), nicht durch den Spread erben.
        zugriffFuerAlleBenutzer: undefined,
        spielplanFreigegeben: false,
        spielplanVersion: 1,
        spielplanGeaendertAm: jetzt,
        spielplanBasis: undefined,
        erstelltVon: req.benutzer!._id,
        erstelltVonName: req.benutzer!.name,
        erstelltAm: jetzt,
        geaendertAm: undefined,
        geaendertVon: undefined,
        zuletztBearbeitetVon: undefined,
        zuletztBearbeitetVonName: undefined,
        abgeschlossenVon: undefined,
        abgeschlossenVonName: undefined,
        abgeschlossenAm: undefined,
        // Turnier-Codes NICHT vom Vorgaenger uebernehmen: der Spread oben wuerde sonst
        // stillschweigend denselben Zugangscode fuer den neuen Spieltag gueltig lassen - wer
        // den alten Code kennt (z.B. vom Aushang des ersten Spieltags), haette damit
        // ungewollt Zugriff auf den neuen. Muss die Turnierleitung bewusst neu vergeben.
        turnierleitungCodeHash: undefined,
        spielleitungCodeHash: undefined,
        // Ebenso keinen Sync-Checkout vom Vorgaenger erben - das abgeleitete Turnier ist neu
        // entstanden und war nie selbst ausgecheckt; sonst wuerde der periodische Check-in
        // (backend/src/sync/checkin.ts) Daten dieses Turniers faelschlich unter dem Checkout-
        // Kontext des Vorgaengers pushen.
        lokalerSyncCheckoutId: undefined,
      };
      // Bewusst noch NICHT einfuegen - das Turnier-Dokument wird einmalig am Ende (inkl.
      // spielplanBasis) gespeichert; Mannschaften/Kader/Spiele referenzieren nur die neue ID.

      // Mannschaften kopieren (mit Herkunftsverweis) und Zuordnung alt->neu merken.
      const basisMannschaften = await findAllBySelector<MannschaftImTurnier>({
        docType: "mannschaftImTurnier",
        turnierId: basis._id,
      });
      const mannschaftMap = new Map<string, string>();
      for (const m of basisMannschaften) {
        const nmId = newId("mannschaftImTurnier");
        mannschaftMap.set(m._id, nmId);
        await insertDoc<MannschaftImTurnier>({
          ...m,
          _id: nmId,
          _rev: undefined,
          mannschaftId: nmId,
          turnierId: neuId,
          importiertAusTurnierId: basis._id,
          importiertAusMannschaftId: m._id,
        });

        // Kader dieser Mannschaft mitkopieren (uebernommen, aber spaeter editierbar).
        const kader = await findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: m._id });
        for (const s of kader) {
          const nsId = newId("spieler");
          await insertDoc<Spieler>({
            ...s,
            _id: nsId,
            _rev: undefined,
            spielerId: nsId,
            mannschaftId: nmId,
            importiertAusTurnierId: basis._id,
            importiertAusSpielerId: s._id,
          });
        }
      }

      // Schiedsrichter (inkl. Turnierleitung) kopieren. vereinId braucht - anders als vorher
      // mannschaftId - KEIN Remapping (Vereins-Zugehoerigkeit aendert sich zwischen Spieltagen
      // nicht, "...sr" uebernimmt sie also schon korrekt). Der Kommentar beim automatischen
      // Turnierleitung-Eintrag in POST /turniere behauptet das schon laenger, tatsaechlich
      // passierte es bisher nicht (Luecke, beim Systemtest 2026-08-14 aufgefallen).
      const basisSchiedsrichter = await findAllBySelector<SchiedsrichterImTurnier>({
        docType: "schiedsrichterImTurnier",
        turnierId: basis._id,
      });
      for (const sr of basisSchiedsrichter) {
        const nsrId = newId("schiedsrichterImTurnier");
        await insertDoc<SchiedsrichterImTurnier>({
          ...sr,
          _id: nsrId,
          _rev: undefined,
          schiedsrichterId: nsrId,
          turnierId: neuId,
          importiertAusTurnierId: basis._id,
          importiertAusSchiedsrichterId: sr._id,
        });
      }

      // Spielplan spiegeln: Heim/Auswaerts getauscht, Startzeiten auf den neuen Termin neu
      // berechnet, Ergebnisse/Schiedsrichter zurueckgesetzt (Status "geplant").
      const basisSpiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: basis._id });
      for (const sp of basisSpiele) {
        const neuA = mannschaftMap.get(sp.mannschaftBId);
        const neuB = mannschaftMap.get(sp.mannschaftAId);
        if (!neuA || !neuB) continue; // Sicherheitsnetz - sollte nie eintreten
        const slot = Number(sp.runde);
        const nId = newId("spiel");
        await insertDoc<Spiel>({
          _id: nId,
          docType: "spiel",
          spielId: nId,
          turnierId: neuId,
          runde: sp.runde,
          feldId: sp.feldId,
          startzeitGeplant: Number.isFinite(slot) ? berechneStartzeit(neuesTurnier, slot - 1) : sp.startzeitGeplant,
          mannschaftAId: neuA,
          mannschaftBId: neuB,
          status: "geplant",
          istForfait: false,
          ergebnisAbgeschlossen: false,
        });
      }

      // Spielplan-Basis-Schnappschuss fuer den Aenderungs-Hinweis setzen (analog spielplan.ts).
      const spielplanBasis: SpielplanBasis = {
        spielplanModus: neuesTurnier.spielplanModus,
        felder: neuesTurnier.felder,
        mannschaften: [...mannschaftMap.values()].map((id) => ({
          id,
          name: basisMannschaften.find((m) => mannschaftMap.get(m._id) === id)?.name ?? "",
        })),
        spielzeitMinuten: neuesTurnier.spielzeitMinuten,
        pauseMinuten: neuesTurnier.pauseMinuten,
        anzahlHalbzeiten: neuesTurnier.anzahlHalbzeiten,
        startzeit: neuesTurnier.startzeit,
        bundeslandBeruecksichtigen: neuesTurnier.bundeslandBeruecksichtigen,
      };
      const mitBasis = await insertDoc({ ...neuesTurnier, spielplanBasis });

      return reply.code(201).send(mitBasis);
    },
  );

  // Bewusst requireAuth statt requireZugriff: vollstaendiges Loeschen eines Turniers ist so
  // weitreichend, dass dafuer ein echtes Benutzerkonto noetig bleibt, auch fuer eine sonst
  // schreiben_voll-berechtigte Turnier-Code-Session (Turnierleitung-Code).
  app.delete<{ Params: { id: string } }>("/turniere/:id", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const bestehend = await findById<Turnier>(req.params.id);
    if (!bestehend) return reply.code(404).send({ error: "Turnier nicht gefunden" });
    if (!(await hatMindestens(bestehend, req, "schreiben_voll"))) {
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

import type { FastifyInstance } from "fastify";
import type { MannschaftImTurnier, Spiel, Turnier } from "@torball/shared";
import { findAllBySelector, findById } from "../repository";
import { berechneTabelle } from "../ergebnisse/tabelle";

/** Nie an die oeffentliche Seite ausliefern (Abschnitt 13: "Spielplan ... ohne
 * Schiedsrichter"; Abschnitt 24.3: Schiedsrichter grundsaetzlich nicht genannt). */
function oeffentlichesSpiel(s: Spiel) {
  return {
    _id: s._id,
    runde: s.runde,
    feldId: s.feldId,
    startzeitGeplant: s.startzeitGeplant,
    mannschaftAId: s.mannschaftAId,
    mannschaftBId: s.mannschaftBId,
    status: s.status,
    ergebnisA: s.ergebnisA,
    ergebnisB: s.ergebnisB,
    istForfait: s.istForfait,
    ergebnisAbgeschlossen: s.ergebnisAbgeschlossen,
  };
}

export async function oeffentlichRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Oeffentliche Turnierseite (Abschnitt 13) - kein Login, "frei verteilbarer
   * Link" je Turnier. Die Turnier-ID selbst dient als Adresse (anders als beim
   * Ergebnis-Token gibt es hier keinen zweiten Geheimwert: Lesezugriff ist
   * unkritisch, die eigentliche Freigabe steuern die vier oeffentlich*-Felder).
   * Jede der vier Sektionen ist einzeln durch die Turnierleitung freischaltbar
   * (Abschnitt 13 "Gliederung") - im Response ist eine deaktivierte Sektion
   * schlicht `null`, der Turniername bleibt immer sichtbar (damit ein noch
   * nicht freigeschalteter Link wenigstens den richtigen Namen zeigt).
   */
  app.get<{ Params: { id: string } }>("/oeffentlich/turniere/:id", async (req, reply) => {
    const turnier = await findById<Turnier>(req.params.id);
    if (!turnier) return reply.code(404).send({ error: "Turnier nicht gefunden" });

    const [mannschaften, spiele] = await Promise.all([
      findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id }),
      findAllBySelector<Spiel>({ docType: "spiel", turnierId: turnier._id }),
    ]);

    return {
      turnierId: turnier._id,
      name: turnier.name,
      // Immer dabei (nicht hinter oeffentlichTurnierinfos versteckt): Spielplan/Ergebnisse
      // brauchen die Namen zum Aufloesen der mannschaftAId/mannschaftBId-Referenzen, auch
      // wenn die reinen Turnierinfos separat abgeschaltet sind. Mannschaftsnamen selbst
      // sind nicht sensibel.
      mannschaften: mannschaften.map((m) => ({ _id: m._id, name: m.name, bundesland: m.bundesland })),
      felder: turnier.felder,

      turnierinfos: turnier.oeffentlichTurnierinfos
        ? {
            datum: turnier.datum,
            startzeit: turnier.startzeit,
            status: turnier.status,
            turnierleitungName: turnier.turnierleitungName,
            turnierleitungKontakt: turnier.turnierleitungKontakt,
            ansprechpartnerName: turnier.ansprechpartnerName,
            ansprechpartnerKontakt: turnier.ansprechpartnerKontakt,
            zusatzinfo: turnier.zusatzinfo,
          }
        : null,

      anfahrt: turnier.oeffentlichAnfahrtDokumente
        ? {
            spielortName: turnier.spielortName,
            spielortAdresse: turnier.spielortAdresse,
            spielortGeo: turnier.spielortGeo,
          }
        : null,

      spielplan: turnier.oeffentlichSpielplan
        ? {
            version: turnier.spielplanVersion,
            geaendertAm: turnier.spielplanGeaendertAm,
            spiele: spiele.map(oeffentlichesSpiel),
          }
        : null,

      ergebnisse: turnier.oeffentlichErgebnisse
        ? {
            tabelle: berechneTabelle(turnier, mannschaften, spiele),
            spiele: spiele.map(oeffentlichesSpiel),
          }
        : null,

      // Turnierregeln (Spielzeit, Wertung, Timeouts …) - nur wenn freigegeben. Die Werte liegen
      // direkt am Turnier (Turnier extends Turnierregeln); nicht sensibel.
      regeln: turnier.oeffentlichRegeln
        ? {
            spielzeitMinuten: turnier.spielzeitMinuten,
            anzahlHalbzeiten: turnier.anzahlHalbzeiten,
            pauseMinuten: turnier.pauseMinuten,
            seitenwechsel: turnier.seitenwechsel,
            timeoutsJeHalbzeit: turnier.timeoutsJeHalbzeit,
            timeoutDauerSekunden: turnier.timeoutDauerSekunden,
            auswechslungenJeHalbzeit: turnier.auswechslungenJeHalbzeit,
            tordifferenzAbbruch: turnier.tordifferenzAbbruch,
            tordifferenzLimit: turnier.tordifferenzLimit,
            verlaengerungAktiv: turnier.verlaengerungAktiv,
            silbernesTor: turnier.silbernesTor,
            punkteSieg: turnier.punkteSieg,
            punkteUnentschieden: turnier.punkteUnentschieden,
            punkteNiederlage: turnier.punkteNiederlage,
            tabellenKriterien: turnier.tabellenKriterien,
            // Aeltere Turniere (vor Einfuehrung des Feldes) haben kein forfaitErgebnis gesetzt -
            // auf den dokumentierten Standard "3:0" zurueckfallen, damit die Zeile nicht leer bleibt
            // (gleicher Fallback wie in der Ergebniserfassung, siehe CLAUDE.md).
            forfaitErgebnis: turnier.forfaitErgebnis || "3:0",
          }
        : null,
    };
  });
}

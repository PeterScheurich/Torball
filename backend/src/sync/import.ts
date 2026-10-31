import type { MannschaftImTurnier, TorballDokument, Turnier, Wettbewerb } from "@torball/shared";
import { findAllBySelector, findById, findByIdUngeprueft, insertDoc } from "../repository";
import type { TurnierExportPaket } from "./export";
import { pruefeTurnierExportPaket } from "./validierung";

/**
 * Gegenstueck zu `sammleTurnierExport`: schreibt ein Exportpaket in die eigene CouchDB. Zwei
 * Modi: `ersetzen: false` (Neuanlage - Download auf die lokale Instanz, oder Upload eines neuen
 * Turniers zum Server) legt jedes Dokument frisch an (kein `_rev`); `ersetzen: true`
 * (Neu-Verknuepfen-Ausnahmefall) ueberschreibt die bestehenden Dokumente mit dem aktuellen
 * lokalen `_rev` je Dokument - kein Merge, das komplett uebergebene Paket ersetzt, was da ist.
 *
 * `BenutzerId`-Referenzen (`erstelltVon`/`geaendertVon`/`zuletztBearbeitetVon`/`abgeschlossenVon`)
 * werden verworfen (bedeutungslos auf der Zielinstanz) - die denormalisierten `*Name`-Felder
 * bleiben als Historie erhalten.
 */
export async function importiereTurnierExport(
  paket: TurnierExportPaket,
  optionen: { ersetzen: boolean; erwarteteTurnierId?: string },
): Promise<{ warnung?: string }> {
  // Verpflichtende Sicherheitspruefung (fail closed), bevor irgendetwas geschrieben wird: sonst
  // koennte ein manipuliertes Paket einer gekoppelten Instanz beliebige Dokumente (fremde Turniere,
  // benutzer:, systemeinstellungen:global, ...) ueberschreiben oder anlegen - die Schreib-Adresse
  // ist die mitgelieferte _id, die _rev holt schreibe() bei ersetzen:true selbst. Die aufrufenden
  // Routen pruefen bereits vorab und antworten sauber; dieser Aufruf hier ist die letzte, nicht zu
  // umgehende Verteidigungslinie (auch fuer kuenftige Aufrufer). Details: validierung.ts.
  const fehler = pruefeTurnierExportPaket(paket, optionen.erwarteteTurnierId);
  if (fehler) throw new Error(`Ungültiges Turnier-Exportpaket: ${fehler}`);

  const turnier: Turnier = {
    ...paket.turnier,
    erstelltVon: undefined,
    geaendertVon: undefined,
    zuletztBearbeitetVon: undefined,
    abgeschlossenVon: undefined,
  };

  // Turnierbezogene Dokumente in Schreibreihenfolge.
  const turnierDokumente: TorballDokument[] = [
    turnier,
    ...paket.mannschaften,
    ...paket.spieler,
    ...paket.spiele,
    ...paket.schiedsrichter,
    // Digitale Protokollierung: aeltere Pakete (vor dem Feature) haben die Felder noch nicht.
    ...(paket.spielprotokolle ?? []),
    ...(paket.events ?? []),
  ];

  // Bei ersetzen:true wird unter der mitgelieferten _id geschrieben und die _rev des dort bereits
  // vorhandenen Dokuments uebernommen. Die Paket-Pruefung (validierung.ts) sieht nur das
  // EINGEHENDE Dokument - ein Paket fuer das eigene Turnier konnte deshalb unter der _id einer
  // fremden Mannschaft/eines fremden Spiels/Spielers ein Dokument von Turnier B ueberschreiben und
  // in dieses Turnier umhaengen (OWASP-Durchgang 2026-10-31). Deshalb wird VOR dem ersten Schreiben
  // jedes bereits vorhandene Ziel-Dokument geprueft: gleicher Typ und zugehoerig zu DIESEM Turnier.
  // Alles vorab, damit eine Ablehnung nie einen halb geschriebenen Stand hinterlaesst.
  const revs = new Map<string, string | undefined>();
  if (optionen.ersetzen) {
    const eigeneMannschaftIds = new Set(
      (
        await findAllBySelector<MannschaftImTurnier>({ docType: "mannschaftImTurnier", turnierId: turnier._id })
      ).map((m) => m._id),
    );
    for (const doc of turnierDokumente) {
      const vorhanden = await findByIdUngeprueft(doc._id);
      if (!vorhanden) continue;
      if (vorhanden.docType !== doc.docType) {
        throw new Error(`Ungültiges Turnier-Exportpaket: ${doc.docType} "${doc._id}" kollidiert mit einem Dokument anderen Typs.`);
      }
      if (!gehoertZuTurnier(vorhanden, turnier._id, eigeneMannschaftIds)) {
        throw new Error(
          `Ungültiges Turnier-Exportpaket: ${doc.docType} "${doc._id}" gehört bereits zu einem anderen Turnier und wird nicht überschrieben.`,
        );
      }
      revs.set(doc._id, vorhanden._rev);
    }
  }

  async function schreibe<T extends TorballDokument>(doc: T): Promise<void> {
    await insertDoc({ ...doc, _rev: revs.get(doc._id) });
  }

  // Stammdaten nur anlegen, falls die ID hier noch nicht existiert (idempotent - ein zweiter
  // Spieltag desselben Wettbewerbs bringt dieselben Vereine/Teams sonst kein zweites Mal mit).
  for (const verein of paket.vereine) {
    if (!(await findById(verein._id, "verein"))) await insertDoc(verein);
  }
  for (const team of paket.teams) {
    if (!(await findById(team._id, "team"))) await insertDoc(team);
  }
  if (paket.wettbewerb && !(await findById(paket.wettbewerb._id, "wettbewerb"))) {
    // erstelltVon ebenso verwerfen wie beim Turnier oben (Kommentar/CLAUDE.md versprechen das
    // pauschal fuer alle BenutzerId-Referenzen im Paket - Wettbewerb wurde dabei vergessen).
    await insertDoc<Wettbewerb>({ ...paket.wettbewerb, erstelltVon: undefined });
  }

  for (const doc of turnierDokumente) await schreibe(doc);

  let warnung: string | undefined;
  if (turnier.basisTurnierId && !(await findById(turnier.basisTurnierId, "turnier"))) {
    warnung =
      "Das referenzierte Vorgänger-Turnier existiert auf dieser Instanz nicht - eine " +
      "turnierübergreifende Auswertung (Gesamttabelle) ist hier nicht möglich.";
  }

  return { warnung };
}

/**
 * Gehoert ein bereits vorhandenes Dokument zu diesem Turnier? Spieler haengen nur an der
 * Mannschaft (kein eigenes turnierId-Feld) und gelten daher ueber die Mannschaften des Turniers, wie
 * sie in der EIGENEN Datenbank stehen - nicht ueber das, was das Paket behauptet.
 */
function gehoertZuTurnier(doc: TorballDokument, turnierId: string, mannschaftIds: Set<string>): boolean {
  const d = doc as unknown as Record<string, unknown>;
  switch (doc.docType) {
    case "turnier":
      return doc._id === turnierId;
    case "spieler":
      return typeof d.mannschaftId === "string" && mannschaftIds.has(d.mannschaftId);
    default:
      return d.turnierId === turnierId;
  }
}

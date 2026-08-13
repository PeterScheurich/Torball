import type { TorballDokument, Turnier } from "@torball/shared";
import { findById, insertDoc } from "../repository";
import type { TurnierExportPaket } from "./export";

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
  optionen: { ersetzen: boolean },
): Promise<{ warnung?: string }> {
  async function schreibe<T extends TorballDokument>(doc: T): Promise<void> {
    const bestehend = optionen.ersetzen ? await findById<T>(doc._id) : null;
    await insertDoc({ ...doc, _rev: bestehend?._rev });
  }

  const turnier: Turnier = {
    ...paket.turnier,
    erstelltVon: undefined,
    geaendertVon: undefined,
    zuletztBearbeitetVon: undefined,
    abgeschlossenVon: undefined,
  };

  // Stammdaten nur anlegen, falls die ID hier noch nicht existiert (idempotent - ein zweiter
  // Spieltag desselben Wettbewerbs bringt dieselben Vereine/Teams sonst kein zweites Mal mit).
  for (const verein of paket.vereine) {
    if (!(await findById(verein._id))) await insertDoc(verein);
  }
  for (const team of paket.teams) {
    if (!(await findById(team._id))) await insertDoc(team);
  }
  if (paket.wettbewerb && !(await findById(paket.wettbewerb._id))) {
    await insertDoc(paket.wettbewerb);
  }

  await schreibe(turnier);
  for (const mannschaft of paket.mannschaften) await schreibe(mannschaft);
  for (const spieler of paket.spieler) await schreibe(spieler);
  for (const spiel of paket.spiele) await schreibe(spiel);
  for (const schiedsrichter of paket.schiedsrichter) await schreibe(schiedsrichter);

  let warnung: string | undefined;
  if (turnier.basisTurnierId && !(await findById(turnier.basisTurnierId))) {
    warnung =
      "Das referenzierte Vorgänger-Turnier existiert auf dieser Instanz nicht - eine " +
      "turnierübergreifende Auswertung (Gesamttabelle) ist hier nicht möglich.";
  }

  return { warnung };
}

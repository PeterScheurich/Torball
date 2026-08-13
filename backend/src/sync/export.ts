import type {
  MannschaftImTurnier,
  SchiedsrichterImTurnier,
  Spiel,
  Spieler,
  Team,
  Turnier,
  Verein,
  Wettbewerb,
} from "@torball/shared";
import { findAllBySelector, findById } from "../repository";

/**
 * Turnier-Exportpaket (Grundlage Turnier-Sync, Abschnitt 21.3/23): sammelt exakt die
 * turnierbezogenen Dokumente, die eine andere Instanz braucht, um dasselbe Turnier lokal
 * weiterzuverwalten - Umfang orientiert an der bestehenden Kaskaden-Loesch-Logik in
 * `routes/turnier.ts` (DELETE /turniere/:id). Bewusst AUSGESCHLOSSEN: turnierBerechtigung,
 * ergebnisToken, ergebnisAenderung, auditLogEintrag, session - instanzlokale/ephemere Artefakte
 * ohne Bedeutung auf der Zielinstanz (siehe Plan-Protokoll).
 */
export interface TurnierExportPaket {
  turnier: Turnier;
  mannschaften: MannschaftImTurnier[];
  spieler: Spieler[];
  spiele: Spiel[];
  schiedsrichter: SchiedsrichterImTurnier[];
  vereine: Verein[];
  teams: Team[];
  wettbewerb: Wettbewerb | null;
}

export async function sammleTurnierExport(
  turnierId: string,
  optionen: { stammdatenMitnehmen: boolean },
): Promise<TurnierExportPaket> {
  const turnier = await findById<Turnier>(turnierId);
  if (!turnier) throw new Error("Turnier nicht gefunden");

  const mannschaften = await findAllBySelector<MannschaftImTurnier>({
    docType: "mannschaftImTurnier",
    turnierId,
  });

  const spieler: Spieler[] = [];
  for (const mannschaft of mannschaften) {
    spieler.push(...(await findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: mannschaft._id })));
  }

  const spiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId });
  const schiedsrichter = await findAllBySelector<SchiedsrichterImTurnier>({
    docType: "schiedsrichterImTurnier",
    turnierId,
  });

  let vereine: Verein[] = [];
  let teams: Team[] = [];
  if (optionen.stammdatenMitnehmen) {
    // Vereins-IDs sowohl aus den Mannschaften als auch aus den Schiedsrichtern sammeln: ein
    // Schiedsrichter kann einem Verein angehoeren, der selbst keine Mannschaft in diesem Turnier
    // stellt (z.B. eine neutrale, von auswaerts eingeladene Person) - dessen Verein wuerde sonst
    // fehlen und auf der Zielinstanz zu einer haengenden vereinId-Referenz fuehren.
    const vereinIds = new Set(
      [...mannschaften.map((m) => m.vereinId), ...schiedsrichter.map((s) => s.vereinId)].filter(
        (id): id is string => !!id,
      ),
    );
    const teamIds = new Set(mannschaften.map((m) => m.teamId).filter((id): id is string => !!id));
    vereine = (await Promise.all([...vereinIds].map((id) => findById<Verein>(id)))).filter(
      (v): v is Verein => v !== null,
    );
    teams = (await Promise.all([...teamIds].map((id) => findById<Team>(id)))).filter((t): t is Team => t !== null);
  }

  const wettbewerb = turnier.wettbewerbId ? await findById<Wettbewerb>(turnier.wettbewerbId) : null;

  return { turnier, mannschaften, spieler, spiele, schiedsrichter, vereine, teams, wettbewerb };
}

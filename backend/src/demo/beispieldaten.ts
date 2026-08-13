import { randomUUID } from "node:crypto";
import type {
  Benutzer,
  Klassifizierung,
  MannschaftImTurnier,
  SchiedsrichterImTurnier,
  Spiel,
  Spieler,
  Spielfeld,
  SpielplanBasis,
  Team,
  Turnier,
  Verein,
  Wettbewerb,
} from "@torball/shared";
import { findAllByType, findAllBySelector, insertDoc, newId } from "../repository";
import { aktuelleTurnierregeln } from "../konfiguration";
import { erzeugePaarungen } from "../spielplan/paarungen";
import { erstelleSpielplanVorschlag } from "../spielplan/planung";
import { berechneStartzeit } from "../spielplan/zeitplanung";
import { pruefeDemoErlaubt } from "./schutz";

/**
 * Baut einen festen Satz Demo-Stammdaten und -Turniere auf (Vereine/Teams, ein abgeschlossenes
 * Turnier, eine zweigleisige Bundesliga-Saison mit je zwei Spieltagen, zwei geplante Turniere,
 * ein laufendes Turnier) - gedacht als einmaliger Aufbau vor einem `demo:snapshot:erstellen`
 * (siehe snapshot.ts), nicht als taeglich neu zu generierender Datensatz. Alle Inhalte gehoeren
 * einem eigenen "Demo-Datenpflege"-Konto (siehe demoKonto unten), nicht dem echten Admin-Konto
 * des Betreibers - dessen Konto bleibt beim Snapshot-Restore unangetastet (siehe schutz.ts/
 * snapshot.ts, die nur Turnier-/Stammdaten-Dokumente ersetzen, keine Benutzer).
 *
 * Mehrfacher Aufruf legt weitere, zusaetzliche Vereine/Turniere an (keine Idempotenz) - das ist
 * fuer den vorgesehenen Anwendungsfall (einmaliger Aufbau, danach direkt ein Snapshot) bewusst
 * kein Problem.
 */
export async function erzeugeBeispieldaten(): Promise<void> {
  pruefeDemoErlaubt();

  const ersteller = await demoKonto();
  const teams = await erzeugeVereineUndTeams();
  const team = (name: string): TeamMitVerein => {
    const treffer = teams.find((t) => t.team.name === name);
    if (!treffer) throw new Error(`Demo-Team "${name}" nicht gefunden - Beispieldaten inkonsistent.`);
    return treffer;
  };

  // Ein Team je Verein (die drei "II"-Zweitteams bleiben hier aussen vor) - fuer das normale
  // Turnier und das 10er-Freundschaftsturnier.
  const erstteams = teams.filter((t) => !t.team.name.endsWith(" II"));

  // ---- Normales abgeschlossenes Turnier: 10 Mannschaften, jeder gegen jeden, volle Ergebnisse. ----
  await erzeugeEinzelTurnier({
    name: "Torball-Cup Musterstadt",
    datum: samstagInVergangenheit(4),
    startzeit: "10:00",
    status: "abgeschlossen",
    ersteller,
    teams: erstteams,
    wiederholungen: 1,
    ergebnisAnteil: 1,
    ergebnisseAbschliessen: true,
    mitSpieler: true,
    oeffentlich: true,
  });

  // ---- Bundesliga-Saison: 1. Liga (7 Mannschaften) + 2. Liga (6 Mannschaften), je zwei
  // Spieltage (Hin-/Rueckspieltag). Die zweite und dritte Mannschaft der Vereine mit Zweitteam
  // spielt jeweils in der 2. Liga - die erste in der 1. Liga. ----
  const ersteBundesliga = [
    team("BSV München I"),
    team("TSG Unterliederbach I"),
    team("SV Hoffeld I"),
    team("BVB Dortmund"),
    team("FC St. Pauli"),
    team("SV Reha Augsburg"),
    team("Magdeburger SV 90"),
  ];
  const zweiteBundesliga = [
    team("BSV München II"),
    team("TSG Unterliederbach II"),
    team("SV Hoffeld II"),
    team("BSG Langenhagen"),
    team("FSV Forst Borgsdorf"),
    team("Landshut"),
  ];

  for (const [ligaName, mannschaftenListe] of [
    ["1. Bundesliga", ersteBundesliga] as const,
    ["2. Bundesliga", zweiteBundesliga] as const,
  ]) {
    const spieltag1 = await erzeugeEinzelTurnier({
      name: `${ligaName} – 1. Spieltag`,
      datum: samstagInZukunft(3),
      startzeit: "11:00",
      status: "aktiv",
      ersteller,
      teams: mannschaftenListe,
      wiederholungen: 1,
      ergebnisAnteil: 0,
      ergebnisseAbschliessen: false,
      mitSpieler: true,
      oeffentlich: true,
    });

    const wettbewerbId = newId("wettbewerb");
    await insertDoc<Wettbewerb>({
      _id: wettbewerbId,
      docType: "wettbewerb",
      wettbewerbId,
      name: `${ligaName} – Demo-Saison`,
      anzahlSpieltage: 2,
      erstelltVon: ersteller._id,
      erstelltAm: new Date().toISOString(),
    });

    await erzeugeSpieltag2(spieltag1, wettbewerbId, `${ligaName} – 2. Spieltag`, samstagInZukunft(7), "11:00");
  }

  // ---- Zwei geplante Turniere, ganz ohne Ergebnisse (Datum in der Zukunft). ----
  await erzeugeEinzelTurnier({
    name: "Freundschaftsturnier Herbstpokal",
    datum: samstagInZukunft(2),
    startzeit: "09:30",
    status: "aktiv",
    ersteller,
    teams: erstteams,
    wiederholungen: 1,
    ergebnisAnteil: 0,
    ergebnisseAbschliessen: false,
    mitSpieler: true,
    oeffentlich: true,
  });

  await erzeugeEinzelTurnier({
    name: "Vierer-Pokal",
    datum: samstagInZukunft(5),
    startzeit: "09:30",
    status: "aktiv",
    ersteller,
    teams: [team("BSV München I"), team("BVB Dortmund"), team("FC St. Pauli"), team("SV Hoffeld I")],
    wiederholungen: 2,
    ergebnisAnteil: 0,
    ergebnisseAbschliessen: false,
    mitSpieler: true,
    oeffentlich: true,
  });

  // ---- Offenes Frauen-Turnier: 5 Mannschaften, jeder gegen jeden, noch ohne Ergebnisse. ----
  await erzeugeEinzelTurnier({
    name: "Frauen-Turnier Frühjahrspokal",
    datum: samstagInZukunft(4),
    startzeit: "09:30",
    status: "aktiv",
    ersteller,
    teams: [
      team("SV Reha Augsburg"),
      team("BSG Langenhagen"),
      team("Magdeburger SV 90"),
      team("FSV Forst Borgsdorf"),
      team("Landshut"),
    ],
    wiederholungen: 1,
    ergebnisAnteil: 0,
    ergebnisseAbschliessen: false,
    mitSpieler: true,
    oeffentlich: true,
  });

  // ---- Laufendes Turnier: 6 Mannschaften, heutiges Datum, mit Spielern und einem Teil bereits
  // erfasster Ergebnisse (die fruehen Zeit-Slots gelten als "schon gespielt"). ----
  await erzeugeEinzelTurnier({
    name: "Demo-Turnier (laufend)",
    datum: heute(),
    startzeit: "10:00",
    status: "aktiv",
    ersteller,
    teams: [
      team("BSV München I"),
      team("SV Reha Augsburg"),
      team("BVB Dortmund"),
      team("FC St. Pauli"),
      team("TSG Unterliederbach I"),
      team("Magdeburger SV 90"),
    ],
    wiederholungen: 1,
    ergebnisAnteil: 0.4,
    ergebnisseAbschliessen: false,
    mitSpieler: true,
    oeffentlich: true,
  });
}

const DEMO_KONTO_EMAIL = "demo-datenpflege@blindentorball.de";

/** Legt (einmalig) das Besitzer-Konto der Demo-Inhalte an, sofern es noch nicht existiert. Bewusst
 *  ohne passwortHash - dieses Konto dient nur als erstelltVon/erstelltVonName-Referenz und soll
 *  sich nie einloggen koennen. Rolle "manager", damit turnierZugriff() vollen Zugriff auf die
 *  selbst erstellten Turniere gewaehrt (siehe CLAUDE.md, Berechtigungsmodell). */
async function demoKonto(): Promise<Benutzer> {
  const alle = await findAllByType<Benutzer>("benutzer");
  const bestehend = alle.find((b) => b.email === DEMO_KONTO_EMAIL);
  if (bestehend) return bestehend;

  const id = newId("benutzer");
  return insertDoc<Benutzer>({
    _id: id,
    docType: "benutzer",
    benutzerId: id,
    email: DEMO_KONTO_EMAIL,
    name: "Demo-Datenpflege",
    globaleRolle: "manager",
    sprache: "de",
    zweiFaAktiv: false,
    gesperrt: false,
    erstelltAm: new Date().toISOString(),
  });
}

interface TeamMitVerein {
  team: Team;
  verein: Verein;
}

const VEREINE_DATEN: { name: string; bundesland: string }[] = [
  { name: "BSV München", bundesland: "Bayern" },
  { name: "SV Reha Augsburg", bundesland: "Bayern" },
  { name: "TSG Unterliederbach", bundesland: "Hessen" },
  { name: "BVB Dortmund", bundesland: "Nordrhein-Westfalen" },
  { name: "BSG Langenhagen", bundesland: "Niedersachsen" },
  { name: "Magdeburger SV 90", bundesland: "Sachsen-Anhalt" },
  { name: "FSV Forst Borgsdorf", bundesland: "Brandenburg" },
  { name: "SV Hoffeld", bundesland: "Baden-Württemberg" },
  { name: "Landshut", bundesland: "Bayern" },
  { name: "FC St. Pauli", bundesland: "Hamburg" },
];

/** Diese Vereine bekommen zwei Teams (Nutzer-Vorgabe) - die zweite Mannschaft spielt jeweils in
 *  der 2. statt der 1. Bundesliga (siehe erzeugeBeispieldaten). */
const VEREINE_MIT_ZWEITTEAM = new Set(["BSV München", "TSG Unterliederbach", "SV Hoffeld"]);

async function erzeugeVereineUndTeams(): Promise<TeamMitVerein[]> {
  const ergebnis: TeamMitVerein[] = [];

  for (const daten of VEREINE_DATEN) {
    const vereinId = newId("verein");
    const verein = await insertDoc<Verein>({
      _id: vereinId,
      docType: "verein",
      vereinId,
      name: daten.name,
      bundesland: daten.bundesland,
    });

    const anzahlTeams = VEREINE_MIT_ZWEITTEAM.has(daten.name) ? 2 : 1;
    for (let i = 1; i <= anzahlTeams; i++) {
      const teamId = newId("team");
      const name = anzahlTeams > 1 ? `${verein.name} ${i === 1 ? "I" : "II"}` : verein.name;
      const team = await insertDoc<Team>({ _id: teamId, docType: "team", teamId, vereinId: verein.vereinId, name });
      ergebnis.push({ team, verein });
    }
  }

  return ergebnis;
}

const VORNAMEN = [
  "Anna", "Ben", "Clara", "David", "Emma", "Finn", "Greta", "Hannah", "Ida", "Jan",
  "Kim", "Lena", "Max", "Nora", "Oskar", "Paula", "Quentin", "Rosa", "Sven", "Tina",
  "Uwe", "Vera", "Willi", "Zoe", "Lukas", "Mia", "Noah", "Sophie", "Tom", "Julia",
];
const NACHNAMEN = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schulz",
  "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger",
  "Hofmann", "Hartmann", "Lange", "Werner", "Schmitt", "Krause", "Meier", "Lehmann", "Huber", "Kaiser",
];
const KLASSIFIZIERUNGEN: Klassifizierung[] = ["B1", "B2", "B3"];

function zufallsElement<T>(liste: T[]): T {
  return liste[Math.floor(Math.random() * liste.length)];
}

/** Legt 3 bis 6 Spieler mit zufaelligem Namen/Trikotnummer/Klassifizierung fuer eine Mannschaft an. */
async function erzeugeSpieler(mannschaftId: string): Promise<void> {
  const anzahl = 3 + Math.floor(Math.random() * 4);
  const vergebeneTrikots = new Set<string>();

  for (let i = 0; i < anzahl; i++) {
    let trikotnummer: string;
    do {
      trikotnummer = String(1 + Math.floor(Math.random() * 9));
    } while (vergebeneTrikots.has(trikotnummer));
    vergebeneTrikots.add(trikotnummer);

    const id = newId("spieler");
    await insertDoc<Spieler>({
      _id: id,
      docType: "spieler",
      spielerId: id,
      mannschaftId,
      vorname: zufallsElement(VORNAMEN),
      name: zufallsElement(NACHNAMEN),
      trikotnummer,
      klassifizierung: zufallsElement(KLASSIFIZIERUNGEN),
      status: "aktiv",
    });
  }
}

/** Legt Turnierleitung + eine weitere pfeifende Person an (Demo-Namen, kein Bezug zu echten Personen). */
async function erzeugeSchiedsrichter(turnierId: string): Promise<void> {
  const tlId = newId("schiedsrichterImTurnier");
  await insertDoc<SchiedsrichterImTurnier>({
    _id: tlId,
    docType: "schiedsrichterImTurnier",
    schiedsrichterId: tlId,
    turnierId,
    name: "Turnierleitung Beispiel",
    lizenzVorhanden: true,
    istTurnierleitung: true,
  });

  const srId = newId("schiedsrichterImTurnier");
  await insertDoc<SchiedsrichterImTurnier>({
    _id: srId,
    docType: "schiedsrichterImTurnier",
    schiedsrichterId: srId,
    turnierId,
    name: "Schiedsrichter Beispiel",
    lizenzVorhanden: true,
    istTurnierleitung: false,
  });
}

interface TurnierBauOptionen {
  name: string;
  datum: string;
  startzeit?: string;
  status: Turnier["status"];
  ersteller: Benutzer;
  teams: TeamMitVerein[];
  wiederholungen: 1 | 2;
  /** Anteil der Spiele (0..1, in Zeit-Slot-Reihenfolge von vorne), die ein Ergebnis bekommen. */
  ergebnisAnteil: number;
  /** true: die Spiele mit Ergebnis gelten als endgueltig abgeschlossen (status "abgeschlossen"),
   *  false: nur "beendet" (Ergebnis erfasst, aber nicht final) - fuer ein noch laufendes Turnier. */
  ergebnisseAbschliessen: boolean;
  mitSpieler: boolean;
  oeffentlich: boolean;
}

/** Baut ein vollstaendiges Turnier (Mannschaften, optional Kader, Spielplan, optional Ergebnisse). */
async function erzeugeEinzelTurnier(opts: TurnierBauOptionen): Promise<Turnier> {
  const { regeln, version } = await aktuelleTurnierregeln();
  const feld: Spielfeld = { feldId: randomUUID(), name: "Feld 1" };
  const turnierId = newId("turnier");
  const jetzt = new Date().toISOString();

  let turnier: Turnier = {
    _id: turnierId,
    docType: "turnier",
    turnierId,
    name: opts.name,
    datum: opts.datum,
    startzeit: opts.startzeit,
    status: opts.status,
    felder: [feld],
    protokollierungsart: "manuell",
    spielplanModus: opts.wiederholungen === 2 ? "doppelt" : "einfach",
    spielernamenOeffentlich: true,
    spielplanFreigegeben: true,
    spielplanVersion: 1,
    oeffentlichTurnierinfos: opts.oeffentlich,
    oeffentlichAnfahrtDokumente: false,
    oeffentlichSpielplan: opts.oeffentlich,
    oeffentlichErgebnisse: opts.oeffentlich,
    oeffentlichRegeln: opts.oeffentlich,
    // Alle angemeldeten Benutzer duerfen die Demo-Turniere lesen UND bearbeiten (Nutzer-Vorgabe),
    // nicht nur das erstellende Demo-Konto/Admin - siehe zugriffFuerAlleBenutzer in
    // shared/src/types/turnier.ts und backend/src/auth/turnierZugriff.ts.
    zugriffFuerAlleBenutzer: "schreiben",
    spielortName: "Sporthalle Musterstadt",
    spielortAdresse: "Musterstraße 1, 12345 Musterstadt",
    zusatzinfo: "Demo-Daten der Testinstanz - werden regelmäßig zurückgesetzt.",
    erstelltVon: opts.ersteller._id,
    erstelltVonName: opts.ersteller.name,
    erstelltMitKonfigVersion: version,
    erstelltAm: jetzt,
    ...regeln,
  };
  turnier = await insertDoc(turnier);

  await erzeugeSchiedsrichter(turnier._id);

  const mannschaften: MannschaftImTurnier[] = [];
  for (const [i, { team, verein }] of opts.teams.entries()) {
    const mannschaftId = newId("mannschaftImTurnier");
    const mannschaft = await insertDoc<MannschaftImTurnier>({
      _id: mannschaftId,
      docType: "mannschaftImTurnier",
      mannschaftId,
      turnierId: turnier._id,
      teamId: team.teamId,
      vereinId: verein.vereinId,
      name: team.name,
      bundesland: verein.bundesland,
      reihenfolge: i,
    });
    mannschaften.push(mannschaft);
    if (opts.mitSpieler) await erzeugeSpieler(mannschaft._id);
  }

  const paarungen = erzeugePaarungen(mannschaften, opts.wiederholungen);
  const vorschlag = erstelleSpielplanVorschlag(paarungen, turnier.felder);

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

  const anzahlMitErgebnis = Math.round(spiele.length * opts.ergebnisAnteil);
  for (const [i, spiel] of spiele.entries()) {
    if (i < anzahlMitErgebnis) {
      spiel.ergebnisA = Math.floor(Math.random() * 6);
      spiel.ergebnisB = Math.floor(Math.random() * 6);
      spiel.status = opts.ergebnisseAbschliessen ? "abgeschlossen" : "beendet";
      spiel.ergebnisAbgeschlossen = opts.ergebnisseAbschliessen;
    }
    await insertDoc(spiel);
  }

  if (opts.ergebnisseAbschliessen && anzahlMitErgebnis === spiele.length) {
    turnier = await insertDoc({
      ...turnier,
      abgeschlossenVon: opts.ersteller._id,
      abgeschlossenVonName: opts.ersteller.name,
      abgeschlossenAm: jetzt,
    });
  }

  return turnier;
}

/**
 * Leitet einen zweiten Spieltag aus einem (Demo-)Vorgaenger-Turnier ab - fachlich identisch zum
 * echten Endpunkt `POST /turniere/:id/ableiten` (backend/src/routes/turnier.ts): Mannschaften +
 * Kader werden mit Herkunftsverweis kopiert, der Spielplan wird gespiegelt (Heim/Auswaerts
 * getauscht), die Regeln gelten als uebernommen und gesperrt. Direkt ueber das Repository statt
 * ueber die HTTP-Route, weil die Route eine bereits ABGESCHLOSSENE Vorgaenger-Instanz verlangt -
 * die Demo-Bundesliga-Spieltage sollen aber beide (noch ergebnislos) in der Zukunft liegen
 * (Nutzer-Vorgabe), was der echte Ablauf so nicht zulaesst.
 */
async function erzeugeSpieltag2(
  basis: Turnier,
  wettbewerbId: string,
  name: string,
  datum: string,
  startzeit: string | undefined,
): Promise<Turnier> {
  const basisMitWettbewerb = await insertDoc<Turnier>({ ...basis, wettbewerbId, spieltagNummer: 1 });

  const jetzt = new Date().toISOString();
  const neuId = newId("turnier");
  let neuesTurnier: Turnier = {
    ...basisMitWettbewerb,
    _id: neuId,
    _rev: undefined,
    turnierId: neuId,
    name,
    datum,
    startzeit,
    status: "aktiv",
    wettbewerbId,
    basisTurnierId: basisMitWettbewerb._id,
    spieltagNummer: 2,
    regelnGesperrt: true,
    spielplanFreigegeben: true,
    spielplanVersion: 1,
    spielplanGeaendertAm: jetzt,
    spielplanBasis: undefined,
    erstelltVon: basis.erstelltVon,
    erstelltVonName: basis.erstelltVonName,
    erstelltAm: jetzt,
    geaendertAm: undefined,
    geaendertVon: undefined,
    zuletztBearbeitetVon: undefined,
    zuletztBearbeitetVonName: undefined,
    abgeschlossenVon: undefined,
    abgeschlossenVonName: undefined,
    abgeschlossenAm: undefined,
  };

  await erzeugeSchiedsrichter(neuId);

  const basisMannschaften = await findAllBySelector<MannschaftImTurnier>({
    docType: "mannschaftImTurnier",
    turnierId: basisMitWettbewerb._id,
  });
  const mannschaftMap = new Map<string, string>();
  for (const m of basisMannschaften) {
    const neueMannschaftId = newId("mannschaftImTurnier");
    mannschaftMap.set(m._id, neueMannschaftId);
    await insertDoc<MannschaftImTurnier>({
      ...m,
      _id: neueMannschaftId,
      _rev: undefined,
      mannschaftId: neueMannschaftId,
      turnierId: neuId,
      importiertAusTurnierId: basisMitWettbewerb._id,
      importiertAusMannschaftId: m._id,
    });

    const kader = await findAllBySelector<Spieler>({ docType: "spieler", mannschaftId: m._id });
    for (const s of kader) {
      const neueSpielerId = newId("spieler");
      await insertDoc<Spieler>({
        ...s,
        _id: neueSpielerId,
        _rev: undefined,
        spielerId: neueSpielerId,
        mannschaftId: neueMannschaftId,
        importiertAusTurnierId: basisMitWettbewerb._id,
        importiertAusSpielerId: s._id,
      });
    }
  }

  const basisSpiele = await findAllBySelector<Spiel>({ docType: "spiel", turnierId: basisMitWettbewerb._id });
  for (const sp of basisSpiele) {
    // Heim/Auswaerts getauscht (Rueckspieltag).
    const neuA = mannschaftMap.get(sp.mannschaftBId);
    const neuB = mannschaftMap.get(sp.mannschaftAId);
    if (!neuA || !neuB) continue;
    const slot = Number(sp.runde);
    const id = newId("spiel");
    await insertDoc<Spiel>({
      _id: id,
      docType: "spiel",
      spielId: id,
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
  };
  neuesTurnier = await insertDoc({ ...neuesTurnier, spielplanBasis });
  return neuesTurnier;
}

function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Naechster Samstag in `wochen` Wochen (wochen=1 -> der naechste kommende Samstag, nie heute
 *  selbst, auch wenn heute Samstag ist - der Spieltag soll erkennbar in der Zukunft liegen). */
function samstagInZukunft(wochen: number): string {
  const datum = new Date();
  const tageBisSamstag = (6 - datum.getDay() + 7) % 7 || 7;
  datum.setDate(datum.getDate() + tageBisSamstag + (wochen - 1) * 7);
  return datum.toISOString().slice(0, 10);
}

/** Letzter Samstag vor `wochen` Wochen (wochen=1 -> der letzte vergangene Samstag, nie heute
 *  selbst). */
function samstagInVergangenheit(wochen: number): string {
  const datum = new Date();
  const tageSeitSamstag = (datum.getDay() - 6 + 7) % 7 || 7;
  datum.setDate(datum.getDate() - tageSeitSamstag - (wochen - 1) * 7);
  return datum.toISOString().slice(0, 10);
}

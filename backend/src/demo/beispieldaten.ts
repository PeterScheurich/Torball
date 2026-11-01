import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type {
  Benutzer,
  Klassifizierung,
  MannschaftImTurnier,
  ModusEinstellungen,
  Schiedsrichter,
  SchiedsrichterImTurnier,
  Spiel,
  Spieler,
  Spielfeld,
  Team,
  Turnier,
  Verein,
} from "@torball/shared";
import { findAllByType, insertDoc, newId } from "../repository";
import { authPreHandler } from "../auth/plugin";
import { erstelleSession } from "../auth/session";
import { turnierRoutes } from "../routes/turnier";
import { mannschaftRoutes } from "../routes/mannschaft";
import { spielplanRoutes } from "../routes/spielplan";
import { spielRoutes } from "../routes/spiel";
import { turniermodusRoutes } from "../routes/turniermodus";
import { ergebnisRoutes } from "../routes/ergebnis";
import type { ModusAnsicht } from "../spielplan/modus";
import { pruefeDemoErlaubt } from "./schutz";
import { loescheUngeschuetzteDokumente } from "./snapshot";

/**
 * Baut den festen Demo-Datenstand auf: Vereine/Teams (auch aus anderen Laendern), Schiedsrichter-Stammdaten und
 * sieben Turniere, die die Turniermodi in unterschiedlichen Zustaenden zeigen (siehe TURNIERE unten). Alle
 * Inhalte gehoeren einem eigenen "Demo-Datenpflege"-Konto (siehe demoKonto), nicht dem echten Admin-Konto.
 *
 * Die Turniere werden NICHT von Hand zusammengesetzt, sondern ueber die echten Routen angelegt und bespielt
 * (im Prozess, ohne Netzwerk): Modus waehlen, Gruppen verteilen, Spielplan erzeugen, Ergebnisse erfassen,
 * Endrunde erzeugen. Dadurch bleibt der Demo-Stand automatisch mit der Programmlogik konsistent - frueher
 * baute dieses Skript Dokumente direkt und musste bei jeder Aenderung am Datenmodell nachgezogen werden.
 *
 * `ersetzen`: entfernt vorher alle Inhalte, die ein Reset ohnehin zuruecksetzen wuerde (Turniere, Stammdaten,
 * nicht-Admin-Konten). Ohne die Option legt ein Aufruf weitere Vereine/Turniere dazu (keine Idempotenz).
 *
 * WICHTIG: Der naechtliche Reset spielt den Stand der "_golden"-Datenbank ein. Neue Beispieldaten gelten
 * erst, wenn danach `demo:snapshot:erstellen` ausgefuehrt wird.
 */
export async function erzeugeBeispieldaten(optionen: { ersetzen?: boolean } = {}): Promise<void> {
  pruefeDemoErlaubt();
  if (optionen.ersetzen) {
    const { anzahlDokumente } = await loescheUngeschuetzteDokumente();
    console.log(`${anzahlDokumente} bisherige Demo-Dokumente entfernt.`);
  }

  const ersteller = await demoKonto();
  const teams = await erzeugeVereineUndTeams();
  await erzeugeSchiedsrichterStammdaten(teams);
  const team = (name: string): TeamMitVerein => {
    const treffer = teams.find((t) => t.team.name === name);
    if (!treffer) throw new Error(`Demo-Team "${name}" nicht gefunden - Beispieldaten inkonsistent.`);
    return treffer;
  };

  const { app, anfrage } = await baueApp(ersteller);
  try {
    for (const t of turnierDefinitionen(team)) {
      await erzeugeTurnier(anfrage, t);
      console.log(`  Turnier angelegt: ${t.name}`);
    }
  } finally {
    await app.close();
  }
}

// ---------------------------------------------------------------- Die Demo-Turniere

/** Wie weit ein Demo-Turnier gespielt ist. */
type Stand =
  /** Spielplan steht, noch kein Ergebnis. */
  | "geplant"
  /** Ein Teil der Vorrunde ist gespielt. */
  | "vorrunde-teil"
  /** Vorrunde komplett, Endrunde noch nicht erzeugt (die Turnierleitung kann sie jetzt erzeugen). */
  | "vorrunde-fertig"
  /** Erste Stufe der Endrunde gespielt, die naechste (Finale, Platz 3) ist erzeugbar. */
  | "endrunde-teil"
  /** Alles gespielt, aber das Turnier ist nicht abgeschlossen. */
  | "gespielt"
  /** Alles gespielt und abgeschlossen. */
  | "abgeschlossen";

interface TurnierDefinition {
  name: string;
  datum: string;
  startzeit: string;
  hallen: number;
  teams: TeamMitVerein[];
  modus: string;
  einstellungen?: ModusEinstellungen;
  doppelt?: boolean;
  international?: boolean;
  stand: Stand;
  /** Anteil der Vorrundenspiele, der bei `vorrunde-teil` gespielt ist. */
  vorrundeAnteil?: number;
  /** Alle Endrundenspiele (ohne Platzierungsspiele) in Halle A legen - zeigt die Hallenwahl. */
  endrundeInHalleA?: boolean;
}

function turnierDefinitionen(team: (name: string) => TeamMitVerein): TurnierDefinition[] {
  const deutsch = [
    "BSV München I", "TSG Unterliederbach I", "SV Hoffeld I", "BVB Dortmund", "FC St. Pauli", "SV Reha Augsburg",
    "Magdeburger SV 90", "BSG Langenhagen", "FSV Forst Borgsdorf", "Landshut", "BSV München II", "TSG Unterliederbach II",
    "SV Hoffeld II",
  ].map(team);
  const ausland = ["Lyoner Torball Club", "Brüsseler Torball Club", "Zürcher Torball Club", "Wiener Torball Club", "Mailänder Torball Club"].map(team);

  return [
    {
      name: "Torball-Cup Musterstadt",
      datum: samstagInVergangenheit(4),
      startzeit: "10:00",
      hallen: 1,
      teams: deutsch.slice(0, 6),
      modus: "jeder-gegen-jeden",
      stand: "abgeschlossen",
    },
    {
      name: "Stadtpokal Musterstadt",
      datum: samstagInVergangenheit(2),
      startzeit: "09:00",
      hallen: 2,
      teams: deutsch.slice(0, 8),
      modus: "gruppen-endrunde",
      einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: true },
      stand: "abgeschlossen",
      endrundeInHalleA: true,
    },
    {
      name: "Internationaler Pokal Musterstadt",
      datum: samstagInVergangenheit(1),
      startzeit: "09:00",
      hallen: 2,
      teams: [...ausland, ...deutsch.slice(0, 7)],
      modus: "gruppen-endrunde",
      einstellungen: { endrundeGroesse: 6, platz3: true, platzierungsspiele: true },
      international: true,
      stand: "abgeschlossen",
    },
    {
      name: "Sommerturnier Musterstadt",
      datum: heute(),
      startzeit: "09:00",
      hallen: 2,
      teams: deutsch.slice(2, 10),
      modus: "gruppen-endrunde",
      einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: true },
      stand: "endrunde-teil",
    },
    {
      name: "Winterpokal",
      datum: heute(),
      startzeit: "10:00",
      hallen: 1,
      teams: deutsch.slice(4, 10),
      modus: "jeder-gegen-jeden-endrunde",
      // Mit Haken "Endrunde automatisch erzeugen": wer die Vorrunde zu Ende spielt, sieht die Halbfinale von allein
      // entstehen. Sommerturnier und Europa-Pokal behalten den Knopf, damit beide Wege in der Demo zu sehen sind.
      // (Der Haken darf nur bei einem Turnier von Anfang an gesetzt sein, dessen naechste Stufe noch nicht feststeht -
      // sonst erzeugte die Automatik die Spiele schon beim Aufbau.)
      einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: false, endrundeAutomatisch: true },
      stand: "vorrunde-teil",
      vorrundeAnteil: 0.5,
    },
    {
      name: "Europa-Pokal",
      datum: heute(),
      startzeit: "09:30",
      hallen: 2,
      teams: [...ausland.slice(0, 4), ...deutsch.slice(0, 4)],
      modus: "jeder-gegen-jeden-endrunde",
      einstellungen: { endrundeGroesse: 4, platz3: true, platzierungsspiele: false },
      international: true,
      stand: "vorrunde-fertig",
    },
    {
      name: "Frühjahrsturnier",
      datum: samstagInZukunft(3),
      startzeit: "09:30",
      hallen: 1,
      teams: deutsch.slice(5, 10),
      modus: "jeder-gegen-jeden",
      stand: "geplant",
    },
  ];
}

// ---------------------------------------------------------------- Ablauf ueber die echten Routen

/** Fastify-Instanz mit den Turnier-Routen, angemeldet als Demo-Konto. Kein Netzwerk: nur `inject`. */
async function baueApp(ersteller: Benutzer): Promise<{ app: FastifyInstance; anfrage: Anfrage }> {
  const app = Fastify();
  await app.register(fastifyCookie);
  app.addHook("preHandler", authPreHandler);
  for (const r of [turnierRoutes, mannschaftRoutes, spielplanRoutes, spielRoutes, turniermodusRoutes, ergebnisRoutes]) {
    await app.register(r);
  }
  const cookie = `torball_session=${(await erstelleSession(ersteller._id)).token}`;
  const anfrage: Anfrage = async <T>(method: "GET" | "POST" | "PUT", url: string, payload?: object) => {
    const antwort = await app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    const text = antwort.body;
    if (antwort.statusCode >= 400) {
      throw new Error(`Demo-Daten: ${method} ${url} -> ${antwort.statusCode} ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  };
  return { app, anfrage };
}

type Anfrage = <T = unknown>(method: "GET" | "POST" | "PUT", url: string, payload?: object) => Promise<T>;

/** Zufallsergebnis; `entschieden`: kein Unentschieden (Endrunde - dort entscheidet sonst die Turnierleitung). */
function zufallsErgebnis(entschieden: boolean): [number, number] {
  const a = Math.floor(Math.random() * 6);
  let b = Math.floor(Math.random() * 6);
  if (entschieden && a === b) b = a + 1 + Math.floor(Math.random() * 2);
  return [a, b];
}

async function erzeugeTurnier(anfrage: Anfrage, t: TurnierDefinition): Promise<void> {
  const felder: Spielfeld[] = Array.from({ length: t.hallen }, (_, i) => ({
    feldId: randomUUID(),
    name: `Halle ${String.fromCharCode(65 + i)}`,
  }));
  const zweiGruppen = /gruppen/.test(t.modus);

  const turnier = await anfrage<Turnier>("POST", "/turniere", {
    name: t.name,
    datum: t.datum,
    startzeit: t.startzeit,
    status: "aktiv",
    felder,
    protokollierungsart: "manuell",
    spielplanModus: t.doppelt ? "doppelt" : "einfach",
    turnierart: t.international ? "international" : "national",
    spielernamenOeffentlich: true,
    oeffentlichTurnierinfos: true,
    oeffentlichAnfahrtDokumente: false,
    oeffentlichSpielplan: true,
    oeffentlichErgebnisse: true,
    oeffentlichRegeln: true,
    // Alle angemeldeten Benutzer duerfen die Demo-Turniere lesen UND bearbeiten (Nutzer-Vorgabe).
    zugriffFuerAlleBenutzer: "schreiben",
    spielortName: "Sporthalle Musterstadt",
    spielortAdresse: "Musterstraße 1, 12345 Musterstadt",
    zusatzinfo: "Demo-Daten der Testinstanz - werden regelmäßig zurückgesetzt.",
  });
  const id = turnier._id;

  await anfrage("PUT", `/turniere/${id}/modus`, { turniermodusId: t.modus, ...(t.einstellungen ? { einstellungen: t.einstellungen } : {}) });

  for (const { team, verein } of t.teams) {
    const m = await anfrage<MannschaftImTurnier>("POST", "/mannschaften", {
      turnierId: id,
      name: team.name,
      teamId: team.teamId,
      vereinId: verein.vereinId,
      // Bei internationalen Turnieren steht das Land im Feld (national: das Bundesland).
      ...(t.international ? { bundesland: verein.land } : verein.bundesland ? { bundesland: verein.bundesland } : {}),
    });
    await erzeugeSpieler(m._id);
  }
  await erzeugeSchiedsrichter(id, t.teams[0]?.verein.vereinId);

  if (zweiGruppen) await anfrage("POST", `/turniere/${id}/gruppen-verteilen`);
  await anfrage("POST", `/turniere/${id}/spielplan?wiederholungen=${t.doppelt ? 2 : 1}`);

  const spieleSortiert = async () =>
    (await anfrage<Spiel[]>("GET", `/turniere/${id}/spiele`)).sort((a, b) => (a.spielNr ?? 0) - (b.spielNr ?? 0));
  const spiele = async (vorrunde: boolean, gespieltAnteil = 1, entschieden = false) => {
    const liste = (await spieleSortiert()).filter((s) => (vorrunde ? !s.planId : Boolean(s.planId)) && s.ergebnisA == null);
    const anzahl = Math.round(liste.length * gespieltAnteil);
    for (const [i, s] of liste.slice(0, anzahl).entries()) {
      const [a, b] = zufallsErgebnis(entschieden);
      await anfrage("PUT", `/spiele/${s._id}/ergebnis`, { ergebnisA: a, ergebnisB: b });
      // Bei einer nur teilweise gespielten Vorrunde bleibt das letzte Ergebnis "beendet", noch nicht abgeschlossen.
      const letztes = gespieltAnteil < 1 && i === anzahl - 1;
      if (!letztes) await anfrage("PUT", `/spiele/${s._id}/abschliessen`);
    }
  };

  if (t.stand === "geplant") return;

  if (t.stand === "vorrunde-teil") {
    await spiele(true, t.vorrundeAnteil ?? 0.5);
    return;
  }

  await spiele(true);
  const plan = async () => anfrage<ModusAnsicht>("GET", `/turniere/${id}/modus-plan`);

  // Gleichstaende entscheidet die Turnierleitung - hier in Reihenfolge der Mannschafts-ID.
  let ansicht = await plan();
  for (const gs of ansicht.gleichstaende ?? []) {
    await anfrage("PUT", `/turniere/${id}/modus/vorrang`, { gruppe: gs.gruppe, reihenfolge: gs.mannschaften.map((m) => m.id).sort() });
  }

  if (t.stand === "vorrunde-fertig") return;
  ansicht = await plan();

  if (t.endrundeInHalleA && felder.length > 1) {
    for (const p of ansicht.plan.filter((x) => !x.spielId && x.phase !== "platzierung")) {
      await anfrage("PUT", `/turniere/${id}/modus/plan/${p.planId}`, { feldId: felder[0].feldId });
    }
  }

  // Endrunde stufenweise erzeugen und spielen.
  for (let runde = 0; runde < 8; runde++) {
    ansicht = await plan();
    if (ansicht.plan.every((p) => p.spielId)) break;
    if (ansicht.plan.some((p) => p.erzeugbar && !p.spielId)) {
      await anfrage("POST", `/turniere/${id}/modus/erzeugen`, {});
      await spiele(false, 1, true);
      if (t.stand === "endrunde-teil") break;
    } else {
      // Nichts erzeugbar: ein Unentschieden muesste entschieden werden (kommt nicht vor, weil entschieden gespielt wird).
      break;
    }
  }

  if (t.stand === "abgeschlossen") await anfrage("POST", `/turniere/${id}/abschliessen`);
}

// ---------------------------------------------------------------- Stammdaten und Konto

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

const VEREINE_DATEN: { name: string; bundesland?: string; land: string }[] = [
  { name: "BSV München", bundesland: "Bayern", land: "Deutschland" },
  { name: "SV Reha Augsburg", bundesland: "Bayern", land: "Deutschland" },
  { name: "TSG Unterliederbach", bundesland: "Hessen", land: "Deutschland" },
  { name: "BVB Dortmund", bundesland: "Nordrhein-Westfalen", land: "Deutschland" },
  { name: "BSG Langenhagen", bundesland: "Niedersachsen", land: "Deutschland" },
  { name: "Magdeburger SV 90", bundesland: "Sachsen-Anhalt", land: "Deutschland" },
  { name: "FSV Forst Borgsdorf", bundesland: "Brandenburg", land: "Deutschland" },
  { name: "SV Hoffeld", bundesland: "Baden-Württemberg", land: "Deutschland" },
  { name: "Landshut", bundesland: "Bayern", land: "Deutschland" },
  { name: "FC St. Pauli", bundesland: "Hamburg", land: "Deutschland" },
  // Erfundene Vereine aus dem Ausland - fuer die internationalen Demo-Turniere (kein Bundesland).
  { name: "Lyoner Torball Club", land: "Frankreich" },
  { name: "Brüsseler Torball Club", land: "Belgien" },
  { name: "Zürcher Torball Club", land: "Schweiz" },
  { name: "Wiener Torball Club", land: "Österreich" },
  { name: "Mailänder Torball Club", land: "Italien" },
];

/** Diese Vereine bekommen zwei Teams (Nutzer-Vorgabe). */
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
      ...(daten.bundesland ? { bundesland: daten.bundesland } : {}),
      land: daten.land,
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

/** Legt ein paar turnieruebergreifende Schiedsrichter-Stammdaten an (Demo-Namen, kein Bezug zu
 *  echten Personen) - zwei mit Vereinsbindung, einer bewusst neutral (ohne Verein), damit die
 *  Demo sowohl die Stammdaten-Uebernahme als auch die "keine (neutral)"-Option zeigt. */
async function erzeugeSchiedsrichterStammdaten(teams: TeamMitVerein[]): Promise<void> {
  const vereinId = (name: string) => teams.find((t) => t.verein.name === name)?.verein.vereinId;

  const eintraege: { name: string; vorname: string; vereinName?: string }[] = [
    { name: "Wagner", vorname: "Petra", vereinName: "BSV München" },
    { name: "Krüger", vorname: "Manfred", vereinName: "FC St. Pauli" },
    { name: "Neutral", vorname: "Norbert" },
  ];

  for (const e of eintraege) {
    const id = newId("schiedsrichter");
    await insertDoc<Schiedsrichter>({
      _id: id,
      docType: "schiedsrichter",
      schiedsrichterId: id,
      name: e.name,
      vorname: e.vorname,
      lizenzVorhanden: true,
      vereinId: e.vereinName ? vereinId(e.vereinName) : undefined,
    });
  }
}

/** Legt eine pfeifende Person fuer EIN Turnier an (Demo-Name, kein Bezug zu echten Personen). Sie
 *  bekommt - falls uebergeben - den Verein der ersten teilnehmenden Mannschaft, damit die
 *  vereinsbasierte Konflikterkennung (siehe CLAUDE.md) in der Demo etwas zu zeigen hat. Die
 *  Turnierleitung legt `POST /turniere` selbst aus dem Profil der anlegenden Person an. */
async function erzeugeSchiedsrichter(turnierId: string, ersteVereinId?: string): Promise<void> {
  const srId = newId("schiedsrichterImTurnier");
  await insertDoc<SchiedsrichterImTurnier>({
    _id: srId,
    docType: "schiedsrichterImTurnier",
    schiedsrichterId: srId,
    turnierId,
    name: "Schiedsrichter Beispiel",
    lizenzVorhanden: true,
    istTurnierleitung: false,
    vereinId: ersteVereinId,
  });
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

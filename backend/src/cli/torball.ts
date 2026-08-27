/**
 * "torball" - zentrales Konsolen-Tool fuer administrative Aufgaben, die keinen
 * Web-Login voraussetzen (Haupt-Anwendungsfall: der einzige Admin-Account ist
 * gesperrt und niemand kommt mehr ins Backend). Aehnlich zu Tools wie
 * "pihole": ein einziger Einstiegspunkt, Unterbefehle, Hilfetext bei
 * fehlendem/unbekanntem Befehl. Neue Befehle werden unten im BEFEHLE-Objekt
 * ergaenzt - die Ausfuehrungs-/Fehlerbehandlung (main()) muss dafuer nicht
 * angefasst werden.
 *
 * Aufruf: npm run torball -- <befehl> [--option=wert ...]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Benutzer } from "@torball/shared";
import { findAllByType, insertDoc } from "../repository";
import { erzeugeBeispieldaten } from "../demo/beispieldaten";
import { erstelleSnapshot, stelleSnapshotWiederher } from "../demo/snapshot";
import { erstelleMailBericht } from "../mail/bericht";
import { erstelleSicherung, spieleSicherungEin, vorgeschlagenerDateiname } from "../sicherung/datei";
import { letzteLogZeilen } from "../logDatei";
import { db } from "../db";

type Optionen = Record<string, string>;
type Befehl = (optionen: Optionen) => Promise<void>;

/** Nur diese Schluessel duerfen ueber die CLI geaendert werden - bewusst ohne COUCHDB_*
 * (Verbindung wuerde ein Tippfehler sofort kappen; die werden vom Installer/deploy-instanz.sh
 * verwaltet), ohne KANBAN_BOARD_AKTIV (nur fuer die Entwicklungs-Instanz relevant) und ohne
 * SMTP_* (seit 2026-08-15 kein .env-Wert mehr, sondern ueber die Oberflaeche unter
 * Systemeinstellungen gepflegt - siehe backend/src/routes/systemeinstellungen.ts). */
const ERLAUBTE_KONFIGURATIONS_SCHLUESSEL = [
  "PORT",
  "HOST",
  "FRONTEND_URL",
  "COOKIE_SECURE",
  "SERVE_FRONTEND",
  "DEMO_SNAPSHOT_ERLAUBT",
  "TZ",
  // Pfad einer zusaetzlichen Logdatei (siehe logDatei.ts) - der Windows-Installer setzt ihn,
  // auf dem Server bleibt er leer (dort faengt systemd die Ausgabe im Journal auf).
  "LOG_DATEI",
];

const BEFEHLE: Record<string, { beschreibung: string; ausfuehren: Befehl }> = {
  "benutzer:liste": {
    beschreibung: "Listet alle Benutzer mit E-Mail, Rolle und Sperr-Status auf.",
    ausfuehren: benutzerListe,
  },
  "benutzer:entsperren": {
    beschreibung: 'Entsperrt einen Benutzer. Optionen: --email="<E-Mail>"',
    ausfuehren: benutzerEntsperren,
  },
  "konfiguration:anzeigen": {
    beschreibung: "Zeigt die aktuelle backend/.env (Passwoerter maskiert).",
    ausfuehren: konfigurationAnzeigen,
  },
  "konfiguration:setzen": {
    beschreibung:
      'Aendert einen Wert in backend/.env (Neustart des Backends noetig, damit es wirkt). ' +
      'Optionen: --schluessel="PORT" --wert="3005". Erlaubte Schluessel: ' +
      ERLAUBTE_KONFIGURATIONS_SCHLUESSEL.join(", "),
    ausfuehren: konfigurationSetzen,
  },
  aktualisieren: {
    beschreibung:
      "Aktualisiert die Installation: git pull (falls Git-Repo vorhanden), npm install, Neubau " +
      "(shared zuerst, dann alle Workspaces). Laufende Server-Prozesse danach neu starten.",
    ausfuehren: aktualisieren,
  },
  "demo:beispieldaten": {
    beschreibung:
      "Legt Demo-Stammdaten (Vereine/Teams) und mehrere Beispiel-Turniere an, im Besitz eines " +
      'eigenen "Demo-Datenpflege"-Kontos (kein Login möglich). Nur bei DEMO_SNAPSHOT_ERLAUBT=true ' +
      "(siehe konfiguration:setzen). Gedacht als einmaliger Aufbau vor demo:snapshot:erstellen - " +
      "mehrfacher Aufruf legt weitere, zusätzliche Beispieldaten an statt vorhandene zu ersetzen.",
    ausfuehren: demoBeispieldaten,
  },
  "demo:snapshot:erstellen": {
    beschreibung:
      'Übernimmt den aktuellen Datenbestand 1:1 in die "_golden"-Datenbank (Grundlage für den ' +
      "täglichen Reset). Nur bei DEMO_SNAPSHOT_ERLAUBT=true, Voraussetzung: die _golden-Datenbank " +
      "wurde bereits eingerichtet (siehe deploy/demo-snapshot-einrichten.sh).",
    ausfuehren: demoSnapshotErstellen,
  },
  "demo:snapshot:wiederherstellen": {
    beschreibung:
      'Gleicht den aktuellen Datenbestand an die "_golden"-Datenbank an und verwirft damit alle ' +
      "Änderungen seit dem letzten Snapshot. Nur bei DEMO_SNAPSHOT_ERLAUBT=true - läuft normalerweise " +
      "automatisch über einen systemd-Timer, nicht von Hand.",
    ausfuehren: demoSnapshotWiederherstellen,
  },
  "sicherung:erstellen": {
    beschreibung:
      'Schreibt den GESAMTEN Datenbestand in eine Datei. Optionen: --datei="<Pfad>" ' +
      "(Standard: torball-sicherung-<Datum>.json im aktuellen Ordner). Die Datei enthaelt auch " +
      "Zugangsdaten - sicher aufbewahren.",
    ausfuehren: sicherungErstellen,
  },
  "sicherung:einspielen": {
    beschreibung:
      'Liest eine Sicherungsdatei zurueck. Optionen: --datei="<Pfad>" (Pflicht), ' +
      "--ueberschreiben (ersetzt auch bereits vorhandene Dokumente; ohne diese Option bleiben sie unangetastet).",
    ausfuehren: sicherungEinspielen,
  },
  diagnose: {
    beschreibung:
      'Schreibt einen Diagnose-Bericht (Version, Konfiguration ohne Passwoerter, Datenbank-Status, ' +
      'letzte Log-Zeilen) als Textdatei zum Weitergeben. Optionen: --datei="<Pfad>"',
    ausfuehren: diagnose,
  },
  "mail:bericht:erstellen": {
    beschreibung:
      "Ruft neue Mails aus dem Feedback-Postfach per IMAP ab, laesst sie per KI klassifizieren, " +
      'legt fuer erkannte Anforderungen Kanban-Karten an ("KI-erstellt/ungeprueft") und verschickt ' +
      "den Bericht. Nur bei MAIL_POSTFACH_AKTIV=true, Konsolen-Fallback zum Knopf in der Oberflaeche.",
    ausfuehren: mailBerichtErstellen,
  },
};

async function demoBeispieldaten(): Promise<void> {
  await erzeugeBeispieldaten();
  console.log("Demo-Stammdaten und Beispiel-Turniere angelegt.");
}

async function demoSnapshotErstellen(): Promise<void> {
  const { anzahlDokumente } = await erstelleSnapshot();
  console.log(`Snapshot erstellt: ${anzahlDokumente} Dokumente in die "_golden"-Datenbank übernommen.`);
}

async function demoSnapshotWiederherstellen(): Promise<void> {
  const { anzahlDokumente } = await stelleSnapshotWiederher();
  console.log(`Snapshot wiederhergestellt: ${anzahlDokumente} Dokumente aus der "_golden"-Datenbank übernommen.`);
}

/**
 * Sicherung schreiben. Bewusst ohne Rueckfrage: der Befehl legt nur eine Datei an, das ist
 * ungefaehrlich - im Gegensatz zum Einspielen.
 */
async function sicherungErstellen(optionen: Optionen): Promise<void> {
  const ziel = optionen.datei?.trim() || path.join(process.cwd(), vorgeschlagenerDateiname());
  const paket = await erstelleSicherung();
  fs.writeFileSync(ziel, JSON.stringify(paket, null, 2), "utf8");
  const groesseMb = (fs.statSync(ziel).size / (1024 * 1024)).toFixed(1);
  console.log(`Sicherung geschrieben: ${ziel}`);
  console.log(`${paket.anzahlDokumente} Dokumente, ${groesseMb} MB.`);
  console.log("Hinweis: Die Datei enthaelt auch Passwort-Hashes und Zugangsdaten - sicher aufbewahren.");
}

/**
 * Sicherung einspielen. Vorhandene Dokumente bleiben ohne --ueberschreiben unangetastet
 * (siehe sicherung/datei.ts) - das schuetzt davor, einen laufenden Turnierbestand versehentlich
 * mit einem aelteren Stand zu ueberschreiben.
 */
async function sicherungEinspielen(optionen: Optionen): Promise<void> {
  const quelle = optionen.datei?.trim();
  if (!quelle) {
    console.error('Bitte --datei="<Pfad zur Sicherungsdatei>" angeben.');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(quelle)) {
    console.error(`Datei nicht gefunden: ${quelle}`);
    process.exitCode = 1;
    return;
  }

  const paket = JSON.parse(fs.readFileSync(quelle, "utf8"));
  const ueberschreiben = "ueberschreiben" in optionen;
  console.log(`Sicherung vom ${paket.erstelltAm ?? "?"} (App-Version ${paket.appVersion ?? "?"}).`);

  const ergebnis = await spieleSicherungEin(paket, { ueberschreiben });
  console.log(`${ergebnis.geschrieben} Dokumente geschrieben.`);
  if (ergebnis.uebersprungen > 0) {
    console.log(
      `${ergebnis.uebersprungen} bereits vorhandene Dokumente unveraendert gelassen. ` +
        "Mit --ueberschreiben werden auch diese ersetzt.",
    );
  }
}

/**
 * Diagnose-Bericht als Textdatei.
 *
 * Zweck (Nutzer-Vorgabe 26.08.2026): Rueckmeldungen aus dem Betrieb lauten erfahrungsgemaess
 * "es funktioniert nicht". Dieser Befehl macht daraus etwas Auswertbares - eine Datei, die man
 * anhaengen kann, ohne selbst wissen zu muessen, was darin relevant ist.
 *
 * Bewusst reiner Text und kein ZIP: laesst sich ohne Zusatzprogramm oeffnen, vor dem Verschicken
 * durchlesen und notfalls in eine Mail kopieren. Passwoerter und Schluessel stehen NICHT darin -
 * nur, ob sie gesetzt sind.
 */
async function diagnose(optionen: Optionen): Promise<void> {
  const zeilen: string[] = [];
  const abschnitt = (titel: string) => {
    zeilen.push("", `--- ${titel} ---`);
  };

  zeilen.push("Torball-Turniere - Diagnose-Bericht");
  zeilen.push(`Erstellt: ${new Date().toISOString()}`);

  abschnitt("Umgebung");
  zeilen.push(`Node:            ${process.version}`);
  zeilen.push(`Betriebssystem:  ${process.platform} ${process.arch}`);
  zeilen.push(`Arbeitsordner:   ${process.cwd()}`);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
    zeilen.push(`App-Version:     ${pkg.version ?? "?"}`);
  } catch {
    zeilen.push("App-Version:     nicht lesbar");
  }

  abschnitt("Konfiguration (Geheimnisse nur als 'gesetzt/nicht gesetzt')");
  for (const schluessel of ERLAUBTE_KONFIGURATIONS_SCHLUESSEL) {
    zeilen.push(`${schluessel.padEnd(22)} ${process.env[schluessel] ?? "(nicht gesetzt)"}`);
  }
  zeilen.push(`${"COUCHDB_URL".padEnd(22)} ${process.env.COUCHDB_URL ?? "(nicht gesetzt)"}`);
  zeilen.push(`${"COUCHDB_DB".padEnd(22)} ${process.env.COUCHDB_DB ?? "(nicht gesetzt)"}`);
  for (const geheim of ["COUCHDB_PASSWORD", "ANTHROPIC_API_KEY"]) {
    zeilen.push(`${geheim.padEnd(22)} ${process.env[geheim] ? "gesetzt" : "nicht gesetzt"}`);
  }

  abschnitt("Datenbank");
  try {
    const liste = await db.list({ include_docs: true });
    const proTyp: Record<string, number> = {};
    for (const zeile of liste.rows) {
      if (zeile.id.startsWith("_design/")) continue;
      const typ = (zeile.doc as { docType?: string } | undefined)?.docType ?? "(ohne docType)";
      proTyp[typ] = (proTyp[typ] ?? 0) + 1;
    }
    zeilen.push("Verbindung:      erreichbar");
    zeilen.push(`Dokumente:       ${Object.values(proTyp).reduce((a, b) => a + b, 0)}`);
    for (const [typ, anzahl] of Object.entries(proTyp).sort((a, b) => b[1] - a[1])) {
      zeilen.push(`  ${typ.padEnd(28)} ${anzahl}`);
    }
  } catch (fehler) {
    zeilen.push("Verbindung:      NICHT erreichbar");
    zeilen.push(`Fehler:          ${fehler instanceof Error ? fehler.message : String(fehler)}`);
  }

  abschnitt("Letzte Log-Zeilen");
  const log = letzteLogZeilen(200);
  if (log.length === 0) {
    zeilen.push("(keine Logdatei konfiguriert oder noch nichts protokolliert - siehe LOG_DATEI)");
  } else {
    zeilen.push(...log);
  }

  const ziel =
    optionen.datei?.trim() ||
    path.join(process.cwd(), `torball-diagnose-${new Date().toISOString().slice(0, 10)}.txt`);
  fs.writeFileSync(ziel, zeilen.join("\n"), "utf8");
  console.log(`Diagnose-Bericht geschrieben: ${ziel}`);
  console.log("Die Datei enthaelt keine Passwoerter und kann so weitergegeben werden.");
}

async function mailBerichtErstellen(): Promise<void> {
  if (process.env.MAIL_POSTFACH_AKTIV !== "true") {
    console.error('Mail-Postfach ist deaktiviert (MAIL_POSTFACH_AKTIV ist nicht "true" in backend/.env).');
    process.exitCode = 1;
    return;
  }
  const bericht = await erstelleMailBericht("manuell");
  console.log(
    `Bericht erstellt: ${bericht.anzahlMails} Mail(s) beruecksichtigt, ${bericht.erstellteKartenIds.length} Kanban-Karte(n) angelegt.`,
  );
}

async function benutzerListe(): Promise<void> {
  const alle = await findAllByType<Benutzer>("benutzer");
  if (alle.length === 0) {
    console.log("Keine Benutzer vorhanden.");
    return;
  }
  for (const b of alle) {
    const status = !b.gesperrt
      ? "aktiv"
      : b.gesperrtGrund === "fehlversuche"
        ? "GESPERRT (zu viele Fehlversuche)"
        : "GESPERRT";
    console.log(`${b.email}\tRolle: ${b.globaleRolle}\t${status}`);
  }
}

async function benutzerEntsperren(optionen: Optionen): Promise<void> {
  const email = optionen.email?.trim().toLowerCase();
  if (!email) {
    console.error('Bitte --email="<E-Mail-Adresse>" angeben.');
    process.exitCode = 1;
    return;
  }

  const alle = await findAllByType<Benutzer>("benutzer");
  const benutzer = alle.find((b) => b.email.toLowerCase() === email);
  if (!benutzer) {
    console.error(`Kein Benutzer mit der E-Mail "${email}" gefunden.`);
    process.exitCode = 1;
    return;
  }
  if (!benutzer.gesperrt) {
    console.log(`"${email}" war bereits nicht gesperrt.`);
    return;
  }

  await insertDoc({ ...benutzer, gesperrt: false, gesperrtGrund: undefined, fehlgeschlageneLoginVersuche: 0 });
  console.log(`"${email}" ist jetzt entsperrt.`);
}

/** Sensible Werte werden nie im Klartext ausgegeben (Konsolen-Historie, geteilte Bildschirme). */
const MASKIERTE_SCHLUESSEL = ["COUCHDB_PASSWORD", "SMTP_PASSWORD"];

/** backend/.env liegt relativ zum Arbeitsverzeichnis, in dem "npm run torball" laeuft - das ist
 * bei Aufruf per --workspace=backend (bzw. direkt in backend/) immer der backend-Ordner selbst. */
function envDateiPfad(): string {
  return path.resolve(process.cwd(), ".env");
}

/** Sehr einfacher .env-Parser (KEY=VALUE je Zeile, # leitet Kommentare ein) - reicht fuer die
 * selbst erzeugten .env-Dateien dieses Projekts, keine Bibliothek noetig. */
function leseEnvZeilen(inhalt: string): { schluessel: string; wert: string }[] {
  const zeilen: { schluessel: string; wert: string }[] = [];
  for (const zeile of inhalt.split(/\r?\n/)) {
    const treffer = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(zeile);
    if (treffer) zeilen.push({ schluessel: treffer[1], wert: treffer[2] });
  }
  return zeilen;
}

async function konfigurationAnzeigen(): Promise<void> {
  const pfad = envDateiPfad();
  if (!fs.existsSync(pfad)) {
    console.error(`Keine .env gefunden unter ${pfad}.`);
    process.exitCode = 1;
    return;
  }
  const zeilen = leseEnvZeilen(fs.readFileSync(pfad, "utf8"));
  console.log(`Konfiguration (${pfad}):\n`);
  for (const { schluessel, wert } of zeilen) {
    const anzeige = MASKIERTE_SCHLUESSEL.includes(schluessel) ? (wert ? "(gesetzt)" : "(leer)") : wert;
    console.log(`  ${schluessel}=${anzeige}`);
  }
}

async function konfigurationSetzen(optionen: Optionen): Promise<void> {
  const schluessel = optionen.schluessel?.trim();
  const wert = optionen.wert ?? "";
  if (!schluessel) {
    console.error('Bitte --schluessel="<NAME>" --wert="<WERT>" angeben.');
    process.exitCode = 1;
    return;
  }
  if (!ERLAUBTE_KONFIGURATIONS_SCHLUESSEL.includes(schluessel)) {
    console.error(
      `"${schluessel}" ist ueber die CLI nicht aenderbar. Erlaubt: ${ERLAUBTE_KONFIGURATIONS_SCHLUESSEL.join(", ")}.`,
    );
    process.exitCode = 1;
    return;
  }

  const pfad = envDateiPfad();
  if (!fs.existsSync(pfad)) {
    console.error(`Keine .env gefunden unter ${pfad}.`);
    process.exitCode = 1;
    return;
  }

  // Werte mit Sonderzeichen (Leerzeichen, #) in Anführungszeichen setzen - sonst wird beim naechsten
  // Start alles ab dem # als Kommentar abgeschnitten (siehe CLAUDE.md, Betrieb/Infrastruktur).
  const wertFuerDatei = /[\s#]/.test(wert) && !wert.startsWith('"') ? `"${wert}"` : wert;

  const zeilen = fs.readFileSync(pfad, "utf8").split(/\r?\n/);
  let gefunden = false;
  const neueZeilen = zeilen.map((zeile) => {
    if (new RegExp(`^${schluessel}=`).test(zeile)) {
      gefunden = true;
      return `${schluessel}=${wertFuerDatei}`;
    }
    return zeile;
  });
  if (!gefunden) neueZeilen.push(`${schluessel}=${wertFuerDatei}`);

  fs.writeFileSync(pfad, neueZeilen.join("\n"));
  console.log(`"${schluessel}" gesetzt. Bitte das Backend neu starten, damit die Aenderung wirkt.`);
}

async function aktualisieren(): Promise<void> {
  // process.cwd() ist beim Aufruf ueber "npm run torball" immer backend/ (siehe envDateiPfad()) -
  // das Projekt-Wurzelverzeichnis ist somit immer genau eine Ebene darueber.
  const projektWurzel = path.resolve(process.cwd(), "..");

  const ausfuehren = (befehl: string) => {
    console.log(`\n> ${befehl}`);
    execSync(befehl, { cwd: projektWurzel, stdio: "inherit" });
  };

  const istGitRepo = fs.existsSync(path.join(projektWurzel, ".git"));

  try {
    if (istGitRepo) {
      ausfuehren("git pull");
    }
    // --no-audit/--no-fund: die npm-Sicherheits-/Spenden-Hinweise richten sich an Entwickler und
    // wirken auf die Zielgruppe der lokalen Installation nur beunruhigend - Schwachstellen werden
    // in der Entwicklung beobachtet und dort behoben (siehe installieren-windows.ps1).
    ausfuehren("npm install --no-audit --no-fund");
    ausfuehren("npm run build --workspace=shared");
    ausfuehren("npm run build");
  } catch (err) {
    console.error("\nAktualisierung fehlgeschlagen:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }

  if (istGitRepo) {
    console.log("\nFertig aktualisiert. Bitte den laufenden Server-Prozess neu starten.");
  } else {
    // Kein Git-Repository (z.B. Installation aus dem heruntergeladenen Quellcode-ZIP) - "git pull"
    // entfaellt dann komplett, es wurde nur der VORHANDENE (unveraenderte) Quellcode neu gebaut.
    // Bewusst NICHT "Fertig aktualisiert" behaupten - das waere schlicht falsch und fuehrt live
    // dazu, dass eine neue Version faelschlich als bereits installiert gilt (2026-08-20 selbst
    // erlebt: neue Funktionen fehlten trotz "erfolgreichem" Lauf dieses Befehls komplett).
    console.log(
      "\n=====================================================================\n" +
        "ACHTUNG: Der Quellcode wurde NICHT aktualisiert!\n" +
        "Diese Installation stammt aus einem heruntergeladenen ZIP, kein Git-Repository - "
        + "dieser Befehl kann den Quellcode dann nicht selbst herunterladen, sondern hat nur den "
        + "bereits vorhandenen (unveraenderten) Stand neu gebaut.\n\n"
        + "Um wirklich eine neue Version zu bekommen:\n"
        + "1. Aktuelles Quellcode-ZIP erneut herunterladen (siehe README bzw. die Instanz, von der "
        + "das ZIP stammt, unter /download/torball-quellcode.zip) und an einer neuen Stelle entpacken.\n"
        + "2. Die eigene 'backend/.env' aus dieser Installation in den neuen Ordner kopieren.\n"
        + "3. Dort 'Setup.cmd' erneut ausfuehren (eine vorhandene .env wird dabei nicht ueberschrieben).\n"
        + "Siehe auch AKTUALISIEREN.md im Projektordner.\n" +
        "=====================================================================",
    );
  }
}

function zeigeHilfe(): void {
  console.log('Verwendung: npm run torball -- <befehl> [--option="wert" ...]\n');
  console.log("Verfügbare Befehle:");
  for (const [name, { beschreibung }] of Object.entries(BEFEHLE)) {
    console.log(`  ${name}\n    ${beschreibung}`);
  }
}

/** Nur das simple Muster --schluessel=wert wird unterstuetzt - reicht fuer die bisherigen Befehle, keine Bibliothek noetig. */
function parseOptionen(argv: string[]): Optionen {
  const optionen: Optionen = {};
  for (const arg of argv) {
    const treffer = /^--([^=]+)=(.*)$/.exec(arg);
    if (treffer) optionen[treffer[1]] = treffer[2];
  }
  return optionen;
}

async function main(): Promise<void> {
  const [befehlName, ...rest] = process.argv.slice(2);

  if (!befehlName || befehlName === "--hilfe" || befehlName === "-h") {
    zeigeHilfe();
    return;
  }

  const befehl = BEFEHLE[befehlName];
  if (!befehl) {
    console.error(`Unbekannter Befehl: "${befehlName}"\n`);
    zeigeHilfe();
    process.exitCode = 1;
    return;
  }

  await befehl.ausfuehren(parseOptionen(rest));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

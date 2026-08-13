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

type Optionen = Record<string, string>;
type Befehl = (optionen: Optionen) => Promise<void>;

/** Nur diese Schluessel duerfen ueber die CLI geaendert werden - bewusst ohne COUCHDB_*
 * (Verbindung wuerde ein Tippfehler sofort kappen; die werden vom Installer/deploy-instanz.sh
 * verwaltet) und ohne KANBAN_SYNC (nur fuer die Entwicklungs-Instanz relevant). */
const ERLAUBTE_KONFIGURATIONS_SCHLUESSEL = [
  "PORT",
  "HOST",
  "FRONTEND_URL",
  "COOKIE_SECURE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SERVE_FRONTEND",
  "DEMO_SNAPSHOT_ERLAUBT",
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

  try {
    if (fs.existsSync(path.join(projektWurzel, ".git"))) {
      ausfuehren("git pull");
    } else {
      console.log("Kein Git-Repository erkannt - Quellcode wird nicht aktualisiert, nur neu gebaut.");
    }
    ausfuehren("npm install");
    ausfuehren("npm run build --workspace=shared");
    ausfuehren("npm run build");
  } catch (err) {
    console.error("\nAktualisierung fehlgeschlagen:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }

  console.log("\nFertig aktualisiert. Bitte den laufenden Server-Prozess neu starten.");
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

#!/usr/bin/env node
/**
 * Baut das fertige Windows-Paket der lokalen Installation (Stufe 2, 2026-11-02):
 *
 *   node scripts/baue-windows-paket.mjs [--ohne-build] [--ausgabe=<Ordner>]
 *
 * Statt des Quellcodes (den der Rechner der Nutzer erst mit Node.js, npm install und einem Build
 * zu einer Anwendung machen musste) enthaelt das Paket die FERTIG GEBAUTE Anwendung samt Laufzeit-
 * Abhaengigkeiten und einer mitgelieferten node.exe. Beim Nutzer entfallen damit Node.js-Installation,
 * npm install und Build - die haeufigsten Fehlerquellen der alten Installation. Das Paket ist
 * plattformunabhaengig gebaut (alle Laufzeit-Abhaengigkeiten des Backends sind reines JavaScript; die
 * einzigen nativen Dateien in node_modules gehoeren zu Entwickler-Werkzeugen wie esbuild/oxlint) und
 * laesst sich deshalb auf JEDEM Rechner erzeugen, nicht nur unter Windows.
 *
 * Ergebnis (in dist-paket/): Torball-Turniere-Windows-<Version>.zip + .sha256. Die ZIP-Datei wird als
 * Anhang eines GitHub-Releases veroeffentlicht (siehe CLAUDE.md, Release-Prozess); die lokale
 * Installation holt sie von dort (deploy/aktualisieren-windows.ps1).
 *
 * Aufbau des Pakets (identisch zum installierten Ordner C:\Torball-Turniere\App):
 *   Setup.cmd, Aktualisieren-Torball.cmd, Deinstallieren-Torball.cmd, *.html (Anleitungen)
 *   paket.json            Version, Bauzeit, Commit, Update-Quelle
 *   node\node.exe         mitgelieferte Node.js-Laufzeit (Version fest, Pruefsumme geprueft)
 *   dienst\               WinSW (Windows-Dienst-Huelle) + Vorlage der Dienst-Konfiguration
 *   deploy\               Installer-Skripte
 *   backend\dist, backend\package.json, shared\dist, shared\package.json, frontend\dist, node_modules
 */
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argumente = process.argv.slice(2);
const OHNE_BUILD = argumente.includes("--ohne-build");
const AUSGABE = path.resolve(
  WURZEL,
  argumente.find((a) => a.startsWith("--ausgabe="))?.split("=")[1] ?? "dist-paket",
);

// Feste Versionen + Pruefsummen: das Paket soll bei jedem Bau dieselben Fremdprogramme enthalten.
// Node.js: Pruefsumme aus https://nodejs.org/dist/v<Version>/SHASUMS256.txt (win-x64/node.exe).
const NODE_VERSION = "22.23.4";
const NODE_SHA256 = "dccc52de28d8df2ee22d2062424f8c563070d95d8ad70c54c4bf01d590dec14f";
// WinSW (Windows-Dienst-Huelle, MIT-Lizenz), https://github.com/winsw/winsw/releases/tag/v2.12.0.
// Pruefsumme beim ersten Bau ermittelt und festgehalten; ein Update der Version verlangt eine neue.
const WINSW_VERSION = "2.12.0";
const WINSW_SHA256 = "05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da";

function protokoll(text) {
  console.log(`[paket] ${text}`);
}

function sha256(datei) {
  return crypto.createHash("sha256").update(fs.readFileSync(datei)).digest("hex");
}

async function lade(url, ziel, erwarteteSumme, name) {
  if (fs.existsSync(ziel) && (!erwarteteSumme || sha256(ziel) === erwarteteSumme)) return;
  protokoll(`Lade ${name} ...`);
  const antwort = await fetch(url, { redirect: "follow" });
  if (!antwort.ok) throw new Error(`${name}: Download fehlgeschlagen (HTTP ${antwort.status}) - ${url}`);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, Buffer.from(await antwort.arrayBuffer()));
  const summe = sha256(ziel);
  if (erwarteteSumme && summe !== erwarteteSumme) {
    fs.rmSync(ziel);
    throw new Error(`${name}: Pruefsumme stimmt nicht (erwartet ${erwarteteSumme}, erhalten ${summe}).`);
  }
  if (!erwarteteSumme) protokoll(`${name}: SHA-256 ${summe} (bitte als feste Pruefsumme eintragen)`);
}

function kopiere(von, nach, filter) {
  fs.cpSync(von, nach, { recursive: true, filter });
}

/** Schreibt alle Dateien unterhalb von `ordner` als ZIP (Pfade mit /, relativ zu `ordner`). */
function schreibeZip(ordner, zielDatei) {
  const dateien = [];
  (function sammle(verzeichnis) {
    for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = path.join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) sammle(pfad);
      else if (eintrag.isFile()) dateien.push(pfad);
    }
  })(ordner);
  dateien.sort();

  const jetzt = new Date();
  const dosZeit = (jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | (jetzt.getSeconds() >> 1);
  const dosDatum = ((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate();

  const fd = fs.openSync(zielDatei, "w");
  let position = 0;
  const schreibe = (puffer) => {
    fs.writeSync(fd, puffer);
    position += puffer.length;
  };
  const verzeichnis = [];
  for (const datei of dateien) {
    const name = Buffer.from(path.relative(ordner, datei).split(path.sep).join("/"), "utf8");
    const inhalt = fs.readFileSync(datei);
    const crc = zlib.crc32(inhalt);
    const komprimiert = zlib.deflateRawSync(inhalt, { level: 6 });
    const gespeichert = komprimiert.length < inhalt.length;
    const daten = gespeichert ? komprimiert : inhalt;
    const verfahren = gespeichert ? 8 : 0;
    const versatz = position;

    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4); // noetige Version
    kopf.writeUInt16LE(0x0800, 6); // Bit 11: Dateinamen sind UTF-8
    kopf.writeUInt16LE(verfahren, 8);
    kopf.writeUInt16LE(dosZeit, 10);
    kopf.writeUInt16LE(dosDatum, 12);
    kopf.writeUInt32LE(crc, 14);
    kopf.writeUInt32LE(daten.length, 18);
    kopf.writeUInt32LE(inhalt.length, 22);
    kopf.writeUInt16LE(name.length, 26);
    kopf.writeUInt16LE(0, 28);
    schreibe(kopf);
    schreibe(name);
    schreibe(daten);
    verzeichnis.push({ name, crc, groesse: daten.length, original: inhalt.length, verfahren, versatz });
  }
  const verzeichnisStart = position;
  for (const e of verzeichnis) {
    const z = Buffer.alloc(46);
    z.writeUInt32LE(0x02014b50, 0);
    z.writeUInt16LE(20, 4); // erstellt mit Version
    z.writeUInt16LE(20, 6); // noetige Version
    z.writeUInt16LE(0x0800, 8);
    z.writeUInt16LE(e.verfahren, 10);
    z.writeUInt16LE(dosZeit, 12);
    z.writeUInt16LE(dosDatum, 14);
    z.writeUInt32LE(e.crc, 16);
    z.writeUInt32LE(e.groesse, 20);
    z.writeUInt32LE(e.original, 24);
    z.writeUInt16LE(e.name.length, 28);
    z.writeUInt32LE(e.versatz, 42);
    schreibe(z);
    schreibe(e.name);
  }
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(verzeichnis.length, 8);
  ende.writeUInt16LE(verzeichnis.length, 10);
  ende.writeUInt32LE(position - verzeichnisStart, 12);
  ende.writeUInt32LE(verzeichnisStart, 16);
  schreibe(ende);
  fs.closeSync(fd);
  if (verzeichnis.length > 65535 || position > 0xffffffff) throw new Error("ZIP zu gross fuer das einfache Format (ZIP64 noetig).");
}

const wurzelPaket = JSON.parse(fs.readFileSync(path.join(WURZEL, "package.json"), "utf8"));
const VERSION = wurzelPaket.version;
const PAKETNAME = `Torball-Turniere-Windows-${VERSION}`;
const BUEHNE = path.join(AUSGABE, "buehne");
const ZWISCHENSPEICHER = path.join(AUSGABE, "cache");

if (!OHNE_BUILD) {
  protokoll("Baue shared, dann alles ...");
  execSync("npm run build --workspace=shared", { cwd: WURZEL, stdio: "inherit" });
  execSync("npm run build", { cwd: WURZEL, stdio: "inherit" });
}
for (const pflicht of ["backend/dist/index.js", "shared/dist/index.js", "frontend/dist/index.html"]) {
  if (!fs.existsSync(path.join(WURZEL, pflicht))) throw new Error(`${pflicht} fehlt - erst bauen (ohne --ohne-build).`);
}

fs.rmSync(BUEHNE, { recursive: true, force: true });
fs.mkdirSync(BUEHNE, { recursive: true });

// --- Anwendung: gebautes Backend/Frontend/shared in derselben Ordnerstruktur wie im Quellcode, damit
// backend/dist/index.js das Frontend unter ../../frontend/dist findet (siehe backend/src/index.ts).
protokoll("Kopiere die gebaute Anwendung ...");
const ohneTests = (quelle) => !/\.(test|integration\.test)\.js(\.map)?$/.test(quelle);
kopiere(path.join(WURZEL, "backend/dist"), path.join(BUEHNE, "backend/dist"), ohneTests);
kopiere(path.join(WURZEL, "shared/dist"), path.join(BUEHNE, "shared/dist"));
kopiere(path.join(WURZEL, "frontend/dist"), path.join(BUEHNE, "frontend/dist"));
fs.copyFileSync(path.join(WURZEL, "backend/package.json"), path.join(BUEHNE, "backend/package.json"));
fs.copyFileSync(path.join(WURZEL, "shared/package.json"), path.join(BUEHNE, "shared/package.json"));

// --- Laufzeit-Abhaengigkeiten: nur "dependencies" (ohne Entwickler-Werkzeuge). Ein Arbeitsbereich mit
// nur backend + shared, damit @torball/shared aufgeloest wird; die Sperrdatei sorgt fuer dieselben
// Versionen wie in der Entwicklung.
protokoll("Installiere die Laufzeit-Abhaengigkeiten (ohne Entwickler-Werkzeuge) ...");
const abhaengigkeiten = path.join(AUSGABE, "abhaengigkeiten");
fs.rmSync(abhaengigkeiten, { recursive: true, force: true });
fs.mkdirSync(path.join(abhaengigkeiten, "backend"), { recursive: true });
fs.mkdirSync(path.join(abhaengigkeiten, "shared"), { recursive: true });
fs.writeFileSync(
  path.join(abhaengigkeiten, "package.json"),
  JSON.stringify({ name: "torball-turniere-paket", version: VERSION, private: true, workspaces: ["backend", "shared"] }, null, 2),
);
fs.copyFileSync(path.join(WURZEL, "backend/package.json"), path.join(abhaengigkeiten, "backend/package.json"));
fs.copyFileSync(path.join(WURZEL, "shared/package.json"), path.join(abhaengigkeiten, "shared/package.json"));
fs.copyFileSync(path.join(WURZEL, "package-lock.json"), path.join(abhaengigkeiten, "package-lock.json"));
execSync("npm install --omit=dev --ignore-scripts --no-audit --no-fund", { cwd: abhaengigkeiten, stdio: "inherit" });

const knoten = path.join(abhaengigkeiten, "node_modules");
// @torball/shared ist eine Verknuepfung auf ../../shared - in einer ZIP-Datei ueberlebt die nicht. Durch
// eine echte Kopie ersetzen (package.json + dist reichen, der Quelltext wird zur Laufzeit nicht gebraucht).
const sharedZiel = path.join(knoten, "@torball", "shared");
fs.rmSync(sharedZiel, { recursive: true, force: true });
fs.mkdirSync(sharedZiel, { recursive: true });
kopiere(path.join(WURZEL, "shared/dist"), path.join(sharedZiel, "dist"));
fs.copyFileSync(path.join(WURZEL, "shared/package.json"), path.join(sharedZiel, "package.json"));
fs.rmSync(path.join(knoten, "@torball", "backend"), { recursive: true, force: true });
// Test-Ordner der Bibliotheken braucht zur Laufzeit niemand (und manche enthalten Dateinamen mit Sonderzeichen,
// die das Windows-tar nicht entpacken kann).
kopiere(knoten, path.join(BUEHNE, "node_modules"), (quelle) => !/(^|[\\/])(test|tests|__tests__)([\\/]|$)/.test(path.relative(knoten, quelle)));
fs.copyFileSync(path.join(abhaengigkeiten, "package.json"), path.join(BUEHNE, "package.json"));

// Sicherheitsnetz 1: nur ASCII-Dateinamen (sonst scheitert das Entpacken mit dem Windows-tar).
const nichtAscii = [];
(function pruefeNamen(ordner) {
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const pfad = path.join(ordner, eintrag.name);
    if (/[^ -~]/.test(eintrag.name)) nichtAscii.push(path.relative(BUEHNE, pfad));
    if (eintrag.isDirectory()) pruefeNamen(pfad);
  }
})(BUEHNE);
if (nichtAscii.length > 0) throw new Error(`Dateinamen mit Sonderzeichen im Paket: ${nichtAscii.join(", ")}`);

// Sicherheitsnetz 2: keine Entwickler-Werkzeuge, keine nativen Programmdateien im Paket.
const verdaechtig = [];
(function pruefe(ordner) {
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const pfad = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) pruefe(pfad);
    else if (/\.(node|exe|dll)$/i.test(eintrag.name)) verdaechtig.push(path.relative(BUEHNE, pfad));
  }
})(path.join(BUEHNE, "node_modules"));
if (verdaechtig.length > 0) {
  throw new Error(`Native Dateien in den Laufzeit-Abhaengigkeiten (nicht plattformunabhaengig): ${verdaechtig.join(", ")}`);
}

// --- Mitgelieferte Programme
protokoll(`Node.js ${NODE_VERSION} ...`);
const nodeDatei = path.join(ZWISCHENSPEICHER, `node-v${NODE_VERSION}-win-x64.exe`);
await lade(`https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`, nodeDatei, NODE_SHA256, "Node.js");
fs.mkdirSync(path.join(BUEHNE, "node"), { recursive: true });
fs.copyFileSync(nodeDatei, path.join(BUEHNE, "node/node.exe"));

const winswDatei = path.join(ZWISCHENSPEICHER, `WinSW-x64-${WINSW_VERSION}.exe`);
await lade(
  `https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe`,
  winswDatei,
  WINSW_SHA256,
  "WinSW",
);
fs.mkdirSync(path.join(BUEHNE, "dienst"), { recursive: true });
fs.copyFileSync(winswDatei, path.join(BUEHNE, "dienst/torball-dienst.exe"));

// --- Installer, Anleitungen, Hinweise
protokoll("Kopiere Installer und Anleitungen ...");
fs.mkdirSync(path.join(BUEHNE, "deploy"), { recursive: true });
for (const datei of [
  "installieren-windows.ps1",
  "windows-paket.ps1",
  "aktualisieren-windows.ps1",
  "deinstallieren-windows.ps1",
  "Installieren-Windows.cmd",
  "Aktualisieren-Windows.cmd",
  "warte-auf-dienste.mjs",
]) {
  const quelle = path.join(WURZEL, "deploy", datei);
  if (!fs.existsSync(quelle)) throw new Error(`deploy/${datei} fehlt.`);
  fs.copyFileSync(quelle, path.join(BUEHNE, "deploy", datei));
}
fs.copyFileSync(path.join(WURZEL, "deploy/torball-dienst.xml.vorlage"), path.join(BUEHNE, "dienst/torball-dienst.xml.vorlage"));
for (const datei of [
  "Setup.cmd",
  "Aktualisieren-Torball.cmd",
  "Deinstallieren-Torball.cmd",
  "Installations-Anleitung.html",
  "Lokales-Netzwerk-Anleitung.html",
  "AKTUALISIEREN.md",
  "LICENSE",
]) {
  fs.copyFileSync(path.join(WURZEL, datei), path.join(BUEHNE, datei));
}
fs.writeFileSync(
  path.join(BUEHNE, "DRITTANBIETER.txt"),
  [
    "Dieses Paket enthaelt Programme Dritter:",
    "",
    `- Node.js ${NODE_VERSION} (node\\node.exe) - MIT-aehnliche Lizenz, https://nodejs.org/`,
    `- WinSW ${WINSW_VERSION} (dienst\\torball-dienst.exe) - MIT-Lizenz, https://github.com/winsw/winsw`,
    "- die in node_modules enthaltenen Bibliotheken mit ihren jeweiligen Lizenzdateien",
    "",
    "Die Datenbank Apache CouchDB wird beim Installieren separat vom Apache-Projekt heruntergeladen.",
    "",
  ].join("\r\n"),
);

let commit = "unbekannt";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: WURZEL }).toString().trim();
} catch {
  /* kein Git-Checkout - Commit bleibt unbekannt */
}
const quelleDatei = JSON.parse(fs.readFileSync(path.join(WURZEL, "deploy/release-quelle.json"), "utf8"));
fs.writeFileSync(
  path.join(BUEHNE, "paket.json"),
  JSON.stringify(
    {
      name: "Torball-Turniere",
      version: VERSION,
      gebaut: new Date().toISOString(),
      commit,
      node: NODE_VERSION,
      updateQuelle: quelleDatei,
    },
    null,
    2,
  ),
);

// --- Zippen (eigener, abhaengigkeitsfreier ZIP-Schreiber) + Pruefsumme
// Bewusst kein tar/Compress-Archive: das Windows-tar stuerzte beim Packen dieses Baums ab (Zugriffsfehler),
// und Compress-Archive ist langsam und kennt keine Pfade ueber 260 Zeichen. Ein ZIP ist einfach genug:
// je Datei ein lokaler Kopf + deflate-komprimierte Daten, am Ende das Inhaltsverzeichnis. Dateinamen
// werden als UTF-8 gekennzeichnet; die Daten gehen (bis auf node.exe) komprimiert hinein.
protokoll("Packe die ZIP-Datei ...");
const zipDatei = path.join(AUSGABE, `${PAKETNAME}.zip`);
fs.rmSync(zipDatei, { force: true });
schreibeZip(BUEHNE, zipDatei);
const summe = sha256(zipDatei);
fs.writeFileSync(`${zipDatei}.sha256`, `${summe}  ${PAKETNAME}.zip\n`);
const groesseMb = (fs.statSync(zipDatei).size / 1024 / 1024).toFixed(1);
protokoll(`Fertig: ${zipDatei} (${groesseMb} MB)`);
protokoll(`SHA-256: ${summe}`);

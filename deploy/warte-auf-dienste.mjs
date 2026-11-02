#!/usr/bin/env node
/**
 * Wartet beim lokalen Start darauf, dass ein Dienst tatsaechlich ANTWORTET - statt einfach
 * eine feste Zeit zu verstreichen zu lassen und zu hoffen.
 *
 * Hintergrund (Nutzer-Fund 2026-08-22): "Start-Torball.cmd" hat frueher pauschal drei Sekunden
 * gewartet und dann den Browser geoeffnet. Dauert der Start laenger - kalter Rechner, frisch
 * hochgefahrenes Windows, CouchDB-Dienst noch nicht bereit -, landete man auf der Fehlerseite
 * des Browsers. Und die aktualisiert sich NICHT von selbst, sobald der Server dann da ist: Der
 * Eindruck bleibt "die Anwendung funktioniert nicht", obwohl sie eine Sekunde spaeter laeuft.
 *
 * Zwei Phasen, weil der Server ohne Datenbank gar nicht erst hochkommt: backend/src/db.ts
 * baut die Verbindung beim Start auf und index.ts ruft ensureIndexes() VOR server.listen() -
 * ist CouchDB dann noch nicht erreichbar, beendet sich der Server-Prozess sofort wieder
 * (bewusst hartes Scheitern, siehe db.ts). Deshalb wird zuerst auf die Datenbank gewartet und
 * der Server erst danach gestartet.
 *
 * Aufruf (aus dem Ordner backend/):
 *   node --env-file=.env ..\deploy\warte-auf-dienste.mjs datenbank
 *   node --env-file=.env ..\deploy\warte-auf-dienste.mjs anwendung
 *
 * Rueckgabewert: 0 = Dienst antwortet, 1 = Zeit abgelaufen (der Aufrufer zeigt dann einen
 * Hinweis, statt den Browser ins Leere laufen zu lassen).
 *
 * Ausgaben bewusst OHNE Umlaute: die Konsole von Windows zeigt sie je nach Codepage sonst als
 * Kauderwelsch an (der uebrige Installer haelt es genauso).
 */

import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import os from "node:os";

/** Abstand zwischen zwei Versuchen. Kurz genug, dass es fluessig wirkt, ohne zu hetzen. */
const ABSTAND_MS = 400;

const PHASEN = {
  datenbank: {
    beschriftung: "Datenbank",
    // Grosszuegig: nach einem Windows-Neustart braucht der CouchDB-Dienst manchmal einen Moment.
    maxSekunden: 45,
    adresse: () => {
      const url = process.env.COUCHDB_URL;
      if (!url) throw new Error("COUCHDB_URL ist nicht gesetzt (backend/.env).");
      // Nur Host und Port pruefen - die Wurzel von CouchDB antwortet ohne Anmeldung.
      const ziel = new URL(url);
      ziel.pathname = "/";
      ziel.search = "";
      return ziel.toString();
    },
  },
  anwendung: {
    beschriftung: "Anwendung",
    maxSekunden: 60,
    adresse: () => {
      const port = process.env.PORT || "3000";
      // Bewusst 127.0.0.1 statt "localhost": haengt nicht an der Namensaufloesung, die unter
      // Windows zuerst IPv6 (::1) versuchen kann, waehrend der Server nur auf IPv4 lauscht.
      return `http://127.0.0.1:${port}/`;
    },
  },
};

/** Ein einzelner Versuch. Erfolg heisst: es kam IRGENDEINE HTTP-Antwort zurueck. */
function antwortet(adresse) {
  return new Promise((fertig) => {
    const holen = adresse.startsWith("https:") ? httpsGet : httpGet;
    const anfrage = holen(adresse, { timeout: 2000 }, (antwort) => {
      antwort.resume(); // Inhalt verwerfen, sonst bleibt die Verbindung offen
      fertig(true);
    });
    anfrage.on("error", () => fertig(false));
    anfrage.on("timeout", () => {
      anfrage.destroy();
      fertig(false);
    });
  });
}

/**
 * Wie lange Windows schon laeuft, in Sekunden. Fuer Tests laesst sich der Wert per Umgebungsvariable vorgeben.
 * Direkt nach dem Hochfahren starten Dienste noch nach und nach - wer die Anwendung in dieser Zeit oeffnet, soll
 * nicht nach einer Minute einen Fehler sehen, sondern einen freundlichen Hinweis und eine laengere Wartezeit.
 */
function windowsLaeuftSeit() {
  const vorgabe = Number(process.env.TORBALL_WARTE_UPTIME_SEKUNDEN);
  return Number.isFinite(vorgabe) && process.env.TORBALL_WARTE_UPTIME_SEKUNDEN ? vorgabe : os.uptime();
}

/** Bis zu dieser Laufzeit gilt Windows als "faehrt noch hoch". */
const HOCHFAHREN_BIS_SEKUNDEN = 600;
/** So lange wird in dieser Zeit auf die Anwendung gewartet. */
const MAX_SEKUNDEN_BEIM_HOCHFAHREN = 330;

async function warte(phase) {
  const adresse = phase.adresse();
  let maxSekunden = phase.maxSekunden;
  const laeuftSeit = windowsLaeuftSeit();
  if (phase.beschriftung === "Anwendung" && laeuftSeit < HOCHFAHREN_BIS_SEKUNDEN) {
    maxSekunden = Math.max(maxSekunden, MAX_SEKUNDEN_BEIM_HOCHFAHREN);
    const minuten = Math.max(1, Math.round(laeuftSeit / 60));
    process.stdout.write(
      `Windows ist erst seit etwa ${minuten} Minute(n) gestartet und faehrt noch hoch. Direkt danach braucht die\n` +
        "Anwendung etwas laenger - bitte einen Moment Geduld, es dauert hoechstens ein paar Minuten.\n",
    );
  }
  process.stdout.write(`${phase.beschriftung} wird gestartet `);

  const ende = Date.now() + maxSekunden * 1000;
  let punkte = 0;
  while (Date.now() < ende) {
    if (await antwortet(adresse)) {
      process.stdout.write(" bereit.\n");
      return true;
    }
    // Ein Punkt je Sekunde - sichtbares Lebenszeichen, ohne die Zeile zu ueberfluten.
    if (punkte < Math.floor((maxSekunden * 1000 - (ende - Date.now())) / 1000)) {
      process.stdout.write(".");
      punkte += 1;
    }
    await new Promise((weiter) => setTimeout(weiter, ABSTAND_MS));
  }

  process.stdout.write(" keine Antwort.\n");
  return false;
}

const name = process.argv[2];
const phase = PHASEN[name];
if (!phase) {
  console.error(`Unbekannte Phase "${name ?? ""}". Erlaubt: ${Object.keys(PHASEN).join(", ")}.`);
  process.exit(2);
}

try {
  process.exit((await warte(phase)) ? 0 : 1);
} catch (fehler) {
  console.error(fehler instanceof Error ? fehler.message : String(fehler));
  process.exit(2);
}

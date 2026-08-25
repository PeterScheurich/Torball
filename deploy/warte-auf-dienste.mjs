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

async function warte(phase) {
  const adresse = phase.adresse();
  process.stdout.write(`${phase.beschriftung} wird gestartet `);

  const ende = Date.now() + phase.maxSekunden * 1000;
  let punkte = 0;
  while (Date.now() < ende) {
    if (await antwortet(adresse)) {
      process.stdout.write(" bereit.\n");
      return true;
    }
    // Ein Punkt je Sekunde - sichtbares Lebenszeichen, ohne die Zeile zu ueberfluten.
    if (punkte < Math.floor((phase.maxSekunden * 1000 - (ende - Date.now())) / 1000)) {
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

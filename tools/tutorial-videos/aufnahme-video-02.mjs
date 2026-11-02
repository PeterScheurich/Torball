import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { holeTestkonto } from "./testkonto.mjs";

/**
 * Bildschirmaufnahme fuer Video 2 "Turnier anlegen" - die Schritte laufen im TAKT DER SPRACHE (plan.json + Zeitmarken je Zeichen aus
 * Saetze/*.json): Ein Feld wird genau dann hervorgehoben, wenn das Wort gesprochen wird. Aufnahmestandard: dunkel, 125 %, 1920x1080,
 * 24 Bilder/s (wie die Resolve-Zeitleiste). Laeuft gegen die lokale Dev-Instanz mit Testdaten und loescht das angelegte Beispielturnier
 * danach wieder. Voraussetzung: Frontend (5173) und Backend (3000) laufen, TORBALL_TESTKONTO_DATEI ist gesetzt.
 * Der Mauszeiger ist ein eingeblendeter Kreis (Playwright nimmt den Systemzeiger nicht auf).
 */
const BASIS = process.env.TORBALL_URL ?? "http://localhost:5173";
const AUSGABE = "D:/Projekte/Videos/Tutorials/Torball/Neu/02 Turnier anlegen";
const FPS = 24;
const TURNIERNAME = "Hallenturnier Sonnenberg";
const DATUM = "2027-03-06";
const STARTZEIT = "09:00";

const plan = JSON.parse(readFileSync(join(AUSGABE, "plan.json"), "utf8"));
const satz = Object.fromEntries(plan.saetze.map((s) => [s.id, s]));
const zeitmarken = {};
for (const s of plan.saetze) zeitmarken[s.id] = JSON.parse(readFileSync(s.datei.replace(/\.mp3$/, ".json"), "utf8")).zeitmarken;

/** Globale Zeit (Sekunden) des Wortes `teil` im Satz `id` - aus den Zeitmarken je Zeichen. */
function wortZeit(id, teil) {
  const z = zeitmarken[id];
  const text = z.characters.join("");
  const i = text.indexOf(teil);
  if (i < 0) throw new Error(`Wort "${teil}" nicht im Satz ${id}.`);
  return satz[id].sprechStart + (z.character_start_times_seconds[i] - z.character_start_times_seconds[0]);
}

const ZEIGER = () => {
  const stil = document.createElement("style");
  stil.textContent =
    "#__z{position:fixed;z-index:2147483647;width:30px;height:30px;border-radius:50%;background:rgba(255,213,79,.9);border:4px solid #fff;" +
    "box-shadow:0 0 0 2px rgba(0,0,0,.65);pointer-events:none;transform:translate(-50%,-50%);transition:transform .1s}" +
    "#__z.klick{transform:translate(-50%,-50%) scale(.55)}" +
    ".__hl{outline:4px solid #ffd54f !important;outline-offset:4px !important;border-radius:6px}" +
    // 125 % Zoom: Die Aufnahme zeichnet nur CSS-Pixel auf und fuellt bei kleinerem Fenster mit Grau. Deshalb Fenster 1920x1080 und
    // der Zoom per CSS auf dem body (der Zeiger haengt am html-Element und bleibt unskaliert).
    "body{zoom:1.25}" +
    // Hinweis-Banner der Entwicklungsumgebung gehoert nicht ins Tutorial
    "[class*=\"umgebungs-banner\"]{display:none !important}";
  const z = document.createElement("div");
  z.id = "__z";
  const lade = () => {
    document.head.appendChild(stil);
    document.documentElement.appendChild(z);
    const x = Number(sessionStorage.getItem("__zx") ?? -60);
    const y = Number(sessionStorage.getItem("__zy") ?? -60);
    z.style.left = `${x}px`;
    z.style.top = `${y}px`;
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lade);
  else lade();
  document.addEventListener("mousemove", (e) => {
    z.style.left = `${e.clientX}px`;
    z.style.top = `${e.clientY}px`;
    sessionStorage.setItem("__zx", e.clientX);
    sessionStorage.setItem("__zy", e.clientY);
  });
};

const konto = holeTestkonto();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
});
await context.addInitScript(ZEIGER);
await context.addInitScript(() => { try { localStorage.setItem("torball-theme", "dark"); } catch { /* ignorieren */ } });
const page = await context.newPage();

// ---- Vorbereitung (nicht im Video): anmelden
await page.goto(`${BASIS}/login`);
await page.getByLabel("E-Mail").fill(konto.email);
await page.getByLabel("Passwort").fill(konto.passwort);
await page.getByRole("button", { name: /anmelden/i }).click();
await page.getByRole("link", { name: "Neues Turnier anlegen" }).waitFor();
const dunkel = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
console.log("Hintergrundfarbe nach Anmeldung:", dunkel);

mkdirSync(join(AUSGABE, "Kontrollbilder"), { recursive: true });
const bild = (name) => page.screenshot({ path: join(AUSGABE, "Kontrollbilder", `${name}.png`) });

// ---- Hilfen fuer die Aufnahme
let mx = 700, my = 400;
const verspaetungen = [];
let t0 = 0;
const bis = async (sek, bezeichnung = "") => {
  const rest = sek * 1000 - (Date.now() - t0);
  if (rest > 0) await page.waitForTimeout(rest);
  else if (rest < -400) verspaetungen.push(`${bezeichnung || sek}: ${(-rest / 1000).toFixed(1)} s zu spaet`);
};
async function gleite(zielX, zielY, dauer = 0.8) {
  const n = Math.max(1, Math.round(dauer * FPS));
  const vx = mx, vy = my;
  for (let i = 1; i <= n; i++) {
    const e = 0.5 - Math.cos((i / n) * Math.PI) / 2; // weich anfahren und abbremsen
    await page.mouse.move(vx + (zielX - vx) * e, vy + (zielY - vy) * e);
    await page.waitForTimeout(1000 / FPS);
  }
  mx = zielX; my = zielY;
}
async function mitte(loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  return [b.x + Math.min(b.width / 2, 120), b.y + b.height / 2];
}
async function hinzu(loc, dauer = 0.7) {
  const [x, y] = await mitte(loc);
  await gleite(x, y, dauer);
}
async function hervorheben(loc) {
  await page.evaluate(() => document.querySelectorAll(".__hl").forEach((e) => e.classList.remove("__hl")));
  await loc.evaluate((e) => e.classList.add("__hl"));
}
const keinHervor = () => page.evaluate(() => document.querySelectorAll(".__hl").forEach((e) => e.classList.remove("__hl")));
async function klick(loc) {
  await hinzu(loc, 0.6);
  await page.evaluate(() => document.getElementById("__z")?.classList.add("klick"));
  await page.waitForTimeout(140);
  await loc.click();
  await page.evaluate(() => document.getElementById("__z")?.classList.remove("klick"));
}

// ---- Aufnahme starten (t = 0 entspricht dem Beginn der Sprache)
await page.goto(`${BASIS}/`);
await page.getByRole("link", { name: "Neues Turnier anlegen" }).waitFor();
await page.mouse.move(mx, my);
const videoPfad = join(AUSGABE, "Aufnahme", "02 Turnier anlegen - Bild.webm");
mkdirSync(join(AUSGABE, "Aufnahme"), { recursive: true });
await page.screencast.start({ path: videoPfad, size: { width: 1920, height: 1080 }, fps: FPS, quality: 92 });
t0 = Date.now();

// A: Begruessung - Turnieruebersicht ruhig im Bild
await bis(satz["A-02"].sprechStart, "A-02");
// B: Ausgangspunkt
await bis(satz["B-01"].sprechStart, "B-01");
await gleite(520, 300, 1.4);
await bis(wortZeit("B-02", "Oben") - 0.2, "B-02");
const neuLink = page.getByRole("link", { name: "Neues Turnier anlegen" });
await hinzu(neuLink, 1.0);
await bis(wortZeit("B-02", "„Neues Turnier"), "B-02 Button");
await hervorheben(neuLink);
// C: Schritt 1 - der Klick passiert, wenn der Satz "Nach einem Klick ... oeffnet sich ein Formular" beginnt
await bis(satz["C-03"].sprechStart - 0.1, "C-03 Klick");
await keinHervor();
await klick(neuLink);
await page.getByLabel("Name", { exact: true }).waitFor();
await bis(wortZeit("C-03", "„Name"), "C-03 Name");
await hervorheben(page.locator("#name"));
await bis(wortZeit("C-03", "„Datum"), "C-03 Datum");
await hervorheben(page.locator("#datum"));
await bis(wortZeit("C-03", "„Startzeit"), "C-03 Startzeit");
await hervorheben(page.locator("#startzeit"));
// C-04: eintragen
await bis(satz["C-04"].sprechStart - 0.3, "C-04");
await keinHervor();
await klick(page.locator("#name"));
await page.keyboard.type(TURNIERNAME, { delay: 38 });
await bis(wortZeit("C-04", "Datum"), "C-04 Datum");
await klick(page.locator("#datum"));
await page.locator("#datum").fill(DATUM);
await bis(wortZeit("C-04", "Uhrzeit"), "C-04 Uhrzeit");
await klick(page.locator("#startzeit"));
await page.locator("#startzeit").fill(STARTZEIT);
await bild("C04-Grunddaten-ausgefuellt");
// C-05: Hinweis zur Startzeit
await bis(satz["C-05"].sprechStart + 0.3, "C-05");
await hervorheben(page.locator("#startzeit"));
// C-06: Workaround - ruhig stehen lassen
await bis(satz["C-06"].sprechStart, "C-06");
await keinHervor();
// C-07: weitere Felder
await bis(wortZeit("C-07", "Anzahl") - 0.4, "C-07 Anzahl");
await page.locator("#anzahlFelder").scrollIntoViewIfNeeded();
await hinzu(page.locator("#anzahlFelder"), 0.7);
await hervorheben(page.locator("#anzahlFelder"));
await bis(wortZeit("C-07", "Spielmodus"), "C-07 Spielmodus");
const modus = (await page.locator("#turniermodus").count()) ? page.locator("#turniermodus") : page.locator("#spielplanModus");
await hinzu(modus, 0.7);
await hervorheben(modus);
await bis(wortZeit("C-07", "Protokollierungsart"), "C-07 Protokollierung");
await hinzu(page.locator("#protokollierungsart"), 0.7);
await hervorheben(page.locator("#protokollierungsart"));
await bild("C07-Felder");
// C-08: Weiter
await bis(satz["C-08"].sprechStart, "C-08");
await keinHervor();
const weiter1 = page.getByRole("button", { name: "Weiter zu Regeln" });
await hinzu(weiter1, 1.0);
await hervorheben(weiter1);
await bis(wortZeit("C-08", "nächsten") - 0.3, "C-08 Klick");
await keinHervor();
await klick(weiter1);
await page.waitForURL(/regeln-erfassen/);
const turnierId = decodeURIComponent(page.url().match(/turniere\/([^/]+)\/regeln-erfassen/)[1]);
// D: Schritt 2 - Regeln
await bis(satz["D-02"].sprechStart, "D-02");
await bis(wortZeit("D-02", "Spieldauer"), "D-02 Spieldauer");
await hinzu(page.locator("#spielzeitMinuten"), 0.8);
await hervorheben(page.locator("#spielzeitMinuten"));
await bis(wortZeit("D-02", "Pausen"), "D-02 Pausen");
await hinzu(page.locator("#pauseMinuten"), 0.7);
await hervorheben(page.locator("#pauseMinuten"));
await bis(wortZeit("D-02", "Wertung"), "D-02 Wertung");
await hinzu(page.locator("#punkteSieg"), 1.0);
await hervorheben(page.locator("#punkteSieg"));
await bild("D02-Regeln");
await bis(satz["D-03"].sprechStart, "D-03");
await keinHervor();
await bis(satz["D-04"].sprechStart, "D-04");
const weiter2 = page.getByRole("button", { name: "Weiter zu Mannschaften" });
await hinzu(weiter2, 1.0);
await hervorheben(weiter2);
await bis(wortZeit("D-04", "übernimmt") - 0.2, "D-04 Klick");
await keinHervor();
await klick(weiter2);
await page.waitForURL(/mannschaften-erfassen/);
// E: Outro - Mannschaften-Seite ruhig im Bild
await bis(satz["E-01"].sprechStart, "E-01");
await bild("E01-Mannschaften");
await bis(plan.gesamtdauer + 1.2, "Ende");
await page.screencast.stop();

// ---- Aufraeumen: Beispielturnier wieder loeschen
const antwort = await context.request.delete(`${BASIS}/api/turniere/${encodeURIComponent(turnierId)}`);
console.log(`Beispielturnier geloescht: HTTP ${antwort.status()}`);
await browser.close();

writeFileSync(join(AUSGABE, "Aufnahme", "aufnahme.json"), JSON.stringify({ datei: videoPfad, fps: FPS, groesse: "1920x1080", dauerGeplant: plan.gesamtdauer + 1.2, verspaetungen }, null, 1));
console.log("Aufnahme:", videoPfad);
console.log(verspaetungen.length ? `Verspaetungen:\n  ${verspaetungen.join("\n  ")}` : "Keine nennenswerten Verspaetungen.");

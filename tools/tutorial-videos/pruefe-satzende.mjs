import { chromium } from "playwright";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Prueft jede Satz-Datei auf abgeschnittenes Ende: dekodiert die mp3 im Browser und vergleicht, wo die Sprache tatsaechlich
 * aufhoert (Lautstaerke), mit dem Ende laut Zeitmarken und mit der Dateilaenge. Ein Satz, dessen Lautstaerke am Dateiende noch hoch ist,
 * wurde mitten im Ton beendet.
 * Aufruf: node pruefe-satzende.mjs "<Ordner mit Saetze>"
 */
const ordner = process.argv[2] ?? "D:/Projekte/Videos/Tutorials/Torball/Neu/02 Turnier anlegen/Saetze";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<body></body>");
for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".mp3")).sort()) {
  const id = datei.replace(".mp3", "");
  const marken = JSON.parse(readFileSync(join(ordner, id + ".json"), "utf8")).zeitmarken;
  const endeLautZeitmarken = marken.character_end_times_seconds.at(-1);
  const b64 = readFileSync(join(ordner, datei)).toString("base64");
  const r = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const fenster = Math.round(sr * 0.02);
    const rms = (von) => { let s = 0; for (let i = von; i < Math.min(d.length, von + fenster); i++) s += d[i] * d[i]; return Math.sqrt(s / fenster); };
    let spitze = 0; for (let i = 0; i < d.length; i += fenster) spitze = Math.max(spitze, rms(i));
    let letzteLaut = 0; for (let i = 0; i < d.length; i += fenster) if (rms(i) > spitze * 0.1) letzteLaut = i / sr;
    const letztes = rms(Math.max(0, d.length - fenster));
    return { dauer: d.length / sr, letzteLaut, spitze, amEnde: letztes };
  }, b64);
  const abgeschnitten = r.amEnde > r.spitze * 0.1;
  console.log(`${id}: Datei ${r.dauer.toFixed(2)} s, Sprache hoert auf bei ${r.letzteLaut.toFixed(2)} s, Zeitmarken-Ende ${endeLautZeitmarken.toFixed(2)} s, Pegel am Dateiende ${(100 * r.amEnde / r.spitze).toFixed(0)} %${abgeschnitten ? "  <-- ABGESCHNITTEN" : ""}`);
}
await browser.close();

import { chromium } from "playwright";
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Wandelt die mp3-Satzdateien in WAV (16 Bit, mono, 44,1 kHz) um. Grund: DaVinci Resolve dekodiert manche dieser mp3-Dateien nicht bis
 * zum Ende (Ende fehlt um 0,2-0,6 s, per Testrender belegt), obwohl sie in jedem anderen Player vollstaendig sind. Die Umwandlung
 * uebernimmt der Browser (Web Audio), der die Dateien vollstaendig dekodiert. Nur veraltete oder fehlende WAV-Dateien werden neu erzeugt.
 * Aufruf: node mp3-zu-wav.mjs "<Ordner mit den Satz-mp3>"
 */
const ordner = process.argv[2] ?? "D:/Projekte/Videos/Tutorials/Torball/Neu/02 Turnier anlegen/Saetze";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<body></body>");
let neu = 0;
for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".mp3")).sort()) {
  const mp3 = join(ordner, datei), wav = mp3.replace(/\.mp3$/, ".wav");
  if (existsSync(wav) && statSync(wav).mtimeMs >= statSync(mp3).mtimeMs) continue;
  const b64 = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(bytes.buffer);
    const d = buf.getChannelData(0), n = d.length, sr = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + n * 2));
    const text = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    text(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); text(8, "WAVE"); text(12, "fmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, sr, true);
    out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); text(36, "data"); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    let s = ""; const u = new Uint8Array(out.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  }, readFileSync(mp3).toString("base64"));
  writeFileSync(wav, Buffer.from(b64, "base64"));
  neu++;
}
console.log(`WAV-Dateien erzeugt: ${neu}`);
await browser.close();

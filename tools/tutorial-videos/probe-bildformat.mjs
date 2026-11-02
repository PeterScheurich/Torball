import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Probe: Fuellt die Playwright-Aufnahme das ganze 1920x1080-Bild? Zeichnet 2 s auf und liest Pixel aus dem fertigen Video. */
const OUT = join(process.env.TEMP ?? ".", "bildformat-probe");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function aufnehmen(name, ctxOpt, zoomCss) {
  const ctx = await browser.newContext({ ...ctxOpt, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/login");
  if (zoomCss) await page.addStyleTag({ content: `html{zoom:${zoomCss}}` });
  const pfad = join(OUT, name + ".webm");
  await page.screencast.start({ path: pfad, size: { width: 1920, height: 1080 }, fps: 24, quality: 92 });
  await page.waitForTimeout(2000);
  await page.screencast.stop();
  await ctx.close();
  return pfad;
}

async function pixel(pfad) {
  const daten = readFileSync(pfad);
  const server = createServer((q, s) => {
    if (q.url === "/") { s.setHeader("Content-Type", "text/html"); s.end('<video id=v src="/v.webm" muted preload=auto></video>'); return; }
    s.setHeader("Content-Type", "video/webm"); s.setHeader("Content-Length", daten.length); s.end(daten);
  }).listen(0);
  const port = server.address().port;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/`);
  const r = await page.evaluate(async () => {
    const v = document.getElementById("v");
    await new Promise((res) => { v.onloadeddata = res; v.load(); });
    v.currentTime = 1; await new Promise((res) => { v.onseeked = res; });
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext("2d"); g.drawImage(v, 0, 0);
    const p = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
    return { groesse: [v.videoWidth, v.videoHeight], mitte: p(960, 540), obenLinks: p(10, 10), untenRechts: p(1910, 1070), rechtsMitte: p(1900, 540), untenMitte: p(960, 1070) };
  });
  await ctx.close(); server.close();
  return r;
}

const varianten = {
  "A-viewport1536-dsf1.25 (bisher)": [{ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 }, null],
  "B-viewport1920-dsf1-csszoom1.25": [{ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, 1.25],
  "C-viewport1920-dsf1 (ohne Zoom)": [{ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, null],
};
for (const [name, [opt, zoom]] of Object.entries(varianten)) {
  const pfad = await aufnehmen(name.slice(0, 1), opt, zoom);
  console.log(name, JSON.stringify(await pixel(pfad)));
}
await browser.close();

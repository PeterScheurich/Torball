import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

/** Prueft eine Aufnahme (WebM): Fuellt sie das ganze Bild? Graue Raender (128,128,128) zeigen, dass die Seite kleiner aufgenommen wurde.
 *  Aufruf: node pruefe-bildrand.mjs "<datei.webm>" */
const daten = readFileSync(process.argv[2]);
const server = createServer((q, s) => {
  if (q.url === "/") { s.setHeader("Content-Type", "text/html"); s.end('<video id=v src="/v.webm" muted preload=auto></video>'); return; }
  s.setHeader("Content-Type", "video/webm"); s.setHeader("Content-Length", daten.length); s.end(daten);
}).listen(0);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);
const r = await page.evaluate(async () => {
  const v = document.getElementById("v");
  await new Promise((res) => { v.onloadeddata = res; v.load(); });
  const ergebnis = [];
  for (const t of [1, 20, 60, 100, 130]) {
    v.currentTime = t; await new Promise((res) => { v.onseeked = res; });
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext("2d"); g.drawImage(v, 0, 0);
    const grau = [[1900, 540], [960, 1070], [1910, 1070]].filter(([x, y]) => { const p = g.getImageData(x, y, 1, 1).data; return p[0] === 128 && p[1] === 128 && p[2] === 128; }).length;
    ergebnis.push({ sekunde: t, graueRandpunkte: grau });
  }
  return { groesse: [v.videoWidth, v.videoHeight], dauer: v.duration, ergebnis };
});
console.log(JSON.stringify(r));
await browser.close(); server.close();

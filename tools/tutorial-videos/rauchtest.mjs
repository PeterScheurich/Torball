import { chromium } from "playwright";
import { statSync } from "node:fs";

const ziel = process.argv[2];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
await page.setContent(`<html lang="de"><body style="font:32px sans-serif;padding:60px"><h1>Rauchtest</h1><button id="b" style="font-size:32px;padding:16px">Neues Turnier anlegen</button><p id="e"></p></body></html>`);
await page.screencast.start({ path: ziel, size: { width: 1920, height: 1080 }, fps: 30, quality: 90 });
await page.screencast.showActions();
await page.screencast.showChapter("Schritt 1 - Grunddaten");
await page.waitForTimeout(1200);
await page.click("#b");
await page.evaluate(() => { document.getElementById("e").textContent = "Geklickt."; });
await page.waitForTimeout(1200);
await page.screencast.stop();
await context.close();
await browser.close();
console.log("Datei:", ziel, Math.round(statSync(ziel).size / 1024) + " KB");

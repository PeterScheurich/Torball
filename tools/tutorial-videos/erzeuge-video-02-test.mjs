import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { erzeugeSatz, schneideZeilen, sprechzeit, MAX_ZEICHEN_JE_LAUF } from "./sprache.mjs";

/**
 * TEST der Pipeline mit dem vorgegebenen Text von Video 2 (Wortlaut vom 19.08.2026, Datei texte/...). SATZWEISE:
 * jeder Satz wird einzeln erzeugt und gespeichert, die PAUSEN setzen wir selbst dazwischen (pausen.json, einstellbar, kostet
 * nichts). Wird nur ein Satz geaendert, wird nur dieser neu erzeugt. Die Meta-Ueberschriften "Video 2", "Intro", "Ausgangspunkt" und
 * "Outro" werden NICHT gesprochen (im alten Schnitt herausgeschnitten); "Schritt 1" und "Schritt 2" bleiben.
 *
 * Aufrufe:  node erzeuge-video-02-test.mjs --trocken     (zeigt nur die Saetze, keine Credits)
 *           node erzeuge-video-02-test.mjs               (erzeugt fehlende/geaenderte Saetze, baut Plan + Untertitel)
 *           node erzeuge-video-02-test.mjs --nur-plan    (baut Plan + Untertitel NEU aus den vorhandenen Dateien - gratis, z. B. nach geaenderten Pausen)
 */
const AUSGABE = "D:/Projekte/Videos/Tutorials/Torball/Neu/02 Turnier anlegen";
const STANDARD_PAUSEN = {
  _hinweis: "Sekunden. satzende = nach einem normalen Satz, ueberschrift = nach 'Schritt 1 - Grunddaten', abschnitt = vor einem neuen Abschnitt.",
  satzende: 0.9,
  ueberschrift: 1.1,
  abschnitt: 1.6,
};
mkdirSync(join(AUSGABE, "Saetze"), { recursive: true });
const pausenPfad = join(AUSGABE, "pausen.json");
if (!existsSync(pausenPfad)) writeFileSync(pausenPfad, JSON.stringify(STANDARD_PAUSEN, null, 2));
const pausen = { ...STANDARD_PAUSEN, ...JSON.parse(readFileSync(pausenPfad, "utf8")) };

const voll = readFileSync(new URL("./texte/02-turnier-anlegen-vom-19-08.txt", import.meta.url), "utf8").replace(/\r/g, "");
const teile = voll.split(/\n\.\.\.\n/).map((t) => t.trim());
const ohneMeta = (t) => t.replace(/^(Intro|Ausgangspunkt|Outro)\.\.\.\n/, "");
const abschnitte = [
  { id: "A", text: ohneMeta(teile[1]) },
  { id: "B", text: ohneMeta(teile[2]) },
  { id: "C", text: teile[3] },
  { id: "D", text: teile[4] },
  { id: "E", text: ohneMeta(teile[5]) },
];

/** Zerlegt die Abschnitte in Saetze/Ueberschriften. */
const saetze = [];
for (const a of abschnitte) {
  let nr = 0;
  for (const zeile of a.text.split("\n").map((z) => z.trim()).filter(Boolean)) {
    if (/^Schritt \d+ — .+\.\.\.$/.test(zeile)) {
      saetze.push({ abschnitt: a.id, nr: ++nr, art: "ueberschrift", text: zeile.replace(/\.\.\.$/, ".") });
      continue;
    }
    for (const s of zeile.split(/(?<=[.!?]["”“]?)\s+/).map((x) => x.trim()).filter(Boolean)) {
      saetze.push({ abschnitt: a.id, nr: ++nr, art: "satz", text: s });
    }
  }
}
saetze.forEach((s, i) => { s.basis = join(AUSGABE, "Saetze", `${s.abschnitt}-${String(s.nr).padStart(2, "0")}`); s.index = i; });

if (process.argv.includes("--trocken")) {
  saetze.forEach((s) => console.log(`${s.abschnitt}-${String(s.nr).padStart(2, "0")} [${s.art}] (${s.text.length}) ${s.text}`));
  console.log(`\n${saetze.length} Saetze, ${saetze.reduce((n, s) => n + s.text.length, 0)} Zeichen. Trockenlauf: keine Credits.`);
  process.exit(0);
}

const nurPlan = process.argv.includes("--nur-plan");
const neuGesamt = saetze.filter((s) => !(existsSync(`${s.basis}.json`) && existsSync(`${s.basis}.mp3`))).reduce((n, s) => n + s.text.length, 0);
if (!nurPlan && neuGesamt > MAX_ZEICHEN_JE_LAUF) throw new Error(`Mehr als ${MAX_ZEICHEN_JE_LAUF} neue Zeichen - Abbruch, bitte vorher bestaetigen.`);

let verbraucht = 0;
for (const s of saetze) {
  if (nurPlan) {
    if (!existsSync(`${s.basis}.json`)) throw new Error(`--nur-plan: ${s.basis}.json fehlt. Erst ohne --nur-plan ausfuehren.`);
    s.zeitmarken = JSON.parse(readFileSync(`${s.basis}.json`, "utf8")).zeitmarken;
    continue;
  }
  const r = await erzeugeSatz({
    text: s.text,
    vorher: s.index > 0 ? saetze[s.index - 1].text.slice(-300) : undefined,
    danach: s.index < saetze.length - 1 ? saetze[s.index + 1].text.slice(0, 300) : undefined,
    basis: s.basis,
  });
  s.zeitmarken = r.zeitmarken;
  if (r.neu) { verbraucht += r.zeichen; console.log(`  erzeugt: ${s.abschnitt}-${s.nr} (${r.zeichen} Zeichen)`); }
}

// Plan: Sprechzeiten + einstellbare Pausen
const plan = { video: "02 Turnier anlegen", pausen, saetze: [], zeilen: [] };
let cursor = 0;
saetze.forEach((s, i) => {
  const { start, ende } = sprechzeit(s.zeitmarken);
  const quelleVon = Math.max(0, start - 0.05);
  const quelleBis = ende + 0.12;
  const naechster = saetze[i + 1];
  const pause = !naechster ? 0 : naechster.abschnitt !== s.abschnitt ? pausen.abschnitt : s.art === "ueberschrift" ? pausen.ueberschrift : pausen.satzende;
  plan.saetze.push({
    id: `${s.abschnitt}-${String(s.nr).padStart(2, "0")}`, art: s.art, text: s.text, datei: `${s.basis}.mp3`,
    sprechStart: +cursor.toFixed(3), sprechEnde: +(cursor + (ende - start)).toFixed(3),
    quelleVon: +quelleVon.toFixed(3), quelleBis: +quelleBis.toFixed(3), pauseDanach: pause,
  });
  for (const z of schneideZeilen(s.zeitmarken)) {
    plan.zeilen.push({ text: z.text, start: +(cursor + (z.start - start)).toFixed(3), ende: +(cursor + (z.ende - start)).toFixed(3), satz: plan.saetze.at(-1).id });
  }
  cursor += (ende - start) + pause;
});
plan.gesamtdauer = +cursor.toFixed(3);
writeFileSync(join(AUSGABE, "plan.json"), JSON.stringify(plan, null, 1));

const zeit = (sek) => {
  const ms = Math.round(sek * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(join(AUSGABE, "02 Turnier anlegen - de.srt"), plan.zeilen.map((z, i) => `${i + 1}\n${zeit(z.start)} --> ${zeit(z.ende)}\n${z.text}\n`).join("\n"), "utf8");
console.log(`${saetze.length} Saetze, neu erzeugt: ${verbraucht} Zeichen. Gesamtdauer ${plan.gesamtdauer.toFixed(1)} s, ${plan.zeilen.length} Untertitelzeilen.`);
console.log(`Pausen (s): Satzende ${pausen.satzende}, Ueberschrift ${pausen.ueberschrift}, Abschnitt ${pausen.abschnitt}`);

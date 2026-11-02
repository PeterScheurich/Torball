import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { erzeugeAbschnitt, schneideZeilen, MAX_ZEICHEN_JE_LAUF } from "./sprache.mjs";

/**
 * TEST der Pipeline mit dem vorgegebenen Text von Video 2 (Wortlaut vom 19.08.2026, Datei texte/...). Die Meta-Ueberschriften
 * "Video 2", "Intro", "Ausgangspunkt" und "Outro" werden NICHT gesprochen (im alten Schnitt wurden sie herausgeschnitten); "Schritt 1"
 * und "Schritt 2" bleiben, weil sie im Video gesprochen werden. Erzeugt je Abschnitt eine mp3 mit Zeitmarken und baut daraus
 * den Plan (plan.json) und eine deutsche SRT. Nutzung: node erzeuge-video-02-test.mjs  (verbraucht ca. 1.800 Credits)
 */
const AUSGABE = "D:/Projekte/Videos/Tutorials/Torball/Neu/02 Turnier anlegen";
const PAUSE_ZWISCHEN_ABSCHNITTEN = 0.8;

const voll = readFileSync(new URL("./texte/02-turnier-anlegen-vom-19-08.txt", import.meta.url), "utf8").replace(/\r/g, "");
const teile = voll.split(/\n\.\.\.\n/).map((t) => t.trim());
// teile: [0] "Video 2 — Turnier anlegen", [1] "Intro...\nText", [2] "Ausgangspunkt...\nText", [3] "Schritt 1 — Grunddaten...\nText",
// [4] "Schritt 2 — Regeln...\nText", [5] "Outro...\nText"
const ohneMeta = (t) => t.replace(/^(Intro|Ausgangspunkt|Outro)\.\.\.\n/, "");
const abschnitte = [
  { id: "A-Begruessung", text: ohneMeta(teile[1]) },
  { id: "B-Ausgangspunkt", text: ohneMeta(teile[2]) },
  { id: "C-Schritt1", text: teile[3].replace("...\n", "...\n") },
  { id: "D-Schritt2", text: teile[4] },
  { id: "E-Outro", text: ohneMeta(teile[5]) },
];

const gesamt = abschnitte.reduce((s, a) => s + a.text.length, 0);
console.log(`Abschnitte: ${abschnitte.length}, Zeichen insgesamt: ${gesamt}`);
if (gesamt > MAX_ZEICHEN_JE_LAUF) throw new Error(`Mehr als ${MAX_ZEICHEN_JE_LAUF} Zeichen - Abbruch, bitte vorher bestaetigen.`);
if (process.argv.includes("--trocken")) {
  for (const a of abschnitte) console.log(`\n[${a.id}] ${a.text.length} Zeichen\n${a.text.slice(0, 140).replace(/\n/g, " | ")}${a.text.length > 140 ? " ..." : ""}`);
  console.log("\nTrockenlauf: keine Credits verbraucht.");
  process.exit(0);
}

mkdirSync(AUSGABE, { recursive: true });
let offset = 0;
const plan = { video: "02 Turnier anlegen", abschnitte: [], zeilen: [] };
for (let i = 0; i < abschnitte.length; i++) {
  const a = abschnitte[i];
  const mp3 = join(AUSGABE, `${a.id}.mp3`);
  const r = await erzeugeAbschnitt({
    text: a.text,
    vorher: i > 0 ? abschnitte[i - 1].text.slice(-300) : undefined,
    danach: i < abschnitte.length - 1 ? abschnitte[i + 1].text.slice(0, 300) : undefined,
    mp3Pfad: mp3,
  });
  const zeilen = schneideZeilen(r.zeitmarken).map((z) => ({ text: z.text, start: +(z.start + offset).toFixed(3), ende: +(z.ende + offset).toFixed(3) }));
  plan.abschnitte.push({ id: a.id, datei: mp3, offset: +offset.toFixed(3), dauer: +r.dauer.toFixed(3), zeichen: r.zeichen });
  plan.zeilen.push(...zeilen.map((z) => ({ ...z, abschnitt: a.id })));
  console.log(`  ${a.id}: ${r.zeichen} Zeichen, ${r.dauer.toFixed(1)} s, ab ${offset.toFixed(1)} s`);
  offset += r.dauer + PAUSE_ZWISCHEN_ABSCHNITTEN;
}
plan.gesamtdauer = +offset.toFixed(3);
writeFileSync(join(AUSGABE, "plan.json"), JSON.stringify(plan, null, 1));

const zeit = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = plan.zeilen.map((z, i) => `${i + 1}\n${zeit(z.start)} --> ${zeit(z.ende)}\n${z.text}\n`).join("\n");
writeFileSync(join(AUSGABE, "02 Turnier anlegen - de.srt"), srt, "utf8");
console.log(`Gesamtdauer ${plan.gesamtdauer} s, ${plan.zeilen.length} Untertitelzeilen. Ausgabe: ${AUSGABE}`);

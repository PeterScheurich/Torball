import { mkdirSync, writeFileSync } from "node:fs";
import { api } from "./elevenlabs.mjs";

/**
 * Holt den Wortlaut einer frueheren Erzeugung aus dem ElevenLabs-Verlauf (nur lesend, keine Credits).
 * Aufruf: node hole-text-aus-verlauf.mjs "Video 2" texte/02-turnier-anlegen-vom-19-08.txt
 * Waehlt unter allen Eintraegen, deren Text mit dem Stichwort beginnt, den mit den meisten Zeichen.
 */
const [stichwort, ziel] = process.argv.slice(2);
const h = await api("/v1/history?page_size=100");
const treffer = (h.history ?? []).filter((e) => (e.text ?? "").startsWith(stichwort));
if (!treffer.length) throw new Error(`Kein Verlaufseintrag beginnt mit "${stichwort}".`);
treffer.sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0));
const e = treffer[0];
mkdirSync(new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") + "texte", { recursive: true });
writeFileSync(ziel, e.text, "utf8");
console.log(`Gefunden: ${treffer.length} Eintraege. Gewaehlt: ${new Date(e.date_unix * 1000).toISOString()} | ${e.text.length} Zeichen | Modell ${e.model_id}`);
console.log(`Gespeichert: ${ziel}`);

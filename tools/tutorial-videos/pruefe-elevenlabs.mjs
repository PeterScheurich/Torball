import { api } from "./elevenlabs.mjs";

/** Nur LESENDE Pruefung: Schluessel gueltig? Welche Stimmen? Welche Einstellungen hatten die frueheren Erzeugungen? Verbraucht keine Credits. */
async function versuche(titel, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`[${titel}] ${e.status ?? ""} ${e.message.replace(/\s+/g, " ").slice(0, 160)}`);
  }
}

await versuche("Konto", async () => {
  const a = await api("/v1/user/subscription");
  console.log(`Tarif: ${a.tier}, Credits genutzt ${a.character_count} von ${a.character_limit}, naechste Erneuerung ${new Date((a.next_character_count_reset_unix ?? 0) * 1000).toISOString().slice(0, 10)}`);
});

await versuche("Stimmen", async () => {
  const s = await api("/v1/voices");
  const eigene = s.voices.filter((v) => v.category !== "premade");
  console.log(`Stimmen gesamt ${s.voices.length}, davon eigene/geklonte ${eigene.length}:`);
  for (const v of eigene) {
    console.log(`  - ${v.name} | ${v.voice_id} | ${v.category} | Einstellungen: ${JSON.stringify(v.settings ?? null)}`);
  }
});

await versuche("Verlauf", async () => {
  const h = await api("/v1/history?page_size=40");
  const eintraege = h.history ?? [];
  console.log(`Verlauf: ${eintraege.length} Eintraege (neueste zuerst)`);
  for (const e of eintraege.slice(0, 20)) {
    const datum = new Date((e.date_unix ?? 0) * 1000).toISOString().slice(0, 16).replace("T", " ");
    const einst = e.settings ? JSON.stringify(e.settings) : "keine Angabe";
    console.log(`  ${datum} | ${e.voice_name} | ${e.model_id} | ${e.character_count_change_to - e.character_count_change_from} Zeichen | ${einst} | "${(e.text ?? "").slice(0, 40).replace(/\s+/g, " ")}"`);
  }
});

await versuche("Aussprache", async () => {
  const p = await api("/v1/pronunciation-dictionaries");
  const liste = p.pronunciation_dictionaries ?? [];
  console.log(`Aussprachewoerterbuecher: ${liste.length}`);
  for (const w of liste) console.log(`  - ${w.name} | ${w.id} | Version ${w.latest_version_id}`);
});

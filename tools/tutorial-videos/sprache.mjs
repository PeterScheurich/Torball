import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { api } from "./elevenlabs.mjs";

/**
 * Erzeugt Sprache mit der geklonten Stimme "Peter" UND den Zeitmarken je Zeichen (ElevenLabs "with-timestamps").
 * Die Einstellungen sind die der Aufnahmen vom 19.08.2026 (aus dem Verlauf gelesen), damit alles gleich klingt.
 * VERBRAUCHT CREDITS (ca. 1 je Zeichen) - deshalb gibt es eine Obergrenze je Aufruf.
 */
export const STIMME_ID = "5l5199xt9XZpblqh38hj"; // "Peter" (geklonte Stimme)
export const MODELL = "eleven_multilingual_v2";
export const EINSTELLUNGEN = { stability: 0.5, similarity_boost: 0.86, style: 0, speed: 0.95, use_speaker_boost: true };
export const MAX_ZEICHEN_JE_LAUF = 5000;

/** Erzeugt einen Abschnitt. Gibt { dauer, zeichen, zeitmarken } zurueck und schreibt die mp3 sowie die Rohdaten der Zeitmarken. */
export async function erzeugeAbschnitt({ text, vorher, danach, mp3Pfad }) {
  const antwort = await api(`/v1/text-to-speech/${STIMME_ID}/with-timestamps?output_format=mp3_44100_128`, {
    methode: "POST",
    body: {
      text,
      model_id: MODELL,
      voice_settings: EINSTELLUNGEN,
      // Zusammenhang fuer eine natuerliche Betonung an den Abschnittsgrenzen
      ...(vorher ? { previous_text: vorher } : {}),
      ...(danach ? { next_text: danach } : {}),
    },
  });
  mkdirSync(dirname(mp3Pfad), { recursive: true });
  writeFileSync(mp3Pfad, Buffer.from(antwort.audio_base64, "base64"));
  const a = antwort.alignment;
  writeFileSync(mp3Pfad.replace(/\.mp3$/, ".zeitmarken.json"), JSON.stringify(a));
  const dauer = a.character_end_times_seconds[a.character_end_times_seconds.length - 1];
  return { dauer, zeichen: text.length, zeitmarken: a };
}

/**
 * Teilt einen Abschnitt in Untertitel-Zeilen (hoechstens ~ maxZeichen) und liefert fuer jede Zeile Anfang und Ende in Sekunden.
 * Zeilenumbruch bevorzugt nach Satzzeichen, sonst am letzten Leerzeichen vor der Grenze.
 */
export function schneideZeilen(zeitmarken, maxZeichen = 84) {
  const z = zeitmarken.characters;
  const von = zeitmarken.character_start_times_seconds;
  const bis = zeitmarken.character_end_times_seconds;
  const zeilen = [];
  let start = 0;
  const zeigt = (i) => z[i] !== undefined;
  while (start < z.length) {
    while (zeigt(start) && /\s/.test(z[start])) start += 1;
    if (!zeigt(start)) break;
    let ende = Math.min(start + maxZeichen, z.length) - 1;
    if (ende < z.length - 1) {
      let schnitt = -1;
      for (let i = ende; i > start + 20; i--) {
        if (/[.!?…:;,—–]/.test(z[i]) && /\s/.test(z[i + 1] ?? " ")) { schnitt = i; break; }
      }
      if (schnitt < 0) for (let i = ende; i > start + 20; i--) if (/\s/.test(z[i])) { schnitt = i - 1; break; }
      if (schnitt > 0) ende = schnitt;
    }
    let e = ende;
    while (e > start && /\s/.test(z[e])) e -= 1;
    const text = z.slice(start, e + 1).join("").replace(/\s+/g, " ").trim();
    // reine Pausenpunkte ("...") ergeben keine eigene Untertitelzeile
    if (text && !/^[.\s…]+$/.test(text)) zeilen.push({ text, start: von[start], ende: bis[e] });
    start = e + 1;
  }
  return zeilen;
}

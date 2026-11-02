import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { api } from "./elevenlabs.mjs";

/**
 * Erzeugt Sprache mit der geklonten Stimme "Peter" UND den Zeitmarken je Zeichen (ElevenLabs "with-timestamps").
 * Die Einstellungen sind die der Aufnahmen vom 19.08.2026 (aus dem Verlauf gelesen), damit alles gleich klingt.
 * VERBRAUCHT CREDITS (Stand 02.11.2026: ca. 0,4 je Zeichen) - deshalb gibt es eine Obergrenze je Aufruf.
 */
export const STIMME_ID = "5l5199xt9XZpblqh38hj"; // "Peter" (geklonte Stimme)
export const MODELL = "eleven_multilingual_v2";
export const EINSTELLUNGEN = { stability: 0.5, similarity_boost: 0.86, style: 0, speed: 0.95, use_speaker_boost: true };
export const MAX_ZEICHEN_JE_LAUF = 5000;
// mp3 in voller Qualitaet (wie die bisherigen Aufnahmen). Unkomprimiertes pcm_44100 gibt es im Starter-Tarif nicht (HTTP 403).
const AUSGABEFORMAT = "mp3_44100_128";

/**
 * Erzeugt EINEN Satz (oder eine Ueberschrift). Ist die Datei schon da und der Text unveraendert, passiert NICHTS (keine Credits).
 * Gibt { zeitmarken, neu, zeichen } zurueck. Die Datei <basis>.json enthaelt Text und Zeitmarken, <basis>.mp3 die Sprache.
 */
export async function erzeugeSatz({ text, vorher, danach, basis }) {
  const jsonPfad = `${basis}.json`;
  const mp3Pfad = `${basis}.mp3`;
  if (existsSync(jsonPfad) && existsSync(mp3Pfad)) {
    const alt = JSON.parse(readFileSync(jsonPfad, "utf8"));
    if (alt.text === text && JSON.stringify(alt.einstellungen) === JSON.stringify(EINSTELLUNGEN)) {
      return { zeitmarken: alt.zeitmarken, neu: false, zeichen: 0 };
    }
  }
  const antwort = await api(`/v1/text-to-speech/${STIMME_ID}/with-timestamps?output_format=${AUSGABEFORMAT}`, {
    methode: "POST",
    body: {
      text,
      model_id: MODELL,
      voice_settings: EINSTELLUNGEN,
      // Zusammenhang fuer eine natuerliche Betonung ueber die Satzgrenzen hinweg
      ...(vorher ? { previous_text: vorher } : {}),
      ...(danach ? { next_text: danach } : {}),
    },
  });
  mkdirSync(dirname(mp3Pfad), { recursive: true });
  writeFileSync(mp3Pfad, Buffer.from(antwort.audio_base64, "base64"));
  writeFileSync(jsonPfad, JSON.stringify({ text, einstellungen: EINSTELLUNGEN, zeitmarken: antwort.alignment }));
  return { zeitmarken: antwort.alignment, neu: true, zeichen: text.length };
}

/** Anfang und Ende der gesprochenen Zeichen (ohne die Stille davor und danach), in Sekunden innerhalb der Datei. */
export function sprechzeit(zeitmarken) {
  const von = zeitmarken.character_start_times_seconds;
  const bis = zeitmarken.character_end_times_seconds;
  return { start: von[0], ende: bis[bis.length - 1] };
}

/**
 * Teilt einen Satz in Untertitel-Zeilen (hoechstens ~ maxZeichen) und liefert fuer jede Zeile Anfang und Ende in Sekunden
 * (innerhalb der Datei). Zeilenumbruch bevorzugt nach Satzzeichen, sonst am letzten Leerzeichen vor der Grenze.
 */
export function schneideZeilen(zeitmarken, maxZeichen = 84) {
  const z = zeitmarken.characters;
  const von = zeitmarken.character_start_times_seconds;
  const bis = zeitmarken.character_end_times_seconds;
  const zeilen = [];
  let start = 0;
  while (start < z.length) {
    while (start < z.length && /\s/.test(z[start])) start += 1;
    if (start >= z.length) break;
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
    if (text && !/^[.\s…]+$/.test(text)) zeilen.push({ text, start: von[start], ende: bis[e] });
    start = e + 1;
  }
  return zeilen;
}

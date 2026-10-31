/** Extrahiert die Video-ID aus einer YouTube-URL (youtu.be-Kurzform, watch?v=, oder bereits
 *  eine embed-URL) - undefined bei ungueltiger/nicht erkannter URL, damit Aufrufer das Video
 *  dann einfach nicht rendern statt mit einer kaputten Einbettung. */
const ERLAUBTE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
/** YouTube-IDs bestehen aus Buchstaben, Ziffern, "_" und "-" (derzeit 11 Zeichen) - alles andere nicht uebernehmen. */
const ID_MUSTER = /^[A-Za-z0-9_-]{6,20}$/;

export function youtubeVideoId(url: string): string | undefined {
  const id = rohId(url);
  return id && ID_MUSTER.test(id) ? id : undefined;
}

function rohId(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  if (parsed.hostname === "youtu.be") {
    return parsed.pathname.slice(1).split("/")[0] || undefined;
  }

  if (ERLAUBTE_HOSTS.has(parsed.hostname)) {
    const vParam = parsed.searchParams.get("v");
    if (vParam) return vParam;
    const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch) return embedMatch[1];
  }

  return undefined;
}

/** Privacy-freundliche Embed-URL (youtube-nocookie.com statt youtube.com - setzt erst bei
 *  tatsaechlicher Wiedergabe Tracking-Cookies) aus einer beliebigen YouTube-URL, oder undefined
 *  bei nicht erkannter URL. */
export function youtubeEmbedUrl(url: string): string | undefined {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
}

/**
 * Vergleich zweier Versionsnummern nach Semantic Versioning (1.2.3 bzw. 1.2.3-beta.2) - fuer den Hinweis
 * "Es gibt eine neuere Version" einer lokalen Installation. Der Windows-Updater
 * (deploy/windows-paket.ps1, `Vergleiche-Version`) rechnet dieselbe Regel; beide Stellen haben Tests
 * mit denselben Faellen. Eine Version OHNE Zusatz ist neuer als dieselbe mit Zusatz (0.10.0 > 0.10.0-beta).
 */
export interface Version {
  haupt: number;
  neben: number;
  patch: number;
  zusatz: string[];
}

export function liesVersion(text: string): Version | undefined {
  const treffer = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(text.trim());
  if (!treffer) return undefined;
  return {
    haupt: Number(treffer[1]),
    neben: Number(treffer[2]),
    patch: Number(treffer[3]),
    zusatz: treffer[4] ? treffer[4].split(".") : [],
  };
}

/** -1: a ist aelter, 0: gleich, 1: a ist neuer. Wirft bei nicht lesbaren Versionen. */
export function vergleicheVersionen(a: string, b: string): -1 | 0 | 1 {
  const va = liesVersion(a);
  const vb = liesVersion(b);
  if (!va || !vb) throw new Error(`Versionsnummer nicht lesbar: "${a}" bzw. "${b}"`);
  for (const [x, y] of [
    [va.haupt, vb.haupt],
    [va.neben, vb.neben],
    [va.patch, vb.patch],
  ] as const) {
    if (x < y) return -1;
    if (x > y) return 1;
  }
  if (va.zusatz.length === 0 && vb.zusatz.length === 0) return 0;
  if (va.zusatz.length === 0) return 1;
  if (vb.zusatz.length === 0) return -1;
  for (let i = 0; i < Math.max(va.zusatz.length, vb.zusatz.length); i++) {
    const x = va.zusatz[i];
    const y = vb.zusatz[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xZahl = /^\d+$/.test(x);
    const yZahl = /^\d+$/.test(y);
    if (xZahl && yZahl) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (xZahl) return -1;
    else if (yZahl) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface GitHubRelease {
  tag_name: string;
  name?: string;
  body?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * Waehlt aus einer Release-Liste die neueste passende Version: Entwuerfe zaehlen nie, Vorab-Versionen (Beta)
 * nur, wenn die installierte Version selbst eine ist - so rutscht niemand versehentlich auf eine unfertige
 * Version, solange es stabile gibt.
 */
export function neuestesRelease(releases: GitHubRelease[], installiert: string): GitHubRelease | undefined {
  const mitVorab = installiert.includes("-");
  let neuestes: GitHubRelease | undefined;
  for (const r of releases) {
    if (r.draft || (!mitVorab && r.prerelease) || !liesVersion(r.tag_name)) continue;
    if (!neuestes || vergleicheVersionen(r.tag_name, neuestes.tag_name) > 0) neuestes = r;
  }
  return neuestes;
}

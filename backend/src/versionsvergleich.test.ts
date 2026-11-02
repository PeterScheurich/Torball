import { test } from "node:test";
import assert from "node:assert/strict";
import { neuestesRelease, vergleicheVersionen, type GitHubRelease } from "./versionsvergleich";

// Dieselben Faelle prueft der Windows-Updater in PowerShell (deploy/windows-paket.ps1) - beide muessen gleich entscheiden.
test("Versionsvergleich nach Semantic Versioning", () => {
  const faelle: Array<[string, string, -1 | 0 | 1]> = [
    ["0.10.0-beta", "0.9.0-beta", 1],
    ["0.9.0-beta", "0.10.0-beta", -1],
    ["0.10.0", "0.10.0-beta", 1],
    ["0.10.0-beta", "0.10.0", -1],
    ["1.0.0", "1.0.0", 0],
    ["v1.2.3", "1.2.3", 0],
    ["0.10.0-beta.2", "0.10.0-beta.10", -1],
    ["0.10.0-beta.10", "0.10.0-beta.2", 1],
    ["0.10.0-rc.1", "0.10.0-beta.9", 1],
    ["0.10.0-beta", "0.10.0-beta.1", -1],
    ["2.0.0-alpha", "1.9.9", 1],
    ["0.9.1", "0.9.0-beta", 1],
  ];
  for (const [a, b, erwartet] of faelle) {
    assert.equal(vergleicheVersionen(a, b), erwartet, `${a} gegen ${b}`);
  }
  assert.throws(() => vergleicheVersionen("neu", "1.0.0"));
});

test("Welches Release gilt als das neueste: Entwuerfe nie, Vorab-Versionen nur fuer Beta-Nutzer", () => {
  const r = (tag: string, extra: Partial<GitHubRelease> = {}): GitHubRelease => ({ tag_name: tag, ...extra });
  const liste = [
    r("v0.9.0-beta", { prerelease: true }),
    r("v0.10.0-beta", { prerelease: true }),
    r("v0.10.1"),
    r("v0.11.0", { draft: true }),
    r("v1.0.0-rc.1", { prerelease: true }),
    r("kein-versionsname"),
  ];
  assert.equal(neuestesRelease(liste, "0.9.0-beta")?.tag_name, "v1.0.0-rc.1", "ein Beta-Nutzer bekommt auch Vorab-Versionen");
  assert.equal(neuestesRelease(liste, "0.10.0")?.tag_name, "v0.10.1", "ein stabiler Nutzer nur stabile Versionen");
  assert.equal(neuestesRelease([r("v1.0.0", { draft: true })], "0.9.0"), undefined, "ein Entwurf zaehlt nie");
  assert.equal(neuestesRelease([], "0.9.0"), undefined);
});

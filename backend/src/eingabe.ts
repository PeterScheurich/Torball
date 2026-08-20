/**
 * Schutz gegen Feld-Injektion über den Request-Body (Backend-Review 2026-08-20).
 *
 * Fastify reicht unbekannte Body-Felder standardmäßig durch (AJV `removeAdditional: false`, und die
 * Body-Schemata setzen kein `additionalProperties: false`). Routen, die den Body per
 * `{ ...serverFelder, ...req.body }` oder `{ ...bestehend, ...req.body }` übernehmen, würden diese
 * Zusatzfelder mitschreiben - dadurch ließen sich sonst z. B. `_id`/`docType` überschreiben (Anlage
 * eines Dokuments mit fremdem Typ, z. B. eines Admin-`benutzer`) oder sensible Felder wie
 * `passwortHash` in ein bestehendes Benutzerdokument injizieren (Konto-Übernahme).
 *
 * Bewusst per-Route-Strippen (Denylist) statt globalem AJV `removeAdditional`/`additionalProperties:
 * false`: die Turnier-Routen nutzen bewusst Passthrough für viele nicht einzeln aufgeführte Felder
 * (Regeln, `oeffentlich*`-Flags), und ein globales Whitelist-Stripping würde legitime
 * Frontend-Round-trips (die das ganze Objekt inkl. `_id`/`_rev`/`docType` zurücksenden) still
 * verändern. Das Strippen einer klaren Denylist server-kontrollierter Felder schließt die
 * Ausnutzung, ohne legitime Felder zu entfernen. Gleiches Muster wie `ohneServerFelder` in
 * `routes/turnier.ts`.
 */

/** Identitäts-/Meta-Felder, die NIE aus dem Client übernommen werden dürfen (an jeder Spread-Stelle). */
export const IDENTITAETS_FELDER = ["_id", "_rev", "docType"] as const;

/**
 * Entfernt die angegebenen Felder aus einer flachen Kopie des Bodys (mutiert das Original nicht).
 * Rückgabetyp bleibt `T`: entfernt werden nur server-kontrollierte Felder, die übrigen (inkl.
 * Pflichtfelder) bleiben erhalten.
 */
export function ohneFelder<T extends object>(body: T, felder: readonly string[]): T {
  const kopie = { ...body } as Record<string, unknown>;
  for (const feld of felder) delete kopie[feld];
  return kopie as T;
}

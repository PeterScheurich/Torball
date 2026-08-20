import type { TurnierExportPaket } from "./export";

/**
 * Sicherheitspruefung fuer ein eingehendes Turnier-Exportpaket (Turnier-Sync, Abschnitt 21.3/23),
 * BEVOR `importiereTurnierExport` es in die eigene CouchDB schreibt. Ohne diese Pruefung koennte
 * eine gekoppelte Instanz beliebige Dokumente ueberschreiben/anlegen: `import.ts` schreibt jedes
 * Dokument unter seiner mitgelieferten `_id` (und holt sich bei `ersetzen: true` die `_rev` selbst),
 * die eigentliche Schreib-Adresse ist also die `_id`. Queries (findAllByType) laufen dagegen ueber
 * das `docType`-FELD - deshalb muessen BEIDE stimmen: sonst liesse sich z.B. ein Dokument mit
 * `_id: "spiel:x"` (Praefix ok), aber `docType: "benutzer", globaleRolle: "admin"` einschleusen, das
 * dann bei der Anmeldung als Benutzer gefunden wuerde. Zusaetzlich muessen die turnierbezogenen
 * Dokumente tatsaechlich zu diesem einen Turnier gehoeren (kein Ueberschreiben eines FREMDEN
 * Turniers, obwohl nur DIESES ausgecheckt ist).
 *
 * Rein funktional (kein DB-Zugriff), damit sie im normalen `npm test` ohne CouchDB laufen kann.
 * Faellt bewusst hart aus (fail closed): im Zweifel wird das komplette Paket abgelehnt.
 */

/** `_id`-Konvention im Projekt: `<docType>:<uuid>` (siehe repository.ts::newId). Der Doppelpunkt
 *  gehoert bewusst zum Praefix, damit "spieler:" nicht faelschlich als "spiel:" durchgeht. */
function istIdVomTyp(wert: unknown, docType: string): boolean {
  return typeof wert === "string" && wert.startsWith(`${docType}:`);
}

/**
 * Prueft ein einzelnes Dokument: korrektes `_id`-Praefix UND korrektes `docType`-Feld, und - falls
 * angegeben - dass sein Zuordnungsfeld (`turnierId`/`mannschaftId`) in den erlaubten Bereich faellt.
 * `erlaubterScope` ist entweder ein einzelner erlaubter Wert (String) oder eine Menge erlaubter
 * Werte (Set).
 */
function pruefeDokument(
  doc: unknown,
  docType: string,
  scopeFeld: "turnierId" | "mannschaftId" | null,
  erlaubterScope: string | Set<string> | null,
): string | null {
  if (typeof doc !== "object" || doc === null) return `${docType}: Eintrag ist kein Objekt.`;
  const d = doc as Record<string, unknown>;
  if (!istIdVomTyp(d._id, docType)) {
    return `${docType}: _id "${String(d._id)}" hat nicht das erwartete Präfix "${docType}:".`;
  }
  if (d.docType !== docType) {
    return `${docType}: docType "${String(d.docType)}" weicht vom erwarteten Typ ab.`;
  }
  if (scopeFeld && erlaubterScope !== null) {
    const wert = d[scopeFeld];
    const ok =
      typeof erlaubterScope === "string"
        ? wert === erlaubterScope
        : typeof wert === "string" && erlaubterScope.has(wert);
    if (!ok) {
      return `${docType}: ${scopeFeld} "${String(wert)}" gehört nicht zu diesem Turnier.`;
    }
  }
  return null;
}

/**
 * Prueft ein vollstaendiges Exportpaket. Gibt `null` zurueck, wenn alles in Ordnung ist, sonst eine
 * konkrete Fehlermeldung. `erwarteteTurnierId` (optional): erzwingt, dass das Paket genau zu diesem
 * Turnier gehoert - beim Check-in ist das die tatsaechlich ausgecheckte `turnierId`, sodass ein
 * Paket fuer ein anderes Turnier abgelehnt wird, auch wenn dessen interne Referenzen konsistent sind.
 */
export function pruefeTurnierExportPaket(paket: TurnierExportPaket, erwarteteTurnierId?: string): string | null {
  if (typeof paket !== "object" || paket === null) return "Exportpaket fehlt oder ist kein Objekt.";
  const p = paket as unknown as Record<string, unknown>;

  const turnierFehler = pruefeDokument(p.turnier, "turnier", null, null);
  if (turnierFehler) return turnierFehler;
  const scope = (p.turnier as Record<string, unknown>)._id as string;
  if (erwarteteTurnierId && scope !== erwarteteTurnierId) {
    return `Exportpaket gehört zu Turnier "${scope}", ausgecheckt ist aber "${erwarteteTurnierId}".`;
  }

  // Alle Listen muessen - falls vorhanden - tatsaechlich Arrays sein (ein String o.ae. wuerde die
  // spaeteren for-Schleifen sonst unerwartet durchlaufen).
  for (const feld of ["mannschaften", "spieler", "spiele", "schiedsrichter", "vereine", "teams"]) {
    if (p[feld] !== undefined && !Array.isArray(p[feld])) return `Feld "${feld}" muss ein Array sein.`;
  }

  const mannschaften = Array.isArray(p.mannschaften) ? p.mannschaften : [];
  for (const m of mannschaften) {
    const fehler = pruefeDokument(m, "mannschaftImTurnier", "turnierId", scope);
    if (fehler) return fehler;
  }
  const mannschaftIds = new Set(
    mannschaften
      .map((m) => (typeof m === "object" && m !== null ? (m as Record<string, unknown>)._id : undefined))
      .filter((id): id is string => typeof id === "string"),
  );

  for (const spieler of Array.isArray(p.spieler) ? p.spieler : []) {
    // Spieler haengen an einer Mannschaft (mannschaftId), nicht direkt am Turnier - der Scope ist
    // deshalb die Menge der Mannschaften DIESES Pakets.
    const fehler = pruefeDokument(spieler, "spieler", "mannschaftId", mannschaftIds);
    if (fehler) return fehler;
  }
  for (const spiel of Array.isArray(p.spiele) ? p.spiele : []) {
    const fehler = pruefeDokument(spiel, "spiel", "turnierId", scope);
    if (fehler) return fehler;
  }
  for (const schiri of Array.isArray(p.schiedsrichter) ? p.schiedsrichter : []) {
    const fehler = pruefeDokument(schiri, "schiedsrichterImTurnier", "turnierId", scope);
    if (fehler) return fehler;
  }

  // Stammdaten (Verein/Team/Wettbewerb) sind turnieruebergreifend und tragen keine turnierId - hier
  // genuegt die Typ-Pruefung (_id-Praefix + docType). Sie schuetzt davor, ueber diese Arrays ein
  // fremdes Dokument (z.B. benutzer:) anzulegen: import.ts legt Stammdaten zwar nur an, wenn die ID
  // noch nicht existiert, aber genau das reichte, um ein neues admin-Benutzerdokument einzuschleusen.
  for (const verein of Array.isArray(p.vereine) ? p.vereine : []) {
    const fehler = pruefeDokument(verein, "verein", null, null);
    if (fehler) return fehler;
  }
  for (const team of Array.isArray(p.teams) ? p.teams : []) {
    const fehler = pruefeDokument(team, "team", null, null);
    if (fehler) return fehler;
  }
  if (p.wettbewerb !== undefined && p.wettbewerb !== null) {
    const fehler = pruefeDokument(p.wettbewerb, "wettbewerb", null, null);
    if (fehler) return fehler;
  }

  return null;
}

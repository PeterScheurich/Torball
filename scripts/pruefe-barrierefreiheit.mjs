#!/usr/bin/env node
/**
 * Prüft die Barrierefreiheits-Regeln, die sich mechanisch nachhalten lassen.
 *
 * === Warum es das gibt ===
 * Barrierefreiheit ist in diesem Projekt Vorgabe für ALLES (siehe CLAUDE.md). Trotzdem war das
 * automatische Speichern über Monate stumm: Acht Listen speicherten beim Verlassen eines Feldes,
 * ohne das irgendwo zu melden. Niemandem ist das aufgefallen – weil man es NICHT SEHEN KANN.
 * Anders als ein verrutschter Knopf sieht eine fehlende Ansage völlig normal aus. Wer mit Maus
 * und Augen prüft, bemerkt sie nie.
 *
 * Genau diese Sorte Fehler fängt dieses Skript ab: Regeln, die einmal bewusst entschieden wurden
 * und beim nächsten neuen Formular schlicht vergessen werden.
 *
 * === Was es NICHT kann ===
 * Ob eine Ansage verständlich ist, ob die Reihenfolge beim Durchtabben Sinn ergibt, ob man ein
 * Spiel damit tatsächlich protokollieren kann – das sieht nur ein echter Durchgang mit einem
 * Screenreader (NVDA ist unter Windows kostenlos), idealerweise mit jemandem aus der Zielgruppe.
 * Dieses Skript ersetzt das nicht. Es sorgt dafür, dass zwischen zwei solchen Durchgängen nichts
 * zurückfällt.
 *
 * === Eine neue Regel ergänzen ===
 * Unten in REGELN einen Eintrag anlegen: `name`, `beschreibung`, `pruefe(datei, inhalt)` gibt
 * eine Liste von Beanstandungen zurück (leer = in Ordnung). Ausnahmen gehören in die
 * `ausnahmen`-Liste der jeweiligen Regel – IMMER mit Begründung, damit sie eine bewusste
 * Entscheidung bleibt und nicht zur stillen Abkürzung wird.
 *
 * Aufruf: node scripts/pruefe-barrierefreiheit.mjs   (läuft auch über `npm run lint` mit)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const WURZEL = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const QUELLE = join(WURZEL, "frontend", "src");

/** Alle .tsx-Dateien unterhalb von frontend/src. */
function tsxDateien(ordner) {
  const gefunden = [];
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) gefunden.push(...tsxDateien(pfad));
    else if (eintrag.endsWith(".tsx")) gefunden.push(pfad);
  }
  return gefunden;
}

/** Dateiname relativ zu frontend/src, mit Schrägstrichen - für Ausnahmen und Ausgabe. */
function kurzname(pfad) {
  return relative(QUELLE, pfad).split(sep).join("/");
}

const REGELN = [
  {
    name: "Rückmeldung beim automatischen Speichern",
    beschreibung:
      "Wer beim Verlassen eines Feldes speichert, muss das melden - und zwar so, dass ein " +
      "Screenreader es ansagt (<SpeicherHinweis> oder ein eigenes Element mit role=\"status\"). " +
      "Ohne Speichern-Knopf fehlt sonst jedes wahrnehmbare Ereignis.",
    ausnahmen: {
      // Das onBlur setzt hier nur die Feststelltasten-Anzeige zurück, es wird nichts gespeichert.
      "pages/LoginPage.tsx": "onBlur speichert nicht, sondern blendet den Feststelltasten-Hinweis aus",
    },
    pruefe(_datei, inhalt) {
      if (!inhalt.includes("onBlur=")) return [];
      if (inhalt.includes("<SpeicherHinweis") || inhalt.includes('role="status"')) return [];
      return ["speichert beim Verlassen eines Feldes, meldet es aber nirgends angesagt"];
    },
  },
  {
    name: "Alternativtext für Bilder",
    beschreibung:
      'Jedes <img> braucht ein alt-Attribut. Ein leeres alt="" ist ausdrücklich erlaubt und ' +
      "richtig, wenn das Bild rein schmückend ist (z.B. das Logo neben dem Schriftzug).",
    ausnahmen: {},
    pruefe(_datei, inhalt) {
      const fehler = [];
      // Vom <img bis zum schliessenden > lesen - JSX-Attribute stehen oft über mehrere Zeilen.
      const treffer = inhalt.matchAll(/<img\b[^>]*>/gs);
      for (const t of treffer) {
        if (!/\balt\s*=/.test(t[0])) {
          fehler.push(`<img ohne alt-Attribut: ${t[0].slice(0, 70).replace(/\s+/g, " ")}…`);
        }
      }
      return fehler;
    },
  },
  {
    name: "Tab-Gruppen über die gemeinsame Komponente",
    beschreibung:
      'Eine handgebaute Reihe mit role="tab" hat zwar die Rollen, aber nicht die Bedienung: ' +
      "Screenreader kündigen Pfeiltasten an, die es dann nicht gibt. <TabListe> bringt " +
      "Roving-Tabindex und Pfeil-/Home-/End-Bedienung mit.",
    ausnahmen: {
      "components/TabListe.tsx": "die Komponente selbst",
      // In CLAUDE.md als bewusste Ausnahme festgehalten: eigene, vollständige Umsetzung
      // inklusive aria-controls/tabpanel-Verdrahtung.
      "pages/TurnierVerwaltenPage.tsx": "eigene vollständige Umsetzung inkl. aria-controls (siehe CLAUDE.md)",
    },
    pruefe(_datei, inhalt) {
      return inhalt.includes('role="tablist"') ? ['role="tablist" von Hand statt über <TabListe>'] : [];
    },
  },
  {
    name: "Fehlermeldungen werden angesagt",
    beschreibung:
      'Eine eingeblendete Fehlermeldung braucht role="alert" - sonst erscheint sie zwar auf dem ' +
      "Bildschirm, wird aber nicht vorgelesen, und die Ursache bleibt unbemerkt.",
    ausnahmen: {},
    pruefe(_datei, inhalt) {
      const fehler = [];
      for (const t of inhalt.matchAll(/\{fehler && <p\b[^>]*>/gs)) {
        if (!t[0].includes('role="alert"')) fehler.push(`Fehleranzeige ohne role="alert": ${t[0].slice(0, 60)}…`);
      }
      return fehler;
    },
  },
];

const dateien = tsxDateien(QUELLE);
let beanstandungen = 0;
let uebersprungen = 0;

console.log(`Barrierefreiheits-Prüfung: ${dateien.length} Dateien unter frontend/src\n`);

for (const regel of REGELN) {
  const treffer = [];
  for (const pfad of dateien) {
    const kurz = kurzname(pfad);
    const inhalt = readFileSync(pfad, "utf8");
    const gefunden = regel.pruefe(kurz, inhalt);
    if (gefunden.length === 0) continue;
    if (regel.ausnahmen[kurz]) {
      uebersprungen += 1;
      continue;
    }
    treffer.push(...gefunden.map((g) => `    ${kurz}: ${g}`));
  }

  if (treffer.length === 0) {
    console.log(`  OK   ${regel.name}`);
  } else {
    console.log(`  FEHLT ${regel.name}`);
    console.log(`        ${regel.beschreibung}`);
    treffer.forEach((z) => console.log(z));
    beanstandungen += treffer.length;
  }
}

console.log("");
if (beanstandungen === 0) {
  console.log(`Alle Regeln eingehalten (${uebersprungen} begründete Ausnahmen übersprungen).`);
  console.log("Hinweis: Das ersetzt keinen echten Durchgang mit einem Screenreader.");
} else {
  console.error(`${beanstandungen} Beanstandung(en). Bitte beheben oder - mit Begründung - als Ausnahme eintragen.`);
  process.exit(1);
}

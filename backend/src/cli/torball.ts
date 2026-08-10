/**
 * "torball" - zentrales Konsolen-Tool fuer administrative Aufgaben, die keinen
 * Web-Login voraussetzen (Haupt-Anwendungsfall: der einzige Admin-Account ist
 * gesperrt und niemand kommt mehr ins Backend). Aehnlich zu Tools wie
 * "pihole": ein einziger Einstiegspunkt, Unterbefehle, Hilfetext bei
 * fehlendem/unbekanntem Befehl. Neue Befehle werden unten im BEFEHLE-Objekt
 * ergaenzt - die Ausfuehrungs-/Fehlerbehandlung (main()) muss dafuer nicht
 * angefasst werden.
 *
 * Aufruf: npm run torball -- <befehl> [--option=wert ...]
 */
import type { Benutzer } from "@torball/shared";
import { findAllByType, insertDoc } from "../repository";

type Optionen = Record<string, string>;
type Befehl = (optionen: Optionen) => Promise<void>;

const BEFEHLE: Record<string, { beschreibung: string; ausfuehren: Befehl }> = {
  "benutzer:liste": {
    beschreibung: "Listet alle Benutzer mit E-Mail, Rolle und Sperr-Status auf.",
    ausfuehren: benutzerListe,
  },
  "benutzer:entsperren": {
    beschreibung: 'Entsperrt einen Benutzer. Optionen: --email="<E-Mail>"',
    ausfuehren: benutzerEntsperren,
  },
};

async function benutzerListe(): Promise<void> {
  const alle = await findAllByType<Benutzer>("benutzer");
  if (alle.length === 0) {
    console.log("Keine Benutzer vorhanden.");
    return;
  }
  for (const b of alle) {
    console.log(`${b.email}\tRolle: ${b.globaleRolle}\t${b.gesperrt ? "GESPERRT" : "aktiv"}`);
  }
}

async function benutzerEntsperren(optionen: Optionen): Promise<void> {
  const email = optionen.email?.trim().toLowerCase();
  if (!email) {
    console.error('Bitte --email="<E-Mail-Adresse>" angeben.');
    process.exitCode = 1;
    return;
  }

  const alle = await findAllByType<Benutzer>("benutzer");
  const benutzer = alle.find((b) => b.email.toLowerCase() === email);
  if (!benutzer) {
    console.error(`Kein Benutzer mit der E-Mail "${email}" gefunden.`);
    process.exitCode = 1;
    return;
  }
  if (!benutzer.gesperrt) {
    console.log(`"${email}" war bereits nicht gesperrt.`);
    return;
  }

  await insertDoc({ ...benutzer, gesperrt: false });
  console.log(`"${email}" ist jetzt entsperrt.`);
}

function zeigeHilfe(): void {
  console.log('Verwendung: npm run torball -- <befehl> [--option="wert" ...]\n');
  console.log("Verfügbare Befehle:");
  for (const [name, { beschreibung }] of Object.entries(BEFEHLE)) {
    console.log(`  ${name}\n    ${beschreibung}`);
  }
}

/** Nur das simple Muster --schluessel=wert wird unterstuetzt - reicht fuer die bisherigen Befehle, keine Bibliothek noetig. */
function parseOptionen(argv: string[]): Optionen {
  const optionen: Optionen = {};
  for (const arg of argv) {
    const treffer = /^--([^=]+)=(.*)$/.exec(arg);
    if (treffer) optionen[treffer[1]] = treffer[2];
  }
  return optionen;
}

async function main(): Promise<void> {
  const [befehlName, ...rest] = process.argv.slice(2);

  if (!befehlName || befehlName === "--hilfe" || befehlName === "-h") {
    zeigeHilfe();
    return;
  }

  const befehl = BEFEHLE[befehlName];
  if (!befehl) {
    console.error(`Unbekannter Befehl: "${befehlName}"\n`);
    zeigeHilfe();
    process.exitCode = 1;
    return;
  }

  await befehl.ausfuehren(parseOptionen(rest));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

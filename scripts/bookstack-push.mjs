#!/usr/bin/env node
/**
 * Überträgt alle Markdown-Dateien aus docs/ nach BookStack.
 *
 * Das Repository ist die führende Quelle. Seiten, die in BookStack bereits
 * existieren, werden aktualisiert; neue Seiten werden angelegt. Seiten, die
 * es nur in BookStack gibt, bleiben unangetastet.
 *
 * Aufruf:
 *   node scripts/bookstack-push.mjs --dry-run   (zeigt nur an, was passieren würde)
 *   node scripts/bookstack-push.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getConfig,
  findBook,
  listPages,
  api,
  pageUrl,
} from './bookstack-api.mjs';

function parseArgs(argv) {
  const args = { dir: 'docs', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--dir' && argv[i + 1]) {
      args.dir = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

/**
 * Der Seitenname ergibt sich aus der ersten Überschrift der Datei.
 * Fehlt sie, wird der Dateiname als Rückfallebene verwendet.
 */
function derivePageName(markdown, filename) {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  if (match) {
    return match[1].trim();
  }
  return filename.replace(/\.md$/i, '').replace(/^\d+-/, '').replace(/-/g, ' ');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();

  console.log(`BookStack: ${config.baseUrl}`);
  console.log(`Buch:      ${config.bookName}`);
  console.log(`Quelle:    ${args.dir}/`);
  if (args.dryRun) {
    console.log('Modus:     Probelauf (es wird nichts geschrieben)');
  }
  console.log('');

  const entries = await readdir(args.dir);
  const files = entries
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .filter((name) => name.toLowerCase() !== 'readme.md')
    .sort();

  if (files.length === 0) {
    console.log(`Keine Markdown-Dateien in ${args.dir}/ gefunden.`);
    return;
  }

  const book = await findBook(config);
  const existingPages = await listPages(config, book.id);

  const byName = new Map(existingPages.map((page) => [page.name, page]));

  let created = 0;
  let updated = 0;

  for (const filename of files) {
    const markdown = await readFile(join(args.dir, filename), 'utf8');
    const name = derivePageName(markdown, filename);
    const existing = byName.get(name);

    if (existing) {
      if (args.dryRun) {
        console.log(`  [würde aktualisieren] ${name}  (Seiten-ID ${existing.id})`);
      } else {
        const result = await api.put(config, `pages/${existing.id}`, {
          name,
          markdown,
        });
        console.log(`  aktualisiert: ${name}`);
        console.log(`                ${pageUrl(config, book.slug, result.slug)}`);
      }
      updated += 1;
    } else {
      if (args.dryRun) {
        console.log(`  [würde anlegen]      ${name}`);
      } else {
        const result = await api.post(config, 'pages', {
          book_id: book.id,
          name,
          markdown,
        });
        console.log(`  angelegt:     ${name}`);
        console.log(`                ${pageUrl(config, book.slug, result.slug)}`);
      }
      created += 1;
    }
  }

  console.log('');
  if (args.dryRun) {
    console.log(`Probelauf beendet: ${created} neu, ${updated} zu aktualisieren.`);
    console.log('Ohne --dry-run erneut aufrufen, um die Änderungen zu übertragen.');
  } else {
    console.log(`Fertig: ${created} angelegt, ${updated} aktualisiert.`);
  }
}

main().catch((error) => {
  console.error('');
  console.error(`Fehler: ${error.message}`);
  process.exit(1);
});

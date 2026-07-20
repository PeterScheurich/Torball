#!/usr/bin/env node
/**
 * Einmaliger Export: holt alle Seiten eines BookStack-Buches als Markdown
 * nach docs/.
 *
 * Gedacht als Startpunkt, um vorhandene Dokumentation ins Repository zu
 * übernehmen. Für den laufenden Betrieb ist das Repository führend, siehe
 * bookstack-push.mjs.
 *
 * Aufruf:
 *   node scripts/bookstack-export.mjs
 *   node scripts/bookstack-export.mjs --out docs
 */

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfig, findBook, listPages, fetchPage } from './bookstack-api.mjs';

function parseArgs(argv) {
  const args = { out: 'docs' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

/**
 * Erzeugt aus einem Seitennamen einen brauchbaren Dateinamen.
 * Umlaute werden ersetzt, damit die Dateinamen plattformübergreifend
 * unproblematisch bleiben.
 */
function toFilename(name, index) {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const prefix = String(index).padStart(2, '0');
  return `${prefix}-${slug || 'seite'}.md`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();

  console.log(`BookStack: ${config.baseUrl}`);
  console.log(`Buch:      ${config.bookName}`);
  console.log('');

  const book = await findBook(config);
  console.log(`Buch gefunden (ID ${book.id}).`);

  const pages = await listPages(config, book.id);
  if (pages.length === 0) {
    console.log('Keine Seiten im Buch gefunden.');
    return;
  }

  console.log(`${pages.length} Seite(n) gefunden.`);
  console.log('');

  await mkdir(args.out, { recursive: true });

  const existing = await readdir(args.out).catch(() => []);
  if (existing.length > 0) {
    console.log(
      `Hinweis: ${args.out}/ enthält bereits ${existing.length} Datei(en). ` +
        'Gleichnamige Dateien werden überschrieben.'
    );
    console.log('');
  }

  const index = [];

  for (const [position, summary] of pages.entries()) {
    const page = await fetchPage(config, summary.id);
    const filename = toFilename(page.name, position + 1);
    const target = join(args.out, filename);

    // BookStack liefert je nach Anlage der Seite markdown oder nur html.
    const content = page.markdown && page.markdown.trim().length > 0
      ? page.markdown
      : `<!-- Diese Seite wurde in BookStack als HTML gepflegt und ist hier\n     nur eingeschränkt verwertbar. Bitte manuell nachbereiten. -->\n\n${page.html ?? ''}`;

    const header = `# ${page.name}\n\n`;
    const body = content.trimStart().startsWith('#') ? content : header + content;

    await writeFile(target, `${body.trimEnd()}\n`, 'utf8');

    index.push({ name: page.name, filename });
    console.log(`  geschrieben: ${target}`);
  }

  // Kleine Übersicht, damit im Repository erkennbar ist, was es gibt.
  const readme = [
    '# Dokumentation',
    '',
    'Diese Dateien sind die führende Fassung der Projektdokumentation.',
    'Änderungen bitte hier vornehmen und anschließend mit',
    '`node scripts/bookstack-push.mjs` nach BookStack übertragen.',
    '',
    '## Inhalt',
    '',
    ...index.map((entry) => `- [${entry.name}](${entry.filename})`),
    '',
  ].join('\n');

  await writeFile(join(args.out, 'README.md'), readme, 'utf8');
  console.log(`  geschrieben: ${join(args.out, 'README.md')}`);

  console.log('');
  console.log('Export abgeschlossen.');
}

main().catch((error) => {
  console.error('');
  console.error(`Fehler: ${error.message}`);
  process.exit(1);
});

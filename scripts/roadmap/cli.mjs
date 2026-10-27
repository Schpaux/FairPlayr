#!/usr/bin/env node
/**
 * Roadmap commands (see roadmap/README.md):
 *   node scripts/roadmap/cli.mjs check    validate roadmap.json and that ROADMAP.md is current
 *   node scripts/roadmap/cli.mjs render   regenerate ROADMAP.md
 *   node scripts/roadmap/cli.mjs public [no|en]   print the public selection as JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoadmap, validateRoadmap, renderMarkdown, publicRoadmap } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataFile = path.join(root, 'roadmap', 'roadmap.json');
const markdownFile = path.join(root, 'ROADMAP.md');

const [command = 'check', arg] = process.argv.slice(2);
if (!['check', 'render', 'public'].includes(command)) {
  console.error(`Unknown command "${command}". Use check, render or public.`);
  process.exit(2);
}

let data;
try {
  data = loadRoadmap(dataFile);
} catch (error) {
  console.error(`error    roadmap/roadmap.json could not be read: ${error.message}`);
  process.exit(1);
}

if (command === 'render') {
  fs.writeFileSync(markdownFile, renderMarkdown(data) + '\n');
  console.log(`Wrote ${path.relative(root, markdownFile)}`);
} else if (command === 'public') {
  if (arg !== undefined && arg !== 'no' && arg !== 'en') {
    console.error(`Unknown locale "${arg}". Use no or en.`);
    process.exit(2);
  }
  const locale = arg ?? 'no';
  console.log(JSON.stringify(publicRoadmap(data, locale), null, 2));
} else if (command === 'check') {
  const { errors, warnings } = validateRoadmap(data, { repoRoot: root, git: true });
  const expected = renderMarkdown(data) + '\n';
  const actual = fs.existsSync(markdownFile) ? fs.readFileSync(markdownFile, 'utf8') : '';
  if (actual !== expected) errors.push('ROADMAP.md is out of date: run `npm run roadmap:render`');
  for (const w of warnings) console.warn(`warning  ${w}`);
  for (const e of errors) console.error(`error    ${e}`);
  console.log(`${data.items.length} items, ${errors.length} errors, ${warnings.length} warnings`);
  process.exitCode = errors.length > 0 ? 1 : 0;
}

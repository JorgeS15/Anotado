// Fails if a text passed to t() or tn() has no English translation.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const dictionary = readFileSync(join(root, 'lib/i18n-en.ts'), 'utf8');
const known = new Set([...dictionary.matchAll(/^\s+("(?:[^"\\]|\\.)*"): /gm)].map((m) => JSON.parse(m[1])));

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(svelte|ts)$/.test(name) && !name.startsWith('i18n')) files.push(path);
  }
};
walk(root);

const missing = new Set();
const literal = /'((?:[^'\\\n]|\\.)*)'/g;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  // t('…') and tn(n, '…', '…'): every string literal argument is a key.
  for (const call of source.matchAll(/\btn?\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    const args = call[1].replace(/\{[^{}]*\}\s*$/, '');
    for (const m of args.matchAll(literal)) {
      const text = m[1].replace(/\\'/g, "'");
      if (!known.has(text)) missing.add(`${file.replace(root, '')}: ${text}`);
    }
  }
}
// Arrays of plural forms passed to SelectBar's bulk().
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(/\['(\{n\}[^']*)', '(\{n\}[^']*)'\]/g)) {
    for (const text of [m[1], m[2]]) if (!known.has(text)) missing.add(`${file.replace(root, '')}: ${text}`);
  }
}
if (missing.size) {
  console.error(`Missing English translations:\n${[...missing].join('\n')}`);
  process.exit(1);
}
console.log(`i18n: ${known.size} texts translated.`);

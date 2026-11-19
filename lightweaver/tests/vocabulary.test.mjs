// Holds Studio's on-screen words to docs/journeys/GLOSSARY.md.
// Rejected words that already exist are recorded in vocabulary-baseline.json
// and may only shrink. Run with --update after renaming screen text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const srcRoot = join(appRoot, 'src');
const glossaryPath = join(appRoot, '..', 'docs', 'journeys', 'GLOSSARY.md');
const baselinePath = join(here, 'vocabulary-baseline.json');

export function readBannedPhrases(markdown) {
  const rows = markdown.split('\n').filter(line => line.startsWith('|') && !/^\|\s*-/.test(line));
  const banned = [];
  for (const row of rows.slice(1)) {
    const cells = row.split('|').map(cell => cell.trim());
    const say = cells[2];
    for (const [, phrase] of (cells[3] || '').matchAll(/`([^`]+)`/g)) {
      banned.push({ phrase, say });
    }
  }
  return banned;
}

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(jsx|js)$/.test(name) && !/\.test\.js$/.test(name)) out.push(path);
  }
  return out;
}

// Text an owner can see: string literals and JSX text, with comment lines removed.
export function screenStrings(source) {
  const code = source
    .split('\n')
    .filter(line => !/^\s*(\/\/|\/?\*)/.test(line))
    .join('\n');
  const strings = [];
  for (const [, , body] of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) strings.push(body);
  for (const [, body] of code.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) strings.push(body);
  return strings;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countBanned(strings, phrase) {
  if (phrase.startsWith('="') && phrase.endsWith('"')) {
    const exact = phrase.slice(2, -1);
    return strings.filter(text => text.trim() === exact).length;
  }
  const pattern = new RegExp(`(^|[^A-Za-z])${escapeRegExp(phrase)}(?![A-Za-z])`, 'g');
  return strings.reduce((sum, text) => sum + (text.match(pattern)?.length ?? 0), 0);
}

export function measure() {
  const banned = readBannedPhrases(readFileSync(glossaryPath, 'utf8'));
  const counts = {};
  for (const file of sourceFiles(srcRoot)) {
    const strings = screenStrings(readFileSync(file, 'utf8'));
    for (const { phrase } of banned) {
      const n = countBanned(strings, phrase);
      if (n) (counts[phrase] ??= {})[relative(appRoot, file)] = n;
    }
  }
  return { banned, counts };
}

if (process.argv.includes('--update')) {
  const { counts } = measure();
  writeFileSync(baselinePath, `${JSON.stringify(counts, null, 2)}\n`);
  const total = Object.values(counts).flatMap(Object.values).reduce((a, b) => a + b, 0);
  console.log(`vocabulary baseline written: ${total} rejected words left on screen`);
} else {
  test('the glossary names at least one rejected word per concept', () => {
    const banned = readBannedPhrases(readFileSync(glossaryPath, 'utf8'));
    assert.ok(banned.length >= 5, `expected rejected words in ${glossaryPath}`);
  });

  test('exact and word matching', () => {
    assert.equal(countBanned(['Pair this card', 'Repair', 'Paired'], 'Pair'), 1);
    assert.equal(countBanned(['Patterns', 'Open Patterns'], '="Patterns"'), 1);
    assert.equal(countBanned(screenStrings("// 'Pair' in a comment\nconst a = 'Pair it';"), 'Pair'), 1);
  });

  test('no new rejected words reach the screen, and progress is recorded', () => {
    const { banned, counts } = measure();
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const say = Object.fromEntries(banned.map(b => [b.phrase, b.say]));
    const problems = [];
    for (const phrase of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
      const files = new Set([...Object.keys(counts[phrase] ?? {}), ...Object.keys(baseline[phrase] ?? {})]);
      for (const file of files) {
        const now = counts[phrase]?.[file] ?? 0;
        const was = baseline[phrase]?.[file] ?? 0;
        if (now > was) problems.push(`${file}: "${phrase}" ${was} → ${now}. Say "${say[phrase] ?? 'the glossary word'}" (docs/journeys/GLOSSARY.md).`);
        if (now < was) problems.push(`${file}: "${phrase}" fell ${was} → ${now}. Record it: node tests/vocabulary.test.mjs --update`);
      }
    }
    assert.deepEqual(problems, []);
  });
}

// Read-only historical reproduction: extracts committed modules to a fresh
// temporary directory. Does not check out revisions or contact any controller.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = mkdtempSync(join(tmpdir(), 'lw-section-history-'));
const revisions = ['8b1fe864^', '8b1fe864', '5568e76b'];
const expected = [
  ['patch-piece', 'patch-piece', 'fire', 'ocean'],
  ['piece', 'piece', 'aurora', 'fire'],
  ['patch-piece', 'piece', 'fire', 'ocean'],
];

function extract(revision, directory, path, seen = new Set()) {
  if (seen.has(path)) return;
  if (!path.startsWith('lightweaver/src/lib/')
      && path !== 'packages/lightweaver-contract/card-hardware.json') {
    throw new Error(`Unexpected dependency: ${path}`);
  }
  seen.add(path);
  const source = execFileSync('git', ['show', `${revision}:${path}`], {
    cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  });
  const target = join(directory, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    extract(revision, directory, posix.normalize(posix.join(posix.dirname(path), match[1])), seen);
  }
}

const strips = [{ id: 'piece', name: 'Piece', pixelCount: 4,
  pixels: Array.from({ length: 4 }, (_, index) => ({ index, x: index, y: 0 })) }];
const patchBoard = {
  chains: [{ id: 'main', rowIds: ['patch-piece'] }],
  patches: [{ id: 'patch-piece', name: 'Piece',
    source: { type: 'strip', stripId: 'piece', startLed: 0, endLed: 3 },
    output: { mode: 'normal' }, playback: { patternId: 'fire' } }],
};
const compiledWiring = {
  ok: true, totalPixels: 4,
  zones: [{ id: 'piece', label: 'Piece', ranges: [{ start: 0, count: 4 }] }],
  pixels: Array.from({ length: 4 }, (_, index) => ({ index, stripId: 'piece' })),
};

for (const [index, revision] of revisions.entries()) {
  const directory = join(base, `revision-${index}`);
  mkdirSync(directory);
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n');
  const entry = 'lightweaver/src/lib/sectionLookModel.js';
  extract(revision, directory, entry);
  const { deriveSectionTargets, applyLookToPatchBoard } = await import(pathToFileURL(join(directory, entry)));
  const target = deriveSectionTargets({ strips, patchBoard, compiledWiring,
    defaultLook: { patternId: 'aurora' } }).find(item => item.kind === 'section');
  const next = applyLookToPatchBoard({ strips, patchBoard, targetId: target.id,
    look: { patternId: 'ocean' } });
  const saved = next.patches.find(item => item.id === 'patch-piece').playback.patternId;
  assert.deepEqual([target.id, target.zoneId, target.look.patternId, saved], expected[index]);
  console.log(JSON.stringify({ revision, selectedId: target.id, zoneId: target.zoneId,
    selectedPattern: target.look.patternId, savedPattern: saved }));
}
console.log(`Historical behavior confirmed for all three revisions. Extracted sources: ${base}`);

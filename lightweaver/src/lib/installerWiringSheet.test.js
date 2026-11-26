import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_BOARDS, rememberBoard, updateBoardLibrary } from './boardProfiles.js';
import { deriveInstallerWiringSheet, recordInstallerWiringConfirmation } from './installerWiringSheet.js';
import { compileWiring } from './wiringCompiler.js';

const cards = ['lw-000000000001', 'lw-000000000002'];
const [profile, changedProfile] = REFERENCE_BOARDS;
const strips = [
  { id: 'a', name: 'Outer ring', pixelCount: 4, pixels: Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })) },
  { id: 'b', name: 'Inner ring', pixelCount: 2, pixels: Array.from({ length: 2 }, (_, x) => ({ x, y: 0 })) },
];
const wiring = {
  version: 1,
  outputs: [
    { id: 'out1', pin: 16, runIds: ['inner', 'skip', 'outer-end'] },
    { id: 'out2', pin: 17, runIds: ['outer-start'] },
  ],
  runs: [
    { id: 'outer-start', type: 'strip', source: { stripId: 'a', from: 0, to: 1 }, verified: true },
    { id: 'outer-end', type: 'strip', source: { stripId: 'a', from: 2, to: 3 }, verified: true },
    { id: 'inner', type: 'strip', source: { stripId: 'b', from: 0, to: 1 }, verified: true },
    { id: 'skip', type: 'inactive', count: 1, verified: true },
  ],
};
const compiled = compileWiring({ wiring, strips });
const input = { cardId: cards[0], projectId: 'artwork-1', wiring, compiled, strips, profile };

function memoryStorage() {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

test('installer sheet uses compiler order, physical connectors, and source ranges for split strips', () => {
  const rows = deriveInstallerWiringSheet(input, memoryStorage());
  assert.deepEqual(rows.map(row => [row.name, row.pins, row.pin, row.count, row.start, row.end, row.segmented, row.checked]), [
    ['Inner ring', ['J1 pin 9'], 16, 2, 1, 2, false, false],
    ['Outer ring', ['J1 pin 9'], 16, 2, 3, 4, true, false],
    ['Outer ring', ['J1 pin 10'], 17, 2, 1, 2, true, false],
  ]);
});

test('operator receipt marks only observed strip runs and cannot transfer to another setup', () => {
  const storage = memoryStorage();
  updateBoardLibrary(storage, library => rememberBoard(library, cards[0], profile));
  assert.equal(recordInstallerWiringConfirmation({ ...input, confirmedRunIds: ['inner', 'skip', 'unknown'] }, storage), true);
  assert.deepEqual(deriveInstallerWiringSheet(input, storage).map(row => row.checked), [true, false, false]);
  for (const changed of [
    { cardId: cards[1] }, { projectId: 'artwork-2' }, { profile: changedProfile },
    { wiring: { ...wiring, outputs: wiring.outputs.toReversed() } },
  ]) {
    assert.equal(deriveInstallerWiringSheet({ ...input, ...changed }, storage).some(row => row.checked), false);
  }
  assert.deepEqual(deriveInstallerWiringSheet({ ...input, profile: undefined }, storage).map(row => row.pins), [[], [], []]);
  assert.equal(recordInstallerWiringConfirmation({ ...input, cardId: 'wrong-id', confirmedRunIds: ['inner'] }, storage), false);
});

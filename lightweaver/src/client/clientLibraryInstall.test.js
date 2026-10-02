import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClientSections, clientLibraryTargets, buildClientLibraryInstallRequest, normalizeClientLibrary, verifyClientLibraryReadback } from './clientLibraryInstall.js';
const zones = [
  { id: 'left', label: 'Left petals', continuous: true, ranges: [{ start: 0, count: 20 }] },
  { id: 'right', label: 'Right petals', mirrorOf: 'left', mirrorFlip: true, ranges: [{ start: 20, count: 20 }] },
  { id: 'center', label: 'Center', ranges: [{ start: 40, count: 10 }] },
];
const sections = normalizeClientSections({ zones });
const input = { status: { cardId: 'card-a', bootId: 'boot-a', playbackReady: true, capabilities: { clientLibrary: { version: 1, supportedPresetIds: ['aurora'] } } },
  currentLookId: 'look-a', libraryRevision: 'rev-a', layoutRevision: 'layout-a', presetId: 'aurora', label: ' My aurora ', targetIds: ['left'], tuning: { brightness: .4 }, sections };
test('section targets retain artwork mirrors and exclude independent mirror targeting', () => {
  assert.deepEqual(clientLibraryTargets(sections), [
    { id: '*', label: 'Whole piece', sectionIds: ['left', 'center'], mirroredIds: ['right'] },
    { id: 'left', label: 'Left petals', sectionIds: ['left'], mirroredIds: ['right'] },
    { id: 'center', label: 'Center', sectionIds: ['center'], mirroredIds: [] },
  ]);
  assert.equal(sections[1].mirrorFlip, true);
  assert.equal(sections[0].continuous, true);
});
test('invalid geometry, duplicate ids, missing mirrors and cycles fail closed', () => {
  for (const invalid of [[zones[0], zones[0]], [{ ...zones[1], mirrorOf: 'missing' }],
    [{ ...zones[0], mirrorOf: 'right' }, zones[1]], [{ ...zones[0], ranges: [{ start: -1, count: 3 }] }]]) {
    assert.throws(() => normalizeClientSections({ zones: invalid }));
  }
});
test('proposal contains exact authority and bounded tuning without layout fields', () => {
  const original = structuredClone(input);
  assert.deepEqual(buildClientLibraryInstallRequest(input), {
    expectedCardId: 'card-a', expectedBootId: 'boot-a', expectedRevision: 'rev-a', expectedCurrentLookId: 'look-a', expectedLayoutRevision: 'layout-a',
    presetId: 'aurora', label: 'My aurora', targetIds: ['left'], tuning: { brightness: .4 },
  });
  assert.deepEqual(input, original);
});
test('unsupported firmware and unsafe targets or edits cannot produce install proposal', () => {
  for (const patch of [{ status: { ...input.status, capabilities: {} } }, { libraryRevision: '' },
    { presetId: 'unsupported' }, { targetIds: ['right'] }, { targetIds: ['missing'] }, { targetIds: ['left', 'left'] },
    { tuning: { pin: 12 } }, { tuning: { brightness: 1.1 } }, { tuning: { hueShift: .5 } }, { label: ' ' }]) {
    assert.throws(() => buildClientLibraryInstallRequest({ ...input, ...patch }));
  }
});

const identity = { cardId: 'card-a', bootId: 'boot-a' };
const receipt = { ok: true, ...identity, revision: 'r2', layoutRevision: 'layout-a', currentLookId: 'look-a',
  remaining: 4, supportedPresetIds: ['aurora'], canInstall: true, sections, installedPatternId: 'client-exact' };
const draft = { ...input, layoutRevision: 'layout-a' };
const patterns = { patterns: [{ id: 'client-exact', label: 'My aurora', zones: sections.map(section => ({ ...section, patternId: 'aurora', brightness: .4 })) }] };
test('save proof requires matching artwork, revision, named zones and appearance', () => {
  assert.equal(verifyClientLibraryReadback(receipt, receipt, patterns, identity, draft).verified, true);
  assert.throws(() => verifyClientLibraryReadback(receipt, { ...receipt, revision: 'r3' }, patterns, identity, draft));
  assert.throws(() => verifyClientLibraryReadback(receipt, receipt, patterns, identity, { ...draft, layoutRevision: 'changed' }));
  const wrong = structuredClone(patterns); wrong.patterns[0].zones[1].mirrorOf = '';
  assert.throws(() => verifyClientLibraryReadback(receipt, receipt, wrong, identity, draft));
  wrong.patterns[0].zones[1].mirrorOf = 'left'; wrong.patterns[0].zones[0].continuous = false;
  assert.throws(() => verifyClientLibraryReadback(receipt, receipt, wrong, identity, draft));
  wrong.patterns[0].zones[0].continuous = true; wrong.patterns[0].zones[0].brightness = .2;
  assert.throws(() => verifyClientLibraryReadback(receipt, receipt, wrong, identity, draft));
  assert.throws(() => normalizeClientLibrary({ ...receipt, cardId: 'other' }, identity));
});

test('multi-pattern placements preserve distinct preset and tuning per exact source section', () => {
  const multi = { ...input, status: { ...input.status, capabilities: { clientLibrary: { version: 1, supportedPresetIds: ['aurora', 'ocean'] } } },
    targetIds: ['left', 'center'], assignments: [{ targetId: 'left', presetId: 'aurora', tuning: { brightness: .4 } },
      { targetId: 'center', presetId: 'ocean', tuning: { speed: .7 } }] };
  assert.deepEqual(buildClientLibraryInstallRequest(multi).assignments, multi.assignments);
  const multiPatterns = structuredClone(patterns); multiPatterns.patterns[0].zones[2].patternId = 'ocean'; multiPatterns.patterns[0].zones[2].speed = .7;
  assert.equal(verifyClientLibraryReadback(receipt, receipt, multiPatterns, identity, multi).verified, true);
  multiPatterns.patterns[0].zones[2].patternId = 'aurora';
  assert.throws(() => verifyClientLibraryReadback(receipt, receipt, multiPatterns, identity, multi));
  for (const assignments of [[multi.assignments[0]], [multi.assignments[0], multi.assignments[0]],
    [multi.assignments[0], { targetId: 'right', presetId: 'ocean', tuning: {} }],
    [multi.assignments[0], { targetId: 'center', presetId: 'foreign', tuning: {} }],
    [multi.assignments[0], { targetId: 'center', presetId: 'ocean', tuning: { pin: 4 } }]]) {
    assert.throws(() => buildClientLibraryInstallRequest({ ...multi, assignments }));
  }
});

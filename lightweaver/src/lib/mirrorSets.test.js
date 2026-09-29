import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { migrateProject, migrateStripIdNamespace } from './projectModel.js';
import { createDefaultPatchBoard } from './patchBoard.js';
import { deriveSectionTargets } from './sectionLookModel.js';
import { compileWiring } from './wiringCompiler.js';
import { makeDefaultWiring } from './wiringModel.js';
import {
  addMirrorMembers,
  defaultMirrorSetName,
  mirrorSetForStrip,
  normalizeMirrorSets,
  removeMirrorMember,
  remapMirrorSetStripIds,
  renameMirrorSet,
  validateMirrorSets,
} from './mirrorSets.js';
import {
  commitLayout,
  createLayoutHistory,
  createLayoutState,
  layoutActions,
  layoutReducer,
  makeLayoutSnapshot,
  undoLayout,
} from '../state/layoutReducer.js';

const strip = (id, pixelCount = 4, extra = {}) => ({
  id,
  name: `Strip ${id}`,
  pixelCount,
  pixels: Array.from({ length: pixelCount }, (_, index) => ({ x: index, y: extra.y ?? 0 })),
  ...extra,
});
const set = (id, members, name = '') => ({ id, name, members });
const codes = result => result.errors.map(error => error.code);

function project(ids, counts = {}) {
  const strips = ids.map(id => strip(id, counts[id] ?? 4));
  return { strips, wiring: makeDefaultWiring(strips), patchBoard: createDefaultPatchBoard(strips) };
}

// ── validation: every code turns red on its own input ─────────────────────

test('a clean two-strip set validates', () => {
  const { strips, wiring } = project(['a', 'b']);
  assert.deepEqual(validateMirrorSets([set('mirror-1', ['a', 'b'])], strips, wiring, []), { ok: true, errors: [] });
});

test('mirror-set-size: one member and seven members are refused', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const { strips, wiring } = project(ids);
  assert.ok(codes(validateMirrorSets([set('m', ['a'])], strips, wiring, [])).includes('mirror-set-size'));
  assert.ok(codes(validateMirrorSets([set('m', ids)], strips, wiring, [])).includes('mirror-set-size'));
  assert.equal(validateMirrorSets([set('m', ids.slice(0, 6))], strips, wiring, []).ok, true);
});

test('mirror-member-missing: a member that is not a strip is refused', () => {
  const { strips, wiring } = project(['a', 'b']);
  const result = validateMirrorSets([set('m', ['a', 'ghost'])], strips, wiring, []);
  assert.ok(codes(result).includes('mirror-member-missing'));
  assert.equal(result.errors.find(error => error.code === 'mirror-member-missing').stripId, 'ghost');
});

test('mirror-member-twice: a strip cannot sit in two sets', () => {
  const { strips, wiring } = project(['a', 'b', 'c']);
  const result = validateMirrorSets([set('m1', ['a', 'b']), set('m2', ['b', 'c'])], strips, wiring, []);
  assert.ok(codes(result).includes('mirror-member-twice'));
  assert.equal(result.errors.find(error => error.code === 'mirror-member-twice').stripId, 'b');
});

test('mirror-member-grouped: a strip in a layer group cannot mirror', () => {
  const { strips, wiring } = project(['a', 'b', 'c']);
  const layerGroups = [{ groupId: 'g', members: [{ type: 'strip', stripId: 'b' }, { type: 'strip', stripId: 'c' }] }];
  const result = validateMirrorSets([set('m', ['a', 'b'])], strips, wiring, layerGroups);
  assert.ok(codes(result).includes('mirror-member-grouped'));
});

test('mirror-member-kaleidoscope: a strip with Kaleidoscope on cannot mirror', () => {
  const { strips, wiring } = project(['a', 'b']);
  strips[1] = { ...strips[1], kaleidoscope: { enabled: true } };
  assert.ok(codes(validateMirrorSets([set('m', ['a', 'b'])], strips, wiring, [])).includes('mirror-member-kaleidoscope'));
});

test('mirror-member-split: a member wired as two runs must be joined first', () => {
  const strips = [strip('a', 4), strip('b', 4)];
  const wiring = {
    ...makeDefaultWiring(strips),
    outputs: [{ id: 'o1', pin: 16, runIds: ['a1', 'b'] }, { id: 'o2', pin: 17, runIds: ['a2'] }],
    runs: [
      { id: 'a1', type: 'strip', source: { stripId: 'a', from: 0, to: 1 } },
      { id: 'a2', type: 'strip', source: { stripId: 'a', from: 2, to: 3 } },
      { id: 'b', type: 'strip', source: { stripId: 'b', from: 0, to: 3 } },
    ],
  };
  const result = validateMirrorSets([set('m', ['a', 'b'])], strips, wiring, []);
  assert.deepEqual(codes(result), ['mirror-member-split']);
  assert.equal(result.errors[0].stripId, 'a');
  assert.match(result.errors[0].message, /Join .*wiring into one run first/);
});

test('mirror-set-ranges: members that need more than six wiring runs are refused', () => {
  const strips = [strip('a', 4), strip('b', 4)];
  const pieces = id => [0, 1, 2, 3].map(index => ({ id: `${id}${index}`, type: 'strip', source: { stripId: id, from: index, to: index } }));
  const runs = [...pieces('a'), ...pieces('b')];
  const wiring = {
    ...makeDefaultWiring(strips),
    outputs: [0, 1, 2, 3].map(index => ({ id: `o${index}`, pin: [16, 17, 18, 21][index], runIds: [`a${index}`, `b${index}`] })),
    runs,
  };
  const result = validateMirrorSets([set('m', ['a', 'b'])], strips, wiring, []);
  assert.ok(codes(result).includes('mirror-set-ranges'), JSON.stringify(result.errors));
  assert.ok(codes(result).includes('mirror-member-split'));
});

// ── compile ───────────────────────────────────────────────────────────────

test('a 4-way set compiles to one zone with four ranges, one section, the lead patch', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const { strips, wiring, patchBoard } = project(ids, { a: 4, b: 4, c: 5, d: 3 });
  const sets = [set('mirror-1', ['a', 'b', 'c', 'd'], 'Four arms')];
  const compiled = compileWiring({ wiring, strips, mirrorSets: sets });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.zones.length, 1);
  const [zone] = compiled.zones;
  assert.equal(zone.id, 'mirror-1');
  assert.equal(zone.label, 'Four arms');
  assert.deepEqual(zone.ranges, [
    { start: 0, count: 4 }, { start: 4, count: 4 }, { start: 8, count: 5 }, { start: 13, count: 3 },
  ]);
  assert.deepEqual(Object.keys(zone).sort(), ['id', 'label', 'ranges']);

  const sections = deriveSectionTargets({ strips, patchBoard, compiledWiring: compiled })
    .filter(target => target.kind === 'section');
  assert.equal(sections.length, 1);
  const leadPatch = patchBoard.patches.find(patch => patch.source.stripId === 'a');
  assert.equal(sections[0].patchId, leadPatch.id);
  assert.equal(sections[0].zoneId, 'mirror-1');
  assert.equal(sections[0].pixelCount, 16);
});

test('zone ranges follow member order, not wiring order', () => {
  const { strips, wiring } = project(['a', 'b', 'c']);
  const compiled = compileWiring({ wiring, strips, mirrorSets: [set('mirror-1', ['c', 'a'])] });
  const zone = compiled.zones.find(candidate => candidate.id === 'mirror-1');
  assert.deepEqual(zone.ranges, [{ start: 8, count: 4 }, { start: 0, count: 4 }]);
  assert.deepEqual(compiled.zones.map(candidate => candidate.id), ['mirror-1', 'b']);
});

test('the default label is derived from the members when the set is unnamed', () => {
  const { strips, wiring } = project(['a', 'b', 'c', 'd']);
  const compiled = compileWiring({ wiring, strips, mirrorSets: [set('mirror-1', ['a', 'b', 'c', 'd'])] });
  assert.equal(compiled.zones[0].label, 'Strip a and 3 more');
  assert.equal(defaultMirrorSetName(set('m', ['a', 'b']), strips), 'Strip a and Strip b');
});

test('two adjacent mirrored strips on one output stay two ranges', () => {
  const { strips, wiring } = project(['a', 'b']);
  assert.equal(wiring.outputs.length, 1);
  const compiled = compileWiring({ wiring, strips, mirrorSets: [set('mirror-1', ['a', 'b'])] });
  assert.deepEqual(compiled.zones[0].ranges, [{ start: 0, count: 4 }, { start: 4, count: 4 }]);
});

test('neighbouring mirrored strips never fuse even when their LED numbers run on', () => {
  // a ends at source LED 0 and b begins at source LED 1, physically adjacent:
  // exactly the shape the same-strip coalescer would join if it ignored strips.
  const strips = [strip('a', 1), strip('b', 4)];
  const wiring = {
    ...makeDefaultWiring(strips),
    outputs: [{ id: 'o1', pin: 16, runIds: ['a', 'b'] }],
    runs: [
      { id: 'a', type: 'strip', source: { stripId: 'a', from: 0, to: 0 } },
      { id: 'b', type: 'strip', source: { stripId: 'b', from: 1, to: 3 } },
    ],
  };
  const compiled = compileWiring({ wiring, strips, mirrorSets: [set('mirror-1', ['a', 'b'])] });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  assert.deepEqual(compiled.zones[0].ranges, [{ start: 0, count: 1 }, { start: 1, count: 3 }]);
});

test('a set that breaks a rule is left out with a warning, never blocking the project', () => {
  const { strips, wiring } = project(['a', 'b']);
  const layerGroups = [{ groupId: 'g', members: [{ type: 'strip', stripId: 'b' }, { type: 'strip', stripId: 'a' }] }];
  const grouped = compileWiring({ wiring, strips, groups: layerGroups, mirrorSets: [set('mirror-1', ['a', 'b'])] });
  assert.equal(grouped.ok, true);
  assert.deepEqual(grouped.zones.map(zone => zone.id), ['g']);
  assert.equal(grouped.warnings.find(warning => warning.code === 'mirror-set-ignored').setId, 'mirror-1');

  const splitStrips = [strip('a', 4), strip('b', 4)];
  const splitWiring = {
    ...makeDefaultWiring(splitStrips),
    outputs: [{ id: 'o1', pin: 16, runIds: ['a1', 'b'] }, { id: 'o2', pin: 17, runIds: ['a2'] }],
    runs: [
      { id: 'a1', type: 'strip', source: { stripId: 'a', from: 0, to: 1 } },
      { id: 'a2', type: 'strip', source: { stripId: 'a', from: 2, to: 3 } },
      { id: 'b', type: 'strip', source: { stripId: 'b', from: 0, to: 3 } },
    ],
  };
  const split = compileWiring({ wiring: splitWiring, strips: splitStrips, mirrorSets: [set('mirror-1', ['a', 'b'])] });
  assert.equal(split.ok, true);
  assert.deepEqual(split.zones.map(zone => zone.id), ['a', 'b']);
  assert.ok(split.warnings.some(warning => warning.code === 'mirror-set-ignored'));
});

test('a 2-way set produces a smaller card config than the same strips unmirrored', () => {
  const { strips, wiring, patchBoard } = project(['a', 'b'], { a: 8, b: 8 });
  const build = mirrorSets => buildCardRuntimePackageFromProject({
    projectName: 'Mirror', strips, wiring, patchBoard, mirrorSets,
    standaloneController: { defaultLook: { patternId: 'aurora' } },
  }).config;
  const plain = build([]);
  const mirrored = build([set('mirror-1', ['a', 'b'])]);
  assert.equal(plain.zones.length, 2);
  assert.equal(mirrored.zones.length, 1);
  assert.deepEqual(mirrored.zones[0].ranges, [{ start: 0, count: 8 }, { start: 8, count: 8 }]);
  assert.ok(JSON.stringify(mirrored).length < JSON.stringify(plain).length,
    `${JSON.stringify(mirrored).length} should be smaller than ${JSON.stringify(plain).length}`);
});

// ── the pure operations ───────────────────────────────────────────────────

test('addMirrorMembers creates a set led by the chosen strip, then extends it', () => {
  const created = addMirrorMembers([], 'a', ['b', 'c', 'a', 'b']);
  assert.deepEqual(created, [{ id: 'mirror-1', name: '', members: ['a', 'b', 'c'] }]);
  const extended = addMirrorMembers(created, 'b', ['d']);
  assert.deepEqual(extended[0].members, ['a', 'b', 'c', 'd']);
  assert.equal(addMirrorMembers(extended, 'a', ['e', 'f', 'g', 'h'])[0].members.length, 6);
  assert.deepEqual(addMirrorMembers([], 'a', []), []);
  assert.equal(mirrorSetForStrip(extended, 'd').id, 'mirror-1');
  assert.equal(mirrorSetForStrip(extended, 'zzz'), null);
});

test('a strip added to a second set leaves its first set, which dissolves below two', () => {
  const first = addMirrorMembers([], 'a', ['b']);
  const moved = addMirrorMembers(first, 'c', ['b']);
  assert.deepEqual(moved.map(entry => entry.members), [['c', 'b']]);
});

test('removeMirrorMember dissolves a set left with one strip', () => {
  const three = [set('mirror-1', ['a', 'b', 'c'])];
  assert.deepEqual(removeMirrorMember(three, 'a')[0].members, ['b', 'c']);
  assert.deepEqual(removeMirrorMember(removeMirrorMember(three, 'a'), 'b'), []);
  assert.deepEqual(removeMirrorMember(three, 'zzz'), three);
});

test('renameMirrorSet and remapMirrorSetStripIds are pure', () => {
  const original = [set('mirror-1', ['a', 'b'], 'Wings')];
  const renamed = renameMirrorSet(original, 'mirror-1', '  Arms ');
  assert.equal(renamed[0].name, 'Arms');
  assert.equal(original[0].name, 'Wings');
  const remapped = remapMirrorSetStripIds(original, new Map([['a', 'strip-1']]));
  assert.deepEqual(remapped[0].members, ['strip-1', 'b']);
  assert.deepEqual(original[0].members, ['a', 'b']);
});

test('normalizeMirrorSets keeps good sets and drops sets that cannot hold together', () => {
  const normalized = normalizeMirrorSets([
    set('m1', ['a', 'b', 'a']),
    set('m2', ['b', 'c']),
    set('m3', ['x']),
    { id: '', members: ['p', 'q'] },
    null,
  ]);
  assert.deepEqual(normalized, [{ id: 'm1', name: '', members: ['a', 'b'] }]);
  assert.deepEqual(normalizeMirrorSets(undefined), []);
  assert.deepEqual(
    normalizeMirrorSets([set('m1', ['a', 'b', 'gone'])], { strips: [{ id: 'a' }, { id: 'b' }] })[0].members,
    ['a', 'b'],
  );
  assert.deepEqual(normalizeMirrorSets([set('m1', ['a', 'gone'])], { strips: [{ id: 'a' }] }), []);
});

// ── persistence ───────────────────────────────────────────────────────────

const savedProject = (layout = {}) => ({
  version: 3,
  id: 'project-1',
  name: 'Wings',
  layout: {
    strips: [strip('strip-1', 4), strip('strip-2', 4), strip('strip-3', 4)],
    viewBox: '0 0 640 400',
    ...layout,
  },
});

test('mirrorSets round-trips through migrateProject and survives a second pass', () => {
  const sets = [set('mirror-1', ['strip-1', 'strip-3'], 'Wings')];
  const once = migrateProject(savedProject({ mirrorSets: sets }));
  assert.deepEqual(once.layout.mirrorSets, sets);
  const twice = migrateProject(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice.layout.mirrorSets, sets);
  assert.deepEqual(migrateProject(savedProject()).layout.mirrorSets, []);
});

test('a saved set with a missing, grouped or kaleidoscope member is dropped on load', () => {
  const dropped = migrateProject(savedProject({ mirrorSets: [set('mirror-1', ['strip-1', 'strip-9'])] }));
  assert.deepEqual(dropped.layout.mirrorSets, []);
  const grouped = migrateProject(savedProject({
    layerGroups: [{ groupId: 'g', members: [{ type: 'strip', stripId: 'strip-2' }] }],
    mirrorSets: [set('mirror-1', ['strip-1', 'strip-2'])],
  }));
  assert.deepEqual(grouped.layout.mirrorSets, []);
});

test('the strip id remap in migrateStripIdNamespace carries mirror set members', () => {
  const legacy = {
    layout: {
      strips: [strip('layer-left', 4), strip('layer-right', 4)],
      mirrorSets: [set('mirror-1', ['layer-left', 'layer-right'])],
    },
  };
  migrateStripIdNamespace(legacy);
  const ids = legacy.layout.strips.map(item => item.id);
  assert.deepEqual(ids, ['strip-1', 'strip-2']);
  assert.deepEqual(legacy.layout.mirrorSets[0].members, ids);
});

// ── the Layout reducer ────────────────────────────────────────────────────

function layoutState(ids = ['strip-1', 'strip-2', 'strip-3']) {
  return createLayoutState({ strips: ids.map(id => strip(id, 4)), mirrorSets: [] });
}

test('SET_MIRROR_SETS stores the normalized array, both action spellings, and undo restores it', () => {
  const sets = [set('mirror-1', ['strip-1', 'strip-2'])];
  const state = layoutReducer(layoutState(), layoutActions.setMirrorSets(sets));
  assert.deepEqual(state.mirrorSets, sets);
  const alias = layoutReducer(layoutState(), { type: 'SET_MIRROR_SETS', mirrorSets: sets });
  assert.deepEqual(alias.mirrorSets, sets);
  assert.deepEqual(layoutReducer(layoutState(), { type: 'SET_MIRROR_SETS', mirrorSets: [set('m', ['strip-1', 'ghost'])] }).mirrorSets, []);

  const committed = commitLayout(createLayoutHistory(), layoutState(), layoutActions.setMirrorSets(sets));
  assert.deepEqual(committed.state.mirrorSets, sets);
  const undone = undoLayout(committed.history, committed.state);
  assert.deepEqual(undone.state.mirrorSets, []);
  assert.deepEqual(makeLayoutSnapshot(committed.state).mirrorSets, sets);
});

test('removing or merging a strip removes it from its set; duplicating never copies membership', () => {
  const start = layoutReducer(layoutState(), layoutActions.setMirrorSets([set('mirror-1', ['strip-1', 'strip-2', 'strip-3'])]));
  assert.deepEqual(layoutReducer(start, layoutActions.removeStrip('strip-1')).mirrorSets[0].members, ['strip-2', 'strip-3']);
  assert.deepEqual(layoutReducer(layoutReducer(start, layoutActions.removeStrip('strip-1')), layoutActions.removeStrip('strip-2')).mirrorSets, []);
  const duplicated = layoutReducer(start, layoutActions.duplicateStrip('strip-1'));
  assert.deepEqual(duplicated.mirrorSets, start.mirrorSets);
  assert.equal(duplicated.strips.length, 4);
});

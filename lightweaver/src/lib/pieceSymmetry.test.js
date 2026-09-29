import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { assertCardSymmetrySupport } from './cardPushClient.js';
import { normalizeCardProjectEvidence } from './cardIdentity.js';
import { buildCardRuntimeConfig } from './cardRuntimeContract.js';
import { prepareCardStoragePayload } from './cardStoragePayload.js';
import { makeComboPlaylistItem } from './cardPlaylist.js';
import { migrateProject, migrateStripIdNamespace } from './projectModel.js';
import { createDefaultPatchBoard } from './patchBoard.js';
import { applyLookToPatchBoard, deriveSectionTargets, normalizeSavedLooks, saveCurrentLookToController } from './sectionLookModel.js';
import { compileWiring } from './wiringCompiler.js';
import { makeDefaultWiring } from './wiringModel.js';
import {
  migrateMirrorSetsToSymmetry,
  moveStripToSide,
  normalizeSymmetry,
  remapSymmetryStripIds,
  reorderSide,
  setSymmetryFold,
  sideFlipped,
  sideOfStrip,
  validateSymmetry,
} from './pieceSymmetry.js';
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
  pixels: Array.from({ length: pixelCount }, (_, index) => ({ x: index, y: 0 })),
  ...extra,
});
const codes = result => result.errors.map(error => error.code);

function project(ids, counts = {}, extra = {}) {
  const strips = ids.map(id => strip(id, counts[id] ?? 4, extra[id]));
  return { strips, wiring: makeDefaultWiring(strips), patchBoard: createDefaultPatchBoard(strips) };
}

const side = (id, stripIds, label = id) => ({ id, label, stripIds });
const twoSides = (a = ['a'], b = ['b']) => ({
  fold: 2,
  orientation: 'mirror',
  sides: [side('side-1', a, 'Left side'), side('side-2', b, 'Right side')],
});
const fourSides = (groups = [['a'], ['b'], ['c'], ['d']], orientation = 'same') => ({
  fold: 4,
  orientation,
  sides: groups.map((stripIds, index) => side(`side-${index + 1}`, stripIds, `Side ${index + 1}`)),
});

// ── validation: every code turns red on its own input ─────────────────────

test('a clean two-side symmetry validates', () => {
  const { strips, wiring } = project(['a', 'b']);
  assert.deepEqual(validateSymmetry(twoSides(), strips, wiring), { ok: true, errors: [] });
  assert.deepEqual(validateSymmetry(null, strips, wiring), { ok: true, errors: [] });
});

test('symmetry-fold: only 2 and 4 are refused otherwise', () => {
  const { strips, wiring } = project(['a', 'b', 'c']);
  const three = { fold: 3, orientation: 'same', sides: [side('side-1', ['a']), side('side-2', ['b']), side('side-3', ['c'])] };
  assert.ok(codes(validateSymmetry(three, strips, wiring)).includes('symmetry-fold'));
});

test('symmetry-side-count: fold 4 with two sides is refused', () => {
  const { strips, wiring } = project(['a', 'b']);
  const bad = { ...twoSides(), fold: 4 };
  assert.ok(codes(validateSymmetry(bad, strips, wiring)).includes('symmetry-side-count'));
});

test('symmetry-strip-missing: a strip that is not in the project is refused', () => {
  const { strips, wiring } = project(['a', 'b']);
  const result = validateSymmetry(twoSides(['a'], ['ghost']), strips, wiring);
  assert.ok(codes(result).includes('symmetry-strip-missing'));
  const error = result.errors.find(item => item.code === 'symmetry-strip-missing');
  assert.equal(error.stripId, 'ghost');
  assert.equal(error.sideId, 'side-2');
});

test('symmetry-strip-twice: a strip cannot sit in two sides', () => {
  const { strips, wiring } = project(['a', 'b']);
  const result = validateSymmetry(twoSides(['a', 'b'], ['b']), strips, wiring);
  assert.ok(codes(result).includes('symmetry-strip-twice'));
  assert.equal(result.errors.find(item => item.code === 'symmetry-strip-twice').stripId, 'b');
});

test('symmetry-strip-kaleidoscope: a strip with Kaleidoscope on cannot be in a side', () => {
  const { strips, wiring } = project(['a', 'b']);
  strips[1] = { ...strips[1], kaleidoscope: { enabled: true } };
  const result = validateSymmetry(twoSides(), strips, wiring);
  assert.ok(codes(result).includes('symmetry-strip-kaleidoscope'));
  assert.equal(result.errors.find(item => item.code === 'symmetry-strip-kaleidoscope').stripId, 'b');
});

test('symmetry-strip-split: a strip wired as two runs must be joined first', () => {
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
  const result = validateSymmetry(twoSides(), strips, wiring);
  assert.deepEqual(codes(result), ['symmetry-strip-split']);
  assert.equal(result.errors[0].stripId, 'a');
  assert.match(result.errors[0].message, /Join .*wiring into one run first/);
});

test('symmetry-side-empty: a side with no strip is refused', () => {
  const { strips, wiring } = project(['a', 'b']);
  const result = validateSymmetry(twoSides(['a', 'b'], []), strips, wiring);
  assert.deepEqual(codes(result), ['symmetry-side-empty']);
  assert.equal(result.errors[0].sideId, 'side-2');
});

// ── compile ───────────────────────────────────────────────────────────────

test('two sides compile to two continuous zones, ranges in stripIds order', () => {
  const { strips, wiring } = project(['a', 'b', 'c', 'd'], { a: 4, b: 5, c: 6, d: 3 });
  const symmetry = twoSides(['c', 'a'], ['d', 'b']);
  const compiled = compileWiring({ wiring, strips, symmetry });
  assert.equal(compiled.ok, true);
  assert.deepEqual(compiled.zones.map(zone => zone.id), ['side-1', 'side-2']);
  const [one, two] = compiled.zones;
  assert.equal(one.label, 'Left side');
  assert.equal(one.continuous, true);
  assert.equal(two.continuous, true);
  // wiring order is a(0-3) b(4-8) c(9-14) d(15-17); side order is c then a, d then b
  assert.deepEqual(one.ranges, [{ start: 9, count: 6 }, { start: 0, count: 4 }]);
  assert.deepEqual(two.ranges, [{ start: 15, count: 3 }, { start: 4, count: 5 }]);
  assert.equal(compiled.symmetry.fold, 2);
});

test('four sides compile to four continuous zones and strips on their own compile as before', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const { strips, wiring } = project(ids);
  const symmetry = fourSides([['a', 'b'], ['c'], ['d'], ['e']]);
  const compiled = compileWiring({ wiring, strips, symmetry });
  assert.equal(compiled.ok, true);
  assert.deepEqual(compiled.zones.map(zone => zone.id), ['side-1', 'side-2', 'side-3', 'side-4', 'f']);
  assert.deepEqual(compiled.zones.map(zone => zone.continuous === true), [true, true, true, true, false]);
  assert.deepEqual(compiled.zones[0].ranges, [{ start: 0, count: 4 }, { start: 4, count: 4 }]);
  const own = compiled.zones.find(zone => zone.id === 'f');
  assert.deepEqual(Object.keys(own).sort(), ['id', 'label', 'ranges']);
});

test('neighbouring strips of one side never fuse even when their LED numbers run on', () => {
  const three = [strip('a', 1), strip('b', 4), strip('c', 3)];
  const wiring3 = { ...makeDefaultWiring(three), outputs: [{ id: 'o1', pin: 16, runIds: ['a', 'b', 'c'] }],
    runs: [
      { id: 'a', type: 'strip', source: { stripId: 'a', from: 0, to: 0 } },
      { id: 'b', type: 'strip', source: { stripId: 'b', from: 1, to: 3 } },
      { id: 'c', type: 'strip', source: { stripId: 'c', from: 0, to: 2 } },
    ] };
  const ok = compileWiring({ wiring: wiring3, strips: three, symmetry: twoSides(['a', 'b'], ['c']) });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.zones[0].ranges, [{ start: 0, count: 1 }, { start: 1, count: 3 }]);
});

test('a symmetry that breaks a rule is left out with a warning, never blocking the project', () => {
  const { strips, wiring } = project(['a', 'b']);
  const layerGroups = [{ groupId: 'g', members: [{ type: 'strip', stripId: 'b' }, { type: 'strip', stripId: 'a' }] }];
  const grouped = compileWiring({ wiring, strips, groups: layerGroups, symmetry: twoSides() });
  assert.equal(grouped.ok, true);
  assert.deepEqual(grouped.zones.map(zone => zone.id), ['g']);
  assert.ok(grouped.warnings.some(warning => warning.code === 'symmetry-ignored'));
  assert.equal(grouped.symmetry, null);

  const missing = compileWiring({ wiring, strips, symmetry: twoSides(['a'], ['ghost']) });
  assert.equal(missing.ok, true);
  assert.deepEqual(missing.zones.map(zone => zone.id), ['a', 'b']);
  assert.ok(missing.warnings.some(warning => warning.code === 'symmetry-ignored'));

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
  const split = compileWiring({ wiring: splitWiring, strips: splitStrips, symmetry: twoSides() });
  assert.equal(split.ok, true);
  assert.deepEqual(split.zones.map(zone => zone.id), ['a', 'b']);
  assert.ok(split.warnings.some(warning => warning.code === 'symmetry-ignored'));
});

test('a side needing more wiring runs than one zone holds is ignored, not blocking', () => {
  const strips = [strip('a', 4), strip('b', 4), strip('c', 4), strip('d', 4), strip('e', 4), strip('f', 4), strip('g', 4), strip('h', 4)];
  const ids = strips.map(item => item.id);
  const runs = ids.map(id => ({ id: `r-${id}`, type: 'strip', source: { stripId: id, from: 0, to: 3 } }));
  const wiring = {
    ...makeDefaultWiring(strips),
    outputs: [{ id: 'o1', pin: 16, runIds: runs.slice(0, 4).map(run => run.id) }, { id: 'o2', pin: 17, runIds: runs.slice(4).map(run => run.id) }],
    runs,
  };
  // side 1 holds seven separate strips: seven ranges is more than a zone holds
  const symmetry = twoSides(ids.slice(0, 7), ['h']);
  const compiled = compileWiring({ wiring, strips, symmetry });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  assert.equal(compiled.symmetry, null);
  assert.ok(compiled.warnings.some(warning => warning.code === 'symmetry-ignored'));
});

// ── section targets ───────────────────────────────────────────────────────

test('mirrored sides derive one Both-sides target plus strips on their own', () => {
  const { strips, wiring, patchBoard } = project(['a', 'b', 'c']);
  const symmetry = twoSides(['a'], ['b']);
  const targets = deriveSectionTargets({ strips, patchBoard, wiring, symmetry, sidesMirrored: true, defaultLook: { patternId: 'aurora' } });
  const sections = targets.filter(target => target.kind === 'section');
  const patchIdOfC = patchBoard.patches.find(patch => patch.source.stripId === 'c').id;
  assert.deepEqual(sections.map(target => target.id), ['side-1', patchIdOfC]);
  const both = sections[0];
  assert.equal(both.zoneId, 'side-1');
  assert.equal(both.label, 'Both sides, mirrored');
  assert.deepEqual(both.mirroredSides, ['side-2']);
  assert.equal(both.pixelCount, 4);
  assert.equal(sections[1].zoneId, 'c');
});

test('own sides derive one target per side, labelled by side', () => {
  const { strips, wiring, patchBoard } = project(['a', 'b', 'c', 'd', 'e']);
  const symmetry = fourSides([['a'], ['b'], ['c'], ['d']]);
  const targets = deriveSectionTargets({ strips, patchBoard, wiring, symmetry, sidesMirrored: false, defaultLook: { patternId: 'aurora' } });
  const sections = targets.filter(target => target.kind === 'section');
  assert.deepEqual(sections.slice(0, 4).map(target => [target.id, target.zoneId, target.label]), [
    ['side-1', 'side-1', 'Side 1'], ['side-2', 'side-2', 'Side 2'], ['side-3', 'side-3', 'Side 3'], ['side-4', 'side-4', 'Side 4'],
  ]);
  assert.equal(sections.length, 5);
  assert.equal(sections.some(target => target.mirroredSides), false);
  // four sides mirrored: one target that lists the three others
  const mirrored = deriveSectionTargets({ strips, patchBoard, wiring, symmetry, sidesMirrored: true }).filter(target => target.kind === 'section');
  assert.deepEqual(mirrored[0].mirroredSides, ['side-2', 'side-3', 'side-4']);
});

test('a symmetry the compiler ignored contributes no side targets', () => {
  const { strips, wiring, patchBoard } = project(['a', 'b']);
  const targets = deriveSectionTargets({ strips, patchBoard, wiring, symmetry: twoSides(['a'], ['ghost']) });
  assert.equal(targets.some(target => /^side-/.test(target.id)), false);
  assert.equal(targets.filter(target => target.kind === 'section').length, 2);
});

test('a look written to a side lands on every strip of that side, or of every side when mirrored', () => {
  const { strips, patchBoard } = project(['a', 'b', 'c']);
  const symmetry = twoSides(['a'], ['b']);
  const playbackOf = (board, stripId) => board.patches.find(patch => patch.source.stripId === stripId).playback?.patternId;
  const mirrored = applyLookToPatchBoard({ patchBoard, strips, targetId: 'side-1', look: { patternId: 'ember' }, symmetry, sidesMirrored: true });
  assert.deepEqual(['a', 'b', 'c'].map(id => playbackOf(mirrored, id)), ['ember', 'ember', null]);
  const own = applyLookToPatchBoard({ patchBoard, strips, targetId: 'side-2', look: { patternId: 'ember' }, symmetry, sidesMirrored: false });
  assert.deepEqual(['a', 'b', 'c'].map(id => playbackOf(own, id)), [null, 'ember', null]);
});

test('saved looks keep sidesMirrored and default to true on a piece with sides', () => {
  const kept = normalizeSavedLooks([{ id: 'x', sidesMirrored: false }, { id: 'y', sidesMirrored: true }, { id: 'z', sidesMirrored: 'yes' }]);
  assert.deepEqual(kept.map(look => look.sidesMirrored), [false, true, undefined]);
  const withSides = saveCurrentLookToController({}, { label: 'One', symmetry: twoSides() });
  assert.equal(withSides.looks[0].sidesMirrored, true);
  const explicit = saveCurrentLookToController({}, { label: 'Two', symmetry: twoSides(), sidesMirrored: false });
  assert.equal(explicit.looks[0].sidesMirrored, false);
  const none = saveCurrentLookToController({}, { label: 'Three' });
  assert.equal(Object.hasOwn(none.looks[0], 'sidesMirrored'), false);
});

test('saving a second look keeps the first look\'s sidesMirrored choice', () => {
  const first = saveCurrentLookToController({}, { label: 'Own sides', symmetry: twoSides(), sidesMirrored: false });
  const second = saveCurrentLookToController(first, { label: 'Mirrored', symmetry: twoSides(), sidesMirrored: true });
  assert.deepEqual(second.looks.map(look => [look.label, look.sidesMirrored]), [['Own sides', false], ['Mirrored', true]]);
  // updating a look in place with no explicit choice on a sided piece defaults it to mirrored,
  // but the untouched look is unchanged
  const updated = saveCurrentLookToController(second, { label: 'Mirrored', lookId: second.looks[1].id, symmetry: twoSides() });
  assert.deepEqual(updated.looks.map(look => look.sidesMirrored), [false, true]);
});

// ── card config ───────────────────────────────────────────────────────────

const zoneById = (config, id) => config.zones.find(zone => zone.id === id);
const build = (fixture, { symmetry, sidesMirrored = true, standaloneController = { defaultLook: { patternId: 'aurora' } } } = {}) => (
  buildCardRuntimePackageFromProject({
    projectName: 'Sides', ...fixture, symmetry, sidesMirrored, standaloneController,
  }).config
);

test('mirrored live state emits mirrorOf and the flip rule; continuous is on every side zone', () => {
  const fixture = project(['a', 'b', 'c', 'd'], { a: 8, b: 8, c: 8, d: 8 });
  const two = build(fixture, { symmetry: twoSides(['a'], ['b']) });
  assert.deepEqual(two.zones.map(zone => [zone.id, zone.continuous === true, zone.mirrorOf, zone.mirrorFlip]), [
    ['side-1', true, undefined, undefined],
    ['side-2', true, 'side-1', true],
    ['c', false, undefined, undefined],
    ['d', false, undefined, undefined],
  ]);
  // four sides, 'same': nobody flips; 'mirror': sides 2 and 4 (index 1, 3) flip
  const same = build(fixture, { symmetry: fourSides([['a'], ['b'], ['c'], ['d']], 'same') });
  assert.deepEqual(same.zones.filter(zone => zone.mirrorOf).map(zone => [zone.id, zone.mirrorOf, zone.mirrorFlip]), [
    ['side-2', 'side-1', false], ['side-3', 'side-1', false], ['side-4', 'side-1', false],
  ]);
  const mirror = build(fixture, { symmetry: fourSides([['a'], ['b'], ['c'], ['d']], 'mirror') });
  assert.deepEqual(mirror.zones.filter(zone => zone.mirrorOf).map(zone => [zone.id, zone.mirrorFlip]), [
    ['side-2', true], ['side-3', false], ['side-4', true],
  ]);
  assert.equal(sideFlipped(fourSides([['a'], ['b'], ['c'], ['d']], 'mirror'), 3), true);
  assert.equal(sideFlipped(fourSides([['a'], ['b'], ['c'], ['d']], 'same'), 3), false);
});

test('own live state emits no mirrorOf but zones stay continuous', () => {
  const fixture = project(['a', 'b']);
  const config = build(fixture, { symmetry: twoSides(['a'], ['b']), sidesMirrored: false });
  assert.deepEqual(config.zones.map(zone => [zone.id, zone.continuous === true, zone.mirrorOf]), [
    ['side-1', true, undefined], ['side-2', true, undefined],
  ]);
});

test('a piece with no symmetry produces the config it always did', () => {
  const fixture = project(['a', 'b']);
  const config = build(fixture, { symmetry: null });
  assert.equal(config.zones.some(zone => 'continuous' in zone || 'mirrorOf' in zone || 'mirrorFlip' in zone), false);
});

test('each saved look carries its own mirroring into looks[].zones[]', () => {
  const fixture = project(['a', 'b', 'c'], { a: 8, b: 8, c: 8 });
  const symmetry = twoSides(['a'], ['b']);
  const looks = [
    { id: 'look-mirror', label: 'Mirror', sectionSnapshotVersion: 1, sidesMirrored: true,
      defaultLook: { patternId: 'aurora' }, sectionLooks: { 'side-1': { patternId: 'ember' }, c: { patternId: 'aurora' } } },
    { id: 'look-own', label: 'Own', sectionSnapshotVersion: 1, sidesMirrored: false,
      defaultLook: { patternId: 'aurora' }, sectionLooks: { 'side-1': { patternId: 'ember' }, 'side-2': { patternId: 'aurora' }, c: { patternId: 'aurora' } } },
  ];
  // a saved look's section keys are patch ids for strips on their own
  const patchIdOfC = fixture.patchBoard.patches.find(patch => patch.source.stripId === 'c').id;
  for (const look of looks) {
    look.sectionLooks[patchIdOfC] = look.sectionLooks.c;
    delete look.sectionLooks.c;
  }
  const standaloneController = {
    defaultLook: { patternId: 'aurora' },
    looks,
    playlist: looks.map(makeComboPlaylistItem),
  };
  const config = build(fixture, { symmetry, standaloneController });
  const mirrorLook = config.looks.find(look => look.id === 'combo-look-mirror');
  const ownLook = config.looks.find(look => look.id === 'combo-look-own');
  assert.deepEqual(mirrorLook.zones.map(zone => [zone.id, zone.mirrorOf, zone.mirrorFlip]), [
    ['side-1', undefined, undefined], ['side-2', 'side-1', true], ['c', undefined, undefined],
  ]);
  assert.deepEqual(ownLook.zones.map(zone => [zone.id, zone.mirrorOf]), [
    ['side-1', undefined], ['side-2', undefined], ['c', undefined],
  ]);
  // the mirrored look shows side 1's pattern on both sides; the own look keeps each side's
  assert.equal(mirrorLook.zones[0].patternId, 'ember');
  assert.equal(mirrorLook.zones[1].patternId, 'ember');
  assert.equal(ownLook.zones[0].patternId, 'ember');
  assert.equal(ownLook.zones[1].patternId, 'aurora');
  // look zones never carry `continuous`; that belongs to the live layout
  assert.equal(config.looks.flatMap(look => look.zones || []).some(zone => 'continuous' in zone), false);
});

test('a four-side project with mirrored and own looks stays inside the 3968-byte card budget', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const fixture = project(ids, { a: 12, b: 12, c: 12, d: 12 });
  const symmetry = fourSides(ids.map(id => [id]), 'mirror');
  const looks = ['one', 'two', 'three', 'four'].map((name, index) => ({
    id: `look-${name}`, label: name, sectionSnapshotVersion: 1, sidesMirrored: index % 2 === 0,
    defaultLook: { patternId: 'aurora' },
    sectionLooks: index % 2 === 0
      ? { 'side-1': { patternId: 'ember' } }
      : { 'side-1': { patternId: 'ember' }, 'side-2': { patternId: 'aurora' }, 'side-3': { patternId: 'ember' }, 'side-4': { patternId: 'aurora' } },
  }));
  const runtimePackage = buildCardRuntimePackageFromProject({
    projectName: 'Four sides', ...fixture, symmetry, sidesMirrored: true,
    standaloneController: { defaultLook: { patternId: 'aurora' }, looks, playlist: looks.map(makeComboPlaylistItem) },
  });
  const payload = prepareCardStoragePayload(runtimePackage);
  assert.ok(payload.bytes <= 3968, `${payload.bytes} bytes`);
});

test('a mirror pointing at a zone that does not play for itself is refused before it reaches the card', () => {
  const fixture = project(['a', 'b']);
  const runtimePackage = buildCardRuntimePackageFromProject({ projectName: 'X', ...fixture, symmetry: twoSides(), standaloneController: {} });
  const zones = runtimePackage.config.zones.map(zone => (zone.id === 'side-1' ? { ...zone, mirrorOf: 'side-2' } : zone));
  assert.throws(() => buildCardRuntimeConfig({ projectName: 'X', led: { pixels: 8 }, zones }), /mirrors side-2/);
});

// ── capability gate ───────────────────────────────────────────────────────

test('assertCardSymmetrySupport refuses a sides config on a card without the capability', () => {
  const fixture = project(['a', 'b']);
  const sidesPackage = buildCardRuntimePackageFromProject({ projectName: 'X', ...fixture, symmetry: twoSides(), standaloneController: {} });
  const plainPackage = buildCardRuntimePackageFromProject({ projectName: 'X', ...fixture, symmetry: null, standaloneController: {} });
  for (const evidence of [null, {}, { capabilities: {} }, { capabilities: { symmetrySides: 0 } }]) {
    assert.throws(
      () => assertCardSymmetrySupport(sidesPackage, evidence),
      error => error?.reason === 'symmetry-unsupported' && error.message === 'Update this card to play mirrored sides.',
    );
    assert.equal(assertCardSymmetrySupport(plainPackage, evidence), true);
  }
  assert.equal(assertCardSymmetrySupport(sidesPackage, { capabilities: { symmetrySides: 1 } }), true);
});

test('a look-only mirror (own live state, mirrored look) still needs the capability', () => {
  const fixture = project(['a', 'b']);
  const looks = [{ id: 'look-m', label: 'M', sectionSnapshotVersion: 1, sidesMirrored: true, defaultLook: { patternId: 'aurora' }, sectionLooks: { 'side-1': { patternId: 'ember' } } }];
  const runtimePackage = buildCardRuntimePackageFromProject({
    projectName: 'X', ...fixture, symmetry: twoSides(), sidesMirrored: false,
    standaloneController: { looks, playlist: looks.map(makeComboPlaylistItem) },
  });
  assert.throws(() => assertCardSymmetrySupport(runtimePackage, { capabilities: {} }), /Update this card/);
});

test('card evidence keeps the symmetrySides capability key', () => {
  const evidence = normalizeCardProjectEvidence({
    app: 'Lightweaver',
    cardId: 'lw-aabbccddeeff',
    firmwareVersion: '1.2.0',
    buildId: 'build-1',
    projectRevision: 1,
    projectFingerprint: 'a'.repeat(16),
    capabilities: { symmetrySides: 1 },
  });
  assert.equal(evidence.capabilities.symmetrySides, 1);
  const old = normalizeCardProjectEvidence({
    app: 'Lightweaver', cardId: 'lw-aabbccddeeff', firmwareVersion: '1.1.47', buildId: 'build-1',
    projectRevision: 1, projectFingerprint: 'a'.repeat(16), capabilities: { symmetrySides: 0 },
  });
  assert.equal(old.capabilities.symmetrySides, 0);
});

// ── the pure operations ───────────────────────────────────────────────────

test('setSymmetryFold: None clears, 2 and 4 make that many sides, a suggestion places strips', () => {
  const { strips } = project(['a', 'b', 'c', 'd'], {}, { c: { offsetX: 50 }, d: { offsetX: 50 } });
  assert.equal(setSymmetryFold(null, 0, strips), null);
  assert.equal(setSymmetryFold(twoSides(), 0, strips), null);
  const four = setSymmetryFold(null, 4, strips);
  assert.equal(four.fold, 4);
  assert.equal(four.orientation, 'same');
  assert.deepEqual(four.sides.map(item => item.stripIds), [['a'], ['b'], ['c'], ['d']]);
  const two = setSymmetryFold(null, 2, strips, { sides: [['c', 'd'], ['a', 'b']] });
  assert.equal(two.orientation, 'mirror');
  // side 1 is the left one: a and b sit left of c and d
  assert.deepEqual(two.sides.map(item => [item.id, item.label, item.stripIds]), [
    ['side-1', 'Left side', ['a', 'b']], ['side-2', 'Right side', ['c', 'd']],
  ]);
  const vertical = project(['a', 'b'], {}, { b: { offsetY: 40 } }).strips;
  assert.deepEqual(setSymmetryFold(null, 2, vertical, { sides: [['b'], ['a']] }).sides.map(item => item.label), ['Top side', 'Bottom side']);
  // same fold with no suggestion keeps what is there
  const kept = twoSides(['b'], ['a']);
  assert.equal(setSymmetryFold(kept, 2, strips), kept);
});

test('moveStripToSide moves, reorders and frees a strip; reorderSide sets flow order', () => {
  const start = twoSides(['a', 'b'], ['c']);
  const moved = moveStripToSide(start, 'b', 'side-2', 0);
  assert.deepEqual(moved.sides.map(item => item.stripIds), [['a'], ['b', 'c']]);
  assert.deepEqual(start.sides.map(item => item.stripIds), [['a', 'b'], ['c']]);
  const freed = moveStripToSide(start, 'a', null);
  assert.deepEqual(freed.sides.map(item => item.stripIds), [['b'], ['c']]);
  assert.equal(sideOfStrip(freed, 'a'), null);
  assert.equal(sideOfStrip(freed, 'c'), 'side-2');
  assert.equal(moveStripToSide(start, 'a', 'side-9'), start);
  const reordered = reorderSide(twoSides(['a', 'b', 'c'], ['d']), 'side-1', ['c', 'a']);
  assert.deepEqual(reordered.sides[0].stripIds, ['c', 'a', 'b']);
});

test('normalizeSymmetry cleans shape, keeps empty sides, and prunes strips that are gone', () => {
  assert.equal(normalizeSymmetry(null), null);
  assert.equal(normalizeSymmetry({ fold: 3, sides: [] }), null);
  const cleaned = normalizeSymmetry({ fold: 2, sides: [{ stripIds: ['a', 'a', ' b '] }, { stripIds: ['b', 'c'] }] });
  assert.deepEqual(cleaned, {
    fold: 2,
    orientation: 'mirror',
    sides: [side('side-1', ['a', 'b'], 'Side 1'), side('side-2', ['c'], 'Side 2')],
  });
  const pruned = normalizeSymmetry(twoSides(['a', 'gone'], ['b']), [{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(pruned.sides.map(item => item.stripIds), [['a'], ['b']]);
  const emptied = normalizeSymmetry(twoSides(['gone'], ['b']), [{ id: 'b' }]);
  assert.deepEqual(emptied.sides.map(item => item.stripIds), [[], ['b']]);
  assert.equal(normalizeSymmetry({ fold: 4, sides: [side('x', ['a'])] }).sides.length, 4);
});

// ── migration from v1 mirror sets ─────────────────────────────────────────

const mirrorSet = (id, members, name = '') => ({ id, name, members });

test('a v1 two-member mirror set becomes two sides, one strip each, in member order', () => {
  const { strips } = project(['a', 'b'], {}, { b: { offsetX: 50 } });
  const sym = migrateMirrorSetsToSymmetry([mirrorSet('mirror-1', ['b', 'a'], 'Wings')], strips);
  assert.equal(sym.fold, 2);
  assert.equal(sym.orientation, 'mirror');
  assert.deepEqual(sym.sides.map(item => item.stripIds), [['a'], ['b']]);
  assert.deepEqual(sym.sides.map(item => item.label), ['Left side', 'Right side']);
});

test('a v1 four-member set becomes four sides; anything else migrates to nothing', () => {
  const { strips } = project(['a', 'b', 'c', 'd', 'e', 'f']);
  const four = migrateMirrorSetsToSymmetry([mirrorSet('m', ['a', 'b', 'c', 'd'])], strips);
  assert.equal(four.fold, 4);
  assert.equal(four.orientation, 'same');
  assert.deepEqual(four.sides.map(item => item.stripIds), [['a'], ['b'], ['c'], ['d']]);
  assert.equal(migrateMirrorSetsToSymmetry([mirrorSet('m', ['a', 'b', 'c'])], strips), null);
  assert.equal(migrateMirrorSetsToSymmetry([mirrorSet('m', ['a', 'b', 'c', 'd', 'e', 'f'])], strips), null);
  assert.equal(migrateMirrorSetsToSymmetry([mirrorSet('m1', ['a', 'b']), mirrorSet('m2', ['c', 'd'])], strips), null);
  assert.equal(migrateMirrorSetsToSymmetry([], strips), null);
  assert.equal(migrateMirrorSetsToSymmetry(undefined, strips), null);
});

// ── persistence ───────────────────────────────────────────────────────────

const savedProject = (layout = {}, pattern = undefined) => ({
  version: 3,
  id: 'project-1',
  name: 'Wings',
  layout: {
    strips: [strip('strip-1', 4), strip('strip-2', 4), strip('strip-3', 4)],
    viewBox: '0 0 640 400',
    ...layout,
  },
  ...(pattern ? { pattern } : {}),
});

test('v1 mirrorSets migrate to symmetry on load and their contents are never carried forward', () => {
  const loaded = migrateProject(savedProject({ mirrorSets: [mirrorSet('mirror-1', ['strip-1', 'strip-3'])] }));
  assert.equal(loaded.layout.symmetry.fold, 2);
  assert.deepEqual(loaded.layout.symmetry.sides.map(item => item.stripIds), [['strip-1'], ['strip-3']]);
  // Only the empty tombstone survives (projectShapeGolden.test.js says why).
  assert.deepEqual(loaded.layout.mirrorSets, []);
  const again = migrateProject(JSON.parse(JSON.stringify(loaded)));
  assert.deepEqual(again.layout.symmetry, loaded.layout.symmetry);
  assert.deepEqual(again.layout.mirrorSets, []);
});

test('symmetry, the offer flag and pattern.sidesMirrored round-trip and default sensibly', () => {
  const symmetry = twoSides(['strip-1'], ['strip-2']);
  const once = migrateProject(savedProject({ symmetry, symmetryOfferDismissed: true }, { sidesMirrored: false }));
  assert.deepEqual(once.layout.symmetry, symmetry);
  assert.equal(once.layout.symmetryOfferDismissed, true);
  assert.equal(once.pattern.sidesMirrored, false);
  const twice = migrateProject(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice.layout.symmetry, symmetry);
  assert.equal(twice.pattern.sidesMirrored, false);
  // Defaults are absent, not written, so a project without symmetry keeps the
  // exact shape (and content hash) it had before symmetry existed.
  const fresh = migrateProject(savedProject());
  assert.equal(Object.hasOwn(fresh.layout, 'symmetry'), false);
  assert.equal(Object.hasOwn(fresh.layout, 'symmetryOfferDismissed'), false);
  assert.equal(Object.hasOwn(fresh.pattern, 'sidesMirrored'), false);
  assert.deepEqual(fresh.layout.mirrorSets, []);
  // Clearing symmetry and choosing mirrored again drops the keys on reload.
  const cleared = migrateProject({ ...JSON.parse(JSON.stringify(once)),
    layout: { ...once.layout, symmetry: null, symmetryOfferDismissed: false },
    pattern: { ...once.pattern, sidesMirrored: true } });
  assert.equal(Object.hasOwn(cleared.layout, 'symmetry'), false);
  assert.equal(Object.hasOwn(cleared.layout, 'symmetryOfferDismissed'), false);
  assert.equal(Object.hasOwn(cleared.pattern, 'sidesMirrored'), false);
});

test('a strip that no longer exists leaves its side on load', () => {
  const loaded = migrateProject(savedProject({ symmetry: twoSides(['strip-1', 'strip-9'], ['strip-2']) }));
  assert.deepEqual(loaded.layout.symmetry.sides.map(item => item.stripIds), [['strip-1'], ['strip-2']]);
});

test('remapSymmetryStripIds and the legacy strip id migration carry side members', () => {
  const remapped = remapSymmetryStripIds(twoSides(['a'], ['b']), new Map([['a', 'strip-1']]));
  assert.deepEqual(remapped.sides.map(item => item.stripIds), [['strip-1'], ['b']]);
  assert.deepEqual(remapSymmetryStripIds(twoSides(['a'], ['b']), { b: 'strip-2' }).sides[1].stripIds, ['strip-2']);
  const original = twoSides(['a'], ['b']);
  remapSymmetryStripIds(original, new Map([['a', 'z']]));
  assert.deepEqual(original.sides[0].stripIds, ['a']);

  const legacy = {
    layout: {
      strips: [strip('layer-left', 4), strip('layer-right', 4)],
      symmetry: twoSides(['layer-left'], ['layer-right']),
    },
  };
  migrateStripIdNamespace(legacy);
  const ids = legacy.layout.strips.map(item => item.id);
  assert.deepEqual(ids, ['strip-1', 'strip-2']);
  assert.deepEqual(legacy.layout.symmetry.sides.map(item => item.stripIds[0]), ids);
});

// ── the Layout reducer ────────────────────────────────────────────────────

function layoutState(ids = ['strip-1', 'strip-2', 'strip-3']) {
  return createLayoutState({ strips: ids.map(id => strip(id, 4)), symmetry: null });
}

test('SET_SYMMETRY stores the normalized value, both action spellings, and undo restores it', () => {
  const sym = twoSides(['strip-1'], ['strip-2']);
  const state = layoutReducer(layoutState(), layoutActions.setSymmetry(sym));
  assert.deepEqual(state.symmetry, sym);
  assert.deepEqual(layoutReducer(layoutState(), { type: 'SET_SYMMETRY', symmetry: sym }).symmetry, sym);
  assert.equal(layoutReducer(state, layoutActions.setSymmetry(null)).symmetry, null);
  assert.deepEqual(
    layoutReducer(layoutState(), layoutActions.setSymmetry(twoSides(['strip-1', 'ghost'], ['strip-2']))).symmetry.sides.map(item => item.stripIds),
    [['strip-1'], ['strip-2']],
  );
  const committed = commitLayout(createLayoutHistory(), layoutState(), layoutActions.setSymmetry(sym));
  assert.deepEqual(committed.state.symmetry, sym);
  const undone = undoLayout(committed.history, committed.state);
  assert.equal(undone.state.symmetry, null);
  assert.deepEqual(makeLayoutSnapshot(committed.state).symmetry, sym);
});

test('removing a strip removes it from its side; duplicating never copies membership', () => {
  const start = layoutReducer(layoutState(), layoutActions.setSymmetry(twoSides(['strip-1', 'strip-3'], ['strip-2'])));
  const removed = layoutReducer(start, layoutActions.removeStrip('strip-1'));
  assert.deepEqual(removed.symmetry.sides.map(item => item.stripIds), [['strip-3'], ['strip-2']]);
  const emptied = layoutReducer(removed, layoutActions.removeStrip('strip-2'));
  assert.deepEqual(emptied.symmetry.sides.map(item => item.stripIds), [['strip-3'], []]);
  const duplicated = layoutReducer(start, layoutActions.duplicateStrip('strip-1'));
  assert.deepEqual(duplicated.symmetry, start.symmetry);
  assert.equal(duplicated.strips.length, 4);
});

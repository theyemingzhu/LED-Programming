import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSectionFamily,
  familyGeometryStatus,
  moveSectionBoundary,
  normalizeSectionFamilies,
  reconcileSectionFamilyRuns,
  resizeSectionFamily,
} from './connectedSections.js';
import {
  applyLayoutSnapshot,
  createLayoutState,
  makeLayoutSnapshot,
} from '../state/layoutReducer.js';
import { migrateProject, migrateStripIdNamespace, PROJECT_VERSION } from './projectModel.js';

const strip = (id, name, pixelCount, pathData) => ({
  id,
  name,
  pixelCount,
  pathData,
  svgLength: pixelCount,
  pixels: Array.from({ length: pixelCount }, (_, index) => ({ x: index, y: 0 })),
  x: 4,
  y: 7,
  reversed: false,
  color: id === 'strip-1' ? '#f00' : '#0f0',
  patternId: id === 'strip-1' ? 'aurora' : 'candle',
});

test('connected family snapshot keeps the original path and stable member identity', () => {
  const source = strip('strip-1', 'Halo', 60, 'M0 0 L60 0');
  const members = [
    strip('strip-1', 'Halo 1', 20, 'part-a'),
    strip('strip-2', 'Halo 2', 40, 'part-b'),
  ];
  const family = createSectionFamily(source, members);

  assert.equal(family.parentId, 'strip-1');
  assert.equal(family.parentName, 'Halo');
  assert.equal(family.source.pathData, source.pathData);
  assert.deepEqual(family.memberIds, ['strip-1', 'strip-2']);
  assert.equal(familyGeometryStatus(family, members).ok, true);
});

test('moving a boundary conserves total and only redistributes adjacent sections', () => {
  assert.deepEqual(moveSectionBoundary([20, 40], 0, 25), [25, 35]);
  assert.deepEqual(moveSectionBoundary([10, 20, 30], 1, 35), [10, 25, 25]);
  assert.equal(moveSectionBoundary([20, 40], 0, 60), null);
  assert.equal(moveSectionBoundary([20, 40], 0, 25.5), null);
  assert.equal(moveSectionBoundary([20, 40], 0, Number.POSITIVE_INFINITY), null);
});

test('malformed persisted families are ignored without claiming legacy strips', () => {
  const members = [strip('strip-1', 'One', 20, 'a'), strip('strip-2', 'Two', 40, 'b')];
  const valid = createSectionFamily(strip('strip-1', 'Halo', 60, 'source'), members);
  const duplicateOwner = { ...valid, id: 'other-family' };
  const missingSource = { ...valid, id: 'missing-source', source: { ...valid.source, pathData: '' } };

  assert.deepEqual(normalizeSectionFamilies([valid, duplicateOwner, missingSource], members), [valid]);
  assert.deepEqual(normalizeSectionFamilies('bad', members), []);
});

test('family resize re-slices the original path and preserves member fields', () => {
  const source = strip('strip-1', 'Halo', 60, 'M0 0 L60 0');
  const members = [
    strip('strip-1', 'Warm centre', 20, 'old-a'),
    strip('strip-2', 'Cool edge', 40, 'old-b'),
  ];
  const family = createSectionFamily(source, members);
  const result = resizeSectionFamily({
    family,
    strips: members,
    counts: [25, 35],
    paths: ['new-a', 'new-b'],
    samplePixels: (member, count) => Array.from({ length: count }, (_, index) => ({ x: index, y: 1 })),
  });

  assert.deepEqual(result.strips.map(item => item.id), ['strip-1', 'strip-2']);
  assert.deepEqual(result.strips.map(item => item.name), ['Warm centre', 'Cool edge']);
  assert.deepEqual(result.strips.map(item => item.patternId), ['aurora', 'candle']);
  assert.deepEqual(result.strips.map(item => item.pixelCount), [25, 35]);
  assert.deepEqual(result.strips.map(item => item.pathData), ['new-a', 'new-b']);
  assert.equal(result.family.source.pathData, source.pathData);
  assert.equal(familyGeometryStatus(result.family, result.strips).ok, true);
});

test('family resize refuses geometry edited outside the connected editor', () => {
  const source = strip('strip-1', 'Halo', 60, 'M0 0 L60 0');
  const members = [strip('strip-1', 'Halo 1', 20, 'part-a'), strip('strip-2', 'Halo 2', 40, 'part-b')];
  const family = createSectionFamily(source, members);
  const moved = members.map((item, index) => index ? { ...item, x: item.x + 2 } : item);

  const result = resizeSectionFamily({ family, strips: moved, counts: [25, 35], paths: ['new-a', 'new-b'] });
  assert.equal(result.ok, false);
  assert.match(result.error, /changed separately/i);
});

test('section families persist through the layout snapshot used by undo and project state', () => {
  const source = strip('strip-1', 'Halo', 60, 'M0 0 L60 0');
  const members = [strip('strip-1', 'Halo 1', 20, 'part-a'), strip('strip-2', 'Halo 2', 40, 'part-b')];
  const family = createSectionFamily(source, members);
  const state = createLayoutState({ strips: members, sectionFamilies: [family] });
  const snapshot = makeLayoutSnapshot(state);
  const restored = applyLayoutSnapshot(createLayoutState(), snapshot);

  assert.deepEqual(snapshot.sectionFamilies, [family]);
  assert.deepEqual(restored.sectionFamilies, [family]);
});

test('legacy strip id migration remaps connected family ownership atomically', () => {
  const source = strip('artwork-halo', 'Halo', 60, 'source');
  const members = [strip('artwork-halo', 'Halo 1', 20, 'a'), strip('strip-1', 'Halo 2', 40, 'b')];
  const family = createSectionFamily(source, members);
  const originalSignature = family.memberGeometry['artwork-halo'];
  const project = { layout: { strips: members, sectionFamilies: [family] } };

  migrateStripIdNamespace(project);

  assert.deepEqual(project.layout.strips.map(item => item.id), ['strip-2', 'strip-1']);
  assert.equal(project.layout.sectionFamilies[0].parentId, 'strip-2');
  assert.deepEqual(project.layout.sectionFamilies[0].memberIds, ['strip-2', 'strip-1']);
  assert.equal(project.layout.sectionFamilies[0].memberGeometry['strip-2'], originalSignature);
});

test('saved project hydration retains valid connected family metadata', () => {
  const source = strip('strip-1', 'Halo', 60, 'M0 0 L60 0');
  const members = [strip('strip-1', 'Halo 1', 20, 'part-a'), strip('strip-2', 'Halo 2', 40, 'part-b')];
  const family = createSectionFamily(source, members);
  const migrated = migrateProject({
    version: PROJECT_VERSION,
    id: 'connected-round-trip',
    name: 'Connected round trip',
    layout: { strips: members, sectionFamilies: [family] },
  });
  const hydrated = createLayoutState(migrated.layout);

  assert.deepEqual(hydrated.sectionFamilies, [family]);
  assert.deepEqual(hydrated.sectionFamilies[0].memberIds, members.map(member => member.id));
});

test('family boundary reconciliation leaves unrelated partial runs and seams unchanged', () => {
  const source = strip('strip-1', 'Halo', 60, 'M0 0 L60 0');
  const members = [strip('strip-1', 'Halo 1', 25, 'part-a'), strip('strip-2', 'Halo 2', 35, 'part-b')];
  const family = createSectionFamily(source, members);
  const unrelatedRuns = [
    { id: 'run-other-a', type: 'strip', source: { stripId: 'strip-other', from: 0, to: 9 }, seamLed: 4, verified: true },
    { id: 'run-other-b', type: 'strip', source: { stripId: 'strip-other', from: 10, to: 29 }, seamLed: 14, verified: true },
  ];
  const draft = {
    runs: [
      { id: 'run-strip-1', type: 'strip', source: { stripId: 'strip-1', from: 0, to: 19 }, seamLed: 8, verified: true },
      { id: 'run-strip-2', type: 'strip', source: { stripId: 'strip-2', from: 0, to: 39 }, seamLed: 9, verified: true },
      ...structuredClone(unrelatedRuns),
    ],
    outputs: [{ runIds: ['run-strip-1', 'run-strip-2', 'run-other-a', 'run-other-b'] }],
  };

  reconcileSectionFamilyRuns(draft, { family, nextStrips: [...members, strip('strip-other', 'Other', 30, 'other')] });

  assert.deepEqual(draft.runs.filter(run => run.source.stripId === 'strip-other'), unrelatedRuns);
  assert.deepEqual(draft.runs.find(run => run.id === 'run-strip-1').source, { stripId: 'strip-1', from: 0, to: 24 });
  assert.equal(draft.runs.find(run => run.id === 'run-strip-1').seamLed, null);
  assert.deepEqual(draft.runs.find(run => run.id === 'run-strip-2').source, { stripId: 'strip-2', from: 0, to: 34 });
});

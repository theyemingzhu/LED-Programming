import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSceneExpressionAreaCatalog,
  resolveSceneExpressionSelection,
} from './sceneExpressionTargets.js';
import { compileWiring } from './wiringCompiler.js';

const strips = [
  { id: 'ribbon-1', name: 'Ribbon 1', pixelCount: 2, pixels: [{ x: 1, y: 2 }, { x: 2, y: 2 }] },
  { id: 'ribbon-2', name: 'Ribbon 2', pixelCount: 2, pixels: [{ x: 3, y: 2 }, { x: 4, y: 2 }] },
  { id: 'ribbon-3', name: 'Ribbon 3', pixelCount: 2, pixels: [{ x: 5, y: 2 }, { x: 6, y: 2 }] },
  { id: 'center', name: 'Center', pixelCount: 1, pixels: [{ x: 0, y: 0 }] },
  { id: 'petal-a', name: 'Petal A', pixelCount: 1, pixels: [{ x: 1, y: 0 }] },
  { id: 'petal-b', name: 'Petal B', pixelCount: 1, pixels: [{ x: -1, y: 0 }] },
];

const layout = {
  strips,
  sectionFamilies: [{
    id: 'section-family-ribbon-1',
    parentId: 'ribbon-1',
    parentName: 'Ribbon',
    memberIds: ['ribbon-1', 'ribbon-2', 'ribbon-3'],
  }],
  layerGroups: [{
    groupId: 'petals',
    name: 'Petals',
    type: 'strip',
    members: [{ stripId: 'petal-a' }, { stripId: 'petal-b' }],
  }],
};

// Physical output deliberately differs from artwork order: Petal B is first,
// followed by the three divided Ribbon sections, then Petal A and Center.
const reorderedWiring = {
  version: 1,
  locked: false,
  verified: false,
  outputs: [{
    id: 'out1', pin: 16,
    runIds: ['run-petal-b', 'run-ribbon-1', 'run-ribbon-2', 'run-ribbon-3', 'run-petal-a', 'run-center'],
  }],
  runs: [
    'petal-b', 'ribbon-1', 'ribbon-2', 'ribbon-3', 'petal-a', 'center',
  ].map(stripId => ({
    id: `run-${stripId}`,
    type: 'strip',
    source: { stripId, from: 0, to: strips.find(strip => strip.id === stripId).pixelCount - 1 },
    physicalDirection: 'source-forward',
  })),
};
const compiledWiring = compileWiring({ wiring: reorderedWiring, strips });
assert.equal(compiledWiring.ok, true);

test('catalog exposes divided-strip and mandala group targets without a second mapping', () => {
  const catalog = buildSceneExpressionAreaCatalog({ ...layout, compiledWiring });
  assert.equal(catalog.version, 1);
  assert.deepEqual(catalog.areas.map(area => area.id), [
    'all',
    'strip:ribbon-1', 'strip:ribbon-2', 'strip:ribbon-3', 'strip:center', 'strip:petal-a', 'strip:petal-b',
    'family:section-family-ribbon-1', 'group:petals',
  ]);
  const ribbon = catalog.areas.find(area => area.id === 'family:section-family-ribbon-1');
  assert.equal(ribbon.name, 'Ribbon');
  assert.deepEqual(ribbon.childIds, ['strip:ribbon-1', 'strip:ribbon-2', 'strip:ribbon-3']);
  assert.deepEqual(ribbon.sourceRefs, [
    { stripId: 'ribbon-1', sourceLeds: [0, 1] },
    { stripId: 'ribbon-2', sourceLeds: [0, 1] },
    { stripId: 'ribbon-3', sourceLeds: [0, 1] },
  ]);
  assert.deepEqual(catalog.areas.find(area => area.id === 'group:petals').childIds, ['strip:petal-a', 'strip:petal-b']);
  assert.deepEqual(catalog.physicalOrder.map(ref => ref.stripId), [
    'petal-b', 'ribbon-1', 'ribbon-1', 'ribbon-2', 'ribbon-2', 'ribbon-3', 'ribbon-3', 'petal-a', 'center',
  ]);
});

test('continuous selection follows current physical order while repeat keeps independent source domains', () => {
  const catalog = buildSceneExpressionAreaCatalog({ ...layout, compiledWiring });
  const continuous = resolveSceneExpressionSelection(catalog, {
    areaIds: ['strip:ribbon-1', 'strip:ribbon-2', 'strip:ribbon-3'],
    domain: 'continuous',
  });
  assert.equal(continuous.ok, true);
  assert.deepEqual(continuous.sourceRefs, [
    { stripId: 'ribbon-1', sourceLeds: [0, 1] },
    { stripId: 'ribbon-2', sourceLeds: [0, 1] },
    { stripId: 'ribbon-3', sourceLeds: [0, 1] },
  ]);
  assert.deepEqual(continuous.physicalRefs.map(ref => ref.outputIndex), [1, 2, 3, 4, 5, 6]);

  const repeated = resolveSceneExpressionSelection(catalog, {
    areaIds: ['strip:ribbon-1', 'strip:ribbon-2', 'strip:ribbon-3'],
    domain: 'repeat',
  });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.sourceRefs.length, 0);
  assert.deepEqual(repeated.instances.map(instance => instance.areaId), ['strip:ribbon-1', 'strip:ribbon-2', 'strip:ribbon-3']);
  assert.deepEqual(repeated.instances.map(instance => instance.sourceRefs), [
    [{ stripId: 'ribbon-1', sourceLeds: [0, 1] }],
    [{ stripId: 'ribbon-2', sourceLeds: [0, 1] }],
    [{ stripId: 'ribbon-3', sourceLeds: [0, 1] }],
  ]);

  const groupedRepeat = resolveSceneExpressionSelection(catalog, {
    areaIds: ['group:petals'], domain: 'repeat',
  });
  assert.equal(groupedRepeat.ok, true);
  assert.deepEqual(groupedRepeat.instances, [{
    areaId: 'group:petals',
    sourceRefs: [
      { stripId: 'petal-a', sourceLeds: [0] },
      { stripId: 'petal-b', sourceLeds: [0] },
    ],
  }], 'one selected group remains one repeat instance');
});

test('whole artwork is explicit and preserves physical order without changing artwork coordinates', () => {
  const catalog = buildSceneExpressionAreaCatalog({ ...layout, compiledWiring });
  const resolved = resolveSceneExpressionSelection(catalog, { areaIds: ['all'], domain: 'continuous' });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.physicalRefs.map(ref => ref.outputIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(strips[0].pixels[0].x, 1, 'selection never rewrites layout artwork points');
});

test('continuous export rejects a compiled route that covers only part of the selected source', () => {
  const partialStrips = [{
    id: 'a', name: 'A', pixelCount: 3,
    pixels: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
  }];
  const partialWiring = compileWiring({
    strips: partialStrips,
    wiring: {
      version: 1,
      outputs: [{ id: 'out', pin: 16, runIds: ['r'] }],
      runs: [{ id: 'r', type: 'strip', source: { stripId: 'a', from: 0, to: 1 } }],
    },
  });
  assert.equal(partialWiring.ok, true);

  const resolved = resolveSceneExpressionSelection(
    buildSceneExpressionAreaCatalog({ strips: partialStrips, compiledWiring: partialWiring }),
    { areaIds: ['all'], domain: 'continuous' },
  );
  assert.equal(resolved.ok, false);
  assert.ok(resolved.errors.some(error => error.code === 'physical-coverage-incomplete'));
  assert.deepEqual(resolved.sourceRefs, []);
  assert.deepEqual(resolved.physicalRefs, []);
});

test('continuous export rejects duplicate physical coverage and zero-LED areas while repeat stays source-only', () => {
  const oneStrip = [{ id: 'a', name: 'A', pixelCount: 1, pixels: [{ x: 0, y: 0 }] }];
  const duplicated = {
    ok: true,
    pixels: [
      { stripId: 'a', sourceLed: 0 },
      { stripId: 'a', sourceLed: 0 },
    ],
  };
  const duplicateResult = resolveSceneExpressionSelection(
    buildSceneExpressionAreaCatalog({ strips: oneStrip, compiledWiring: duplicated }),
    { areaIds: ['strip:a'], domain: 'continuous' },
  );
  assert.equal(duplicateResult.ok, false);
  assert.ok(duplicateResult.errors.some(error => error.code === 'physical-coverage-duplicate'));

  const zeroCatalog = buildSceneExpressionAreaCatalog({
    strips: [{ id: 'empty', name: 'Empty', pixelCount: 0, pixels: [] }],
  });
  const zeroContinuous = resolveSceneExpressionSelection(zeroCatalog, {
    areaIds: ['strip:empty'], domain: 'continuous',
  });
  assert.equal(zeroContinuous.ok, false);
  assert.ok(zeroContinuous.errors.some(error => error.code === 'empty-source-selection'));

  const zeroRepeated = resolveSceneExpressionSelection(zeroCatalog, {
    areaIds: ['strip:empty'], domain: 'repeat',
  });
  assert.equal(zeroRepeated.ok, false);
  assert.ok(zeroRepeated.errors.some(error => error.code === 'empty-source-selection'));
});

test('parent-child and overlapping group selections are rejected before pixels can be double selected', () => {
  const catalog = buildSceneExpressionAreaCatalog({ ...layout, compiledWiring });
  const parentChild = resolveSceneExpressionSelection(catalog, {
    areaIds: ['family:section-family-ribbon-1', 'strip:ribbon-1'], domain: 'continuous',
  });
  assert.equal(parentChild.ok, false);
  assert.equal(parentChild.errors[0].code, 'overlapping-areas');
  assert.deepEqual(parentChild.sourceRefs, []);

  const groupMember = resolveSceneExpressionSelection(catalog, {
    areaIds: ['group:petals', 'strip:petal-a'], domain: 'repeat',
  });
  assert.equal(groupMember.ok, false);
  assert.equal(groupMember.errors[0].code, 'overlapping-areas');
});

test('renames retain stable IDs; missing and unsupported split/merge identities remain unresolved', () => {
  const catalog = buildSceneExpressionAreaCatalog({
    ...layout,
    strips: strips.map(strip => strip.id === 'ribbon-2' ? { ...strip, name: 'Warm ribbon' } : strip),
    compiledWiring,
  });
  assert.equal(catalog.areas.find(area => area.id === 'strip:ribbon-2').name, 'Warm ribbon');

  const missing = resolveSceneExpressionSelection(catalog, {
    areaIds: ['strip:removed-section'], domain: 'continuous',
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.unresolved, ['strip:removed-section']);
  assert.deepEqual(missing.sourceRefs, []);

  const lostFamily = resolveSceneExpressionSelection(catalog, {
    areaIds: ['family:section-family-merged-away'], domain: 'continuous',
  });
  assert.equal(lostFamily.ok, false);
  assert.deepEqual(lostFamily.unresolved, ['family:section-family-merged-away']);
});

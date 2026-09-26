import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSceneExpressionAreaCatalog, resolveSceneExpressionSelection } from './sceneExpressionTargets.js';
import { createSceneExpressionPreviewRenderer } from './sceneExpressionFlow.js';
import { mapSceneExpressionPreviewFrame } from './sceneExpressionFrame.js';
import { compilePattern, renderPixelFrame } from './frameEngine.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';

const strips = [
  { id: 'a', pixelCount: 2, pixels: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
  { id: 'b', pixelCount: 3, pixels: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }] },
  { id: 'c', pixelCount: 1, pixels: [{ x: 9, y: 8 }] },
];
const compiledWiring = { ok: true, pixels: [
  { stripId: 'b', sourceLed: 0 }, { stripId: 'b', sourceLed: 1 }, { inactive: true },
  { stripId: 'b', sourceLed: 2 }, { stripId: 'c', sourceLed: 0 },
  { stripId: 'a', sourceLed: 1 }, { stripId: 'a', sourceLed: 0 },
] };
const catalog = buildSceneExpressionAreaCatalog({ strips, compiledWiring });
const segments = strips.map(strip => ({
  id: strip.id, patternId: 'pulse', pixels: strip.pixels.map((point, sourceLed) => ({
    ...point, stripId: strip.id, sourceLed,
  })),
}));

test('one shared pulse crosses unequal reversed/disjoint sections and scatters to installed addresses', () => {
  const selected = {
    selection: { areaIds: ['strip:a', 'strip:c', 'strip:b'], domain: 'continuous',
      flow: { version: 1, directions: { 'strip:a': 'reverse', 'strip:b': 'reverse' } } },
  };
  const observed = [];
  const renderer = createSceneExpressionPreviewRenderer({
    assignments: [selected], catalog, segments,
    compile: () => (...args) => {
      observed.push({ index: args[0], count: args[5], id: args[10], progress: args[11], x: args[1], y: args[2] });
      return { r: args[0] * 40, g: 0, b: 0 };
    },
  });
  assert.equal(renderer.ok, true);
  const frame = segments.flatMap(segment => segment.pixels.map((_, sourceLed) => {
    const index = segments.slice(0, segments.indexOf(segment)).reduce((n, item) => n + item.pixels.length, 0) + sourceLed;
    return renderer.compiledFn(index, segment.pixels[sourceLed].x, segment.pixels[sourceLed].y, 0, 0, 6, [], 0, 0, {}, segment.id, 0);
  }));
  assert.deepEqual(observed.map(item => item.index), [0, 1, 5, 4, 3, 2]);
  assert.ok(observed.every(item => item.count === 6 && item.id === 'flow:0'));
  assert.deepEqual(observed.map(item => item.progress), [0, .2, 1, .8, .6, .4]);
  assert.deepEqual(observed.map(item => [item.x, item.y]), [[0, .5], [.2, .5], [1, .5], [.8, .5], [.6, .5], [.4, .5]]);
  assert.deepEqual(segments.map(segment => segment.pixels.map(pixel => [pixel.x, pixel.y])), [
    [[0, 0], [1, 0]], [[3, 1], [4, 1], [5, 1]], [[9, 8]],
  ], 'artwork remains on its original points');
  const mapped = mapSceneExpressionPreviewFrame({ framePixels: frame, segments, compiledWiring });
  assert.equal(mapped.ok, true);
  assert.deepEqual(mapped.pixels, ['C80000', 'A00000', '000000', '780000', '500000', '280000', '000000']);
});

test('real Chase renderer advances one pulse over the logical route and matches a render-once oracle', () => {
  const selection = { areaIds: ['strip:a', 'strip:c', 'strip:b'], domain: 'continuous',
    flow: { version: 1, directions: { 'strip:a': 'reverse', 'strip:b': 'reverse' } } };
  const chaseSegments = segments.map(segment => ({ ...segment, patternId: 'chase' }));
  const renderer = createSceneExpressionPreviewRenderer({ assignments: [{ selection }], catalog, segments: chaseSegments });
  assert.equal(renderer.ok, true);
  const display = normalizeProjectRenderStrips(chaseSegments.map(segment => ({ ...segment, patternId: undefined })));
  const domain = resolveSceneExpressionSelection(catalog, selection);
  for (const t of [13.653, 27.307, 40.96]) {
    const actual = renderPixelFrame({ t, strips: display, patternId: 'aurora', activeFn: renderer.compiledFn });
    const oracle = renderPixelFrame({
      t, strips: [{ id: 'one-domain', pts: domain.physicalRefs.map(ref => ({ x: ref.logicalIndex, y: 0, p: ref.progress })) }],
      patternId: 'chase', activeFn: compilePattern('chase'),
    });
    const actualBySource = new Map(chaseSegments.flatMap((segment, segmentIndex) =>
      segment.pixels.map((pixel, pixelIndex) => {
        const offset = chaseSegments.slice(0, segmentIndex).reduce((sum, item) => sum + item.pixels.length, 0);
        return [`${pixel.stripId}:${pixel.sourceLed}`, actual.pixels[offset + pixelIndex]];
      })));
    assert.deepEqual(domain.physicalRefs.map(ref => actualBySource.get(`${ref.stripId}:${ref.sourceLed}`)), oracle.pixels);
    const physical = mapSceneExpressionPreviewFrame({ framePixels: actual.pixels, segments: chaseSegments, compiledWiring });
    assert.equal(physical.ok, true);
    assert.equal(physical.pixels[2], '000000', 'inactive installed gap stays dark');
  }
});

test('spatial patterns sample one logical chain across disconnected artwork while drawing coordinates remain original', () => {
  const selection = { areaIds: ['strip:c', 'strip:a', 'strip:b'], domain: 'continuous',
    flow: { version: 1, directions: { 'strip:b': 'reverse' } } };
  const spatialSegments = segments.map(segment => ({ ...segment, patternId: 'plasma' }));
  const renderer = createSceneExpressionPreviewRenderer({ assignments: [{ selection }], catalog, segments: spatialSegments });
  const domain = resolveSceneExpressionSelection(catalog, selection);
  assert.equal(renderer.ok, true);
  const actual = renderPixelFrame({
    t: 2.5,
    strips: normalizeProjectRenderStrips(spatialSegments.map(segment => ({ ...segment, patternId: undefined }))),
    patternId: 'aurora', activeFn: renderer.compiledFn,
  });
  const oracle = renderPixelFrame({
    t: 2.5,
    strips: [{ id: 'flow:0', pts: domain.physicalRefs.map(ref => ({
      x: ref.progress, y: .5, p: ref.progress,
    })) }],
    patternId: 'plasma', activeFn: compilePattern('plasma'),
    normBounds: { minX: 0, minY: 0, range: 1 },
  });
  const bySource = new Map(spatialSegments.flatMap((segment, segmentIndex) =>
    segment.pixels.map((pixel, pixelIndex) => [
      `${pixel.stripId}:${pixel.sourceLed}`,
      actual.pixels[spatialSegments.slice(0, segmentIndex).reduce((sum, item) => sum + item.pixels.length, 0) + pixelIndex],
    ])));
  assert.deepEqual(domain.physicalRefs.map(ref => bySource.get(`${ref.stripId}:${ref.sourceLed}`)), oracle.pixels);
  assert.deepEqual(spatialSegments[2].pixels[0], { x: 9, y: 8, stripId: 'c', sourceLed: 0 });
});

test('Flow uses one scene clock even when incoming strip phases differ', () => {
  const selection = { areaIds: ['strip:a', 'strip:b'], domain: 'continuous', flow: { version: 1, directions: {} } };
  const seen = [];
  let clock = 4;
  const renderer = createSceneExpressionPreviewRenderer({
    assignments: [{ selection }], catalog, segments,
    stateByStrip: { a: { pattern: { speed: 1.5 } }, b: { pattern: { speed: 1.5 } } },
    getFlowTime: () => clock,
    compile: () => (...args) => { seen.push({ t: args[3], time: args[4], id: args[10] }); return { r: 0, g: 0, b: 0 }; },
  });
  assert.equal(renderer.ok, true);
  renderer.compiledFn(0, 0, 0, 19, 0.2, 6, [], 0, 0, {}, 'a', 0);
  renderer.compiledFn(2, 0, 0, 203, 0.8, 6, [], 0, 0, {}, 'b', 0);
  assert.deepEqual(seen.map(item => item.t), [6, 6]);
  assert.deepEqual(seen.map(item => item.time), [6 / 65.536, 6 / 65.536]);
  clock = 5;
  renderer.compiledFn(0, 0, 0, 19, 0.2, 6, [], 0, 0, {}, 'a', 0);
  assert.equal(seen.at(-1).t, 7.5);
});

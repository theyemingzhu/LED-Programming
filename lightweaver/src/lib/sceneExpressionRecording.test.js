import test from 'node:test';
import assert from 'node:assert/strict';

import { bakeSceneExpressionFlow, estimateSceneExpressionFlowRecording, verifySceneExpressionFlowBake } from './sceneExpressionRecording.js';
import { compileWiring } from './wiringCompiler.js';
import { buildSceneExpressionAreaCatalog } from './sceneExpressionTargets.js';
import { effectiveSceneFlowAt, scenePlaybackAt } from '../scene-expression/sceneExpressionEditorModel.js';
import { resolveSceneExpression } from './sceneExpression.js';
import { buildPatternPreviewSegments, applyPatternPreviewSegmentLooks } from './patternPiecePreview.js';
import { createSceneExpressionPreviewRenderer } from './sceneExpressionFlow.js';
import { renderPixelFrame, normalizePalette } from './frameEngine.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';
import { mapSceneExpressionPreviewFrame } from './sceneExpressionFrame.js';

const strips = [
  { id: 'a', pixelCount: 2, pixels: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
  { id: 'b', pixelCount: 3, pixels: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }] },
  { id: 'c', pixelCount: 1, pixels: [{ x: 9, y: 8 }] },
];
const wiring = { version: 1, outputs: [
  { id: 'one', pin: 16, runIds: ['b', 'gap'] },
  { id: 'two', pin: 17, runIds: ['c', 'a'] },
], runs: [
  { id: 'a', type: 'strip', source: { stripId: 'a', from: 0, to: 1 }, physicalDirection: 'source-reverse' },
  { id: 'b', type: 'strip', source: { stripId: 'b', from: 0, to: 2 }, physicalDirection: 'source-forward' },
  { id: 'c', type: 'strip', source: { stripId: 'c', from: 0, to: 0 }, physicalDirection: 'source-forward' },
  { id: 'gap', type: 'inactive', count: 1 },
] };
const compiledWiring = compileWiring({ wiring, strips });
assert.equal(compiledWiring.ok, true);
const scene = {
  format: 'lightweaver-expression-scene', version: 1, id: 'flow', name: 'Flow',
  defaults: { pattern: { rendererId: 'chase', speed: 1 }, color: { kind: 'palette', colors: ['#ff0000', '#000000'] }, intensity: { brightness: 1 } },
  steps: [
    { id: 'first', label: 'First', holdMs: 1000, transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [
      { selection: { domain: 'continuous', areaIds: ['strip:a', 'strip:c', 'strip:b'], flow: { version: 1, directions: { 'strip:a': 'reverse', 'strip:b': 'reverse' } } } },
    ] },
    { id: 'second', label: 'Second', holdMs: 1000, transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [
      { selection: { domain: 'continuous', areaIds: ['strip:a', 'strip:c', 'strip:b'],
        flow: { version: 1, directions: { 'strip:c': 'reverse' } } }, pattern: { rendererId: 'plasma' } },
    ] },
  ], loop: { mode: 'once' },
};
const context = { scene, strips, wiring, compiledWiring, fps: 2 };

function previewAt(time) {
  const catalog = buildSceneExpressionAreaCatalog({ strips, compiledWiring });
  const resolved = resolveSceneExpression(scene, catalog);
  const playback = scenePlaybackAt(scene, time * 1000);
  const step = resolved.steps.find(item => item.id === playback.stepId);
  const targets = strips.map(strip => ({ kind: 'section', id: strip.id, zoneId: `patch-${strip.id}`,
    look: { patternId: step.states[strip.id].pattern.rendererId, speed: step.states[strip.id].pattern.speed,
      brightness: step.states[strip.id].intensity.brightness },
    palette: step.states[strip.id].color.colors }));
  const segments = buildPatternPreviewSegments({ strips, targets,
    resolvePatternId: id => id, paletteForPattern: () => ['#ff0000', '#000000'] });
  const flow = effectiveSceneFlowAt(scene, playback.stepId, catalog);
  const renderer = createSceneExpressionPreviewRenderer({ assignments: flow.assignments, catalog, segments,
    stateByStrip: step.states, getFlowTime: () => time });
  assert.equal(renderer.ok, true);
  const renderStrips = normalizeProjectRenderStrips(segments.map(segment => ({ ...segment, patternId: undefined })));
  const frame = renderPixelFrame({ t: time, strips: renderStrips, activeFn: renderer.compiledFn,
    perStripPalettes: new Map(segments.map(segment => [segment.id, normalizePalette(segment.palette)])) }).pixels;
  applyPatternPreviewSegmentLooks(frame, segments, time * 1000);
  return mapSceneExpressionPreviewFrame({ framePixels: frame, segments, compiledWiring }).pixels;
}

test('recording samples the exact preview across GPIOs, reversed unequal areas and a cut step', async () => {
  const baked = await bakeSceneExpressionFlow(context);
  assert.equal(baked.sidecar.frameCount, 4);
  assert.deepEqual(baked.outputs.map(item => [item.pin, item.pixels]), [[16, 4], [17, 3]]);
  const bytes = baked.bytes;
  assert.equal(new DataView(bytes.buffer).getUint32(16, true), 4);
  for (let index = 0; index < 4; index += 1) {
    const actual = [];
    for (let pixel = 0; pixel < 7; pixel += 1) {
      const offset = 64 + (index * 7 + pixel) * 3;
      actual.push([...bytes.slice(offset, offset + 3)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase());
    }
    assert.deepEqual(actual, previewAt(index / 2));
    assert.equal(actual[3], '000000');
  }
  assert.equal((await verifySceneExpressionFlowBake(baked, context)).ok, true);
});

test('recording rejects stale source or layout and bounds bytes before allocation', async () => {
  const baked = await bakeSceneExpressionFlow(context);
  assert.equal((await verifySceneExpressionFlowBake(baked, { ...context, scene: { ...scene, name: 'Changed' } })).reason, 'recording-stale-scene');
  assert.equal((await verifySceneExpressionFlowBake(baked, { ...context, wiring: { ...wiring, outputs: wiring.outputs.map((o, i) => i ? { ...o, pin: 18 } : o) } })).reason, 'recording-stale-layout');
  const altered = { ...baked, bytes: baked.bytes.slice() };
  altered.bytes[64] ^= 1;
  assert.equal((await verifySceneExpressionFlowBake(altered, context)).reason, 'recording-invalid');
  const missing = structuredClone(scene);
  missing.steps[0].assignments[0].selection.areaIds[0] = 'strip:missing';
  await assert.rejects(() => bakeSceneExpressionFlow({ ...context, scene: missing }), /no longer present/i);
  await assert.rejects(() => bakeSceneExpressionFlow({ ...context, maxBytes: 64 }), /storage limit.*shorter loop/i);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(() => bakeSceneExpressionFlow({ ...context, signal: abort.signal }), { name: 'AbortError' });
});

test('recording rejects more than 4096 physical LEDs before rendering', async () => {
  const extra = Array.from({ length: 4097 - compiledWiring.pixels.length }, (_, index) => ({
    ...compiledWiring.pixels[0], physicalIndex: compiledWiring.pixels.length + index,
  }));
  const oversized = { ...context, compiledWiring: {
    ...compiledWiring, pixels: [...compiledWiring.pixels, ...extra],
  } };
  assert.throws(() => estimateSceneExpressionFlowRecording(oversized), /1 to 4096 physical LEDs/);
  await assert.rejects(() => bakeSceneExpressionFlow(oversized), /1 to 4096 physical LEDs/);
});

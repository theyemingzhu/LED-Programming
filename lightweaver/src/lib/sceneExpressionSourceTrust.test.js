import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneExpressionPreviewRenderer } from './sceneExpressionFlow.js';
import { bakeSceneExpressionFlow } from './sceneExpressionRecording.js';
import { buildSceneExpressionAreaCatalog } from './sceneExpressionTargets.js';
import { compileWiring } from './wiringCompiler.js';
import { getCardPatternById } from './cardPatternBank.js';
import { isBuiltInPattern } from './patternRegistry.js';

const strips = [{ id: 'a', pixelCount: 2, pixels: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }];
const wiring = { version: 1, outputs: [{ id: 'one', pin: 16, runIds: ['a'] }], runs: [
  { id: 'a', type: 'strip', source: { stripId: 'a', from: 0, to: 1 }, physicalDirection: 'source-forward' },
] };
const compiledWiring = compileWiring({ wiring, strips });
const catalog = buildSceneExpressionAreaCatalog({ strips, compiledWiring });
const selection = { areaIds: ['strip:a'], domain: 'continuous', flow: { version: 1, directions: {} } };
const segments = patternId => strips.map(strip => ({ ...strip, patternId,
  pixels: strip.pixels.map((point, sourceLed) => ({ ...point, stripId: strip.id, sourceLed })) }));
const options = patternId => ({ assignments: [{ selection }], catalog, segments: segments(patternId), getFlowTime: () => 3 });
const scene = (rendererId, domain) => ({
  format: 'lightweaver-expression-scene', version: 1, id: 'trust', name: 'Trust',
  defaults: { pattern: { rendererId, speed: 1 }, color: { kind: 'palette', colors: ['#ff0000', '#000000'] }, intensity: { brightness: 1 } },
  steps: [{ id: 'one', label: 'One', holdMs: 1000, transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [{ selection: domain === 'continuous' ? selection : { areaIds: ['strip:a'], domain } }] }],
  loop: { mode: 'once' },
});
const args = [0, 0, 0, 0, 0, 2, [{ r: 1, g: 0, b: 0 }], 0, 0, {}, 'a', 0];

async function withCustomPatterns(patterns, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'lw_custom_patterns' ? JSON.stringify(patterns) : null } });
  globalThis.__FLOW_CANARY = 173;
  delete globalThis.__FLOW_EXECUTED;
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
    delete globalThis.__FLOW_CANARY; delete globalThis.__FLOW_EXECUTED;
  }
}
const probeCode = 'this.__FLOW_EXECUTED = this.__FLOW_CANARY; return [173, 0, 0];';

test('missing bank source stays unavailable with or without a custom shadow; trusted compiler injection remains explicit', async () => {
  assert.ok(getCardPatternById('warm-white'));
  assert.equal(isBuiltInPattern('warm-white'), false);
  await withCustomPatterns([], () => assert.equal(createSceneExpressionPreviewRenderer(options('warm-white')).ok, false));
  await withCustomPatterns([{ id: 'warm-white', code: probeCode }], () => {
    const renderer = createSceneExpressionPreviewRenderer(options('warm-white'));
    assert.equal(renderer.ok, false);
    assert.equal(renderer.compiledFn, null);
    assert.equal(renderer.errors[0].code, 'flow-pattern-unavailable');
    assert.equal(globalThis.__FLOW_EXECUTED, undefined);
    const trusted = createSceneExpressionPreviewRenderer({ ...options('warm-white'), compile: () => () => ({ r: 7, g: 8, b: 9 }) });
    assert.equal(trusted.ok, true);
    assert.deepEqual(trusted.compiledFn(...args), { r: 7, g: 8, b: 9 });
  });
});

test('resolved metadata aliases and bundled IDs keep exact RGB/clock when storage contains shadows', async () => {
  const alias = getCardPatternById('sunset').previewPatternId;
  assert.equal(alias, 'sunrise');
  assert.equal(isBuiltInPattern(alias), true);
  const baseline = createSceneExpressionPreviewRenderer(options(alias)).compiledFn(...args);
  await withCustomPatterns([{ id: 'sunset', code: probeCode }, { id: alias, code: probeCode }], () => {
    const renderer = createSceneExpressionPreviewRenderer(options(alias));
    assert.equal(renderer.ok, true);
    assert.deepEqual(renderer.compiledFn(...args), baseline);
    assert.equal(globalThis.__FLOW_EXECUTED, undefined);
  });
});

for (const domain of ['continuous', 'repeat']) test(`recording refuses missing source shadow in ${domain} steps before native execution`, async () => {
  await withCustomPatterns([{ id: 'warm-white', code: probeCode }], async () => {
    await assert.rejects(bakeSceneExpressionFlow({ scene: scene('warm-white', domain), strips, wiring, compiledWiring, fps: 1 }), /Pattern warm-white cannot render/);
    assert.equal(globalThis.__FLOW_EXECUTED, undefined);
  });
});


test('recording preserves valid bundled alias bytes despite imported metadata/source shadows', async () => {
  const input = { scene: scene('sunset', 'continuous'), strips, wiring, compiledWiring, fps: 1 };
  const baseline = await bakeSceneExpressionFlow(input);
  await withCustomPatterns([{ id: 'sunset', code: probeCode }, { id: 'sunrise', code: probeCode }], async () => {
    const actual = await bakeSceneExpressionFlow(input);
    assert.deepEqual(actual.bytes, baseline.bytes);
    assert.equal(actual.sidecar.lwseqSha256, baseline.sidecar.lwseqSha256);
    assert.equal(globalThis.__FLOW_EXECUTED, undefined);
  });
});

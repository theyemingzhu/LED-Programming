import test from 'node:test';
import assert from 'node:assert/strict';

import { PALETTE_DEFAULT } from '../data.js';
import { CUSTOM_PATTERNS_KEY } from './customPatterns.js';
import { blendPatternLabColors } from './patternLabCompositor.js';
import {
  buildGammaLut,
  compilePattern,
  normalizePalette,
  renderPixelFrame,
} from './frameEngine.js';
import { recipeFromPattern, renderPatternLabRecipeFrame } from './patternLabPatternAdapter.js';
import { parseParamsFromCode } from './patternParams.js';
import { getPatternById } from './patternRegistry.js';

const FIXED_TIME = 137.25;
const FIXED_PALETTE = ['#16002f', '#2962ff', '#00d7b7', '#ffe266'];
const FIXED_LAYOUT = [
  {
    id: 'inner',
    brightness: 0.82,
    speed: 0.75,
    hueShift: 7,
    spacing: 4,
    pts: [
      { x: 20, y: 15, p: 0 },
      { x: 42, y: 9, p: 0.33 },
      { x: 55, y: 32, p: 0.66 },
      { x: 28, y: 44, p: 1 },
    ],
  },
  {
    id: 'outer',
    brightness: 0.64,
    speed: 1.3,
    hueShift: -11,
    spacing: 6,
    pts: [
      { x: 0, y: 0, p: 0 },
      { x: 70, y: 3, p: 0.25 },
      { x: 83, y: 57, p: 0.5 },
      { x: 8, y: 72, p: 0.75 },
      { x: 0, y: 0, p: 1 },
    ],
  },
];

function defaultParams(patternId) {
  const pattern = getPatternById(patternId);
  return Object.fromEntries(parseParamsFromCode(pattern.code).map(param => [param.name, param.value]));
}

function directFrame(patternId, context = {}) {
  return renderPixelFrame({
    t: FIXED_TIME,
    strips: FIXED_LAYOUT,
    patternId,
    params: defaultParams(patternId),
    paletteNorm: normalizePalette(FIXED_PALETTE),
    bpm: 93,
    audioBands: { bass: 0.73, mid: 0.41, hi: 0.19 },
    ...context,
  });
}

function wrappedFrame(patternId, context = {}, params = defaultParams(patternId)) {
  const recipe = recipeFromPattern(patternId, { palette: FIXED_PALETTE });
  recipe.base.params = params;
  return renderPatternLabRecipeFrame(recipe, {
    t: FIXED_TIME,
    strips: FIXED_LAYOUT,
    bpm: 93,
    audioBands: { bass: 0.73, mid: 0.41, hi: 0.19 },
    ...context,
  });
}

function assertLossless(patternId, context = {}, params = defaultParams(patternId)) {
  assert.deepEqual(
    wrappedFrame(patternId, context, params),
    directFrame(patternId, { ...context, params }),
  );
}

test('adapter exports the recipe and frame wrappers', () => {
  assert.equal(typeof recipeFromPattern, 'function');
  assert.equal(typeof renderPatternLabRecipeFrame, 'function');
});

test('recipeFromPattern creates a private recipe with source defaults and provenance', () => {
  const palette = ['#123456', '#abcdef'];
  const source = getPatternById('fire');
  const recipe = recipeFromPattern('fire', { palette });

  assert.notEqual(recipe.id, source.id);
  assert.equal(recipe.name, source.name);
  assert.deepEqual(recipe.base, {
    kind: 'lightweaver-pattern',
    patternId: 'fire',
    params: { scale: 3, rise: 1.5 },
  });
  assert.deepEqual(recipe.palette, palette);
  assert.deepEqual(recipe.provenance, [{ source: 'lightweaver', patternId: 'fire' }]);
  assert.deepEqual(parseParamsFromCode(source.code).map(param => param.value), [3, 1.5]);
});

test('recipeFromPattern rejects unknown source patterns', () => {
  assert.throws(
    () => recipeFromPattern('does-not-exist'),
    { name: 'RangeError', message: 'Unknown pattern: does-not-exist' },
  );
});

test('omitted and empty palettes preserve the existing Lightweaver default output', () => {
  for (const sourceContext of [undefined, { palette: [] }]) {
    const recipe = recipeFromPattern('gradient', sourceContext);
    const frameContext = { t: FIXED_TIME, strips: FIXED_LAYOUT };

    assert.deepEqual(recipe.palette, PALETTE_DEFAULT);
    assert.deepEqual(
      renderPatternLabRecipeFrame(recipe, frameContext),
      renderPixelFrame({ ...frameContext, patternId: 'gradient' }),
    );
  }
});

test('recipe rendering ignores global function and blend overrides from context', () => {
  const recipe = recipeFromPattern('gradient', { palette: FIXED_PALETTE });
  const frameContext = { t: FIXED_TIME, strips: FIXED_LAYOUT };
  const expected = renderPatternLabRecipeFrame(recipe, frameContext);

  assert.deepEqual(renderPatternLabRecipeFrame(recipe, {
    ...frameContext,
    patternId: 'candle',
    params: { unexpected: 1 },
    paletteNorm: normalizePalette(['#ffffff', '#ffffff']),
    activeFn: () => ({ r: 255, g: 255, b: 255 }),
    blendPatternId: 'fire',
    blendFn: () => ({ r: 255, g: 0, b: 0 }),
    blendAmount: 1,
    blendType: 'dissolve',
  }), expected);
});

test('custom registry patterns are rejected until recipes can embed their source', () => {
  const originalStorage = globalThis.localStorage;
  const custom = {
    id: 'custom_mutable',
    name: 'Mutable custom source',
    code: 'return { r: 1, g: 2, b: 3 };',
    custom: true,
  };
  globalThis.localStorage = {
    getItem(key) {
      return key === CUSTOM_PATTERNS_KEY ? JSON.stringify([custom]) : null;
    },
  };

  try {
    assert.throws(
      () => recipeFromPattern(custom.id),
      { name: 'RangeError', message: `Pattern Lab recipes require a built-in pattern: ${custom.id}` },
    );
    assert.throws(
      () => renderPatternLabRecipeFrame({
        ...recipeFromPattern('gradient'),
        base: { kind: 'lightweaver-pattern', patternId: custom.id, params: {} },
      }, { strips: FIXED_LAYOUT }),
      { name: 'RangeError', message: `Pattern Lab recipes require a built-in pattern: ${custom.id}` },
    );
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('legacy wrapped patterns intentionally ignore recipe seed', () => {
  const recipe = recipeFromPattern('sparkle', { palette: FIXED_PALETTE });
  const context = { t: FIXED_TIME, strips: FIXED_LAYOUT };
  const first = renderPatternLabRecipeFrame({ ...recipe, seed: 1 }, context);
  const second = renderPatternLabRecipeFrame({ ...recipe, seed: 0xffffffff }, context);

  assert.deepEqual(second, first);
});

test('renders configured built-in layers through the bounded compositor', () => {
  const recipe = recipeFromPattern('gradient', { palette: FIXED_PALETTE });
  recipe.layers = [{
    id: 'sparkle-layer',
    name: 'Sparkle layer',
    generator: { kind: 'lightweaver-pattern', patternId: 'candle', params: defaultParams('candle') },
    blendMode: 'add',
    opacity: 1,
  }];
  const context = { t: FIXED_TIME, strips: FIXED_LAYOUT, bpm: 93 };
  const base = renderPixelFrame({
    ...context,
    patternId: 'gradient',
    params: defaultParams('gradient'),
    paletteNorm: normalizePalette(FIXED_PALETTE),
  });
  const layer = renderPixelFrame({
    ...context,
    patternId: 'candle',
    params: defaultParams('candle'),
    paletteNorm: normalizePalette(FIXED_PALETTE),
  });

  const rendered = renderPatternLabRecipeFrame(recipe, context);
  const expected = base.pixels.map((color, index) => (
    blendPatternLabColors(color, layer.pixels[index], 'add', 1)
  ));
  assert.notDeepEqual(expected, base.pixels);
  assert.deepEqual(rendered.pixels, expected);
});

test('screen and multiply layers receive Pattern Lab brightness and gamma once after compositing', () => {
  const gammaLUT = buildGammaLut(true, 2.2);
  for (const blendMode of ['screen', 'multiply']) {
    const recipe = recipeFromPattern('gradient', { palette: FIXED_PALETTE });
    recipe.layers = [{
      id: `${blendMode}-layer`,
      name: `${blendMode} layer`,
      generator: { kind: 'lightweaver-pattern', patternId: 'candle', params: defaultParams('candle') },
      blendMode,
      opacity: 0.73,
    }];
    const context = { t: FIXED_TIME, strips: FIXED_LAYOUT, bpm: 93 };
    const neutral = renderPatternLabRecipeFrame(recipe, context);
    const expected = neutral.pixels.map(color => ({
      r: gammaLUT[Math.round(color.r * 0.5)],
      g: gammaLUT[Math.round(color.g * 0.5)],
      b: gammaLUT[Math.round(color.b * 0.5)],
    }));
    const rendered = renderPatternLabRecipeFrame(recipe, {
      ...context,
      masterBrightness: 0.5,
      gammaLUT,
    });

    assert.deepEqual(rendered.pixels, expected, blendMode);
  }
});

test('stateless Pattern Lab rendering applies Movement profiles spatially at one fixed clock', () => {
  const recipe = recipeFromPattern('ripple', { palette: FIXED_PALETTE });
  const context = { t: FIXED_TIME, strips: FIXED_LAYOUT, bpm: 93 };
  const drift = renderPatternLabRecipeFrame(recipe, {
    ...context,
    motionWeights: { drift: 1, flow: 0, pulse: 0, surge: 0 },
  });
  const surge = renderPatternLabRecipeFrame(recipe, {
    ...context,
    motionWeights: { drift: 0, flow: 0, pulse: 0, surge: 1 },
  });

  assert.notDeepEqual(drift.pixels, surge.pixels);
});

test('palette-aware pattern keeps every representative pixel unchanged', () => {
  assertLossless('gradient');
});

test('fixed-color pattern keeps every representative pixel unchanged', () => {
  assertLossless('candle');
});

test('spatial polar pattern keeps every representative pixel unchanged', () => {
  assertLossless('ripple');
});

test('beat-dependent pattern keeps every representative pixel unchanged', () => {
  assertLossless('heartbeat');
});

test('audio-dependent pattern keeps every representative pixel unchanged', () => {
  assertLossless('spectrum');
});

test('per-section pattern assignments and per-strip controls remain unchanged', () => {
  const strips = FIXED_LAYOUT.map((strip, index) => ({
    ...strip,
    patternId: index === 0 ? 'gradient' : 'ripple',
  }));
  const perStripFns = new Map([
    ['gradient', compilePattern('gradient')],
    ['ripple', compilePattern('ripple')],
  ]);
  const patternParamsById = {
    gradient: {},
    ripple: { speed: 2.25, freq: 11 },
  };

  assertLossless('aurora', { strips, perStripFns, patternParamsById });
});

test('custom parameter values keep every representative pixel unchanged', () => {
  assertLossless('fire', {}, { scale: 7.25, rise: 0.85 });
});

for (const patternId of ['mandelbrot', 'lotus']) {
  test(`${patternId} new Lab design follows palette and animates on a 41-light horizontal piece`, () => {
    const strips = [{ id: 'line', pts: Array.from({ length: 41 }, (_, i) => ({ x: i * 10, y: 20, p: i / 40 })) }];
    const red = recipeFromPattern(patternId, { palette: ['#ff0000'] });
    const blue = recipeFromPattern(patternId, { palette: ['#0000ff'] });
    const frame = renderPatternLabRecipeFrame(red, { strips, t: 0 }).pixels;
    const other = renderPatternLabRecipeFrame(blue, { strips, t: 0 }).pixels;
    assert.ok(frame.some(pixel => pixel.r > 100), 'visible highlights');
    assert.ok(frame.every(pixel => pixel.g === 0 && pixel.b === 0), 'selected red palette');
    assert.notDeepEqual(frame, other, 'palette changes computed pixels');
    assert.notDeepEqual(frame, renderPatternLabRecipeFrame(red, { strips, t: 3 }).pixels, 'motion within seconds');
    assert.ok(new Set(frame.map(pixel => JSON.stringify(pixel))).size > 3, 'spatial detail');
  });
}

test('legacy Mandelbrot and Lotus recipes retain their exact stored appearance', () => {
  for (const patternId of ['mandelbrot', 'lotus']) {
    const recipe = recipeFromPattern(patternId, { palette: FIXED_PALETTE });
    delete recipe.base.params.__labSpatialV1;
    assert.deepEqual(renderPatternLabRecipeFrame(recipe, { strips: FIXED_LAYOUT, t: FIXED_TIME }),
      renderPixelFrame({ strips: FIXED_LAYOUT, t: FIXED_TIME, patternId, params: recipe.base.params, paletteNorm: normalizePalette(FIXED_PALETTE) }));
  }
});

test('journey frame uses literal minute timing and independent movement, survives recipe normalization', async () => {
  const { createSlowColorDriftJourney } = await import('./colorJourney.js');
  const { createPatternLabRecipe } = await import('./patternLabRecipe.js');
  const createSlowColorDriftRecipe = () => createPatternLabRecipe({ base: { kind: 'color-journey', id: 'slow-color-drift' }, journey: createSlowColorDriftJourney() });
  const { normalizePatternLabRecipe } = await import('./patternLabRecipe.js');
  const recipe = createSlowColorDriftRecipe();
  const strips = [{ id: 'line', pts: Array.from({ length: 41 }, (_, i) => ({ x: i, y: 0, p: i / 40 })) }];
  const render = (source, t) => renderPatternLabRecipeFrame(source, { strips, t }).pixels;
  const baseline = render(recipe, 0);
  assert.notDeepEqual(baseline, render(recipe, 3), 'motion runs while holding the first color');
  assert.notDeepEqual(baseline, render(recipe, 180), 'minute-scale color destinations differ');
  assert.deepEqual(render(recipe, 75), render(normalizePatternLabRecipe(JSON.parse(JSON.stringify(recipe))), 75));
  assert.deepEqual(render(recipe, 0), render(recipe, 360), 'authored loop and default movement meet at six minutes');
});

test('actual worker agrees with direct Lab frames for centered line patterns and journey', async () => {
  const { compactPatternLabWorkerGeometry } = await import('./patternLabWorkerProtocol.js');
  const { createSlowColorDriftJourney } = await import('./colorJourney.js');
  const { createPatternLabRecipe } = await import('./patternLabRecipe.js');
  const createSlowColorDriftRecipe = () => createPatternLabRecipe({ base: { kind: 'color-journey', id: 'slow-color-drift' }, journey: createSlowColorDriftJourney() });
  const geometry = { strips: [{ id: 'line', pixels: Array.from({ length: 41 }, (_, i) => ({ x: i, y: 0, p: i / 40 })) }], gammaEnabled: false };
  const compact = compactPatternLabWorkerGeometry(geometry);
  const renderOptions = { masterSpeed: 1, masterBrightness: 1, masterSaturation: 1, masterHueShift: 0, motionWeights: { drift: 1, flow: 0, pulse: 0, surge: 0 } };
  const oldPost = globalThis.postMessage;
  const oldMessage = globalThis.onmessage;
  let replies = [];
  globalThis.postMessage = reply => { replies.push(reply); };
  try {
    await import('../pattern-lab/patternLab.worker.js');
    globalThis.onmessage({ data: { type: 'initialize', requestId: 1, payload: { generation: 1, geometry: compact } } });
    let requestId = 1;
    const { recipeFromLook } = await import('./patternLabFromLook.js');
    const imported = recipeFromLook({ patternId: 'rainbow', customHue: 180, customSaturation: 0, customBreathe: true });
    for (const recipe of [recipeFromPattern('mandelbrot'), recipeFromPattern('lotus'), createSlowColorDriftRecipe(), imported]) {
      replies = [];
      globalThis.onmessage({ data: { type: 'render', requestId: ++requestId, payload: { generation: 1, mode: 'final', layerCount: 0, time: 75, recipe, renderOptions } } });
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(!replies.some(reply => reply.type === 'error'), JSON.stringify(replies));
      const response = replies.find(reply => reply.type === 'frame');
      assert.ok(response, 'worker returned frame');
      const direct = renderPatternLabRecipeFrame(recipe, { strips: geometry.strips, t: 75, ...renderOptions }).pixels;
      assert.deepEqual([...new Uint8Array(response.payload.colors)], direct.flatMap(({ r, g, b }) => [r, g, b]));
    }
  } finally {
    globalThis.postMessage = oldPost;
    globalThis.onmessage = oldMessage;
  }
});

test('Lab rendering carries imported look saturation, hue, Drift and Breathe through the same post-pass as Patterns', async () => {
  const { recipeFromLook } = await import('./patternLabFromLook.js');
  const { applyLookColorModifiers } = await import('./previewColorModifiers.js');
  const strips = [{ id: 'strip', pts: Array.from({ length: 41 }, (_, i) => ({ x: i, y: 0, p: i / 40 })) }];
  for (const patternId of ['rainbow', 'blocks']) for (const modifiers of [
    { customHue: 32, customSaturation: 0 },
    { customHue: 110, customSaturation: 210, hueShift: 45 },
    { customHue: 32, customSaturation: 230, customDrift: true, speed: 2 },
    { customHue: 32, customSaturation: 230, customBreathe: true, breatheLowerPct: 15, breatheUpperPct: 80, breatheCycleSeconds: 9 },
  ]) {
    const look = { patternId, brightness: 1, speed: 1, ...modifiers };
    const recipe = recipeFromLook(look, { palette: FIXED_PALETTE });
    for (const elapsed of [0, 4, 12]) {
      const expected = applyLookColorModifiers(renderPixelFrame({ strips, t: elapsed, patternId, masterSpeed: look.speed, paletteNorm: normalizePalette(FIXED_PALETTE) }).pixels, elapsed * 1000, look);
      const actual = renderPatternLabRecipeFrame(recipe, { strips, t: elapsed * look.speed }).pixels;
      assert.deepEqual(actual, expected, JSON.stringify({ modifiers, elapsed }));
    }
  }
});

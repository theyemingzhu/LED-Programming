import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLOR_JOURNEY_NATIVE_MAX_PIXELS,
  compileColorJourneyNativeRecipe,
  sampleNativeColorJourneyPixel,
} from './colorJourneyNative.js';
import { createSlowColorDriftJourney } from './colorJourney.js';
import { createPatternLabRecipe } from './patternLabRecipe.js';
import { createColorJourneyPattern, renderPatternLabRecipeFrame } from './patternLabPatternAdapter.js';

function recipe(overrides = {}) {
  const journey = createSlowColorDriftJourney({
    stops: [
      { id: 'red', color: '#ff0000', holdMs: 1_000, fadeMs: 2_000 },
      { id: 'blue', color: '#0000ff', holdMs: 1_000, fadeMs: 2_000 },
    ],
    motionSpeedSeconds: 18,
    character: 'balanced',
  });
  return createPatternLabRecipe({
    name: 'Gallery drift',
    base: { kind: 'color-journey', id: 'slow-color-drift', params: {} },
    journey,
    palette: journey.stops.map(stop => stop.color),
    evolution: { enabled: false },
    ...overrides,
  });
}

const strips = [{
  id: 'line',
  name: 'Line',
  pixels: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ],
}];

const wiring = {
  version: 1,
  locked: true,
  verified: true,
  outputs: [{ id: 'out', name: 'Out', pin: 16, runIds: ['tail', 'head'] }],
  runs: [
    { id: 'tail', type: 'strip', verified: true, source: { stripId: 'line', from: 1, to: 2 }, physicalDirection: 'source-reverse' },
    { id: 'head', type: 'strip', verified: true, source: { stripId: 'line', from: 0, to: 0 }, physicalDirection: 'source-forward' },
  ],
};

test('compiles the bounded v1 wire in physical output and reversed run order', () => {
  const nativeRecipe = compileColorJourneyNativeRecipe({ recipe: recipe(), strips, wiring });
  assert.equal(COLOR_JOURNEY_NATIVE_MAX_PIXELS, 256);
  assert.deepEqual(nativeRecipe, {
    version: 1,
    kind: 'color-journey',
    id: 'slow-color-drift',
    journey: {
      version: 1,
      stops: [
        { color: '#ff0000', holdMs: 1000, fadeMs: 2000 },
        { color: '#0000ff', holdMs: 1000, fadeMs: 2000 },
      ],
      easing: 'smooth',
      loop: true,
      restart: 'restart',
      motionSpeedMs: 18000,
      depth: 0.25,
      phase16: '599a00000000',
    },
  });
});

test('native sampling preserves the browser journey color and quantized 2D motion within one channel', () => {
  const nativeRecipe = compileColorJourneyNativeRecipe({ recipe: recipe(), strips, wiring });
  const physicalPoints = [strips[0].pixels[2], strips[0].pixels[1], strips[0].pixels[0]];
  const bounds = { minX: 0, minY: 0, range: 10 };
  for (const elapsedMs of [0, 999, 2000, 3999, 6000, 0xffffffff]) {
    const browserPattern = createColorJourneyPattern(recipe().journey, elapsedMs / 1000);
    physicalPoints.forEach((point, index) => {
      const expected = browserPattern(index, (point.x - bounds.minX) / bounds.range, (point.y - bounds.minY) / bounds.range);
      const actual = sampleNativeColorJourneyPixel(nativeRecipe, index, elapsedMs);
      for (const channel of ['r', 'g', 'b']) {
        assert.ok(Math.abs(actual[channel] - Math.round(expected[channel])) <= 1, `${elapsedMs}ms pixel ${index} ${channel}`);
      }
    });
  }
});

test('native physical waveform matches the full Lab renderer after final segment reversal', () => {
  const source = recipe();
  const nativeRecipe = compileColorJourneyNativeRecipe({ recipe: source, strips, wiring });
  for (const elapsedMs of [0, 2000, 3999, 0xffffffff]) {
    const logical = renderPatternLabRecipeFrame(source, { strips, t: elapsedMs / 1000 }).pixels;
    const physical = [logical[2], logical[1], logical[0]];
    physical.forEach((expected, index) => {
      const actual = sampleNativeColorJourneyPixel(nativeRecipe, index, elapsedMs);
      for (const channel of ['r', 'g', 'b']) {
        assert.ok(Math.abs(actual[channel] - expected[channel]) <= 1, `${elapsedMs}ms pixel ${index} ${channel}`);
      }
    });
  }
});

test('fails closed for holes, oversized layouts, section targets, layers, requirements, and base modifiers', () => {
  const cases = [
    { wiring: { ...wiring, outputs: [{ ...wiring.outputs[0], runIds: ['tail', 'hole', 'head'] }], runs: [...wiring.runs, { id: 'hole', type: 'inactive', count: 1 }] }, error: /inactive|hole/i },
    { strips: [{ id: 'long', pixels: Array.from({ length: COLOR_JOURNEY_NATIVE_MAX_PIXELS + 1 }, (_, x) => ({ x, y: 0 })) }], wiring: { version: 1, outputs: [{ id: 'out', pin: 16, runIds: ['long'] }], runs: [{ id: 'long', type: 'strip', source: { stripId: 'long', from: 0, to: COLOR_JOURNEY_NATIVE_MAX_PIXELS } }] }, error: /256/ },
    { recipe: recipe({ targets: [{ kind: 'section', id: 'line' }] }), error: /whole piece/i },
    { recipe: recipe({ layers: [{ id: 'extra' }] }), error: /layer/i },
    { recipe: recipe({ requirements: [{ capability: 'audio', required: true }] }), error: /requirement/i },
    { recipe: recipe({ base: { kind: 'color-journey', id: 'slow-color-drift', params: { hueShift: 1 } } }), error: /modifier/i },
  ];
  for (const candidate of cases) {
    assert.throws(() => compileColorJourneyNativeRecipe({
      recipe: candidate.recipe || recipe(),
      strips: candidate.strips || strips,
      wiring: candidate.wiring || wiring,
    }), candidate.error);
  }
});

test('fails closed for saved section authority, symmetry, and per-strip render modifiers', () => {
  assert.throws(() => compileColorJourneyNativeRecipe({
    recipe: recipe({ sourceLook: { selectedTargetId: 'section-one' } }), strips, wiring,
  }), /section|whole/i);
  assert.throws(() => compileColorJourneyNativeRecipe({
    recipe: recipe(), strips, wiring, symSettings: { enabled: true, type: 'mirror' },
  }), /symmetry/i);
  assert.throws(() => compileColorJourneyNativeRecipe({
    recipe: recipe(), strips: [{ ...strips[0], brightness: 0.6 }], wiring,
  }), /strip.*brightness/i);
});

test('non-looping native sampling holds its final authored color', () => {
  const source = recipe({ journey: { ...recipe().journey, loop: false } });
  const nativeRecipe = compileColorJourneyNativeRecipe({ recipe: source, strips, wiring });
  const color = sampleNativeColorJourneyPixel(nativeRecipe, 2, 20_000_000);
  assert.equal(color.r, 0);
  assert.equal(color.g, 0);
  assert.ok(color.b > 0, 'motion continues while the final authored blue is held');
});

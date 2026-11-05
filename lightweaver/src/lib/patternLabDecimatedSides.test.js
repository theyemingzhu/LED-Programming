import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPatternLabWorkerGeometry } from './patternLabWorkerProtocol.js';
import { renderPatternLabRecipeFrame } from './patternLabPatternAdapter.js';
import { recipeFromPattern } from './patternLabPatternAdapter.js';
import { buildGammaLut, renderPixelFrame } from './frameEngine.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';
import { createPatternLabRecipe } from './patternLabRecipe.js';
import { createSlowColorDriftJourney } from './colorJourney.js';
import { patternLabDisplayStrips, patternLabWorkerColorLookup, planPatternLabSideSamples } from './patternLabSampleMapping.js';

const priorPost = globalThis.postMessage;
const priorMessage = globalThis.onmessage;
const pending = new Map();
const stats = new Map();
globalThis.postMessage = message => {
  if (message.type === 'stats') stats.set(message.requestId, message.payload);
  if (message.type === 'frame' || message.type === 'error') pending.get(message.requestId)?.(message);
};
await import('../pattern-lab/patternLab.worker.js');
let requestId = 0;
async function workerFrame(geometry, recipe, options, time) {
  globalThis.onmessage({ data: { type: 'initialize', requestId: ++requestId, payload: { geometry, generation: 1 } } });
  const id = ++requestId;
  const response = new Promise(resolve => pending.set(id, resolve));
  globalThis.onmessage({ data: { type: 'render', requestId: id, payload: {
    generation: 1, mode: 'preview', time, layerCount: recipe.layers.length, recipe, renderOptions: options,
  } } });
  const message = await response;
  pending.delete(id);
  assert.notEqual(message.type, 'error', JSON.stringify(message.payload));
  return { ...message.payload, stats: stats.get(id) };
}
test.after(() => { globalThis.postMessage = priorPost; globalThis.onmessage = priorMessage; });

for (const variant of ['own', 'mirrored', 'default', 'plain', 'single', 'layered']) {
  const sidesMirrored = variant === 'own' ? false : variant === 'default' ? undefined : true;
  test(`decimated built-in side flow equals full pixels (${variant})`, async () => {
    const counts = variant === 'single' ? [1350] : [233, 421, 317, 379];
    const strips = counts.map((count, strip) => ({ id: `strip-${strip}`, speed: 1,
      brightness: 0.6 + strip * 0.1, hueShift: strip * 10, pixels: Array.from({ length: count }, (_, i) => ({ x: i, y: strip * 20 })) }));
    const symmetry = variant === 'plain' || variant === 'single' ? null : { orientation: 'mirror', sides: [
      { id: 'first', stripIds: ['strip-1', 'strip-0'] },
      { id: 'second', stripIds: ['strip-2', 'strip-3'] },
    ] };
    const geometry = compactPatternLabWorkerGeometry({ strips, symmetry, sidesMirrored, gammaEnabled: true, gammaValue: 2.2 });
    const recipe = recipeFromPattern('chase', { palette: ['#000000', '#ffffff'] });
    recipe.base.params = { dotSize: 0.15 };
    if (variant === 'layered') recipe.layers = [{ id: 'layer', enabled: true, opacity: 0.4, blendMode: 'screen', generator: { kind: 'lightweaver-pattern', patternId: 'scanner', params: { width: 0.4, hue: 0.1 } }, target: { kind: 'whole-piece', id: 'all' }, mask: { kind: 'none' } }];
    const options = { masterSpeed: 1, masterBrightness: 0.7, masterSaturation: 0.8, masterHueShift: 15,
      motionWeights: { drift: 1, flow: 0, pulse: 0, surge: 0 } };
    const time = 12.5;
    const frame = await workerFrame(geometry, recipe, options, time);
    const indices = new Uint32Array(frame.indices);
    const actual = new Uint8ClampedArray(frame.colors);
    assert.equal(indices.length, 384);
    assert.ok(indices.length < geometry.visiblePixelCount);
    assert.equal(frame.totalSamples, geometry.visiblePixelCount);
    assert.equal(frame.stats.sampleCount, 384);
    assert.equal(frame.stats.outputBytes, 384 * 7);
    assert.ok(frame.stats.allocatedBytes <= 4 * 1024 * 1024);
    if (symmetry) {
      const plan = planPatternLabSideSamples(geometry, indices);
      assert.ok(plan.indices.length <= indices.length);
      assert.equal(plan.slots.length, indices.length);
      assert.ok(plan.slots.every(slot => slot >= 0 && slot < plan.indices.length));
    }
    assert.deepEqual([...indices], Array.from({ length: 384 }, (_, i) => Math.round(i * (geometry.visiblePixelCount - 1) / 383)), 'requested visible-pixel identities/order stay exact');
    const expected = renderPatternLabRecipeFrame(recipe, { t: time, strips, symmetry, sidesMirrored,
      ...options, normBounds: geometry.normalizationBounds, gammaLUT: buildGammaLut(true, 2.2) }).pixels;
    const mismatches = [...indices].filter((index, sample) => {
      const color = expected[index];
      return color.r !== actual[sample * 3] || color.g !== actual[sample * 3 + 1] || color.b !== actual[sample * 3 + 2];
    });
    assert.deepEqual(mismatches, [], `${mismatches.length} sampled LEDs differ; first ${mismatches.slice(0, 8)}`);
    const decoded = renderPixelFrame({ t: time, strips: normalizeProjectRenderStrips(patternLabDisplayStrips(strips)),
      activeFn: patternLabWorkerColorLookup({ colors: actual, indices }) }).pixels;
    assert.deepEqual([...indices].map(index => decoded[index]), [...indices].map(index => expected[index]), 'mounted canvas decoder must not reapply side indices or strip colors');
  });
}

for (const variant of ['four-own', 'four-mirrored', 'same', 'empty-lead',
  'coordinate-own', 'coordinate-mirrored', 'coordinate-plain', 'coordinate-single',
  'coordinate-kaleidoscope', 'coordinate-layered', 'radial-own', 'radial-mirrored',
  'journey-own', 'journey-mirrored', 'journey-coordinate', 'journey-native-own', 'journey-native-mirrored']) {
  test(`exact full pixel identity across side and symmetry mappings (${variant})`, async () => {
    const counts = variant === 'coordinate-single' ? [1350] : [233, 421, 317, 379];
    const strips = counts.map((count, i) => ({ id: `s${i}`, speed: 0.8 + i * 0.1,
      brightness: 0.6 + i * 0.1, hueShift: i * 10,
      pixels: Array.from({ length: count }, (_, j) => ({ x: i % 2 ? count - j : j, y: i * 20 + Math.sin(j / 10) * 10 })) }));
    if (variant === 'coordinate-kaleidoscope') strips[1].kaleidoscope = { enabled: true, pointCount: 4, startLed: 1, offsets: [0, 0, 1, -1] };
    const symmetry = ['coordinate-plain', 'coordinate-single'].includes(variant) ? null : {
      orientation: variant === 'same' ? 'same' : 'mirror',
      sides: variant === 'empty-lead'
        ? [{ id: 'empty', stripIds: [] }, { id: 'other', stripIds: ['s1', 's0', 's3', 's2'] }]
        : ['s1', 's3', 's0', 's2'].map((id, i) => ({ id: `side-${i}`, stripIds: [id] })),
    };
    const sidesMirrored = !variant.endsWith('own');
    const symSettings = variant.includes('coordinate')
      ? { enabled: true, type: 'guide-mirror', guide: { mode: 'split', axis: { x1: 0, y1: 0, x2: 1, y2: 0 } } }
      : variant.startsWith('radial') ? { enabled: true, type: 'radial', count: 4, phase: 0.2 } : null;
    const recipe = variant.startsWith('journey')
      ? createPatternLabRecipe({ base: { kind: 'color-journey', id: 'slow-color-drift', params: {} },
        journey: createSlowColorDriftJourney({ stops: [
          { id: 'red', color: '#ff0000', holdMs: 1000, fadeMs: 2000 },
          { id: 'blue', color: '#0000ff', holdMs: 1000, fadeMs: 2000 },
        ], motionSpeedSeconds: 18, character: 'expressive' }) })
      : recipeFromPattern('chase', { palette: ['#000000', '#ffffff'] });
    recipe.base.params.dotSize = 0.15;
    if (variant.includes('native')) recipe.sourceLook = { nativeSourcePhase16: Array.from({ length: 1350 }, (_, i) => ((i * 197) % 65536).toString(16).padStart(4, '0')).join('') };
    if (variant === 'coordinate-layered') recipe.layers = [{ id: 'layer', enabled: true, opacity: 0.6,
      blendMode: 'screen', generator: { kind: 'lightweaver-pattern', patternId: 'scanner', params: { width: 0.4 } },
      target: { kind: 'section', stripIds: ['s1', 's0'] }, transforms: [{ kind: 'rotate', degrees: 45 }],
      mask: { kind: 'linear', angle: 30, offset: 0.5, width: 0.4, softness: 0.1 } }];
    const geometry = compactPatternLabWorkerGeometry({ strips, symmetry, sidesMirrored, symSettings, gammaEnabled: true, gammaValue: 2.2 });
    const options = { masterSpeed: 1, masterBrightness: 0.7, masterSaturation: 0.8, masterHueShift: 15,
      motionWeights: { drift: 0.1, flow: 0.3, pulse: 0.2, surge: 0.4 } };
    const time = 12.5;
    const frame = await workerFrame(geometry, recipe, options, time);
    const indices = new Uint32Array(frame.indices), colors = new Uint8ClampedArray(frame.colors);
    assert.equal(indices.length, 384);
    assert.equal(colors.length, 384 * 3);
    assert.ok(frame.stats.allocatedBytes <= 4 * 1024 * 1024);
    const expected = renderPatternLabRecipeFrame(recipe, { t: time, strips, symmetry, sidesMirrored, symSettings,
      ...options, normBounds: geometry.normalizationBounds, gammaLUT: buildGammaLut(true, 2.2) }).pixels;
    const mismatches = [...indices].filter((index, sample) => ['r', 'g', 'b'].some((key, channel) => expected[index][key] !== colors[sample * 3 + channel]));
    assert.deepEqual(mismatches, [], `${mismatches.length} sampled pixels differ; first ${mismatches.slice(0, 8)}`);
    const decoded = renderPixelFrame({ t: time, strips: normalizeProjectRenderStrips(patternLabDisplayStrips(strips)),
      activeFn: patternLabWorkerColorLookup({ colors, indices }) }).pixels;
    assert.deepEqual([...indices].map(index => decoded[index]), [...indices].map(index => expected[index]));
  });
}

test('quick samples match corresponding LWSEQ pixels in reversed physical wiring order', async () => {
  const { bakePatternLabRecipe } = await import('./lwseqBake.js');
  const { resolvePatternLabControls } = await import('./patternLabControls.js');
  const { compileWiring } = await import('./wiringCompiler.js');
  const strips = [133, 211, 171, 229].map((count, i) => ({ id: `s${i}`, speed: 1,
    brightness: 0.65 + i * 0.1, hueShift: i * 10,
    pixels: Array.from({ length: count }, (_, j) => ({ x: j, y: i * 30 })) }));
  const symmetry = { fold: 2, orientation: 'mirror', sides: [
    { id: 'lead', stripIds: ['s1', 's0'] }, { id: 'twin', stripIds: ['s2', 's3'] },
  ] };
  const wiring = { version: 1, locked: true, verified: true,
    outputs: [{ id: 'out', name: 'Out', pin: 16, runIds: ['s2', 's0', 's3', 's1'] }],
    runs: strips.map((strip, i) => ({ id: strip.id, type: 'strip', verified: true,
      directionPolicy: 'fixed', physicalDirection: i % 2 ? 'source-reverse' : 'source-forward', seamLed: null,
      source: { stripId: strip.id, from: 0, to: strip.pixels.length - 1 } })),
  };
  const compiledWiring = compileWiring({ strips, wiring, symmetry });
  assert.equal(compiledWiring.sendReady, true);
  const recipe = recipeFromPattern('chase');
  recipe.base.params = { dotSize: 0.15 };
  recipe.playback.brightness = 0.7;
  recipe.evolution.durationSeconds = 300;
  const controls = resolvePatternLabControls(recipe, 12);
  const options = { masterSpeed: 1, masterBrightness: controls.effectiveBrightness,
    masterSaturation: controls.masterSaturation, masterHueShift: controls.masterHueShift, motionWeights: controls.motionWeights };
  const naturalSlots = new Map();
  let offset = 0;
  strips.forEach(strip => { strip.pixels.forEach((_, i) => naturalSlots.set(`${strip.id}:${i}`, offset + i)); offset += strip.pixels.length; });
  const physicalSlots = new Map(compiledWiring.pixels.map((pixel, i) => [naturalSlots.get(`${pixel.stripId}:${pixel.sourceLed}`), i]));
  for (const sidesMirrored of [false, true]) {
    const geometry = compactPatternLabWorkerGeometry({ strips, symmetry, sidesMirrored, gammaEnabled: true, gammaValue: 2.2 });
    const frame = await workerFrame(geometry, recipe, options, controls.renderTime);
    const indices = new Uint32Array(frame.indices), colors = new Uint8ClampedArray(frame.colors);
    const baked = await bakePatternLabRecipe({ recipe, strips, symmetry, sidesMirrored, wiring, compiledWiring, fps: 1,
      render: { bpm: 120, gammaEnabled: true, gammaValue: 2.2 } });
    const mismatches = [...indices].filter((index, sample) => {
      const byte = 64 + (12 * geometry.visiblePixelCount + physicalSlots.get(index)) * 3;
      return colors[sample * 3] !== baked.bytes[byte] || colors[sample * 3 + 1] !== baked.bytes[byte + 1] || colors[sample * 3 + 2] !== baked.bytes[byte + 2];
    });
    assert.deepEqual(mismatches, [], `physical bake differs in ${sidesMirrored ? 'mirrored' : 'own'} mode`);
  }
});

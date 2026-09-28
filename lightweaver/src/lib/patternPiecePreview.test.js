import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSectionTargets } from './sectionLookModel.js';
import {
  PATTERN_PREVIEW_UI_STORAGE_PREFIX,
  applyPatternPreviewSegmentLooks,
  buildPatternPreviewSegments,
  fitPreviewViewBox,
  readPatternPreviewUiState,
  writePatternPreviewUiState,
} from './patternPiecePreview.js';
import { compilePattern, normalizePalette, renderPixelFrame } from './frameEngine.js';
import { makeDefaultWiring } from './wiringModel.js';
import { compileWiring } from './wiringCompiler.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';

const strips = [{
  id: 'petal-strip',
  name: 'Petals',
  offsetX: 100,
  offsetY: 20,
  pixels: [
    { x: 0, y: 0, index: 0 },
    { x: 10, y: 10, index: 1 },
    { x: 20, y: 20, index: 2 },
    { x: 30, y: 30, index: 3 },
  ],
}, {
  id: 'center-strip',
  name: 'Center',
  pixels: [
    { x: 300, y: 150, index: 0 },
    { x: 310, y: 150, index: 1 },
  ],
}, {
  id: 'art-only-layer',
  name: 'Artwork only',
  pixels: [],
}];

const patchBoard = {
  physicalLocked: false,
  dataWireCount: 1,
  chains: [{
    id: 'main',
    name: 'Main physical strip',
    rowIds: ['center', 'art-only', 'petal-tail', 'petal-head'],
  }],
  groups: [],
  patches: [{
    id: 'petal-head',
    name: 'Petal head',
    source: { type: 'strip', stripId: 'petal-strip', startLed: 0, endLed: 1 },
    output: { mode: 'normal' },
    playback: { patternId: 'fire', brightness: 0.4, speed: 1.5 },
  }, {
    id: 'center',
    name: 'Center',
    source: { type: 'strip', stripId: 'center-strip', startLed: 0, endLed: 1 },
    output: { mode: 'normal' },
    playback: { patternId: 'ocean', brightness: 0.8, speed: 0.7 },
  }, {
    id: 'petal-tail',
    name: 'Petal tail',
    source: { type: 'strip', stripId: 'petal-strip', startLed: 3, endLed: 2 },
    output: { mode: 'normal' },
    playback: { patternId: 'sparkle' },
  }, {
    id: 'art-only',
    name: 'Artwork only',
    source: { type: 'strip', stripId: 'art-only-layer', startLed: 0, endLed: 8 },
    output: { mode: 'normal' },
    playback: { patternId: 'aurora' },
  }],
};

test('preview segments include only real LED ranges in physical wiring order', () => {
  const targets = deriveSectionTargets({ strips, patchBoard, defaultLook: { patternId: 'aurora' } });
  const segments = buildPatternPreviewSegments({ strips, patchBoard, targets });
  const targetIds = targets
    .filter(target => target.kind === 'section' && target.id !== 'art-only')
    .map(target => target.id);

  assert.deepEqual(segments.map(segment => segment.id), targetIds);
  assert.deepEqual(segments.map(segment => segment.pixels.length), [2, 2, 2]);
  assert.deepEqual(segments[1].pixels.map(pixel => [pixel.x, pixel.y]), [[130, 50], [120, 40]]);
});

test('preview segments follow compiled wiring zones when Patterns uses those targets', () => {
  const ledStrips = [strips[0]];
  const wiring = makeDefaultWiring(ledStrips);
  const compiledWiring = compileWiring({ wiring, strips: ledStrips });
  assert.equal(compiledWiring.ok, true);
  const targets = deriveSectionTargets({
    strips: ledStrips,
    wiring,
    compiledWiring,
    defaultLook: { patternId: 'aurora' },
  });
  const segments = buildPatternPreviewSegments({
    strips: ledStrips,
    wiring,
    compiledWiring,
    targets,
  });
  const sectionIds = targets.filter(target => target.kind === 'section').map(target => target.id);
  assert.ok(sectionIds.length > 0);
  assert.deepEqual(segments.map(segment => segment.id), sectionIds);
  assert.equal(segments[0].pixels.length, ledStrips[0].pixels.length);
});

test('preview segments preserve each target assignment and an unsaved draft override', () => {
  const targets = deriveSectionTargets({ strips, patchBoard, defaultLook: { patternId: 'aurora' } });
  const draftTarget = targets.find(target => target.id.includes('2-3'));
  const effectiveTargets = targets.map(target => target.id === draftTarget.id
    ? {
        ...target,
        look: {
          ...target.look,
          patternId: 'plasma',
          brightness: 0.33,
          speed: 1.75,
          hueShift: -24,
          customHue: 160,
          customSaturation: 91,
          customBreathe: true,
          customDrift: true,
        },
      }
    : target);

  const segments = buildPatternPreviewSegments({ strips, patchBoard, targets: effectiveTargets });
  const draft = segments.find(segment => segment.id === draftTarget.id);
  const saved = segments.find(segment => segment.id === 'center');

  assert.equal(saved.patternId, 'ocean');
  assert.deepEqual(draft.visualLook, effectiveTargets.find(target => target.id === draftTarget.id).look);
  assert.equal(draft.patternId, 'plasma');
  assert.equal(draft.brightness, 0.33);
  assert.equal(draft.speed, 1.75);
  assert.equal(draft.hueShift, 0, 'the firmware-faithful visual post-pass owns hue shift');
  assert.ok(Array.isArray(draft.palette) && draft.palette.length > 0);
});

test('selected-target viewBox tightly fits actual mapped geometry with padding', () => {
  const viewBox = fitPreviewViewBox([{
    pixels: [{ x: 100, y: 20 }, { x: 130, y: 50 }],
  }], '0 0 640 400');

  assert.equal(viewBox, '96 16 38 38');
});

test('preview UI state is isolated per project and falls back when a target was deleted', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  writePatternPreviewUiState({
    projectId: 'piece-a',
    state: { mode: 'piece', lastTargetId: 'petal-tail' },
    storage,
  });
  writePatternPreviewUiState({
    projectId: 'piece-b',
    state: { mode: 'strip', lastTargetId: 'center' },
    storage,
  });

  assert.deepEqual(readPatternPreviewUiState({
    projectId: 'piece-a', targetIds: ['center', 'petal-tail'], storage,
  }), { mode: 'piece', lastTargetId: 'petal-tail', restored: true });
  assert.deepEqual(readPatternPreviewUiState({
    projectId: 'piece-a', targetIds: ['center'], storage,
  }), { mode: 'piece', lastTargetId: 'center', restored: true });
  assert.deepEqual(readPatternPreviewUiState({
    projectId: 'piece-b', targetIds: ['center', 'petal-tail'], storage,
  }), { mode: 'strip', lastTargetId: 'center', restored: true });
});

test('fresh and legacy previews show the whole piece while explicit strip focus persists', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const args = { projectId: 'four-section-piece', targetIds: ['a', 'b', 'c', 'd'], storage };
  assert.equal(readPatternPreviewUiState(args).mode, 'piece');

  // v1 wrote strip focus on every visit, even when the visitor never selected it.
  values.set('lw_pattern_piece_preview_v1:four-section-piece', JSON.stringify({ mode: 'strip', lastTargetId: 'b' }));
  assert.equal(readPatternPreviewUiState(args).mode, 'piece');

  writePatternPreviewUiState({ projectId: args.projectId, state: { mode: 'strip', lastTargetId: 'c' }, storage });
  assert.notEqual(PATTERN_PREVIEW_UI_STORAGE_PREFIX, 'lw_pattern_piece_preview_v1:');
  assert.deepEqual(readPatternPreviewUiState(args), { mode: 'strip', lastTargetId: 'c', restored: true });
});

test('four real sections keep their separate pattern, palette, and LED counts in one frame', () => {
  const counts = [12, 13, 14, 15];
  const patterns = ['fire', 'ocean', 'plasma', 'sparkle'];
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  const sectionStrips = counts.map((count, section) => ({
    id: `strip-${section}`,
    pixels: Array.from({ length: count }, (_, index) => ({
      x: section * 100 + index * 2,
      y: section * 20,
      index,
    })),
  }));
  const patches = counts.map((count, section) => ({
    id: `section-${section}`,
    name: `Section ${section + 1}`,
    source: { type: 'strip', stripId: `strip-${section}`, startLed: 0, endLed: count - 1 },
    output: { mode: 'normal' },
    playback: { patternId: patterns[section], brightness: 1, speed: 1 },
  }));
  const board = {
    physicalLocked: false,
    dataWireCount: 1,
    chains: [{ id: 'main', name: 'Main', rowIds: patches.map(patch => patch.id) }],
    groups: [],
    patches,
  };
  const targets = deriveSectionTargets({ strips: sectionStrips, patchBoard: board });
  const segments = buildPatternPreviewSegments({
    strips: sectionStrips,
    patchBoard: board,
    targets,
    paletteForPattern: patternId => [colors[patterns.indexOf(patternId)]],
  });
  assert.deepEqual(segments.map(segment => segment.id), patches.map(patch => patch.id));
  assert.deepEqual(segments.map(segment => segment.pixels.length), counts);
  assert.deepEqual(segments.map(segment => segment.patternId), patterns);
  assert.deepEqual(segments.map(segment => segment.palette[0]), colors);
  assert.equal(segments.reduce((sum, segment) => sum + segment.pixels.length, 0), 54);
  assert.equal(segments[3].pixels.at(-1).x, 328);

  const renderStrips = normalizeProjectRenderStrips(segments);
  const perStripFns = new Map(patterns.map(patternId => [patternId, (_index, _x, _y, _t, _time, _count, palette) => {
    const color = palette[0];
    return { r: color.r * 255, g: color.g * 255, b: color.b * 255 };
  }]));
  const frame = renderPixelFrame({
    t: 0,
    strips: renderStrips,
    patternId: patterns[0],
    perStripFns,
    perStripPalettes: new Map(segments.map(segment => [segment.id, normalizePalette(segment.palette)])),
  });
  assert.deepEqual(frame.stripFrames.map(section => section.leds.length), counts);
  assert.deepEqual(frame.stripFrames.map(section => {
    const { r, g, b } = section.leds[0];
    return [r, g, b];
  }), [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]);
});

test('whole-piece rendering supports a palette and firmware color look per segment', () => {
  const fn = compilePattern('gradient');
  const segments = [{
    id: 'warm',
    patternId: 'gradient',
    pixels: [{ x: 0, y: 0 }],
    visualLook: { customHue: 32, customSaturation: 230 },
  }, {
    id: 'cool',
    patternId: 'gradient',
    pixels: [{ x: 1, y: 0 }],
    visualLook: { customHue: 96, customSaturation: 230, customBreathe: true },
  }];
  const stripsForFrame = segments.map(segment => ({
    ...segment,
    pts: segment.pixels.map((pixel, index) => ({ ...pixel, p: index })),
  }));
  const frame = renderPixelFrame({
    t: 1,
    strips: stripsForFrame,
    patternId: 'gradient',
    activeFn: fn,
    perStripFns: new Map([['gradient', fn]]),
    perStripPalettes: new Map([
      ['warm', normalizePalette(['#ff0000', '#ff0000'])],
      ['cool', normalizePalette(['#0000ff', '#0000ff'])],
    ]),
  });
  assert.deepEqual(frame.pixels[0], { r: 255, g: 0, b: 0 });
  assert.deepEqual(frame.pixels[1], { r: 0, g: 0, b: 255 });
  const pixels = applyPatternPreviewSegmentLooks(frame.pixels, segments, 1000);

  assert.deepEqual(pixels[0], { r: 255, g: 0, b: 0 });
  assert.notDeepEqual(pixels[1], pixels[0]);
  assert.ok(pixels[1].b > 0 || pixels[1].g > 0);
});

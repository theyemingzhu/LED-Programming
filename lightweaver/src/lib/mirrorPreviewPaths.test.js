// Every preview and bake path must show a mirrored side exactly as side 1. The
// card plays a side as one continuous zone and copies it onto its twins, so a
// preview or a baked sequence that lets a twin free-run shows the owner
// something the card will not play.

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPatternPreviewSegmentLooks, buildPatternPreviewSegments } from './patternPiecePreview.js';
import { renderPixelFrame } from './frameEngine.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';
import { mirrorSourceIndex } from './mirrorFrame.js';
import { compileWiring } from './wiringCompiler.js';
import { makeDefaultWiring } from './wiringModel.js';
import { deriveSectionTargets } from './sectionLookModel.js';
import { compactPatternLabWorkerGeometry } from './patternLabWorkerProtocol.js';

const strip = (id, count, x0, y) => ({
  id,
  name: id,
  pixels: Array.from({ length: count }, (_, index) => ({ x: x0 + index * 7, y: y + index * 3 })),
});

const side = (id, stripIds) => ({ id, label: id, stripIds });
const symmetry = (orientation = 'mirror') => ({
  fold: 2,
  orientation,
  sides: [side('side-1', ['a1', 'a2']), side('side-2', ['b1', 'b2'])],
});

// A compiled wiring shaped like the compiler's output for that symmetry: each
// side is one zone of one range per strip, in the side's order.
function compiledFixture(counts = { a1: 4, a2: 4, b1: 4, b2: 4 }) {
  const strips = [
    strip('a1', counts.a1, 0, 0), strip('a2', counts.a2, 0, 40),
    strip('b1', counts.b1, 200, 10), strip('b2', counts.b2, 200, 50),
  ];
  const pixels = [];
  const ranges = {};
  for (const item of strips) {
    ranges[item.id] = { start: pixels.length, count: item.pixels.length };
    item.pixels.forEach((pixel, sourceLed) => pixels.push({ ...pixel, stripId: item.id, sourceLed }));
  }
  const compiledWiring = {
    ok: true,
    pixels,
    zones: [
      { id: 'side-1', ranges: [ranges.a1, ranges.a2], continuous: true },
      { id: 'side-2', ranges: [ranges.b1, ranges.b2], continuous: true },
    ],
  };
  return { strips, compiledWiring };
}

const mirroredTarget = () => ({
  kind: 'section', id: 'side-1', zoneId: 'side-1', label: 'Both sides, mirrored',
  mirroredSides: ['side-2'], look: { patternId: 'rainbow' },
});

function segmentsFor(targets, sym = symmetry(), counts) {
  const { strips, compiledWiring } = compiledFixture(counts);
  return buildPatternPreviewSegments({
    strips, compiledWiring, symmetry: sym, targets,
    resolvePatternId: id => id, paletteForPattern: () => undefined,
  });
}

function render(segments, extra = {}) {
  const strips = normalizeProjectRenderStrips(segments);
  const frame = renderPixelFrame({ t: 1.3, strips, patternId: 'rainbow', ...extra });
  applyPatternPreviewSegmentLooks(frame.pixels, segments, 1300, extra);
  return frame.pixels;
}

// ── patternPiecePreview: a mirrored side renders as lead + copy ───────────

test('a side is one segment holding every strip in the side, in order', () => {
  const segments = segmentsFor([mirroredTarget()]);
  assert.equal(segments[0].id, 'side-1');
  assert.equal(segments[0].pixels.length, 8);
  assert.deepEqual(segments[0].pixels.map(pixel => pixel.stripId), ['a1', 'a1', 'a1', 'a1', 'a2', 'a2', 'a2', 'a2']);
});

test('"Both sides, mirrored" adds one copy segment per mirrored side, flipped by the rule', () => {
  const segments = segmentsFor([mirroredTarget()]);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].mirrorOf, undefined);
  assert.equal(segments[1].id, 'side-2');
  assert.equal(segments[1].mirrorOf, 'side-1');
  assert.equal(segments[1].mirrorFlip, true);
  assert.equal(segments[1].targetId, 'side-1', 'selecting the target still means both sides');
  assert.equal(segments[1].pixels.length, 8);
  assert.equal(segmentsFor([mirroredTarget()], symmetry('same'))[1].mirrorFlip, false);
});

test('the copy segment is side 1 reversed in the rendered frame, and not one long strip', () => {
  const segments = segmentsFor([mirroredTarget()]);
  const pixels = render(segments);
  assert.equal(pixels.length, 16);
  assert.ok(pixels.slice(0, 8).some(pixel => pixel.r || pixel.g || pixel.b), 'the lead is lit');
  assert.deepEqual(pixels.slice(8, 16), pixels.slice(0, 8).reverse(), 'twin is the lead, reversed');

  // The lead really is one run across both strips: it equals a single 8-LED strip.
  const single = renderPixelFrame({
    t: 1.3, patternId: 'rainbow',
    strips: normalizeProjectRenderStrips([{ id: 'one', pixels: segments[0].pixels }]),
  });
  assert.deepEqual(pixels.slice(0, 8), single.pixels.slice(0, 8).map(({ r, g, b }) => ({ r, g, b })));

  // Control: without the mirror fields the same segments free-run and differ.
  const free = render(segments.map(({ mirrorOf, mirrorFlip, ...rest }) => rest));
  assert.notDeepEqual(free.slice(8, 16), free.slice(0, 8).reverse());
});

test('a continuous zone plays one run: index and count span the side, not the piece', () => {
  const segments = segmentsFor([mirroredTarget()]);
  assert.deepEqual(segments[0].run, { before: 0, length: 8 });
  const log = [];
  const probe = (index, x, y, t, time, count, palette, beat, beatSin, params, stripId, stripProgress) => {
    log.push({ index, count, stripId, stripProgress });
    return [0, 0, 0];
  };
  renderPixelFrame({ t: 0, strips: normalizeProjectRenderStrips(segments), patternId: 'aurora', activeFn: probe });
  const lead = log.filter(entry => entry.stripId === 'side-1');
  assert.deepEqual(lead.map(entry => entry.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(lead.every(entry => entry.count === 8), 'count is the side, not the 16 LEDs on screen');
  assert.ok(Math.abs(lead.at(-1).stripProgress - 1) < 1e-9);
  // a zone that is not continuous keeps the piece-wide index and count
  const { strips, compiledWiring } = compiledFixture();
  const flat = buildPatternPreviewSegments({
    strips, compiledWiring: { ...compiledWiring, zones: compiledWiring.zones.map(({ continuous, ...zone }) => zone) },
    targets: [{ kind: 'section', id: 'side-1', zoneId: 'side-1', look: {} }, { kind: 'section', id: 'side-2', zoneId: 'side-2', look: {} }],
  });
  assert.equal(flat[0].run, undefined);
});

test('own mode: one segment per side and no copy', () => {
  const own = [
    { kind: 'section', id: 'side-1', zoneId: 'side-1', label: 'Left side', look: { patternId: 'rainbow' } },
    { kind: 'section', id: 'side-2', zoneId: 'side-2', label: 'Right side', look: { patternId: 'rainbow' } },
  ];
  const segments = segmentsFor(own);
  assert.deepEqual(segments.map(segment => segment.id), ['side-1', 'side-2']);
  assert.ok(segments.every(segment => segment.mirrorOf === undefined));
});

test('an unequal twin is stretched from side 1, ends to ends', () => {
  const segments = segmentsFor([mirroredTarget()], symmetry('same'), { a1: 3, a2: 3, b1: 2, b2: 3 });
  assert.equal(segments[0].pixels.length, 6);
  assert.equal(segments[1].pixels.length, 5);
  const pixels = render(segments);
  [0, 1, 3, 4, 5].forEach((source, i) => {
    assert.deepEqual(pixels[6 + i], pixels[source], `twin LED ${i}`);
  });
  assert.deepEqual(pixels[6], pixels[0]);
  assert.deepEqual(pixels[10], pixels[5]);
});

test('with the real compiler and targets: a mirrored piece previews as side 1 plus its reversed copy', () => {
  const { strips } = compiledFixture();
  const sym = symmetry('mirror');
  const wiring = makeDefaultWiring(strips);
  const compiledWiring = compileWiring({ wiring, strips, symmetry: sym });
  assert.equal(compiledWiring.ok, true);
  assert.equal(compiledWiring.zones.find(zone => zone.id === 'side-1')?.continuous, true);

  const build = sidesMirrored => {
    const targets = deriveSectionTargets({ strips, wiring, compiledWiring, symmetry: sym, sidesMirrored })
      .filter(target => target.kind === 'section')
      .map(target => ({ ...target, look: { ...target.look, patternId: 'rainbow' } }));
    return buildPatternPreviewSegments({
      strips, wiring, compiledWiring, symmetry: sym, targets,
      resolvePatternId: id => id, paletteForPattern: () => undefined,
    });
  };

  const mirrored = build(true);
  assert.deepEqual(mirrored.map(segment => segment.id), ['side-1', 'side-2']);
  assert.equal(mirrored[1].mirrorOf, 'side-1');
  assert.equal(mirrored[1].mirrorFlip, true);
  const pixels = render(mirrored);
  assert.deepEqual(pixels.slice(8), pixels.slice(0, 8).reverse());

  const own = build(false);
  assert.deepEqual(own.map(segment => segment.id), ['side-1', 'side-2']);
  assert.ok(own.every(segment => segment.mirrorOf === undefined));
  assert.ok(own.every(segment => segment.run?.length === 8), 'each side is its own run');
});

// ── PatternPreview: segment looks must not make twins differ ──────────────

test('per-segment looks run before the mirror, so a mirrored side always equals side 1', () => {
  const colours = () => [{ r: 255, g: 0, b: 0 }, { r: 0, g: 200, b: 40 }, { r: 10, g: 20, b: 250 }];
  const segments = [
    { id: 'lead', pixels: colours(), visualLook: { customHue: 100, customSaturation: 180 } },
    { id: 'twin', pixels: colours(), visualLook: { customHue: 200, customSaturation: 230 }, mirrorOf: 'lead', mirrorFlip: false },
  ];
  const frame = () => [...colours(), ...colours()].map(pixel => ({ ...pixel }));

  const mirrored = applyPatternPreviewSegmentLooks(frame(), segments, 0);
  assert.deepEqual(mirrored.slice(3, 6), mirrored.slice(0, 3), 'twin equals the lead after looks');
  assert.notDeepEqual(mirrored.slice(0, 3), colours(), 'the lead look really was applied');

  // Control: with different looks and no mirror pass the twin does differ, so
  // the assertion above can only pass because the mirror ran after the looks.
  const unmirrored = applyPatternPreviewSegmentLooks(frame(), segments.map(({ mirrorOf, ...rest }) => rest), 0);
  assert.notDeepEqual(unmirrored.slice(3, 6), unmirrored.slice(0, 3));
});

test('looks then mirror also stretches an unequal twin from side 1, reversed when flipped', () => {
  const segments = [
    { id: 'lead', pixels: [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }], visualLook: {} },
    { id: 'twin', pixels: [{ r: 1, g: 1, b: 1 }, { r: 2, g: 2, b: 2 }], visualLook: { customHue: 90 }, mirrorOf: 'lead', mirrorFlip: true },
  ];
  const frame = [
    { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 },
    { r: 1, g: 1, b: 1 }, { r: 2, g: 2, b: 2 },
  ];
  applyPatternPreviewSegmentLooks(frame, segments, 0);
  assert.deepEqual(frame[3], frame[2], 'flipped: the twin starts where the lead ends');
  assert.deepEqual(frame[4], frame[0]);
});

test('layout strips are mirrored by symmetry + sidesMirrored after the looks too', () => {
  const strips = ['a1', 'a2', 'b1', 'b2'].map((id, i) => ({
    id, pixels: Array.from({ length: 3 }, (_, k) => ({ x: i * 10 + k, y: i })), visualLook: {},
  }));
  const px = n => ({ r: n, g: n * 2, b: n * 3 });
  const frame = Array.from({ length: 12 }, (_, i) => px(i + 1));
  applyPatternPreviewSegmentLooks(frame, strips, 0, { symmetry: symmetry('mirror'), sidesMirrored: true });
  assert.deepEqual(frame.slice(6, 12), frame.slice(0, 6).reverse());
  const own = Array.from({ length: 12 }, (_, i) => px(i + 1));
  applyPatternPreviewSegmentLooks(own, strips, 0, { symmetry: symmetry('mirror'), sidesMirrored: false });
  assert.deepEqual(own, Array.from({ length: 12 }, (_, i) => px(i + 1)));
});

// ── Pattern Lab worker: the symmetry rides with the geometry ──────────────

test('worker geometry carries symmetry, and a piece without it keeps its byte count', () => {
  const strips = [strip('a1', 4, 0, 0), strip('a2', 4, 0, 40), strip('b1', 4, 100, 40), strip('b2', 4, 100, 80)];
  const plain = compactPatternLabWorkerGeometry({ strips });
  const withNull = compactPatternLabWorkerGeometry({ strips, symmetry: null, sidesMirrored: true });
  const mirrored = compactPatternLabWorkerGeometry({ strips, symmetry: symmetry(), sidesMirrored: true });
  const own = compactPatternLabWorkerGeometry({ strips, symmetry: symmetry(), sidesMirrored: false });
  assert.equal(plain.symmetry, undefined);
  assert.equal(withNull.geometryBytes, plain.geometryBytes);
  assert.deepEqual(mirrored.symmetry, {
    orientation: 'mirror',
    sides: [{ id: 'side-1', stripIds: ['a1', 'a2'] }, { id: 'side-2', stripIds: ['b1', 'b2'] }],
  });
  assert.equal(mirrored.sidesMirrored, true);
  assert.equal(own.sidesMirrored, false);
  assert.ok(mirrored.geometryBytes > plain.geometryBytes);
});

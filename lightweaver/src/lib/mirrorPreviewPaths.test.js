// Every preview and bake path must show a mirror set's twins exactly as the lead.
// The card plays a set as one zone (each range restarts at its own LED 1), so a
// preview or a baked sequence that lets a twin free-run shows the owner something
// the card will not play.

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPatternPreviewSegmentLooks, buildPatternPreviewSegments, expandPatternPreviewMirrorSegments } from './patternPiecePreview.js';
import { renderPixelFrame } from './frameEngine.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';
import { compileWiring } from './wiringCompiler.js';
import { makeDefaultWiring } from './wiringModel.js';
import { deriveSectionTargets } from './sectionLookModel.js';
import { mirrorSourceIndex } from './mirrorFrame.js';
import { compactPatternLabWorkerGeometry } from './patternLabWorkerProtocol.js';

const strip = (id, count, x0, y) => ({
  id,
  name: id,
  pixels: Array.from({ length: count }, (_, index) => ({ x: x0 + index * 7, y: y + index * 3 })),
});

// ── patternPiecePreview: a mirror zone renders as lead + copies ───────────

function pieceFixture() {
  const strips = [strip('lead', 4, 0, 0), strip('twin', 4, 100, 40)];
  const wiring = makeDefaultWiring(strips);
  const mirrorSets = [{ id: 'mirror-1', name: 'Pair', members: ['lead', 'twin'] }];
  const compiledWiring = compileWiring({ wiring, strips, mirrorSets });
  assert.equal(compiledWiring.ok, true);
  const targets = deriveSectionTargets({ strips, wiring, compiledWiring, mirrorSets })
    .filter(target => target.kind === 'section')
    .map(target => ({ ...target, look: { ...target.look, patternId: 'rainbow' } }));
  const segments = buildPatternPreviewSegments({
    strips, wiring, compiledWiring, mirrorSets, targets,
    resolvePatternId: id => id, paletteForPattern: () => undefined,
  });
  return { strips, wiring, mirrorSets, compiledWiring, targets, segments };
}

function renderExpanded(segments, mirrorSets) {
  const expanded = expandPatternPreviewMirrorSegments(segments, mirrorSets);
  const frame = renderPixelFrame({
    t: 1.3,
    strips: normalizeProjectRenderStrips(expanded.strips),
    patternId: 'rainbow',
    mirrorSets: expanded.mirrorSets,
  });
  applyPatternPreviewSegmentLooks(frame.pixels, expanded.strips, 1300, { mirrorSets: expanded.mirrorSets });
  return { expanded, pixels: frame.pixels };
}

test('a mirror zone becomes one segment that remembers each member, in range order', () => {
  const { segments } = pieceFixture();
  assert.equal(segments.length, 1);
  assert.equal(segments[0].pixels.length, 8);
  assert.deepEqual(segments[0].mirror.groups, [{ stripId: 'lead', count: 4 }, { stripId: 'twin', count: 4 }]);
});

test('patternPiecePreview: the twin members render as copies of the lead, not one long strip', () => {
  const { segments, mirrorSets } = pieceFixture();
  const { expanded, pixels } = renderExpanded(segments, mirrorSets);

  assert.equal(expanded.strips.length, 2, 'one virtual strip per member');
  assert.equal(pixels.length, 8, 'the frame keeps the segment pixel count and order');
  assert.ok(pixels.slice(0, 4).some(pixel => pixel.r || pixel.g || pixel.b), 'the lead is lit');
  assert.deepEqual(pixels.slice(4, 8), pixels.slice(0, 4), 'twin equals lead');

  // The old behaviour: one strip holding every member runs the pattern on
  // through the twin's pixels, so the twin never matches its lead.
  const oldFrame = renderPixelFrame({ t: 1.3, strips: normalizeProjectRenderStrips(segments), patternId: 'rainbow' });
  assert.notDeepEqual(oldFrame.pixels.slice(4, 8), oldFrame.pixels.slice(0, 4));
});

// ── PatternPreview: segment looks must not make twins differ ──────────────

test('per-segment looks run before the mirror, so twins always equal the lead', () => {
  const colours = () => [{ r: 255, g: 0, b: 0 }, { r: 0, g: 200, b: 40 }, { r: 10, g: 20, b: 250 }];
  const segments = [
    { id: 'lead', pixels: colours(), visualLook: { customHue: 100, customSaturation: 180 } },
    { id: 'twin', pixels: colours(), visualLook: { customHue: 200, customSaturation: 230 } },
  ];
  const mirrorSets = [{ id: 'm', members: ['lead', 'twin'] }];
  const frame = () => [...colours(), ...colours()].map(pixel => ({ ...pixel }));

  const mirrored = applyPatternPreviewSegmentLooks(frame(), segments, 0, { mirrorSets });
  assert.deepEqual(mirrored.slice(3, 6), mirrored.slice(0, 3), 'twin equals the lead after looks');
  assert.notDeepEqual(mirrored.slice(0, 3), colours(), 'the lead look really was applied');

  // Control: with different looks and no mirror pass the twin does differ, so
  // the assertion above can only pass because the mirror ran after the looks.
  const unmirrored = applyPatternPreviewSegmentLooks(frame(), segments, 0);
  assert.notDeepEqual(unmirrored.slice(3, 6), unmirrored.slice(0, 3));
});

// ── Pattern Lab worker: the mirror rides with the geometry ────────────────

test('worker geometry carries mirror sets, and an unmirrored piece keeps its byte count', () => {
  const strips = [strip('lead', 4, 0, 0), strip('twin', 4, 100, 40)];
  const plain = compactPatternLabWorkerGeometry({ strips });
  const mirrored = compactPatternLabWorkerGeometry({
    strips,
    mirrorSets: [{ id: 'mirror-1', name: 'Pair', members: ['lead', 'twin'] }, { id: 'lone', members: ['x'] }],
  });
  assert.equal(plain.mirrorSets, undefined);
  assert.deepEqual(mirrored.mirrorSets, [{ id: 'mirror-1', members: ['lead', 'twin'] }]);
  assert.ok(mirrored.geometryBytes > plain.geometryBytes);
});

test('looks then mirror also stretches an unequal twin from the lead', () => {
  const segments = [
    { id: 'lead', pixels: [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }], visualLook: {} },
    { id: 'twin', pixels: [{ r: 1, g: 1, b: 1 }, { r: 2, g: 2, b: 2 }], visualLook: { customHue: 90 } },
  ];
  const frame = [
    { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 },
    { r: 1, g: 1, b: 1 }, { r: 2, g: 2, b: 2 },
  ];
  applyPatternPreviewSegmentLooks(frame, segments, 0, { mirrorSets: [{ id: 'm', members: ['lead', 'twin'] }] });
  assert.deepEqual(frame[3], frame[mirrorSourceIndex(0, 2, 3)]);
  assert.deepEqual(frame[4], frame[mirrorSourceIndex(1, 2, 3)]);
});

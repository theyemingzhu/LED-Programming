import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPatternPreviewSegmentLooks, buildPatternPreviewSegments } from './patternPiecePreview.js';
import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { compilePattern, renderPixelFrame } from './frameEngine.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';
import { reverseStripPath } from './layoutGeometry.js';
import { createDefaultPatchBoard } from './patchBoard.js';
import { mapSceneExpressionPreviewFrame } from './sceneExpressionFrame.js';
import { compileWiring, playbackSlotsInStripFrame } from './wiringCompiler.js';
import { mapLayoutPatternFrame } from '../components/layout/hooks/layoutFrameMapping.js';

const patterns = ['meteor', 'scanner', 'chase', 'rainbow', 'sunset'];
const counts = [11, 10, 10, 10, 5];
const strips = counts.map((pixelCount, index) => ({
  id: `part-${index + 1}`, name: `Part ${index + 1}`, pixelCount,
  pixels: Array.from({ length: pixelCount }, (_, led) => ({ x: index * 20 + led, y: index })),
}));
const targets = strips.map((strip, index) => ({
  kind: 'section', id: strip.id, look: { patternId: patterns[index] },
}));
function fixture(flipped = []) {
  const runs = strips.map((strip, index) => ({
    id: `run-${strip.id}`, type: 'strip', source: { stripId: strip.id, from: 0, to: strip.pixelCount - 1 },
    physicalDirection: flipped.includes(index) ? 'source-reverse' : 'source-forward', verified: true,
  }));
  const wiring = {
    version: 1, locked: true, verified: true, runs,
    outputs: [{ id: 'main', pin: 18, runIds: runs.slice(0, 4).map(run => run.id) },
      { id: 'neighbor', pin: 17, runIds: [runs[4].id] }],
  };
  const compiledWiring = compileWiring({ strips, wiring });
  assert.equal(compiledWiring.ok, true);
  const sectionLooks = Object.fromEntries(targets.map(target => [target.id, target.look]));
  const config = buildCardRuntimePackageFromProject({
    strips, wiring, compiledWiring, patchBoard: createDefaultPatchBoard(strips),
    standaloneController: {
      defaultLook: { patternId: 'aurora' },
      looks: [{ id: 'directional', label: 'Four directional effects', sectionLooks }],
      playlist: [{ type: 'combo', lookId: 'directional' }],
    },
  }).config;
  return { wiring, compiledWiring, config };
}

const frame = strips.flatMap((strip, index) => strip.pixels.map((point, led) => ({
  ...point, r: 10 + led, g: 20 + index, b: 200 - led * (index + 1),
})));

test('four independent effect families retain their installed ranges, with run-local flips and an untouched output', () => {
  const before = fixture();
  const after = fixture([0, 1, 2, 3]);
  const combo = config => config.looks.find(look => look.id === 'combo-directional').zones.map(zone => [zone.id, zone.patternId]);
  assert.deepEqual(combo(after.config), combo(before.config));
  assert.deepEqual(combo(after.config).map(([, pattern]) => pattern), patterns);
  assert.deepEqual(after.config.zones.map(zone => [zone.id, zone.ranges]), before.config.zones.map(zone => [zone.id, zone.ranges]));
  assert.deepEqual(after.config.led.outputs.map(output => [output.pin, output.pixels]), [[18, 41], [17, 5]]);
  assert.deepEqual(after.config.led.outputs[0].segments.map(segment => segment.direction), ['reverse', 'reverse', 'reverse', 'reverse']);
  assert.deepEqual(after.config.led.outputs[1], before.config.led.outputs[1]);
  assert.deepEqual(after.compiledWiring.pixels, before.compiledWiring.pixels, 'logical addresses do not move');
  assert.deepEqual(fixture().config, before.config, 'unflip returns the original runtime config');
});

test('Layout, Patterns and outgoing physical frames reverse only the selected section, exactly once', () => {
  const { compiledWiring } = fixture([1]);
  const segments = buildPatternPreviewSegments({ strips, compiledWiring, targets, previewPlaybackDirection: true });
  let start = 0;
  const source = segments.map(segment => {
    const end = start + segment.pixels.length;
    const leds = frame.slice(start, end);
    start = end;
    return { id: segment.id, leds };
  });
  const ordinaryFrame = structuredClone(source).flatMap(section => section.leds);
  const layout = mapLayoutPatternFrame({ stripFrames: structuredClone(source) }, {
    strips, renderSegments: segments, previewTime: 1, mirrorSides: false, hidden: {},
  });
  const patternsFrame = applyPatternPreviewSegmentLooks(structuredClone(ordinaryFrame), segments, 1_000);
  const physicalSlots = playbackSlotsInStripFrame(compiledWiring, strips);
  assert.deepEqual(physicalSlots.slice(11, 21), [20, 19, 18, 17, 16, 15, 14, 13, 12, 11]);
  assert.deepEqual(physicalSlots.slice(21), frame.slice(21).map((_, i) => i + 21));
  assert.deepEqual(patternsFrame.map(pixel => pixel.r), physicalSlots.map(index => frame[index].r));
  for (let index = 0, start = 0; index < strips.length; start += counts[index++]) {
    assert.deepEqual(layout.get(strips[index].id).leds.map(pixel => pixel.r),
      physicalSlots.slice(start, start + counts[index]).map(slot => frame[slot].r));
  }
  const stream = mapSceneExpressionPreviewFrame({ framePixels: ordinaryFrame, segments, compiledWiring });
  assert.equal(stream.ok, true);
  const rgbHex = pixel => [pixel.r, pixel.g, pixel.b].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  assert.deepEqual(stream.pixels, physicalSlots.map(index => rgbHex(frame[index])));
});

test('a zone with two physical runs retains both ranges and reverses inside the chosen run', () => {
  const { wiring, compiledWiring: before } = fixture();
  const middle = wiring.runs[2];
  middle.source.to = 4;
  wiring.runs.push({ ...middle, id: 'part-3-tail', source: { ...middle.source, from: 5, to: 9 }, physicalDirection: 'source-reverse' });
  wiring.outputs[0].runIds.push('part-3-tail');
  const compiled = compileWiring({ strips, wiring });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.sendReady, true);
  assert.deepEqual(compiled.zones.map(zone => zone.id), before.zones.map(zone => zone.id));
  assert.deepEqual(compiled.zones.find(zone => zone.id === 'part-3').ranges, [{ start: 21, count: 5 }, { start: 36, count: 5 }]);
  const slots = playbackSlotsInStripFrame(compiled, strips);
  assert.deepEqual(slots.slice(21, 26), [21, 22, 23, 24, 25]);
  assert.deepEqual(slots.slice(26, 36), [31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
  assert.deepEqual(slots.slice(36, 41), [30, 29, 28, 27, 26]);
  assert.deepEqual(slots.slice(41), [41, 42, 43, 44, 45]);
});


test('the drawing path flip reverses installed and physical-frame playback exactly once', () => {
  const line = { ...strips[0], reversed: false };
  const other = { ...strips[4], reversed: false };
  const { wiring } = fixture();
  wiring.runs = [wiring.runs[0], wiring.runs[4]];
  wiring.outputs[0].runIds = [wiring.runs[0].id];
  const runtime = strip => {
    const strips = [strip, other];
    const compiledWiring = compileWiring({ strips, wiring });
    assert.equal(compiledWiring.sendReady, true);
    const config = buildCardRuntimePackageFromProject({
      strips, wiring, compiledWiring, patchBoard: createDefaultPatchBoard(strips),
    }).config;
    const segments = buildPatternPreviewSegments({ strips, compiledWiring, targets, previewPlaybackDirection: true });
    return { compiledWiring, config, segments };
  };
  const before = runtime(line);
  const turned = reverseStripPath(line);
  const after = runtime(turned);
  const firstSlots = Array.from({ length: line.pixelCount }, (_, index) => index);
  const tailSlots = Array.from({ length: other.pixelCount }, (_, index) => line.pixelCount + index);
  assert.deepEqual(after.config.zones, before.config.zones);
  assert.deepEqual(after.config.led.outputs[1], before.config.led.outputs[1]);
  assert.equal(after.config.led.outputs[0].segments[0].direction, 'reverse');
  assert.deepEqual(playbackSlotsInStripFrame(after.compiledWiring, [turned, other]), [...firstSlots.toReversed(), ...tailSlots]);
  assert.equal(after.segments[0].playbackOrder, undefined, 'Studio already displays the reversed drawing positions');
  assert.deepEqual(after.segments[0].pixels.map(point => point.x), before.segments[0].pixels.map(point => point.x).reverse());
  assert.deepEqual(runtime(reverseStripPath(turned)).config, before.config);
  // Compare finished colors at fixed artwork locations and card addresses.
  // Plasma travels in x/y. Chase travels by LED index.
  for (const patternId of ['plasma', 'chase']) {
    const framesAt = (state, t) => {
      const segments = [state.segments[0]];
      const frame = renderPixelFrame({
        t, patternId, activeFn: compilePattern(patternId),
        strips: normalizeProjectRenderStrips(segments.map(segment => ({ ...segment, patternId }))),
      });
      const rgbHex = rgb => [rgb.r, rgb.g, rgb.b].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
      const displayed = frame.stripFrames[0].leds.toSorted((a, b) => a.x - b.x).map(rgbHex);
      const slots = playbackSlotsInStripFrame(state.compiledWiring, [line, other]).slice(0, line.pixelCount);
      const physical = slots.map(index => rgbHex(frame.pixels[index]));
      assert.deepEqual(displayed, physical);
      return displayed;
    };
    const instants = [0.2, 1.3, 2.4];
    const baseline = instants.map(t => framesAt(before, t));
    assert.notDeepEqual(baseline[0], baseline[2], `${patternId} is moving`);
    assert.deepEqual(instants.map(t => framesAt(after, t)), baseline.map(frame => frame.toReversed()));
  }

  wiring.runs[0].physicalDirection = 'source-reverse';
  const both = runtime(turned);
  assert.equal(both.config.led.outputs[0].segments[0].direction, 'forward');
  assert.deepEqual(playbackSlotsInStripFrame(both.compiledWiring, [turned, other]), [...firstSlots, ...tailSlots]);
  assert.deepEqual(both.segments[0].playbackOrder, firstSlots.toReversed());
});

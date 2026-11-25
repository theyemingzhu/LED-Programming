import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_BAKE_FPS } from './lwseqBake.js';
import { mirrorSourceIndex } from './mirrorFrame.js';
import { MAX_STORED_SEQUENCE_BYTES } from './recordedSequenceAsset.js';
import { LWSEQ_HEADER_BYTES } from './standaloneController.js';
import { compileWiring } from './wiringCompiler.js';
import { makeDefaultWiring } from './wiringModel.js';
import {
  PLACED_LOOK_MAX_BYTES,
  PLACED_LOOK_MAX_FPS,
  PLACED_LOOK_PALETTES,
  bakePlacedLook,
  defaultPlacedLookFrame,
  estimatePlacedLookBake,
  normalizePlacedLook,
  placedFrameCorners,
  placedLookColour,
  placedLookFrame,
  placedLookLoop,
  placedLookOnCentre,
  placedLookStops,
  toPlacedFrame,
} from './placedLook.js';

// A 100 x 100 frame centred on (50, 50). Colour A at one end of a band, B at the other.
const A = [200, 100, 0];
const B = [0, 100, 200];
const look = (extra = {}) => normalizePlacedLook({
  mode: 'sweep', frame: { x: 50, y: 50, halfWidth: 50, halfHeight: 50, turn: 0 },
  colours: [A, B], width: 0.5, softness: 0, repeat: 1, speed: 0.25, ...extra,
});
const at = (x, y) => ({ x, y });
const row = (id, xs, y = 50) => ({ id, pixels: xs.map(x => ({ x, y })) });
const rgb = led => [led.r, led.g, led.b];

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

test('normalizePlacedLook fills defaults, clamps every dial and does not mutate', () => {
  const blank = normalizePlacedLook(null);
  assert.equal(blank.kind, 'placed');
  assert.equal(blank.mode, 'rings');
  assert.deepEqual(blank.colours, PLACED_LOOK_PALETTES.ember.map(colour => [...colour]));
  assert.deepEqual([blank.width, blank.softness, blank.repeat, blank.speed, blank.reverse, blank.alikeOnSides], [0.38, 0.7, 2, 0.3, false, true]);

  const wild = deepFreeze({ mode: 'spiral', frame: { x: '12', y: NaN, halfWidth: -40, halfHeight: 0, turn: 999 },
    colours: [[300, -5, 12.6], 'red'], width: 5, softness: -1, repeat: 2.6, speed: 9, reverse: 'yes', alikeOnSides: false });
  const clean = normalizePlacedLook(wild);
  assert.equal(clean.mode, 'rings');
  assert.deepEqual(clean.frame, { x: 12, y: 0, halfWidth: 40, halfHeight: 1, turn: 180 });
  assert.deepEqual(clean.colours, [[255, 0, 13], [...PLACED_LOOK_PALETTES.ember[1]]]);
  assert.deepEqual([clean.width, clean.softness, clean.repeat, clean.speed, clean.reverse, clean.alikeOnSides], [0.9, 0, 3, 1, false, false]);
  assert.equal(normalizePlacedLook({ repeat: 99 }).repeat, 6);
  assert.equal(normalizePlacedLook({ width: 0 }).width, 0.05);
  // A second pass changes nothing, and the result shares nothing with the input.
  assert.deepEqual(normalizePlacedLook(clean), clean);
  assert.notEqual(normalizePlacedLook(clean).frame, clean.frame);
  assert.notEqual(normalizePlacedLook(clean).colours[0], clean.colours[0]);
});

test('a new look starts as a frame around every LED, in the LEDs\' own space', () => {
  const strips = [row('a', [100, 300], 40), row('b', [200], 240)];
  const frame = defaultPlacedLookFrame(strips);
  assert.equal(frame.x, 200);
  assert.equal(frame.y, 140);
  assert.ok(frame.halfWidth > 100 && frame.halfHeight > 100);
  for (const strip of strips) for (const point of strip.pixels) {
    const { u, v } = toPlacedFrame(normalizePlacedLook({ frame }), point);
    assert.ok(u > 0 && u < 1 && v > 0 && v < 1);
  }
  assert.deepEqual(normalizePlacedLook({}, { strips }).frame, frame);
  assert.deepEqual(defaultPlacedLookFrame([]), { x: 0, y: 0, halfWidth: 100, halfHeight: 100, turn: 0 });
});

test('sweep: hand-computed colours across the frame', () => {
  const sweep = look();
  // u = .5 -> p = .5: the middle of the band, halfway between the two colours.
  assert.deepEqual(placedLookColour(sweep, at(50, 50), 0), [100, 100, 100]);
  // u = .4 -> p = .4: inside the band (d = .2 < width .5), 40% of the way from A to B.
  assert.deepEqual(placedLookColour(sweep, at(40, 50), 0), [120, 100, 80]);
  // u = .25 -> d = .5: the edge of the band, dark.
  assert.deepEqual(placedLookColour(sweep, at(25, 50), 0), [0, 0, 0]);
  // v does not matter to a sweep.
  assert.deepEqual(placedLookColour(sweep, at(40, 3), 0), [120, 100, 80]);
});

test('softness fades the band edge with a smoothstep', () => {
  // softness 1 -> the whole half-band (0.5) is edge. d = .2 -> (.5 - .2) / .5 = .6 -> smoothstep .648.
  assert.deepEqual(placedLookColour(look({ softness: 1 }), at(40, 50), 0), [78, 65, 52]);
  // softness .08 -> edge .04. u = .26 -> d = .48 -> level .5 -> smoothstep .5, of [148, 100, 52].
  assert.deepEqual(placedLookColour(look({ softness: 0.08 }), at(26, 50), 0), [74, 50, 26]);
});

test('the sweep moves across the frame, and "run the other way" turns it round', () => {
  // speed .25 passes a second: after one second the band's middle has gone from u = .5 to u = .75.
  assert.deepEqual(placedLookColour(look(), at(75, 50), 1), [100, 100, 100]);
  assert.deepEqual(placedLookColour(look(), at(25, 50), 1), [0, 0, 0]);
  assert.deepEqual(placedLookColour(look({ reverse: true }), at(25, 50), 1), [100, 100, 100]);
  assert.deepEqual(placedLookColour(look({ reverse: true }), at(75, 50), 1), [0, 0, 0]);
  // One whole pass later (4 s) the picture is where it began.
  assert.deepEqual(placedLookColour(look(), at(40, 50), 4), placedLookColour(look(), at(40, 50), 0));
});

test('repeat fits that many bands across the frame', () => {
  // repeat 2: u = .25 -> p = .5 and u = .75 -> p = .5: two band middles.
  const two = look({ repeat: 2 });
  assert.deepEqual(placedLookColour(two, at(25, 50), 0), [100, 100, 100]);
  assert.deepEqual(placedLookColour(two, at(75, 50), 0), [100, 100, 100]);
  assert.deepEqual(placedLookColour(two, at(50, 50), 0), [0, 0, 0]);
});

test('outside the frame is dark', () => {
  for (const mode of ['sweep', 'rings']) {
    const placed = look({ mode });
    assert.equal(placedLookColour(placed, at(101, 50), 0), null);
    assert.equal(placedLookColour(placed, at(-1, 50), 0), null);
    assert.equal(placedLookColour(placed, at(50, 100.5), 0), null);
    assert.notEqual(placedLookColour(placed, at(100, 100), 0), null);
  }
  const frame = placedLookFrame(look(), [row('in', [40]), row('out', [140, 150])], 0);
  assert.deepEqual(frame.byStrip.get('out').leds.map(rgb), [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(frame.byStrip.get('in').leds.map(rgb), [[120, 100, 80]]);
});

test('turn swings the picture about the frame\'s centre', () => {
  const turned = look({ frame: { x: 50, y: 50, halfWidth: 50, halfHeight: 50, turn: 90 } });
  // A quarter turn clockwise: the sweep now runs down the screen.
  for (const step of [-30, -10, 10, 25, 40]) {
    assert.deepEqual(placedLookColour(turned, at(50, 50 + step), 0), placedLookColour(look(), at(50 + step, 50), 0));
  }
  assert.deepEqual(placedLookColour(turned, at(50, 75), 1), [100, 100, 100]);
  // The corners turn with it, and stay the corners of the 0..1 space.
  const corners = placedFrameCorners(look({ frame: { x: 50, y: 50, halfWidth: 40, halfHeight: 10, turn: 30 } }));
  const turned30 = look({ frame: { x: 50, y: 50, halfWidth: 40, halfHeight: 10, turn: 30 } });
  const local = corners.map(corner => toPlacedFrame(turned30, corner)).map(({ u, v }) => [Math.round(u * 1e9) / 1e9 + 0, Math.round(v * 1e9) / 1e9 + 0]);
  assert.deepEqual(local, [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test('rings: hand-computed, and the same in every direction from the frame\'s centre', () => {
  const rings = look({ mode: 'rings' });
  // The centre is along = 0 -> p = 0: between bands, dark.
  assert.deepEqual(placedLookColour(rings, at(50, 50), 0), [0, 0, 0]);
  // Halfway out (along = .5) is the band's middle, whichever way you go.
  for (const point of [at(75, 50), at(25, 50), at(50, 75), at(50, 25)]) {
    assert.deepEqual(placedLookColour(rings, point, 0), [100, 100, 100]);
  }
  for (const [dx, dy] of [[12, 7], [31, -4], [-20, 22], [3, 40]]) {
    const colour = placedLookColour(rings, at(50 + dx, 50 + dy), 0.7);
    assert.deepEqual(placedLookColour(rings, at(50 - dx, 50 - dy), 0.7), colour);
    assert.deepEqual(placedLookColour(rings, at(50 + dx, 50 - dy), 0.7), colour);
    assert.deepEqual(placedLookColour(rings, at(50 - dx, 50 + dy), 0.7), colour);
  }
  // Rings grow outward: a second later the band's middle is at along = .75.
  assert.deepEqual(placedLookColour(rings, at(87.5, 50), 1), [100, 100, 100]);
  // A sweep and rings are different pictures.
  assert.notDeepEqual(placedLookColour(rings, at(50, 50), 0), placedLookColour(look(), at(50, 50), 0));
});

test('rings follow the frame\'s shape and place', () => {
  const wide = look({ mode: 'rings', frame: { x: 200, y: 80, halfWidth: 100, halfHeight: 20, turn: 0 } });
  // along = .5 is 50 across but only 10 up.
  assert.deepEqual(placedLookColour(wide, at(250, 80), 0), [100, 100, 100]);
  assert.deepEqual(placedLookColour(wide, at(200, 90), 0), [100, 100, 100]);
  const moved = placedLookOnCentre(wide, { x: 0, y: 0 });
  assert.deepEqual(moved.frame, { x: 0, y: 0, halfWidth: 100, halfHeight: 20, turn: 0 });
  assert.equal(wide.frame.x, 200);
  assert.deepEqual(placedLookColour(moved, at(50, 0), 0), [100, 100, 100]);
  assert.equal(placedLookOnCentre(wide, null), wide);
});

test('placedLookFrame gives every LED of every strip its colour, in LED order', () => {
  const strips = [row('a', [50, 40, 25]), row('b', [75, 101])];
  const frame = placedLookFrame(look(), strips, 0);
  assert.deepEqual(frame.byStrip.get('a').leds.map(rgb), [[100, 100, 100], [120, 100, 80], [0, 0, 0]]);
  assert.deepEqual(frame.byStrip.get('b').leds.map(rgb), [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(frame.pixels.map(rgb), [...frame.byStrip.get('a').leds, ...frame.byStrip.get('b').leds].map(rgb));
  assert.deepEqual([frame.byStrip.get('a').avgR, frame.byStrip.get('a').avgG, frame.byStrip.get('a').avgB], [73, 67, 60]);
});

// Side 1 sits inside the frame; side 2 is somewhere the picture is not.
const SIDE_1 = [row('l1', [30, 35, 40]), row('l2', [45, 50])];
const SIDE_2 = [row('r1', [300, 310, 320], 400), row('r2', [330, 340], 400)];
const OWN = row('own', [60, 500]);
const sides = (orientation, second = ['r1', 'r2']) => ({ fold: 2, orientation,
  sides: [{ id: 'side-1', label: 'Left side', stripIds: ['l1', 'l2'] }, { id: 'side-2', label: 'Right side', stripIds: second }] });
const sideColours = (frame, ids) => ids.flatMap(id => frame.byStrip.get(id).leds.map(rgb));

test('alike on all sides: side 2 shows side 1, by the piece\'s own side order and flip rule', () => {
  const strips = [...SIDE_1, ...SIDE_2, OWN];
  const own = placedLookFrame(look({ alikeOnSides: false }), strips, 0.4, { symmetry: sides('same') });
  const lead = sideColours(own, ['l1', 'l2']);
  assert.ok(lead.some(colour => colour.some(Boolean)));
  // Off: side 2 is outside the frame, so it is dark.
  assert.deepEqual(sideColours(own, ['r1', 'r2']), Array(5).fill([0, 0, 0]));

  const same = placedLookFrame(look(), strips, 0.4, { symmetry: sides('same') });
  assert.deepEqual(sideColours(same, ['l1', 'l2']), lead);
  assert.deepEqual(sideColours(same, ['r1', 'r2']), lead);
  // A mirrored piece flips every second side (pieceSymmetry.sideFlipped).
  const mirrored = placedLookFrame(look(), strips, 0.4, { symmetry: sides('mirror') });
  assert.deepEqual(sideColours(mirrored, ['r1', 'r2']), [...lead].reverse());
  // The order of strips inside a side is the order the picture flows through it.
  const swapped = placedLookFrame(look(), strips, 0.4, { symmetry: sides('same', ['r2', 'r1']) });
  assert.deepEqual(sideColours(swapped, ['r2', 'r1']), lead);
  // A strip in no side keeps the colour under it.
  assert.deepEqual(same.byStrip.get('own').leds.map(rgb), own.byStrip.get('own').leds.map(rgb));
  // Without sides the switch does nothing.
  assert.deepEqual(placedLookFrame(look(), strips, 0.4).pixels.map(rgb), own.pixels.map(rgb));
});

test('alike on all sides stretches side 1 onto a side of another length', () => {
  const long = row('long', [300, 301, 302, 303, 304, 305, 306, 307], 400);
  const strips = [...SIDE_1, long];
  const symmetry = sides('same', ['long']);
  const frame = placedLookFrame(look(), strips, 0.4, { symmetry });
  const lead = sideColours(frame, ['l1', 'l2']);
  assert.deepEqual(frame.byStrip.get('long').leds.map(rgb), long.pixels.map((_, i) => lead[mirrorSourceIndex(i, 8, 5)]));
});

test('the faint picture: one repeat as stops that begin and end on the same colour', () => {
  const stops = placedLookStops(look(), 0, 8);
  assert.equal(stops.length, 9);
  assert.deepEqual(stops.map(stop => stop.offset), [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
  assert.deepEqual(stops[4], { offset: 0.5, level: 1, rgb: [100, 100, 100] });
  assert.equal(stops[0].level, 0);
  assert.deepEqual(stops[8].rgb, stops[0].rgb);
  assert.equal(stops[8].level, stops[0].level);
  // It moves with the look: a quarter pass on, the middle is at offset .75.
  assert.deepEqual(placedLookStops(look(), 1, 8)[6], { offset: 0.75, level: 1, rgb: [100, 100, 100] });
});

function wired(strips, symmetry = null) {
  const wiring = makeDefaultWiring(strips);
  const compiled = compileWiring({ wiring, strips, groups: [], symmetry });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  return compiled;
}
const frameBytes = (bake, index) => {
  const size = bake.pixelCount * 3;
  return Array.from(bake.bytes.subarray(LWSEQ_HEADER_BYTES + index * size, LWSEQ_HEADER_BYTES + (index + 1) * size));
};

test('the recording limits are the ones the other recorders use', () => {
  assert.equal(PLACED_LOOK_MAX_FPS, MAX_BAKE_FPS);
  assert.equal(PLACED_LOOK_MAX_BYTES, MAX_STORED_SEQUENCE_BYTES);
});

test('a loop holds whole passes and whole frames', () => {
  // speed .25: one pass is 4 s. Two seconds asked for still gives one whole pass.
  assert.deepEqual(placedLookLoop(look(), { seconds: 2, fps: 24 }), { passes: 1, frameCount: 96, fps: 24, seconds: 4 });
  assert.deepEqual(placedLookLoop(look(), { seconds: 20, fps: 24 }), { passes: 5, frameCount: 480, fps: 24, seconds: 20 });
  // A speed that does not divide evenly: 7 passes in 454 frames, about 18.9 s.
  const odd = placedLookLoop(look({ speed: 0.37 }), { seconds: 20, fps: 24 });
  assert.deepEqual([odd.passes, odd.frameCount], [7, 454]);
  // A still look is one picture.
  assert.deepEqual(placedLookLoop(look({ speed: 0 }), { seconds: 20, fps: 24 }), { passes: 0, frameCount: 1, fps: 24, seconds: 1 / 24 });
  assert.throws(() => placedLookLoop(look(), { fps: 25 }), RangeError);
  assert.throws(() => placedLookLoop(look(), { fps: 12.5 }), RangeError);
  assert.throws(() => placedLookLoop(look(), { seconds: 0 }), RangeError);
});

test('bake: LWSEQ1 header, length, and the card\'s physical pixel order', () => {
  const strips = [row('a', [50, 40, 25]), row('b', [75, 60])];
  const compiled = wired(strips);
  const bake = bakePlacedLook(look(), strips, compiled, { seconds: 2, fps: 24 });
  const view = new DataView(bake.bytes.buffer);
  assert.equal(String.fromCharCode(...bake.bytes.subarray(0, 6)), 'LWSEQ1');
  assert.equal(view.getUint32(12, true), 5);
  assert.equal(view.getUint32(16, true), 96);
  assert.equal(view.getUint16(20, true), 24);
  assert.equal(view.getUint16(22, true), 3);
  assert.equal(view.getUint16(10, true), compiled.outputs.length);
  assert.equal(view.getUint16(32, true), compiled.outputs[0].pin);
  assert.equal(view.getUint16(34, true), compiled.outputs[0].pixels);
  assert.equal(bake.byteLength, LWSEQ_HEADER_BYTES + 5 * 3 * 96);
  assert.equal(bake.bytes.byteLength, bake.byteLength);
  assert.deepEqual([bake.frameCount, bake.fps, bake.seconds, bake.passes, bake.pixelCount], [96, 24, 4, 1, 5]);
  assert.deepEqual(estimatePlacedLookBake(look(), compiled, { seconds: 2, fps: 24 }),
    { passes: 1, frameCount: 96, fps: 24, seconds: 4, pixelCount: 5, totalBytes: bake.byteLength, maxBytes: PLACED_LOOK_MAX_BYTES, fits: true });

  // Every frame is written in compiledWiring.pixels order: frame 24 is one second in.
  const byId = new Map(strips.map(strip => [strip.id, strip]));
  for (const [index, t] of [[0, 0], [24, 1], [60, 2.5]]) {
    const expected = compiled.pixels.flatMap(pixel => placedLookColour(look(), byId.get(pixel.stripId).pixels[pixel.sourceLed], t) || [0, 0, 0]);
    assert.deepEqual(frameBytes(bake, index), expected);
  }
});

test('bake follows the wiring, not the strip list: a moved first LED and a second output', () => {
  const strips = [row('a', [50, 40, 25]), row('b', [75, 60])];
  const base = makeDefaultWiring(strips);
  const runOf = id => base.runs.find(run => run.source?.stripId === id);
  const wiring = {
    ...base,
    outputs: [
      { ...base.outputs[0], id: 'out-b', pin: 17, runIds: [runOf('b').id] },
      { ...base.outputs[0], id: 'out-a', pin: 16, runIds: [runOf('a').id] },
    ],
    runs: base.runs.map(run => (run.source?.stripId === 'a' ? { ...run, seamLed: 1 } : run)),
  };
  const compiled = compileWiring({ wiring, strips, groups: [] });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  assert.deepEqual(compiled.pixels.map(pixel => `${pixel.stripId}:${pixel.sourceLed}`), ['b:0', 'b:1', 'a:1', 'a:2', 'a:0']);
  const bake = bakePlacedLook(look(), strips, compiled, { seconds: 2, fps: 24 });
  const colour = (x, t = 0) => placedLookColour(look(), at(x, 50), t);
  assert.deepEqual(frameBytes(bake, 0), [75, 60, 40, 25, 50].flatMap(x => colour(x)));
  const view = new DataView(bake.bytes.buffer);
  assert.deepEqual([view.getUint16(32, true), view.getUint16(34, true), view.getUint16(36, true), view.getUint16(38, true)], [17, 2, 16, 3]);
});

test('bake carries "alike on all sides" into the recording', () => {
  const strips = [...SIDE_1, ...SIDE_2];
  const symmetry = sides('mirror');
  const compiled = wired(strips, symmetry);
  const bake = bakePlacedLook(look(), strips, compiled, { seconds: 2, fps: 24, symmetry });
  const preview = placedLookFrame(look(), strips, 0, { symmetry });
  const offsets = new Map(); let offset = 0;
  for (const strip of strips) { offsets.set(strip.id, offset); offset += strip.pixels.length; }
  const expected = compiled.pixels.flatMap(pixel => rgb(preview.pixels[offsets.get(pixel.stripId) + pixel.sourceLed]));
  assert.deepEqual(frameBytes(bake, 0), expected);
  assert.ok(expected.slice(15).some(Boolean), 'side 2 is lit although it sits outside the frame');
});

test('the loop has no seam: the frame after the last equals the first', () => {
  const strips = [row('a', [50, 40, 25, 10, 90]), row('b', [75, 60, 33])];
  const compiled = wired(strips);
  for (const placed of [look(), look({ speed: 0.37, mode: 'rings', softness: 0.6 }), look({ speed: 0.9, reverse: true, repeat: 3 })]) {
    const bake = bakePlacedLook(placed, strips, compiled, { seconds: 20, fps: 24 });
    // Each frame moves the picture by passes / frames, so "frame N" is a whole number of passes on.
    const perFrame = bake.passes / bake.frameCount;
    const at = index => compiled.pixels.flatMap(pixel => {
      const point = strips.find(strip => strip.id === pixel.stripId).pixels[pixel.sourceLed];
      return placedLookColour({ ...placed, speed: 1 }, point, index * perFrame) || [0, 0, 0];
    });
    assert.deepEqual(frameBytes(bake, 0), at(0));
    assert.deepEqual(frameBytes(bake, bake.frameCount - 1), at(bake.frameCount - 1));
    assert.deepEqual(at(bake.frameCount), frameBytes(bake, 0));
    assert.notDeepEqual(frameBytes(bake, 1), frameBytes(bake, 0));
  }
  const still = bakePlacedLook(look({ speed: 0 }), strips, compiled, { seconds: 20, fps: 24 });
  assert.equal(still.frameCount, 1);
  assert.equal(still.byteLength, LWSEQ_HEADER_BYTES + 8 * 3);
});

test('bake refuses what the card could not take', () => {
  const strips = [row('a', [50, 40, 25])];
  const compiled = wired(strips);
  assert.throws(() => bakePlacedLook(look(), strips, compiled, { fps: 30 }), RangeError);
  assert.throws(() => bakePlacedLook(look(), strips, null), TypeError);
  assert.throws(() => bakePlacedLook(look(), strips, { ...compiled, ok: false }), TypeError);
  const small = estimatePlacedLookBake(look(), compiled, { seconds: 2, fps: 24, maxBytes: 500 });
  assert.equal(small.fits, false);
  assert.throws(() => bakePlacedLook(look(), strips, compiled, { seconds: 2, fps: 24, maxBytes: 500 }), RangeError);
  // A caller cannot raise the limit past the per-look cap.
  assert.equal(estimatePlacedLookBake(look(), compiled, { maxBytes: 1e12 }).maxBytes, PLACED_LOOK_MAX_BYTES);
  // 4096 lights at the slowest moving speed would pass 16 MB: reported, not written.
  const many = { ok: true, outputs: [{ id: 'o', pin: 16 }], pixels: Array.from({ length: 4096 }, () => ({ outputId: 'o', stripId: 'a', sourceLed: 0 })) };
  const big = estimatePlacedLookBake(look({ speed: 0.01 }), many, { seconds: 20, fps: 24 });
  assert.equal(big.frameCount, 2400);
  assert.equal(big.fits, false);
  assert.throws(() => bakePlacedLook(look({ speed: 0.01 }), strips, many, { seconds: 20, fps: 24 }), RangeError);
});

test('placedLookPhysicalFrame is the recording frame as hex, in wired order', async () => {
  const { placedLookPhysicalFrame } = await import('./placedLook.js');
  const strips = [row('a', [10, 20, 30, 40]), row('b', [60, 70, 80, 90])];
  const compiled = wired(strips);
  const still = look({ speed: 0 });
  const live = placedLookPhysicalFrame(still, strips, compiled, 0);
  assert.equal(live.length, compiled.pixels.length);
  assert.ok(live.every(colour => /^[0-9a-f]{6}$/.test(colour)));
  const bake = bakePlacedLook(still, strips, compiled, { seconds: 1 });
  const first = [];
  for (let index = 0; index < compiled.pixels.length; index += 1) {
    const at = 64 + index * 3;
    first.push([bake.bytes[at], bake.bytes[at + 1], bake.bytes[at + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
  }
  assert.deepEqual(live, first);
  assert.deepEqual(placedLookPhysicalFrame(still, strips, null, 0), []);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStripSchedule,
  buildRunSheet,
  stripLengthMm,
  stripPitchMm,
  formatMillimetres,
  formatAmps,
} from './wireBuildSheet.js';

// 3.7795 px per mm is the app's own fallback scale, so a 378px strip is ~100mm.
const PX_PER_MM = 3.7795;

const strip = (id, name, leds, svgLength, angle) => ({
  id,
  name,
  angle,
  color: '#f2b23c',
  svgLength,
  pixels: Array.from({ length: leds }, (_, i) => ({ x: i, y: 0 })),
});

const compiled = (runs, outputs = [{ id: 'out1', pin: 16 }]) => ({
  ok: true,
  runs,
  outputs,
});

// The shape a real project actually stores, read out of lw_autosave_v3: a run
// points at its strip through `source`, and carries the slice of it covered.
// The first build of this module read a flat run.stripId, found nothing, and
// rendered every row as "undefined" with no pitch.
test('a run finds its strip through source.stripId, as real projects store it', () => {
  const rows = buildStripSchedule({
    strips: [strip('strip-1', 'Line', 44, 2771.6333, 0)],
    compiledWiring: compiled([{
      id: 'run-strip-1',
      type: 'strip',
      outputId: 'out1',
      start: 0,
      count: 44,
      source: { stripId: 'strip-1', from: 0, to: 43 },
    }]),
    pxPerMm: PX_PER_MM,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Line');
  assert.equal(rows[0].stripId, 'strip-1');
  assert.equal(rows[0].leds, 44);
  assert.notEqual(rows[0].pitchMm, null);
  // 2771.6px / 3.7795 = 733.3mm over 43 gaps
  assert.equal(Math.round(rows[0].pitchMm * 10) / 10, 17.1);
});

test('a run pointing at a strip that is gone still names something readable', () => {
  const rows = buildStripSchedule({
    strips: [],
    compiledWiring: compiled([{
      id: 'r1', type: 'strip', outputId: 'out1', start: 0, count: 9,
      source: { stripId: 'ghost' },
    }]),
    pxPerMm: PX_PER_MM,
  });
  assert.equal(rows[0].name, 'ghost');
  assert.equal(rows[0].pitchMm, null);
});

test('a schedule follows the wire order, not the order strips were drawn', () => {
  const strips = [strip('a', 'Outer arc', 18, 1000), strip('b', 'Lower sweep', 15, 900)];
  const rows = buildStripSchedule({
    strips,
    // b is soldered first, a second — the reverse of the strips array
    compiledWiring: compiled([
      { id: 'r2', type: 'strip', source: { stripId: 'b' }, outputId: 'out1', start: 0, count: 15 },
      { id: 'r1', type: 'strip', source: { stripId: 'a' }, outputId: 'out1', start: 15, count: 18 },
    ]),
    pxPerMm: PX_PER_MM,
  });
  assert.deepEqual(rows.map(r => r.name), ['Lower sweep', 'Outer arc']);
  assert.deepEqual(rows.map(r => r.index), [1, 2]);
});

test('each row owns the block of pixel addresses the card will send it', () => {
  const rows = buildStripSchedule({
    strips: [strip('a', 'Outer arc', 18, 1000), strip('b', 'Lower sweep', 15, 900)],
    compiledWiring: compiled([
      { id: 'r1', type: 'strip', source: { stripId: 'a' }, outputId: 'out1', start: 0, count: 18 },
      { id: 'r2', type: 'strip', source: { stripId: 'b' }, outputId: 'out1', start: 18, count: 15 },
    ]),
    pxPerMm: PX_PER_MM,
  });
  assert.deepEqual(rows.map(r => [r.from, r.to]), [[1, 18], [19, 33]]);
});

test('a cable between two strips is not a row — it carries no pixels', () => {
  const rows = buildStripSchedule({
    strips: [strip('a', 'Outer arc', 18, 1000), strip('b', 'Lower sweep', 15, 900)],
    compiledWiring: compiled([
      { id: 'r1', type: 'strip', source: { stripId: 'a' }, outputId: 'out1', start: 0, count: 18 },
      { id: 'c1', type: 'cable', outputId: 'out1', start: 18, count: 0 },
      { id: 'r2', type: 'strip', source: { stripId: 'b' }, outputId: 'out1', start: 18, count: 15 },
    ]),
    pxPerMm: PX_PER_MM,
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => [r.from, r.to]), [[1, 18], [19, 33]]);
});

test('strips still list before a wire plan exists, marked as unplanned', () => {
  const rows = buildStripSchedule({
    strips: [strip('a', 'Outer arc', 18, 1000), strip('b', 'Lower sweep', 15, 900)],
    compiledWiring: null,
    pxPerMm: PX_PER_MM,
  });
  assert.deepEqual(rows.map(r => [r.from, r.to]), [[1, 18], [19, 33]]);
  assert.equal(rows.every(r => r.planned === false), true);
});

test('wiring that failed to compile is not treated as a wire order', () => {
  const rows = buildStripSchedule({
    strips: [strip('a', 'Outer arc', 18, 1000)],
    compiledWiring: { ok: false, runs: [], outputs: [] },
    pxPerMm: PX_PER_MM,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].planned, false);
});

test('pitch is the gap between LEDs, so one LED has no pitch at all', () => {
  // 1000px / 3.7795 = 264.6mm over 17 gaps = 15.6mm
  assert.equal(Math.round(stripPitchMm(strip('a', 'A', 18, 1000), 18, PX_PER_MM) * 10) / 10, 15.6);
  assert.equal(stripPitchMm(strip('a', 'A', 1, 1000), 1, PX_PER_MM), null);
  assert.equal(stripPitchMm(strip('a', 'A', 18, 0), 18, PX_PER_MM), null);
});

test('a strip with no drawn length reports no length rather than zero', () => {
  assert.equal(stripLengthMm({ svgLength: 0 }, PX_PER_MM), null);
  assert.equal(stripLengthMm({}, PX_PER_MM), null);
  assert.equal(Math.round(stripLengthMm({ svgLength: 1000 }, PX_PER_MM)), 265);
});

test('the sheet totals the run and reports one data line as continuous', () => {
  const sheet = buildRunSheet({
    strips: [strip('a', 'Outer arc', 18, 1000), strip('b', 'Lower sweep', 15, 900)],
    compiledWiring: compiled([
      { id: 'r1', type: 'strip', source: { stripId: 'a' }, outputId: 'out1', start: 0, count: 18 },
      { id: 'r2', type: 'strip', source: { stripId: 'b' }, outputId: 'out1', start: 18, count: 15 },
    ]),
    pxPerMm: PX_PER_MM,
    standaloneController: { led: { psuAmps: 5, milliampsPerPixel: 12 } },
  });
  assert.equal(sheet.totalLeds, 33);
  assert.equal(sheet.continuous, true);
  assert.equal(sheet.outputs.length, 1);
  assert.equal(Math.round(sheet.totalLengthMm), 503);
});

test('two data lines are not a continuous run', () => {
  const sheet = buildRunSheet({
    strips: [strip('a', 'Outer arc', 18, 1000), strip('b', 'Lower sweep', 15, 900)],
    compiledWiring: compiled(
      [
        { id: 'r1', type: 'strip', source: { stripId: 'a' }, outputId: 'out1', start: 0, count: 18 },
        { id: 'r2', type: 'strip', source: { stripId: 'b' }, outputId: 'out2', start: 18, count: 15 },
      ],
      [{ id: 'out1', pin: 16 }, { id: 'out2', pin: 17 }],
    ),
    pxPerMm: PX_PER_MM,
    standaloneController: { led: { psuAmps: 5 } },
  });
  assert.equal(sheet.continuous, false);
  assert.deepEqual(sheet.outputs.map(o => o.pin), [16, 17]);
});

test('draw is stated without a declared supply; the verdict is withheld', () => {
  const sheet = buildRunSheet({
    strips: [strip('a', 'Outer arc', 100, 1000)],
    compiledWiring: null,
    pxPerMm: PX_PER_MM,
    // no psuAmps: the owner has never said what is powering this
    standaloneController: { led: {} },
  });
  assert.equal(sheet.power.declared, false);
  // 100 LEDs x 12mA = 1.2A — true whatever the supply is
  assert.equal(sheet.power.maxAmps, 1.2);
  assert.equal(sheet.power.psuAmps, null);
  assert.equal(sheet.power.headroomAmps, null);
  assert.equal(sheet.power.status, 'unknown');
});

test('a declared supply gets a real verdict on both sides of the line', () => {
  const within = buildRunSheet({
    strips: [strip('a', 'A', 100, 1000)],
    pxPerMm: PX_PER_MM,
    standaloneController: { led: { psuAmps: 5, milliampsPerPixel: 12 } },
  });
  assert.equal(within.power.declared, true);
  assert.equal(within.power.safeAmps, 4); // 80% of 5A
  assert.equal(within.power.status, 'ok');

  const over = buildRunSheet({
    strips: [strip('a', 'A', 600, 1000)],
    pxPerMm: PX_PER_MM,
    standaloneController: { led: { psuAmps: 5, milliampsPerPixel: 12 } },
  });
  assert.equal(over.power.maxAmps, 7.2);
  assert.equal(over.power.status, 'over');
  assert.ok(over.power.headroomAmps < 0);
});

test('an empty design reports nothing rather than a zero-length run', () => {
  const sheet = buildRunSheet({ strips: [], compiledWiring: null, pxPerMm: PX_PER_MM });
  assert.deepEqual(sheet.rows, []);
  assert.equal(sheet.totalLeds, 0);
  assert.equal(sheet.totalLengthMm, null);
  assert.equal(sheet.continuous, false);
});

test('a run whose strips have no drawn length reports no total length', () => {
  const sheet = buildRunSheet({
    strips: [strip('a', 'A', 18, 0)],
    compiledWiring: null,
    pxPerMm: PX_PER_MM,
  });
  assert.equal(sheet.totalLeds, 18);
  assert.equal(sheet.totalLengthMm, null);
});

test('unknown measurements print as a dash, never as zero', () => {
  assert.equal(formatMillimetres(null), '—');
  assert.equal(formatMillimetres(15.64), '15.6 mm');
  assert.equal(formatMillimetres(1250), '1.25 m');
  assert.equal(formatAmps(null), '—');
  assert.equal(formatAmps(2.4), '2.40 A');
});

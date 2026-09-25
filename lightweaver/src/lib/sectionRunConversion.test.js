import test from 'node:test';
import assert from 'node:assert/strict';
import { convertExistingRunsToSections, migrateRunSectionReferences } from './sectionRunConversion.js';
import { compileWiring } from './wiringCompiler.js';
import { makeLayoutSnapshot, applyLayoutSnapshot } from '../state/layoutReducer.js';

test('connected-section history retains exact sampled LED points through Undo/Redo', () => {
  const original = { id: 'source', pathData: 'M 0,0 L 10,0', pixelCount: 2, pixels: [{ x: 8, y: 9 }, { x: 6, y: 7 }] };
  const other = { id: 'other', pathData: 'M 0,0 L 10,0', pixelCount: 1, pixels: [{ x: 1, y: 1 }] };
  const state = { strips: [original, other], sectionFamilies: [{ memberIds: ['source'] }],
    selection: { kind: 'none', ids: [], name: '' }, layerGroups: [], layerOrder: [] };
  const snapshot = makeLayoutSnapshot(state);
  assert.deepEqual(snapshot.strips[0].pixels, original.pixels);
  assert.equal(snapshot.strips[1].pixels, undefined);
  const applied = applyLayoutSnapshot(state, snapshot, strip => strip.pixels ? strip : { ...strip, pixels: [{ x: 99, y: 99 }] });
  assert.deepEqual(applied.strips[0].pixels, original.pixels);
});

for (const counts of [[2, 3], [2, 3, 4], [2, 3, 4, 5]]) {
  test(`${counts.length} run boundaries retain the independent GPIO/address oracle`, () => {
    const total = counts.reduce((sum, count) => sum + count, 0);
    const strip = { id: 'piece', name: 'Piece', pixelCount: total, pathData: 'M 0,0 L 100,0',
      pixels: Array.from({ length: total }, (_, x) => ({ x, y: 0 })) };
    let start = 0;
    const ranges = counts.map((count, index) => {
      const range = { id: `r${index}`, type: 'strip', source: { stripId: 'piece', from: start, to: start + count - 1 },
        physicalDirection: index % 2 ? 'source-reverse' : 'source-forward', verified: true };
      start += count;
      return range;
    });
    const order = ranges.map((_, index) => ranges.length - index - 1);
    const pins = [16, 17, 18, 21];
    const outputs = order.map((rangeIndex, outputIndex) => ({ id: `out${outputIndex}`, pin: pins[outputIndex], runIds: [ranges[rangeIndex].id] }));
    const expected = order.flatMap((rangeIndex, outputIndex) => {
      const range = ranges[rangeIndex];
      const leds = Array.from({ length: counts[rangeIndex] }, (_, address) => range.source.from + address);
      if (range.physicalDirection === 'source-reverse') leds.reverse();
      return leds.map((sourceLed, address) => [pins[outputIndex], address, sourceLed]);
    });
    const wiring = { outputs, runs: ranges, verified: true };
    const board = { chains: [{ id: 'main', rowIds: ['p'] }], patches: [{ id: 'p', source: { type: 'strip', stripId: 'piece', startLed: 0, endLed: total - 1, autoRange: true }, output: { mode: 'normal' }, playback: { patternId: 'ocean' } }] };
    const converted = convertExistingRunsToSections({ strips: [strip], wiring, patchBoard: board,
      stripId: 'piece', paths: counts.map((_, index) => `M ${index},0 L ${index + 1},0`) });
    assert.equal(converted.ok, true, converted.error);
    const oldByRun = new Map(ranges.map(run => [run.id, run]));
    const actual = converted.wiring.outputs.flatMap(output => output.runIds.flatMap(runId => {
      const run = converted.wiring.runs.find(item => item.id === runId);
      const original = oldByRun.get(runId);
      const leds = Array.from({ length: run.source.to + 1 }, (_, address) => original.source.from + address);
      if (run.physicalDirection === 'source-reverse') leds.reverse();
      return leds.map((sourceLed, address) => [output.pin, address, sourceLed]);
    }));
    assert.deepEqual(actual, expected);
    assert.deepEqual(converted.strips.map(item => item.pixelCount), counts);
    assert.equal(converted.wiring.verified, true);
  });
}

test('same GPIO multi-run split retains disjoint address order and refuses a duplicate patch id', () => {
  const strip = { id: 'piece', name: 'Piece', pixelCount: 4, pathData: 'M 0,0 L 4,0', pixels: Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })) };
  const wiring = { outputs: [{ id: 'a', pin: 16, runIds: ['r0', 'r1'] }], runs: [
    { id: 'r0', type: 'strip', source: { stripId: 'piece', from: 0, to: 1 } },
    { id: 'r1', type: 'strip', source: { stripId: 'piece', from: 2, to: 3 } },
  ] };
  const board = { chains: [{ id: 'main', rowIds: ['p', 'patch-strip-1'] }], patches: [
    { id: 'p', source: { type: 'strip', stripId: 'piece', startLed: 0, endLed: 3, autoRange: true }, output: { mode: 'normal' }, playback: { patternId: 'fire' } },
    { id: 'patch-strip-1', source: { type: 'off', ledCount: 1 }, output: { mode: 'off' } },
  ] };
  const result = convertExistingRunsToSections({ strips: [strip], wiring, patchBoard: board, stripId: 'piece', paths: ['M 0,0 L 2,0', 'M 2,0 L 4,0'] });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.wiring.outputs[0].runIds, ['r0', 'r1']);
  assert.deepEqual(result.patchIdentityMap.p, ['p', 'patch-strip-1-2']);
  const grouped = convertExistingRunsToSections({ strips: [strip], wiring, patchBoard: board, stripId: 'piece',
    paths: ['M 0,0 L 2,0', 'M 2,0 L 4,0'], layerGroups: [{ id: 'g', name: 'Shared ring', members: [{ stripId: 'piece' }] }] });
  assert.equal(grouped.ok, false);
  assert.match(grouped.error, /Ungroup/);
});

test('reference migration expands saved looks and scene leaves, then undoes against current unrelated edits', () => {
  const map = { identityMap: { piece: ['piece', 'part'] }, patchIdentityMap: { 'patch-piece': ['patch-piece', 'patch-part'] } };
  const controller = { brightness: 0.2, playlist: [{ lookId: 'mix' }], looks: [
    { id: 'mix', sectionLooks: { 'patch-piece': { patternId: 'fire' } } },
    { id: 'native', defaultLook: { patternId: 'aurora' }, sectionLooks: { piece: { patternId: 'ocean' } } },
  ] };
  const expressionScenes = { scenes: [{ id: 'scene', steps: [{ assignments: [{ selection: { areaIds: ['strip:piece', 'all'] } }] }] }] };
  const forward = migrateRunSectionReferences({ controller, expressionScenes, ...map });
  assert.deepEqual(Object.keys(forward.controller.looks[0].sectionLooks), ['patch-piece', 'patch-part']);
  assert.deepEqual(forward.controller.looks[1].sectionLooks.part, { patternId: 'ocean' });
  assert.deepEqual(forward.expressionScenes.scenes[0].steps[0].assignments[0].selection.areaIds, ['strip:piece', 'strip:part', 'all']);
  forward.controller.brightness = 0.7;
  forward.controller.playlist = [];
  forward.expressionScenes.scenes = [];
  const undone = migrateRunSectionReferences({ ...forward, ...map, reverse: true });
  assert.equal(undone.controller.brightness, 0.7);
  assert.deepEqual(undone.controller.playlist, []);
  assert.deepEqual(undone.expressionScenes.scenes, []);
  assert.deepEqual(Object.keys(undone.controller.looks[0].sectionLooks), ['patch-piece']);
  forward.controller.looks[0].sectionLooks['patch-part'] = { patternId: 'ocean' };
  assert.throws(() => migrateRunSectionReferences({ ...forward, ...map, reverse: true }), /different patterns/);
  delete forward.controller.looks[0].sectionLooks['patch-part'];
  assert.throws(() => migrateRunSectionReferences({ ...forward, ...map, reverse: true }), /only some/);
});

test('converting two GPIO runs keeps independently specified physical addresses and playback', () => {
  const strip = { id: 'art', name: 'Artwork', pixelCount: 5, pathData: 'M 0,0 L 50,0', pixels: Array.from({ length: 5 }, (_, x) => ({ x: x * 10, y: 0 })) };
  const strips = [strip];
  const wiring = { version: 1, outputs: [
    { id: 'a', pin: 16, runIds: ['r2'] },
    { id: 'b', pin: 17, runIds: ['r1'] },
  ], runs: [
    { id: 'r1', type: 'strip', source: { stripId: 'art', from: 0, to: 1 }, physicalDirection: 'source-forward', verified: true },
    { id: 'r2', type: 'strip', source: { stripId: 'art', from: 2, to: 4 }, physicalDirection: 'source-reverse', verified: true },
  ], verified: true };
  const board = { chains: [{ id: 'main', rowIds: ['patch-art'] }], patches: [{ id: 'patch-art', source: { type: 'strip', stripId: 'art', startLed: 0, endLed: 4, autoRange: true }, output: { mode: 'normal' }, playback: { patternId: 'rainbow' } }] };
  const before = compileWiring({ strips, wiring });
  assert.deepEqual(before.pixels.map(pixel => [pixel.outputId, pixel.sourceLed]), [['a', 2], ['a', 3], ['a', 4], ['b', 0], ['b', 1]]);
  const result = convertExistingRunsToSections({ strips, wiring, patchBoard: board, stripId: 'art', paths: ['M 0,0 L 20,0', 'M 20,0 L 50,0'] });
  assert.equal(result.ok, true, result.error);
  const after = compileWiring({ strips: result.strips, wiring: result.wiring });
  assert.deepEqual(after.pixels.map(pixel => [pixel.outputId, pixel.stripId, pixel.sourceLed]), [['a', 'strip-1', 0], ['a', 'strip-1', 1], ['a', 'strip-1', 2], ['b', 'art', 0], ['b', 'art', 1]]);
  assert.equal(after.runs.find(run => run.id === 'r2').reversed, before.runs.find(run => run.id === 'r2').reversed);
  assert.deepEqual(result.patchBoard.patches.map(patch => patch.playback.patternId), ['rainbow', 'rainbow']);
  assert.deepEqual(result.identityMap, { art: ['art', 'strip-1'] });
  assert.equal(result.wiring.verified, true);
});

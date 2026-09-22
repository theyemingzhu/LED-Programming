// mandalaEngine.listeningLevels.test.js — band meters must fall to zero when
// listening stops, not freeze on the last frame heard.
//
// getLevels() returns the engine's live F snapshot, and the only thing that
// ever pushed fresh numbers into it is setFeatures()/analyze() — both driven
// from the caller's animation loop only while engine.isListening() is true
// (see lw-show.jsx's step()). The engine's own tick() runs every frame
// regardless. Before this fix nothing in tick() touched F when not
// listening, so F held whatever the last loud frame was forever: the meters
// read as a hung analyser instead of silence.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMandalaEngine } from './mandalaEngine.js';
import { createMandalaSpatialTemplate } from './showSpatialTemplate.js';

function loudEngine() {
  const engine = createMandalaEngine({ template: createMandalaSpatialTemplate() });
  engine.setListening(true);
  engine.setFeatures({ bass: 1, mid: 1, high: 1, energy: 1, centroid: 0.5, flux: 1, beat: 1 });
  engine.tick(0.016);
  return engine;
}

test('levels hold their last snapshot while still listening, exactly as getLevels documents', () => {
  const engine = loudEngine();
  const before = engine.getLevels();
  assert.ok(before.bass > 0.9, 'a loud frame should read loud');
  engine.tick(0.5); // half a second with no new setFeatures call, same as a quiet passage
  const after = engine.getLevels();
  assert.equal(after.bass, before.bass, 'still listening: the last analysed frame is the live value, not stale');
});

test('band meters fall toward zero once listening stops, instead of freezing on the last loud frame', () => {
  const engine = loudEngine();
  const atStop = engine.getLevels();
  assert.ok(atStop.bass > 0.9 && atStop.mid > 0.9 && atStop.high > 0.9 && atStop.energy > 0.9);

  engine.setListening(false);
  // setFeatures is never called again from here on — this is the exact
  // shape of the bug: the caller's loop stops feeding the engine, and only
  // tick() keeps running.
  for (let i = 0; i < 90; i += 1) engine.tick(0.033); // ~3s at 30fps

  const settled = engine.getLevels();
  assert.ok(settled.bass < 0.01, `bass should have fallen to ~0, got ${settled.bass}`);
  assert.ok(settled.mid < 0.01, `mid should have fallen to ~0, got ${settled.mid}`);
  assert.ok(settled.high < 0.01, `high should have fallen to ~0, got ${settled.high}`);
  assert.ok(settled.energy < 0.01, `energy should have fallen to ~0, got ${settled.energy}`);
});

test('the fall is a decay, not an instant snap to zero', () => {
  const engine = loudEngine();
  engine.setListening(false);
  engine.tick(0.033); // one frame after stopping
  const first = engine.getLevels();
  assert.ok(first.bass > 0.3 && first.bass < 1, `one frame in, bass should be mid-fall, got ${first.bass}`);
  assert.notEqual(first.bass, 0, 'must not snap straight to zero on the very next frame');
});

test('flux and beat are cleared immediately once listening stops, matching the silence they already report on analyze', () => {
  const engine = loudEngine();
  engine.setListening(false);
  engine.tick(0.016);
  const levels = engine.getLevels();
  assert.equal(levels.flux, 0);
  assert.equal(levels.beat, 0);
});

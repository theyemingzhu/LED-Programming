import test from 'node:test';
import assert from 'node:assert/strict';
import { retainCardPhysicalVerification } from './cardVerificationRetention.js';

const wiring = { verified: true, runs: [
  { id: 'a', verified: true, source: { stripId: 'a', from: 0, to: 40 }, physicalDirection: 'source-forward' },
  { id: 'b', verified: true, source: { stripId: 'b', from: 0, to: 19 }, physicalDirection: 'source-forward' },
], outputs: [{ id: 'o1', pin: 18, runIds: ['a'] }, { id: 'o2', pin: 21, runIds: ['b'] }] };
const controller = { led: { type: 'WS2812B', colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' }, outputs: [{ id: 'o1', pin: 18, pixels: 41 }, { id: 'o2', pin: 21, pixels: 20 }] };
const invalidated = () => ({ ...structuredClone(wiring), verified: false, runs: wiring.runs.map(run => ({ ...run, verified: false })) });
const retain = (nextController, nextWiring = invalidated()) => retainCardPhysicalVerification({ wiring, nextWiring, standaloneController: controller, nextStandaloneController: nextController });

test('unrelated controller content and reload preserve existing physical checks', () => {
  const next = JSON.parse(JSON.stringify({ ...controller, name: 'Renamed', patterns: ['new'], playlist: ['new'], brightness: 2 }));
  const result = retain(next);
  assert.equal(result.wiring.verified, true);
  assert.equal(result.standaloneController.led.colorOrderConfirmed, true);
});

test('changed output count invalidates its runs while preserving the other output', () => {
  const next = structuredClone(controller); next.outputs[0].pixels = 42;
  const result = retain(next);
  assert.equal(result.wiring.verified, false);
  assert.deepEqual(result.wiring.runs.map(run => run.verified), [false, true]);
  assert.equal(result.standaloneController.led.colorOrderConfirmed, false);
});

test('GPIO changes and chipset changes invalidate corresponding evidence', () => {
  const next = structuredClone(controller); next.outputs[0].pin = 16;
  assert.deepEqual(retain(next).wiring.runs.map(run => run.verified), [false, true]);
  next.led.type = 'SK6812';
  assert.deepEqual(retain(next).wiring.runs.map(run => run.verified), [false, false]);
});

test('colour order change preserves wiring and invalidates old colour confirmation', () => {
  const next = structuredClone(controller); next.led.colorOrder = 'RGB';
  const result = retain(next);
  assert.equal(result.wiring.verified, true);
  assert.equal(result.standaloneController.led.colorOrderConfirmed, false);
});

test('changed section direction never recovers that run confirmation', () => {
  const changed = invalidated(); changed.runs[0].physicalDirection = 'source-reverse';
  assert.deepEqual(retain(controller, changed).wiring.runs.map(run => run.verified), [false, true]);
});

test('missing legacy output binding never grants retained confirmation', () => {
  const result = retainCardPhysicalVerification({ wiring: { ...wiring, outputs: [] }, nextWiring: invalidated(), standaloneController: controller, nextStandaloneController: controller });
  assert.deepEqual(result.wiring.runs.map(run => run.verified), [false, false]);
});


test('ordinary content edits preserve legacy project flags without upgrading them', () => {
  const legacyWiring = { verified: true, runs: [{ id: 'legacy', verified: true }] };
  const legacyController = { led: controller.led };
  const result = retainCardPhysicalVerification({ wiring: legacyWiring, nextWiring: legacyWiring, standaloneController: legacyController, nextStandaloneController: { ...legacyController, patterns: ['new'] } });
  assert.equal(result.wiring, legacyWiring);
});


test('new explicit confirmation is preserved when discovery records its measured outputs', () => {
  const prior = { ...controller, led: { ...controller.led, colorOrderConfirmed: false } };
  const next = structuredClone(controller); next.outputs[0].pixels = 42;
  const result = retainCardPhysicalVerification({ wiring, nextWiring: invalidated(), standaloneController: prior, nextStandaloneController: next });
  assert.equal(result.standaloneController.led.colorOrderConfirmed, true);
  assert.deepEqual(result.wiring.runs.map(run => run.verified), [false, true]);
});


test('repeated discovery preserves its new explicit colour confirmation across changed outputs', () => {
  const next = structuredClone(controller); next.outputs[0].pixels = 42;
  const input = { wiring, nextWiring: invalidated(), standaloneController: controller, nextStandaloneController: next };
  assert.equal(retainCardPhysicalVerification(input).standaloneController.led.colorOrderConfirmed, false);
  const result = retainCardPhysicalVerification({ ...input, physicalColorConfirmed: true });
  assert.equal(result.standaloneController.led.colorOrderConfirmed, true);
  assert.deepEqual(result.wiring.runs.map(run => run.verified), [false, true]);
});

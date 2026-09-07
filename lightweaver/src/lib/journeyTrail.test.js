import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyTransition } from './journeyTrail.js';

const FIXED_NOW = () => '2026-09-06T10:00:00.000Z';

function snapshot(overrides = {}) {
  return {
    journey: { taskId: 'connect-card', currentPhaseId: 'connect', setupComplete: false },
    cardId: 'lw-abc123',
    bootId: 'boot-1',
    commissioningStage: '',
    projectId: 'lwproj-1',
    evidenceStale: false,
    ...overrides,
  };
}

test('a re-render that changes none of taskId, currentPhaseId or setupComplete is not an event', () => {
  const previous = snapshot();
  const next = snapshot();
  assert.equal(journeyTransition(previous, next, { now: FIXED_NOW }), null);
});

test('no next journey at all is not an event', () => {
  assert.equal(journeyTransition(snapshot(), { journey: null }, { now: FIXED_NOW }), null);
  assert.equal(journeyTransition(snapshot(), undefined, { now: FIXED_NOW }), null);
});

test('the very first snapshot is worth one line, same convention as the connection log', () => {
  const next = snapshot({ journey: { taskId: 'connect-card', currentPhaseId: 'connect', setupComplete: false } });
  const record = journeyTransition(null, next, { now: FIXED_NOW });
  assert.deepEqual(record, {
    at: '2026-09-06T10:00:00.000Z',
    step: 'connect',
    task: 'connect-card',
    cardId: 'lw-abc123',
    bootId: 'boot-1',
    reason: 'link-changed',
  });
});

test('a changed taskId with everything else the same is a real event', () => {
  const previous = snapshot();
  const next = snapshot({ journey: { taskId: 'discover-lights', currentPhaseId: 'lights', setupComplete: false } });
  const record = journeyTransition(previous, next, { now: FIXED_NOW });
  assert.ok(record);
  assert.equal(record.task, 'discover-lights');
  assert.equal(record.step, 'lights');
});

test('setupComplete flipping alone, with the same taskId, is still a change', () => {
  const previous = snapshot({ journey: { taskId: 'open-patterns', currentPhaseId: null, setupComplete: false } });
  const next = snapshot({ journey: { taskId: 'open-patterns', currentPhaseId: null, setupComplete: true } });
  const record = journeyTransition(previous, next, { now: FIXED_NOW });
  assert.ok(record);
  assert.equal(record.task, 'open-patterns');
  assert.equal(record.step, 'complete', 'falls back to "complete" when there is no current phase');
});

test('holds nothing but the bounded fields — no project contents, no credentials, no hosts', () => {
  const previous = snapshot();
  const next = snapshot({
    journey: { taskId: 'confirm-visible-lights', currentPhaseId: 'verify', setupComplete: false },
    // Extra fields a caller might mistakenly pass through must never leak into the record.
    project: { id: 'lwproj-1', name: 'Secret piece', layout: { strips: [{ pixels: 60 }] } },
    host: '192.168.18.70',
  });
  const record = journeyTransition(previous, next, { now: FIXED_NOW });
  assert.deepEqual(Object.keys(record).sort(), ['at', 'bootId', 'cardId', 'reason', 'step', 'task']);
});

test('reason: a different card id explains the change first', () => {
  const previous = snapshot();
  const next = snapshot({
    cardId: 'lw-def456',
    journey: { taskId: 'reconnect-card', currentPhaseId: 'connect', setupComplete: false },
  });
  assert.equal(journeyTransition(previous, next, { now: FIXED_NOW }).reason, 'link-changed');
});

test('reason: boot id alone changing is still link-changed', () => {
  const previous = snapshot();
  const next = snapshot({
    bootId: 'boot-2',
    journey: { taskId: 'reconnect-card', currentPhaseId: 'connect', setupComplete: false },
  });
  assert.equal(journeyTransition(previous, next, { now: FIXED_NOW }).reason, 'link-changed');
});

test('reason: commissioning stage changing, same card/boot', () => {
  const previous = snapshot({ commissioningStage: 'set-up-card' });
  const next = snapshot({
    commissioningStage: 'check-lights',
    journey: { taskId: 'test-and-save', currentPhaseId: 'verify', setupComplete: false },
  });
  assert.equal(journeyTransition(previous, next, { now: FIXED_NOW }).reason, 'commissioning-changed');
});

test('reason: project id changing, same card/boot/commissioning', () => {
  const previous = snapshot();
  const next = snapshot({
    projectId: 'lwproj-2',
    journey: { taskId: 'load-matching-project', currentPhaseId: 'connect', setupComplete: false },
  });
  assert.equal(journeyTransition(previous, next, { now: FIXED_NOW }).reason, 'project-changed');
});

test('reason: evidence going from stale to fresh, nothing else different, reads as a hardware op ending', () => {
  const previous = snapshot({ evidenceStale: true, journey: { taskId: 'test-and-save', currentPhaseId: 'verify', setupComplete: false } });
  const next = snapshot({ evidenceStale: false, journey: { taskId: 'confirm-visible-lights', currentPhaseId: 'verify', setupComplete: false } });
  assert.equal(journeyTransition(previous, next, { now: FIXED_NOW }).reason, 'hardware-op-ended');
});

test('reason: falls back to evidence-fresh when nothing else distinguishes the change', () => {
  const previous = snapshot({ journey: { taskId: 'test-and-save', currentPhaseId: 'verify', setupComplete: false } });
  const next = snapshot({ journey: { taskId: 'confirm-visible-lights', currentPhaseId: 'verify', setupComplete: false } });
  assert.equal(journeyTransition(previous, next, { now: FIXED_NOW }).reason, 'evidence-fresh');
});

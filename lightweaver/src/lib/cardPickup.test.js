import test from 'node:test';
import assert from 'node:assert/strict';
import { cardPickupKey, projectFromCardParts } from './cardPickup.js';
import { createProjectLifecycle, markEdited } from './projectLifecycle.js';

const readiness = { cardId: 'lw-one', bootId: 'b1', knownGoodProject: true, commandReady: true, projectId: 'art', projectFingerprint: 'ab12cd34ef56ab12' };
const starter = { id: 'starter', layout: { starterPending: true } };
const ok = { project: starter, projectLifecycle: createProjectLifecycle(), connected: true, readiness };

test('an untouched starter on a proven card picks up once per boot', () => {
  assert.equal(cardPickupKey(ok), 'lw-one:b1');
});
test('owner work, an unproven card or a production job never picks up', () => {
  assert.equal(cardPickupKey({ ...ok, project: { ...starter, layout: { starterPending: false } } }), '');
  assert.equal(cardPickupKey({ ...ok, projectLifecycle: markEdited(createProjectLifecycle()) }), '');
  assert.equal(cardPickupKey({ ...ok, connected: false }), '');
  assert.equal(cardPickupKey({ ...ok, readiness: { ...readiness, projectFingerprint: '' } }), '');
  assert.equal(cardPickupKey({ ...ok, readiness: { ...readiness, productionJobId: 'job' } }), '');
  assert.equal(cardPickupKey({ ...ok, readiness: { ...readiness, provisionalSetup: true } }), '');
  assert.equal(cardPickupKey({ ...ok, readiness: { ...readiness, knownGoodProject: false } }), '');
});
test('the rebuilt project takes the card id and its strips, and is no longer a starter', () => {
  const p = projectFromCardParts(starter, { strips: [{ id: 's', pixels: 41, pin: 18 }], outputs: [{ pin: 18, pixels: 41 }] }, { projectId: 'art' });
  assert.equal(p.id, 'art');
  assert.equal(p.layout.starterPending, false);
  assert.equal(p.devices.standaloneController.led.pixels, 41);
});

test("the rebuilt project shows what the card plays, not this window's last pick", () => {
  const mine = { id: 'art', layout: { starterPending: false }, pattern: { activePatternId: 'rainbow', palette: ['#f00'] } };
  const p = projectFromCardParts(mine, { strips: [{ id: 's', pixels: 41, pin: 18 }] }, { projectId: 'art', currentPatternId: 'ocean' });
  assert.equal(p.pattern.activePatternId, 'ocean');
  assert.equal(p.pattern.palette, undefined);
});

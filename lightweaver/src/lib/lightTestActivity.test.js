import test from 'node:test';
import assert from 'node:assert/strict';
import { activeLightTestPhase, getLightTestActivity, setLightTestActivity, subscribeLightTestActivity, LIGHT_TEST_ACTIVITY_MAX_MS } from './lightTestActivity.js';

test('the light-test signal is set, cleared, heard, and expires on its own (FS3)', () => {
  let heard = 0;
  const stop = subscribeLightTestActivity(() => { heard += 1; });
  setLightTestActivity('starting', { now: 1000 });
  assert.equal(activeLightTestPhase(getLightTestActivity(), { now: 2000 }), 'starting');
  assert.equal(activeLightTestPhase(getLightTestActivity(), { now: 1000 + LIGHT_TEST_ACTIVITY_MAX_MS + 1 }), '', 'a stuck signal expires');
  setLightTestActivity('nonsense', { now: 3000 });
  assert.equal(getLightTestActivity().phase, '', 'unknown phases clear it');
  setLightTestActivity('', { now: 4000 });
  stop();
  assert.equal(heard, 2);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSceneExpressionPreviewTopology } from './sceneExpressionPreviewTopology.js';

const desiredConfig = {
  led: {
    type: 'WS2815', colorOrder: 'RGB',
    outputs: [{
      id: 'out1', pin: 16, pixels: 5, direction: 'mixed',
      segments: [
        { id: 'outer-a', count: 3, direction: 'forward' },
        { id: 'inner-b', count: 2, direction: 'reverse' },
      ],
    }],
  },
};
const cardStatus = {
  led: { type: 'WS2815', colorOrder: 'RGB' },
  outputs: structuredClone(desiredConfig.led.outputs),
};

test('accepts exact output pins, counts, ordered run identities, directions and color order', () => {
  assert.equal(compareSceneExpressionPreviewTopology({ cardStatus, desiredConfig }).ok, true);
});

for (const [name, mutate] of [
  ['pixel count', value => { value.outputs[0].pixels = 6; value.outputs[0].segments[0].count = 4; }],
  ['output route', value => { value.outputs[0].pin = 17; }],
  ['run order', value => { value.outputs[0].segments.reverse(); }],
  ['reversal', value => { value.outputs[0].segments[1].direction = 'forward'; value.outputs[0].direction = 'forward'; }],
  ['color order', value => { value.led.colorOrder = 'GRB'; }],
]) {
  test(`rejects a same-project card with changed ${name}`, () => {
    const changed = structuredClone(cardStatus);
    mutate(changed);
    assert.equal(compareSceneExpressionPreviewTopology({ cardStatus: changed, desiredConfig }).reason, 'wiring-mismatch');
  });
}

test('refuses when status omits ordered run identities and cannot prove the source mapping', () => {
  const incomplete = structuredClone(cardStatus);
  incomplete.outputs[0].segments = [];
  assert.equal(compareSceneExpressionPreviewTopology({ cardStatus: incomplete, desiredConfig }).reason, 'wiring-identity-unavailable');
});

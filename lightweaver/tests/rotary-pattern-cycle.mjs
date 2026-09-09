import assert from 'node:assert/strict';
import {
  adjustRotaryBrightness,
  getNextRotaryCyclePatternId,
  insertPatternInCycle,
  makeDefaultRotaryCycleIds,
  normalizeRotaryPatternCycle,
} from '../src/lib/rotaryPatternCycle.js';

const knownPatternIds = new Set(['candle', 'breathe', 'aurora', 'fire', 'ocean']);

assert.deepEqual(
  normalizeRotaryPatternCycle(['candle', 'unknown', 'aurora', 'candle', '', null], knownPatternIds),
  ['candle', 'aurora'],
);

assert.deepEqual(
  makeDefaultRotaryCycleIds({
    activePatternId: 'fire',
    playlist: [
      { type: 'pattern', patternId: 'candle', enabled: true },
      { type: 'pattern', patternId: 'unknown', enabled: true },
      { type: 'pattern', patternId: 'fire', enabled: true },
      { type: 'pattern', patternId: 'aurora', enabled: true },
    ],
    knownPatternIds,
  }),
  ['fire', 'candle', 'aurora'],
);

// An empty card playlist leaves the dial on just the active pattern.
assert.deepEqual(
  makeDefaultRotaryCycleIds({
    activePatternId: 'fire',
    playlist: [],
    knownPatternIds,
  }),
  ['fire'],
);

// Three enabled looks in the playlist give a four-id cycle, in order.
assert.deepEqual(
  makeDefaultRotaryCycleIds({
    activePatternId: 'fire',
    playlist: [
      { type: 'pattern', patternId: 'candle', enabled: true },
      { type: 'pattern', patternId: 'aurora', enabled: true },
      { type: 'pattern', patternId: 'breathe', enabled: true },
    ],
    knownPatternIds,
  }),
  ['fire', 'candle', 'aurora', 'breathe'],
);

assert.deepEqual(
  insertPatternInCycle(['candle', 'aurora'], 'breathe', 1, knownPatternIds),
  ['candle', 'breathe', 'aurora'],
);

assert.deepEqual(
  insertPatternInCycle(['candle', 'breathe', 'aurora'], 'candle', 2, knownPatternIds),
  ['breathe', 'aurora', 'candle'],
);

assert.deepEqual(
  insertPatternInCycle(['candle', 'aurora'], 'unknown', 1, knownPatternIds),
  ['candle', 'aurora'],
);

assert.equal(
  getNextRotaryCyclePatternId(['candle', 'breathe', 'aurora'], 'candle', knownPatternIds),
  'breathe',
);

assert.equal(
  getNextRotaryCyclePatternId(['candle', 'breathe', 'aurora'], 'aurora', knownPatternIds),
  'candle',
);

assert.equal(
  getNextRotaryCyclePatternId(['candle', 'breathe'], 'fire', knownPatternIds),
  'candle',
);

assert.equal(
  adjustRotaryBrightness({
    currentBrightness: 0.5,
    rotateDirection: 'clockwise-dimmer',
    turn: 'clockwise',
    step: 0.1,
  }),
  0.4,
);

assert.equal(
  adjustRotaryBrightness({
    currentBrightness: 0.5,
    rotateDirection: 'clockwise-dimmer',
    turn: 'counterclockwise',
    step: 0.1,
  }),
  0.6,
);

assert.equal(
  adjustRotaryBrightness({
    currentBrightness: 0.98,
    rotateDirection: 'clockwise-brighter',
    turn: 'clockwise',
    step: 0.1,
  }),
  1,
);

console.log('rotary-pattern-cycle passed');

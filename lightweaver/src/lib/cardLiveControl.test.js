import assert from 'node:assert/strict';
import test from 'node:test';

import { zoneConfirmsLivePreviewIntent } from './cardLiveControl.js';

// zoneConfirmsLivePreviewIntent is the pure comparison readBackLivePreview
// leans on to decide whether a card's own `/api/zones` report already shows a
// live-preview write that lost its acknowledgement. It is exercised here
// without a network or a simulated card so the field-by-field contract (wire
// name in, control name out, numeric tolerance, exact booleans) is provable
// on its own.

test('zoneConfirmsLivePreviewIntent: true when every present field matches within tolerance', () => {
  const controlPayload = { brightness: 0.42, speed: 1.3, hue: 88, saturation: 210 };
  const zone = {
    id: 'zone-all', patternId: 'aurora',
    brightness: 0.42, speed: 1.3, customHue: 88, customSaturation: 210,
    hueShift: 0, customBreathe: false,
  };
  assert.equal(zoneConfirmsLivePreviewIntent(controlPayload, zone), true);
});

test('zoneConfirmsLivePreviewIntent: only checks fields actually present in the payload', () => {
  const controlPayload = { brightness: 0.5 };
  const zone = { brightness: 0.5, speed: 999, customHue: 1, customSaturation: 1 };
  assert.equal(zoneConfirmsLivePreviewIntent(controlPayload, zone), true);
});

test('zoneConfirmsLivePreviewIntent: numeric fields tolerate a small amount of drift, not a large one', () => {
  const zone = { brightness: 0.50 };
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.505 }, zone), true, 'well within 0.01 is still a match');
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.55 }, zone), false, 'well beyond 0.01 is not a match');
});

test('zoneConfirmsLivePreviewIntent: boolean fields must match exactly, not by truthiness', () => {
  const zone = { customBreathe: false };
  assert.equal(zoneConfirmsLivePreviewIntent({ breathe: true }, zone), false);
  assert.equal(zoneConfirmsLivePreviewIntent({ breathe: false }, zone), true);
});

test('zoneConfirmsLivePreviewIntent: false when a targeted field is missing or non-numeric on the zone', () => {
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.5 }, { brightness: undefined }), false);
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.5 }, { brightness: 'bright' }), false);
});

test('zoneConfirmsLivePreviewIntent: patternId compares by the same wire/control name (the runtime id)', () => {
  assert.equal(zoneConfirmsLivePreviewIntent({ patternId: 'fire-2' }, { patternId: 'fire-2' }), true);
  assert.equal(zoneConfirmsLivePreviewIntent({ patternId: 'fire-2' }, { patternId: 'aurora' }), false);
});

test('zoneConfirmsLivePreviewIntent: false without a usable payload or zone', () => {
  assert.equal(zoneConfirmsLivePreviewIntent(null, { brightness: 0.5 }), false);
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.5 }, null), false);
});

test('zoneConfirmsLivePreviewIntent: an empty payload confirms trivially (nothing was asked)', () => {
  assert.equal(zoneConfirmsLivePreviewIntent({}, { brightness: 0.1 }), true);
});

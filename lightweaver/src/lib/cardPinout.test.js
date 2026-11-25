import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CARD_HEADER_ROWS, cardPinNotes, describeCardPinPlace, describeCardPinRole, locateCardPin } from './cardPinout.js';
import { CARD_CONNECTOR_PINS } from './wiringModel.js';

const hardware = JSON.parse(readFileSync(new URL('../../../packages/lightweaver-contract/card-hardware.json', import.meta.url), 'utf8'));

test('both header rows have the board’s 22 pins and every GPIO appears once', () => {
  for (const row of CARD_HEADER_ROWS) assert.equal(row.pins.length, 22, row.id);
  const gpios = CARD_HEADER_ROWS.flatMap(row => row.pins.filter(pin => typeof pin === 'number'));
  assert.equal(new Set(gpios).size, gpios.length);
});

test('every pin the card can drive LEDs from is drawn on the board', () => {
  for (const pin of hardware.outputPins) assert.ok(locateCardPin(pin), `GPIO ${pin} has no place on the drawing`);
  for (const pin of CARD_CONNECTOR_PINS) assert.ok(locateCardPin(pin), `connector GPIO ${pin} has no place`);
});

test('positions follow the DevKitC-1 header tables', () => {
  assert.deepEqual(locateCardPin(18), { row: 'J1', firstLabel: '3V3', position: 11 });
  assert.deepEqual(locateCardPin(21), { row: 'J3', firstLabel: 'G', position: 18 });
  assert.deepEqual(locateCardPin(4), { row: 'J1', firstLabel: '3V3', position: 4 });
  assert.equal(locateCardPin(26), null);
  assert.equal(locateCardPin('x'), null);
});

test('the place reads as one sentence an owner can follow', () => {
  assert.equal(describeCardPinPlace(18), 'GPIO 18: 11th pin from the antenna end, on the 3V3 row.');
  assert.equal(describeCardPinPlace(21), 'GPIO 21: 18th pin from the antenna end, on the G row.');
  assert.equal(describeCardPinPlace(42), 'GPIO 42: 6th pin from the antenna end, on the G row.');
  assert.match(describeCardPinPlace(26), /not on the card/);
});

test('only the board-light pins carry a note', () => {
  assert.deepEqual(cardPinNotes([16, 17, 18, 21]), []);
  assert.equal(cardPinNotes([38]).length, 1);
  assert.equal(cardPinNotes(['48']).length, 1);
});

test('pin roles distinguish board wiring, project assignments and available LED pins', () => {
  const roles = {
    controls: new Map([[0, 'Encoder press'], [4, 'Encoder A'], [9, 'Blackout']]),
    outputs: new Map([[38, {}]]),
    supportedPins: hardware.outputPins,
    availablePins: [5, 17],
  };
  const role = pin => describeCardPinRole(pin, roles);
  assert.deepEqual(role(0), { kind: 'reserved', label: 'BOOT strap · Encoder press' });
  assert.deepEqual(role(2), { kind: 'reserved', label: 'Boot status LED' });
  assert.deepEqual(role(4), { kind: 'reserved', label: 'Encoder A' });
  assert.deepEqual(role(10), { kind: 'reserved', label: 'microSD CS' });
  assert.deepEqual(role(19), { kind: 'reserved', label: 'USB D−' });
  assert.deepEqual(role('TX'), { kind: 'reserved', label: 'UART0 TX · GPIO 43' });
  assert.deepEqual(role(35), { kind: 'reserved', label: 'PSRAM' });
  assert.deepEqual(role(38), { kind: 'output', label: 'LED output · RGB v1.1' });
  assert.deepEqual(role(5), { kind: 'available', label: 'LED available' });
  assert.deepEqual(role(16), { kind: 'reserved', label: 'LED unavailable' });
  assert.deepEqual(role(14), { kind: 'unsupported', label: 'LED unsupported' });
});

test('a confirmed profile marks only its onboard RGB pin and displays custom reservations', () => {
  const profile = { id: 'espressif-devkitc-1-n16r8-v1.0' };
  const role = (pin, profilePin) => describeCardPinRole(pin, {
    profile, profilePin, supportedPins: hardware.outputPins,
  });
  assert.deepEqual(role(38, { role: 'gpio' }), { kind: 'available', label: 'LED available' });
  assert.deepEqual(role(48, { role: 'led', detail: 'Onboard RGB (shared)' }), {
    kind: 'available', label: 'LED available · Onboard RGB (shared)',
  });
  assert.deepEqual(role(15, { role: 'storage', detail: 'External storage', installation: 'Card reader' }), {
    kind: 'reserved', label: 'External storage · Card reader',
  });
});

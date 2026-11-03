import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CARD_HEADER_ROWS, cardPinNotes, describeCardPinPlace, locateCardPin } from './cardPinout.js';
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

// Room on the card (sections-effortless plan, change 7): the same measurement
// Install uses, read before the cap is hit rather than as a refusal at push.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardStorageRoom, cardStorageRoomLine, prepareCardStoragePayload } from '../src/lib/cardStoragePayload.js';
import { CARD_HARDWARE_CONTRACT } from '../src/lib/cardHardwareContract.js';

const zone = (id) => ({ id, label: id, patternId: 'aurora', brightness: 1, speed: 1, ranges: [{ start: 0, count: 10 }] });
const config = { version: 1, mode: 'standalone', piece: { id: 'p', name: 'Piece' }, led: { pixels: 40 }, zones: [zone('ring-1'), zone('ring-2'), zone('ring-3'), zone('ring-4')], looks: [], playlist: { enabled: false, entries: [] } };

test('bytes agree with the Install measurement and the line reads in plain words', () => {
  const room = cardStorageRoom(config);
  assert.equal(room.bytes, prepareCardStoragePayload(config).bytes);
  assert.equal(room.limit, CARD_HARDWARE_CONTRACT.configCapacityBytes);
  assert.equal(room.zoneCount, 4);
  assert.ok(room.sectionsLeft >= 1 && room.sectionsLeft <= CARD_HARDWARE_CONTRACT.maxZones - 4, `sectionsLeft ${room.sectionsLeft}`);
  const line = cardStorageRoomLine(room);
  assert.match(line, /^Room on card: [\d,]+ of 3,968 bytes, about \d+ more sections$/);
});

test('the section estimate is capped by the card zone limit, not only by bytes', () => {
  const twelve = { ...config, zones: Array.from({ length: 12 }, (_, i) => zone(`z${i}`)) };
  const room = cardStorageRoom(twelve);
  assert.equal(room.sectionsLeft, 0);
  assert.equal(cardStorageRoomLine(room), `Room on card: ${room.bytes.toLocaleString('en-US')} of 3,968 bytes, no room for another section`);
});

test('a config over the limit reports how far over, and never throws', () => {
  const room = cardStorageRoom(config, { maxBytes: 100 });
  assert.ok(room.remaining < 0);
  assert.equal(room.sectionsLeft, 0);
  assert.match(cardStorageRoomLine(room), /^Over the card's room by [\d,]+ bytes/);
});

test('mutating the limit to something tiny changes the answer (the window is real)', () => {
  const wide = cardStorageRoom(config, { maxBytes: 100000 });
  const tight = cardStorageRoom(config, { maxBytes: cardStorageRoom(config).bytes + 5 });
  assert.equal(wide.sectionsLeft, CARD_HARDWARE_CONTRACT.maxZones - 4);
  assert.equal(tight.sectionsLeft, 0);
});

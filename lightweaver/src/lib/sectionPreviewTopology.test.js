import assert from 'node:assert/strict';
import { pushLivePreviewToCard, readBackLivePreview, buildLivePreviewControlPayload } from './cardLiveControl.js';

import { CUSTOMER_CONTROL_WIRE_FIELDS } from './cardCustomerControlContract.js';
const payload = buildLivePreviewControlPayload({ patternId: 'fire' });
const controls = Object.fromEntries(CUSTOMER_CONTROL_WIRE_FIELDS.filter(field => payload[field.wire] !== undefined).map(field => [field.control, payload[field.wire]]));

// The divided draft reuses strip-1, but the installed card still gives that ID
// all 41 LEDs. Existence of the ID alone must never authorize this 11-LED edit.
let zones = [{ ...controls, id: 'strip-1', ranges: [{ start: 0, count: 41 }], patternId: 'fire' }];
const requests = [];
const authority = {
  cardId: 'lw-section-test',
  async request(path, options = {}) {
    requests.push({ path, ...options });
    if (path === '/api/zones') return { zones };
    return { ok: true, cardId: this.cardId, patternId: options.body.patternId, appliedPatternId: options.body.patternId };
  },
};
const options = { host: 'section-test.invalid', authority, autoDiscover: false, expectedZoneRanges: [{ start: 0, count: 11 }] };
for (const zone of ['strip-1', 'strip-2']) {
  await assert.rejects(pushLivePreviewToCard({ patternId: 'fire', zone, syncZones: false }, options),
    error => error.reason === 'section-layout-mismatch');
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
}
// A lost response cannot be "confirmed" by a same-pattern, wrong-size zone.
assert.equal(await readBackLivePreview({ patternId: 'fire', zone: 'strip-1' }, options), null);
zones = [11, 10, 10, 10].map((count, index) => ({
  ...controls, id: `strip-${index + 1}`, ranges: [{ start: index ? 11 + (index - 1) * 10 : 0, count }], patternId: 'fire',
}));
await pushLivePreviewToCard({ patternId: 'fire', zone: 'strip-1', syncZones: false }, options);
const writes = requests.filter(request => request.method === 'POST');
assert.equal(writes.length, 1);
assert.equal(writes[0].body.zone, 'strip-1');
assert.equal(writes[0].body.syncZones, false);
assert.ok(await readBackLivePreview({ patternId: 'fire', zone: 'strip-1' }, options));
console.log('section preview topology passed: stale/missing zones blocked, matching 11-LED zone targeted alone');

const { classifyCardActionFailure } = await import('./cardAction.js');
assert.equal(classifyCardActionFailure({ reason: 'section-layout-mismatch' }).actionId, 'install-sections');

const { zonesFromZonesEnvelope } = await import('./cardJourneyEvidence.js');
assert.deepEqual(zonesFromZonesEnvelope({ zones })[0].ranges, [{ start: 0, count: 11 }]);

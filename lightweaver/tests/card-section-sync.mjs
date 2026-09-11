import assert from 'node:assert/strict';
import {
  ensureCardSectionsForPreview,
  missingCardZoneIds,
  runtimeZoneIds,
  syncRuntimePackageToCard,
  waitForCardZones,
} from '../src/lib/cardSectionSync.js';

const runtimePackage = {
  config: {
    zones: [
      { id: 'outer' },
      { id: 'inner' },
    ],
  },
};

assert.deepEqual(runtimeZoneIds(runtimePackage), ['outer', 'inner']);
assert.deepEqual(
  missingCardZoneIds({ zones: [{ id: 'outer' }] }, ['outer', 'inner', 'inner']),
  ['inner'],
);
assert.deepEqual(missingCardZoneIds(null, ['outer']), ['outer']);

let configPushes = 0;
const alreadyReady = await ensureCardSectionsForPreview({
  host: '192.168.4.1',
  requiredZoneIds: ['outer', 'inner'],
  runtimePackage,
  readZones: async () => ({ zones: [{ id: 'outer' }, { id: 'inner' }] }),
  pushConfig: async () => {
    configPushes += 1;
    return { ok: true };
  },
  sleep: async () => {},
});
assert.equal(alreadyReady.synced, false);
assert.equal(configPushes, 0);

const operations = [];
let zoneReads = 0;
const repaired = await ensureCardSectionsForPreview({
  host: '192.168.4.1',
  requiredZoneIds: ['outer', 'inner'],
  runtimePackage,
  readZones: async () => {
    operations.push('zones');
    zoneReads += 1;
    return zoneReads === 1
      ? { zones: [{ id: 'full-piece' }] }
      : { zones: [{ id: 'outer' }, { id: 'inner' }] };
  },
  pushConfig: async (_pkg, options) => {
    operations.push('config');
    // Preview auto-sync must never force a wiring/project change past the guard.
    assert.ok(!options.allowLayoutChange);
    assert.ok(!options.allowProjectChange);
    return { ok: true };
  },
  sleep: async () => {},
});
assert.equal(repaired.synced, true);
assert.deepEqual(operations, ['zones', 'config', 'zones']);
assert.deepEqual(repaired.zones.zones.map(zone => zone.id), ['outer', 'inner']);

let releaseConcurrentConfig;
const concurrentConfigGate = new Promise(resolve => { releaseConcurrentConfig = resolve; });
let concurrentConfigPushes = 0;
let concurrentReady = false;
const concurrentOptions = {
  host: '192.168.4.1',
  runtimePackage,
  readZones: async () => concurrentReady
    ? { zones: [{ id: 'outer' }, { id: 'inner' }] }
    : { zones: [{ id: 'full-piece' }] },
  pushConfig: async () => {
    concurrentConfigPushes += 1;
    await concurrentConfigGate;
    concurrentReady = true;
    return { ok: true };
  },
  sleep: async () => {},
};
const concurrentOuter = ensureCardSectionsForPreview({
  ...concurrentOptions,
  requiredZoneIds: ['outer'],
});
await new Promise(resolve => setTimeout(resolve, 0));
const concurrentInner = ensureCardSectionsForPreview({
  ...concurrentOptions,
  requiredZoneIds: ['inner'],
});
await new Promise(resolve => setTimeout(resolve, 0));
releaseConcurrentConfig();
await Promise.all([concurrentOuter, concurrentInner]);
assert.equal(concurrentConfigPushes, 1);

let releaseProjectConfigs;
const projectConfigGate = new Promise(resolve => { releaseProjectConfigs = resolve; });
const pushedProjects = [];
const projectPackage = projectId => ({
  config: {
    piece: { id: projectId },
    led: { outputs: [{ id: 'out1', pin: 16, pixels: 44 }] },
    zones: [{ id: 'outer', ranges: [{ start: 0, count: 44 }] }],
  },
});
const projectOptions = runtimePackageForProject => ensureCardSectionsForPreview({
  host: '192.168.4.1',
  requiredZoneIds: ['outer'],
  runtimePackage: runtimePackageForProject,
  readZones: async () => ({ zones: [{ id: 'full-piece' }] }),
  pushConfig: async pkg => {
    pushedProjects.push(pkg.config.piece.id);
    await projectConfigGate;
    return { ok: true };
  },
  sleep: async () => {},
});
const projectA = projectOptions(projectPackage('project-a'));
const projectB = projectOptions(projectPackage('project-b'));
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(pushedProjects.sort(), ['project-a', 'project-b']);
releaseProjectConfigs();
await Promise.allSettled([projectA, projectB]);

let unavailableReads = 0;
await assert.rejects(
  waitForCardZones({
    host: '192.168.4.1',
    requiredZoneIds: ['outer', 'inner'],
    attempts: 3,
    intervalMs: 0,
    readZones: async () => {
      unavailableReads += 1;
      return { zones: [{ id: 'full-piece' }] };
    },
    sleep: async () => {},
  }),
  error => error?.reason === 'zones-missing',
);
assert.equal(unavailableReads, 3);

let rebootWindowReads = 0;
await assert.rejects(
  waitForCardZones({
    host: '192.168.4.1',
    requiredZoneIds: ['outer'],
    intervalMs: 0,
    readZones: async () => {
      rebootWindowReads += 1;
      throw new Error('card rebooting');
    },
    sleep: async () => {},
  }),
  error => error?.reason === 'zones-missing',
);
assert.equal(rebootWindowReads, 20);

const layoutMismatch = new Error('output layout changed');
layoutMismatch.reason = 'layout-mismatch';
await assert.rejects(
  ensureCardSectionsForPreview({
    host: '192.168.4.1',
    requiredZoneIds: ['outer'],
    runtimePackage,
    readZones: async () => ({ zones: [{ id: 'full-piece' }] }),
    pushConfig: async () => { throw layoutMismatch; },
    sleep: async () => {},
  }),
  error => error === layoutMismatch,
);

const projectMismatch = new Error('wrong project');
projectMismatch.reason = 'project-mismatch';
await assert.rejects(
  syncRuntimePackageToCard({
    host: '192.168.4.1',
    runtimePackage,
    pushConfig: async () => { throw projectMismatch; },
    readZones: async () => ({ zones: [] }),
    sleep: async () => {},
  }),
  error => error === projectMismatch,
);

let postSaveVerificationCalls = 0;
const verifiedAfterHeadChange = await syncRuntimePackageToCard({
  host: '192.168.18.70',
  runtimePackage,
  expectedCardId: 'lw-exact-card',
  pushConfig: async () => ({ ok: true, cardId: 'lw-exact-card', projectHead: 'head-2' }),
  verifyPostSave: async options => {
    postSaveVerificationCalls += 1;
    assert.equal(options.host, '192.168.18.70');
    assert.equal(options.expectedCardId, 'lw-exact-card');
    assert.deepEqual(options.requiredZoneIds, ['outer', 'inner']);
    return { ok: true, zones: { zones: [{ id: 'outer' }, { id: 'inner' }] } };
  },
  sleep: async () => {},
});
assert.equal(postSaveVerificationCalls, 1);
assert.deepEqual(verifiedAfterHeadChange.verifiedZones.zones.map(zone => zone.id), ['outer', 'inner']);

console.log('card-section-sync tests passed');

// cardSectionDifference / cardSectionSummary: the Patterns status line is a
// comparison between the project's sections and the card's own zones list.
{
  const { cardSectionDifference, cardSectionSummary } = await import('../src/lib/cardSectionSync.js');
  const targets = [
    { id: 'all', zoneId: '', kind: 'all', label: 'All sections' },
    { id: 'p1', zoneId: 'ring-1', kind: 'section', label: 'Ring 1' },
    { id: 'p2', zoneId: 'ring-2', kind: 'section', label: 'Ring 2' },
    { id: 'p3', zoneId: 'ring-3', kind: 'section', label: 'Ring 3' },
  ];
  // Not read yet: say nothing, never guess.
  assert.equal(cardSectionDifference(targets, null).known, false);
  assert.equal(cardSectionSummary(targets, null), '');
  // Card holds every section.
  const full = { zones: [{ id: 'ring-1', label: 'Ring 1' }, { id: 'ring-2', label: 'Ring 2' }, { id: 'ring-3', label: 'Ring 3' }] };
  assert.deepEqual(cardSectionDifference(targets, full).missing, []);
  assert.equal(cardSectionSummary(targets, full), 'Card holds Ring 1, Ring 2, Ring 3');
  // Card still on the single auto zone from before the divide.
  const single = { zones: [{ id: 'all', label: 'All' }] };
  const diff = cardSectionDifference(targets, single);
  assert.equal(diff.held.length, 0);
  assert.equal(diff.missing.length, 3);
  assert.deepEqual(diff.extra.map(z => z.zoneId), ['all']);
  assert.equal(cardSectionSummary(targets, single), 'Card holds one section; Install to send yours');
  // Card holds two of three (a divide after the last install).
  const partial = { zones: [{ id: 'ring-1', label: 'Ring 1' }, { id: 'ring-2', label: 'Ring 2' }] };
  assert.equal(cardSectionSummary(targets, partial), 'Card holds Ring 1, Ring 2; Install to send yours');
  // A single-section project on a matching card says so, no "Install" nag.
  assert.equal(cardSectionSummary(targets.slice(0, 2), { zones: [{ id: 'ring-1', label: 'Ring 1' }] }), 'Card holds Ring 1');
}

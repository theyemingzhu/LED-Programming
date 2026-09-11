// "Show me which one" (sections-effortless plan, change 4): the exact request
// sequence a section flash sends, and that every restore value equals the
// value the card reported, never a guess.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flashSectionOnCard } from '../src/lib/cardLiveControl.js';

const zones = [
  { id: 'ring-1', label: 'Ring 1', brightness: 1 },
  { id: 'ring-2', label: 'Ring 2', brightness: 0.6 },
  { id: 'ring-3', label: 'Ring 3', brightness: 0.1 },
];

test('dims every other zone to a fifth of its reported brightness, holds, then restores the reported values', async () => {
  const posts = [];
  const waits = [];
  const result = await flashSectionOnCard({
    host: '192.168.4.1',
    zoneId: 'ring-2',
    zones,
    postControlImpl: async payload => { posts.push(payload); return { ok: true }; },
    sleep: async ms => { waits.push(ms); },
  });
  assert.deepEqual(result, { flashed: true, dimmed: ['ring-1', 'ring-3'], restored: ['ring-1', 'ring-3'] });
  assert.deepEqual(waits, [1000]);
  assert.deepEqual(posts, [
    { zone: 'ring-1', syncZones: false, brightness: 0.2 },
    // 0.1 * 0.2 = 0.02 sits under the floor: the strip is never sent black.
    { zone: 'ring-3', syncZones: false, brightness: 0.05 },
    { zone: 'ring-1', syncZones: false, brightness: 1 },
    { zone: 'ring-3', syncZones: false, brightness: 0.1 },
  ]);
  // The tapped zone is never written.
  assert.equal(posts.some(post => post.zone === 'ring-2'), false);
});

test('reads the card when no zones are handed in, and restores what it read', async () => {
  const posts = [];
  const result = await flashSectionOnCard({
    host: '192.168.4.1',
    zoneId: 'ring-1',
    readZonesImpl: async () => ({ zones: [{ id: 'ring-1', brightness: 0.9 }, { id: 'ring-2', brightness: 0.45 }] }),
    postControlImpl: async payload => { posts.push(payload); return { ok: true }; },
    sleep: async () => {},
  });
  assert.equal(result.flashed, true);
  assert.deepEqual(posts.map(post => Number(post.brightness.toFixed(3))), [0.09, 0.45]);
});

test('does nothing for a single-zone card or a zone the card does not hold', async () => {
  const posts = [];
  const post = async payload => { posts.push(payload); return { ok: true }; };
  assert.deepEqual(await flashSectionOnCard({ zoneId: 'only', zones: [{ id: 'only', brightness: 1 }], postControlImpl: post, sleep: async () => {} }),
    { flashed: false, dimmed: [], restored: [] });
  assert.deepEqual(await flashSectionOnCard({ zoneId: 'ring-9', zones, postControlImpl: post, sleep: async () => {} }),
    { flashed: false, dimmed: [], restored: [] });
  assert.deepEqual(posts, []);
});

test('a dim that fails midway still restores everything already dimmed', async () => {
  const posts = [];
  let calls = 0;
  await assert.rejects(flashSectionOnCard({
    zoneId: 'ring-2',
    zones,
    postControlImpl: async payload => {
      calls += 1;
      if (calls === 2) throw new Error('card went away');
      posts.push(payload);
      return { ok: true };
    },
    sleep: async () => {},
  }), /card went away/);
  assert.deepEqual(posts, [
    { zone: 'ring-1', syncZones: false, brightness: 0.2 },
    { zone: 'ring-1', syncZones: false, brightness: 1 },
  ]);
});

// The bench-discovery practice card answers the facts the physical card
// answered on 2026-11-21 (tests/harness/traces/real-card-bench-2026-11-21/).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBenchDiscoveryCard } from './harness/benchDiscoveryCard';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'harness', 'traces', 'real-card-bench-2026-11-21');
const real = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.map(k => [k, o?.[k]]));
const outputsOf = (o: any) => (o?.outputs || []).map((x: any) => ({
  id: x.id, pin: x.pin, pixels: x.pixels,
  segments: (x.segments || []).map((s: any) => ({ id: s.id, count: s.count, direction: s.direction })),
}));

test('the bench-discovery practice card answers what the physical card answered', async ({ page }) => {
  const card = createBenchDiscoveryCard();
  await card.install(page);
  await page.goto('/');
  const get = (p: string) => page.evaluate(async url => (await fetch(url)).json(), `http://lightweaver.local${p}`);

  const identity = ['projectId', 'projectRevision', 'projectFingerprint', 'provisionalSetup', 'firmwareVersion',
    'buildId', 'buildNumber', 'runtimePhase', 'commandReady', 'knownGoodProject'];
  for (const p of ['/api/status', '/api/firmware-info']) {
    const sim = await get(p);
    const want = real(p === '/api/status' ? 'status' : 'firmware-info');
    // firmware-info names the project only as piece.id on the real card; the
    // simulator also adds a top-level projectId (logged drift, see the plan).
    const keys = p === '/api/firmware-info' ? identity.filter(k => k !== 'projectId') : identity;
    expect(pick(sim, keys), p).toEqual(pick(want, keys));
    if (p === '/api/firmware-info') expect(sim.piece?.id).toBe(want.piece?.id);
    expect(outputsOf(sim), `${p} outputs`).toEqual(outputsOf(want));
  }
  const info = await get('/api/firmware-info');
  const wantInfo = real('firmware-info');
  expect(pick(info, ['ledType', 'outputColor', 'controls'])).toEqual(pick(wantInfo, ['ledType', 'outputColor', 'controls']));
  const status = await get('/api/status');
  expect(pick(status.firmwareUpdate, ['phase', 'rollbackReason', 'restoredFirmwareVersion', 'restoredBuildNumber', 'lastError']))
    .toEqual(pick(real('status').firmwareUpdate, ['phase', 'rollbackReason', 'restoredFirmwareVersion', 'restoredBuildNumber', 'lastError']));

  const wiring = await get('/api/wiring/status');
  expect(pick(wiring, ['state', 'candidateState', 'hasCandidate'])).toEqual(pick(real('wiring_status'), ['state', 'candidateState', 'hasCandidate']));

  const zones = await get('/api/zones');
  expect(zones.zones.map((z: any) => ({ id: z.id, brightness: z.brightness, ranges: z.ranges.map((r: any) => [r.start, r.count]) })))
    .toEqual(real('zones').zones.map((z: any) => ({ id: z.id, brightness: z.brightness, ranges: z.ranges.map((r: any) => [r.start, r.count]) })));

  const patterns = await get('/api/patterns');
  expect(pick(patterns, ['currentId'])).toEqual(pick(real('patterns'), ['currentId']));
  expect(patterns.patterns.map((x: any) => x.id)).toEqual(real('patterns').patterns.map((x: any) => x.id));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureCardSectionsForPreview } from './cardSectionSync.js';

for (const transport of ['direct', 'bridge']) {
  test(`section sync preserves ${transport} transport through save and readback`, async () => {
    let installed = false;
    const requests = [];
    const result = await ensureCardSectionsForPreview({
      host: '192.168.50.77',
      transport,
      requiredZoneIds: ['left', 'right'],
      runtimePackage: { config: { zones: [{ id: 'left' }, { id: 'right' }] } },
      async readZones(options) {
        requests.push(['zones', options.transport]);
        return { zones: installed ? [{ id: 'left' }, { id: 'right' }] : [] };
      },
      async pushConfig(_config, options) {
        requests.push(['config', options.transport]);
        installed = true;
        return { ok: true };
      },
      sleep: async () => {},
    });
    assert.equal(result.synced, true);
    assert.deepEqual(requests, [['zones', transport], ['config', transport], ['zones', transport]]);
  });
}

test('saved mix refuses a stale direction before any section preview can proceed', async () => {
  const segments = [11, 10, 10, 10].map((count, index) => ({
    id: `part-${index + 1}`, count, direction: 'forward',
  }));
  const targetSegments = segments.map((segment, index) => (
    index === 1 ? { ...segment, direction: 'reverse' } : segment
  ));
  const neighbor = { id: 'out2', pin: 16, pixels: 5 };
  const output = { id: 'out1', pin: 18, pixels: 41 };
  const zones = { zones: segments.map(({ id }) => ({ id })) };
  let installedSegments = segments;
  let writes = 0;
  let statusReads = 0;
  const options = {
    host: '192.168.50.77',
    transport: 'bridge',
    requiredZoneIds: segments.map(({ id }) => id),
    runtimePackage: { config: { led: { outputs: [{ ...output, segments: targetSegments }, neighbor] }, ...zones } },
    verifyInstalledWiring: true,
    async readWiring({ transport }) {
      assert.equal(transport, 'bridge');
      statusReads += 1;
      return { outputs: [{ ...output, segments: installedSegments }, neighbor] };
    },
    async readZones() { return zones; },
    async pushConfig() { writes += 1; },
  };

  await assert.rejects(ensureCardSectionsForPreview(options), { reason: 'section-layout-mismatch' });
  assert.equal(writes, 0);

  installedSegments = targetSegments;
  assert.deepEqual(await ensureCardSectionsForPreview(options), { synced: false, zones });
  assert.equal(writes, 0);
  assert.equal(statusReads, 2);
});

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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyLedCountOnCard,
  applyTypedLedCountToCard,
  cardStatusWithPixelCount,
  projectForTypedLedCount,
  projectFromCountedCardStatus,
} from './applyLedCountToCard.js';
import { pushConfigToCard } from './cardPushClient.js';

const realBenchStatus = JSON.parse(readFileSync(new URL('./fixtures/realBenchCountStatus.json', import.meta.url), 'utf8'));
const realBenchFirmwareInfo = JSON.parse(readFileSync(new URL('./fixtures/realBenchCountFirmwareInfo.json', import.meta.url), 'utf8'));

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

const project = {
  projectId: 'counted-piece',
  projectName: 'Counted Piece',
  strips: [{
    id: 'a',
    name: 'Strip',
    pixelCount: 41,
    pixels: Array.from({ length: 41 }, (_, index) => ({ x: index, y: 0 })),
  }],
  wiring: {
    version: 1,
    locked: false,
    verified: false,
    outputs: [{ id: 'o1', name: 'One', pin: 16, runIds: ['a'] }],
    runs: [{
      id: 'a',
      type: 'strip',
      source: { stripId: 'a', from: 0, to: 40 },
      directionPolicy: 'flexible',
      physicalDirection: 'source-forward',
      seamLed: null,
    }],
  },
  standaloneController: {
    outputs: [{ id: 'main', pin: 16, pixels: 41 }],
    led: { colorOrder: 'GRB' },
  },
};

const countedProjectCard = {
  ledType: 'WS2812B', maxMilliamps: 1500,
  outputs: [{ id: 'o1', pin: 16, pixels: 256, segments: [{ id: 'a', count: 256, direction: 'forward' }] }],
};

test('applies a typed LED count when the GPIO is unchanged', async () => {
  const pushes = [];
  const result = await applyTypedLedCountToCard({
    host: '192.168.18.70',
    project,
    readEvidence: async () => countedProjectCard,
    pushConfig: async (runtimePackage, options) => {
      pushes.push({ runtimePackage, options });
      return { ok: true, saved: true };
    },
  });
  assert.equal(result.applied, true);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].options.reboot, 'if-needed');
  assert.equal(result.runtimePackage.config.led.outputs[0].pixels, 41);
});

test('does not write when the card already has that length', async () => {
  const result = await applyTypedLedCountToCard({
    host: '192.168.18.70',
    project,
    readEvidence: async () => ({ outputs: [{ pin: 16, pixels: 41 }] }),
    pushConfig: async () => { throw new Error('must not write'); },
  });
  assert.deepEqual(result, { applied: false, reason: 'not-a-length-change' });
});

test('does not write a GPIO change as a length update', async () => {
  const result = await applyTypedLedCountToCard({
    host: '192.168.18.70',
    project,
    readEvidence: async () => ({ outputs: [{ pin: 18, pixels: 256 }] }),
    pushConfig: async () => { throw new Error('must not write'); },
  });
  assert.deepEqual(result, { applied: false, reason: 'not-a-length-change' });
});

const benchStatus = realBenchStatus;

test('cardStatusWithPixelCount resizes a single-strip card in place', () => {
  const next = cardStatusWithPixelCount(benchStatus, { pixels: 41 });
  assert.equal(next.outputs[0].pin, 18);
  assert.equal(next.outputs[0].pixels, 41);
  assert.equal(next.outputs[0].segments[0].count, 41);
  assert.equal(next.led.pixels, 41);
});

test('cardStatusWithPixelCount refuses to guess among multiple strips', () => {
  assert.throws(
    () => cardStatusWithPixelCount({
      ...benchStatus,
      outputs: [
        ...benchStatus.outputs,
        { id: 'out2', pin: 17, pixels: 60, segments: [{ id: 'b', count: 60, direction: 'forward' }] },
      ],
    }, { pixels: 41 }),
    /GPIO/,
  );
});

test('a counted card project keeps the GPIO and uses the new length', () => {
  const projectFromCard = projectFromCountedCardStatus(benchStatus, { pixels: 41 });
  assert.equal(projectFromCard.projectId, 'lightweaver-bench-discovery-v1');
  assert.equal(projectFromCard.strips[0].pixelCount, 41);
  assert.equal(projectFromCard.standaloneController.outputs[0].pin, 18);
  assert.equal(projectFromCard.standaloneController.outputs[0].pixels, 41);
  assert.equal(projectFromCard.wiring.outputs[0].pin, 18);
});

test('applyLedCountOnCard writes from the live card without a Studio Layout visit', async () => {
  const pushes = [];
  const result = await applyLedCountOnCard({
    host: '192.168.18.70',
    pixels: 41,
    readStatus: async () => benchStatus,
    readFirmwareInfo: async () => realBenchFirmwareInfo,
    readEvidence: async () => benchStatus,
    readWiring: async () => ({ state: 'known-good', hasCandidate: false, cardId: benchStatus.cardId }),
    pushConfig: async (runtimePackage, options) => {
      pushes.push({ runtimePackage, options });
      return { ok: true, saved: true };
    },
  });
  assert.equal(result.applied, true);
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].pin, 18);
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].pixels, 41);
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].id, 'bench-18');
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].segments[0].id, 'bench-18-full');
  assert.equal(pushes[0].runtimePackage.config.led.maxMilliamps, 2000);
  assert.equal(pushes[0].runtimePackage.config.projectRevision, 1);
  assert.match(pushes[0].runtimePackage.config.projectFingerprint, /^[a-f0-9]{16}$/);
});

test('a staged count response is not reported as applied', async () => {
  const result = await applyLedCountOnCard({
    host: '192.168.18.70', pixels: 41, pin: 18,
    readStatus: async () => benchStatus,
    readFirmwareInfo: async () => realBenchFirmwareInfo,
    readEvidence: async () => benchStatus,
    readWiring: async () => ({ state: 'known-good', hasCandidate: false }),
    pushConfig: async () => ({ ok: true, state: 'staged', activationId: 'candidate-a' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'staged-candidate');
});

test('real build 2160 status and firmware-info jointly authorize only a GPIO18 length change', async () => {
  const pushes = [];
  const result = await applyLedCountOnCard({
    host: '192.168.18.70', pixels: 41, pin: 18,
    readWiring: async () => ({ state: 'known-good', hasCandidate: false, cardId: realBenchStatus.cardId }),
    readStatus: async () => realBenchStatus,
    readFirmwareInfo: async () => realBenchFirmwareInfo,
    readEvidence: async () => realBenchStatus,
    pushConfig: async (pkg) => { pushes.push(pkg); return { ok: true, saved: true }; },
  });
  assert.equal(result.applied, true);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].config.led.outputs[0].id, 'bench-18');
  assert.equal(pushes[0].config.led.outputs[0].segments[0].id, 'bench-18-full');
  assert.equal(pushes[0].config.led.maxMilliamps, 2000);
});

test('real build 2160 count sends top-level LED outputs through the actual direct config serializer', async () => {
  const writes = [];
  const result = await applyLedCountOnCard({
    host: '192.168.18.70', pixels: 41, pin: 18,
    readWiring: async () => ({ state: 'known-good', hasCandidate: false, cardId: realBenchStatus.cardId }),
    readStatus: async () => realBenchStatus,
    readFirmwareInfo: async () => realBenchFirmwareInfo,
    readEvidence: async () => realBenchStatus,
    pushConfig: (pkg, options) => pushConfigToCard(pkg, {
      ...options, transport: 'direct',
      fetchImpl: async (url, init = {}) => {
        const path = new URL(url).pathname;
        if (path === '/api/firmware-info') return jsonResponse(realBenchFirmwareInfo);
        if (path === '/api/config') {
          const body = JSON.parse(init.body);
          writes.push(body);
          assert.equal(Object.hasOwn(body, 'config'), false);
          assert.equal(body.led.outputs[0].id, 'bench-18');
          assert.equal(body.led.outputs[0].pixels, 41);
          assert.equal(body.led.outputs[0].segments[0].id, 'bench-18-full');
          assert.equal(body.led.maxMilliamps, 2000);
          assert.equal(body.piece.id, 'lightweaver-bench-discovery-v1');
          assert.equal(body.provisional, true);
          assert.equal(body.controls.encoder.a, 4);
          return jsonResponse({ ok: true, requiresReboot: true });
        }
        if (path === '/api/reboot') return jsonResponse({ ok: true });
        throw new Error(`unexpected path ${path}`);
      },
    }),
  });
  assert.equal(result.applied, true);
  assert.equal(writes.length, 1);
});

test('count tool refuses mismatched firmware-info card, boot, build, and project before writing', async () => {
  for (const mismatch of [
    { cardId: 'lw-other' }, { bootId: 'boot-other' }, { buildNumber: 9999 },
    { projectFingerprint: 'other' },
  ]) {
    const result = await applyLedCountOnCard({
      host: '192.168.18.70', pixels: 41, pin: 18,
      readWiring: async () => ({ state: 'known-good', hasCandidate: false, cardId: realBenchStatus.cardId }),
      readStatus: async () => realBenchStatus,
      readFirmwareInfo: async () => ({ ...realBenchFirmwareInfo, ...mismatch }),
      pushConfig: async () => { throw new Error('must not write'); },
    });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'firmware-evidence-mismatch');
  }
});

test('count tool refuses a card reboot between exact proof and final preflight', async () => {
  const result = await applyLedCountOnCard({
    host: '192.168.18.70', pixels: 41, pin: 18,
    readWiring: async () => ({ state: 'known-good', hasCandidate: false, cardId: realBenchStatus.cardId }),
    readStatus: async () => realBenchStatus,
    readFirmwareInfo: async () => realBenchFirmwareInfo,
    readEvidence: async () => ({ ...realBenchStatus, bootId: 'boot-new' }),
    pushConfig: async () => { throw new Error('must not write'); },
  });
  assert.deepEqual(result, { applied: false, reason: 'status-changed' });
});

test('count tool refuses to write while a wiring candidate is present', async () => {
  const result = await applyLedCountOnCard({
    host: '192.168.18.70', pixels: 41, pin: 18,
    readWiring: async () => ({ state: 'staged', hasCandidate: true }),
    readStatus: async () => { throw new Error('must not read or write'); },
    pushConfig: async () => { throw new Error('must not write'); },
  });
  assert.deepEqual(result, { applied: false, reason: 'wiring-candidate-active' });
});

test('count tool refuses a disguised topology or power change', async () => {
  for (const changed of [
    { outputs: [{ ...countedProjectCard.outputs[0], id: 'different' }] },
    { outputs: [{ ...countedProjectCard.outputs[0], segments: [{ id: 'different', count: 256, direction: 'forward' }] }] },
    { maxMilliamps: 2000 },
    { ledType: 'WS2815' },
  ]) {
    const result = await applyTypedLedCountToCard({
      host: '192.168.18.70', project,
      readEvidence: async () => ({ ...countedProjectCard, ...changed }),
      pushConfig: async () => { throw new Error('must not write'); },
    });
    assert.deepEqual(result, { applied: false, reason: 'not-a-length-change' });
  }
});

test('typed count write follows strip pixels even if a run range is stale', async () => {
  const drifted = {
    ...project,
    strips: [{
      ...project.strips[0],
      pixelCount: 39,
      pixels: Array.from({ length: 39 }, (_, index) => ({ x: index, y: 0 })),
    }],
  };
  const prepared = projectForTypedLedCount(drifted);
  assert.equal(prepared.wiring.runs[0].source.to, 38);
  assert.equal(prepared.standaloneController.outputs[0].pixels, 39);

  const pushes = [];
  const result = await applyTypedLedCountToCard({
    host: '192.168.18.70',
    project: drifted,
    readEvidence: async () => ({ ...countedProjectCard, outputs: [{ ...countedProjectCard.outputs[0], pixels: 41 }] }),
    pushConfig: async (runtimePackage, options) => {
      pushes.push({ runtimePackage, options });
      return { ok: true, saved: true };
    },
  });
  assert.equal(result.applied, true);
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].pixels, 39);
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].pin, 16);
});

test('LayoutScreen does not silently auto-push a typed LED count', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const layoutScreen = readFileSync(fileURLToPath(new URL('../components/LayoutScreen.jsx', import.meta.url)), 'utf8');
  assert.equal(layoutScreen.includes('useApplyLedCountToCard'), false);
  let hookMissing = false;
  try {
    readFileSync(fileURLToPath(new URL('../components/layout/hooks/useApplyLedCountToCard.js', import.meta.url)));
  } catch (error) {
    hookMissing = error?.code === 'ENOENT';
  }
  assert.equal(hookMissing, true);
  const drawPanel = readFileSync(fileURLToPath(new URL('../components/layout/modes/DrawModePanel.jsx', import.meta.url)), 'utf8');
  assert.match(drawPanel, /setStripPhysical\(id, \{ lengthM: count \/ dens \}\)/);
  assert.equal(drawPanel.includes('useApplyLedCountToCard'), false);
});

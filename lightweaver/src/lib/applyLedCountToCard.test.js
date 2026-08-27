import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLedCountOnCard,
  applyTypedLedCountToCard,
  cardStatusWithPixelCount,
  projectForTypedLedCount,
  projectFromCountedCardStatus,
} from './applyLedCountToCard.js';

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

test('applies a typed LED count when the GPIO is unchanged', async () => {
  const pushes = [];
  const result = await applyTypedLedCountToCard({
    host: '192.168.18.70',
    project,
    readEvidence: async () => ({ outputs: [{ pin: 16, pixels: 256 }] }),
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

const benchStatus = {
  projectId: 'lightweaver-bench-discovery-v1',
  projectRevision: 4,
  currentPatternId: 'aurora',
  piece: { name: 'Untitled Project' },
  led: { type: 'WS2812B', colorOrder: 'RGB', maxMilliamps: 2000, pixels: 256 },
  outputs: [{
    id: 'out1', pin: 18, pixels: 256, gpio: 18, count: 256,
    segments: [{ id: 'bench-18-full', count: 256, direction: 'forward' }],
  }],
};

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
    readEvidence: async () => ({ outputs: [{ pin: 18, pixels: 256 }] }),
    pushConfig: async (runtimePackage, options) => {
      pushes.push({ runtimePackage, options });
      return { ok: true, saved: true };
    },
  });
  assert.equal(result.applied, true);
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].pin, 18);
  assert.equal(pushes[0].runtimePackage.config.led.outputs[0].pixels, 41);
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
    readEvidence: async () => ({ outputs: [{ pin: 16, pixels: 41 }] }),
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
  assert.match(drawPanel, /setStripCount\(id, clampLedCount\(raw\)\)/);
  assert.equal(drawPanel.includes('setStripPhysical(id, { lengthM: clampLedCount'), false);
});

// Dev-only click-through seeds. Production never imports this.
//
// Local Studio has no card on the wire. These query params put the existing
// Connect / Setup surfaces into the states the connect work is about, so the
// owner can hunt leftover circles without USB or an AP. They do not add a
// connect surface.

const PREVIEW_HOST = 'lightweaver.local';
const BUILD_ID = 'a'.repeat(40);

function readyStatus(cardId, overrides = {}) {
  return {
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    cardId,
    firmwareVersion: '1.4.0',
    buildId: BUILD_ID,
    bootId: `boot-${cardId}`,
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    outputReady: true,
    playbackReady: true,
    ...overrides,
  };
}

function mockCardFetch(status) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!/lightweaver\.local|192\.168\.4\.1/.test(url)) return originalFetch(input, init);
    if (!status) return Promise.reject(new TypeError('Failed to fetch'));
    let path = '/';
    try { path = new URL(url, 'http://lightweaver.local').pathname; } catch { /* keep / */ }
    if (path === '/api/status' || path === '/api/firmware-info') {
      return Promise.resolve(new Response(JSON.stringify({ ...status, bridgeVersion: 6 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    return Promise.resolve(new Response('{"ok":false}', {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }));
  };
}

function clearCardMemory() {
  localStorage.clear();
}

function seedReadyProject({ cardId, projectId, fingerprint, name }) {
  localStorage.setItem('lw_card_identity_v1', JSON.stringify({
    version: 1, id: cardId, firmwareVersion: '1.4.0', buildId: BUILD_ID,
  }));
  localStorage.setItem('lw_chip_card_host', PREVIEW_HOST);
  localStorage.setItem('lw_autosave_v3', JSON.stringify({
    id: projectId,
    name,
    layout: {
      starterPending: false,
      strips: [{ id: 'strip-1', pixels: 41, pin: 18 }],
      wiring: {
        verified: true,
        runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }],
      },
    },
    portRoles: [{ port: 'out1', role: 'strip', pin: 18, pixelCount: 41 }],
    devices: {
      standaloneController: {
        led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' },
      },
    },
  }));
  localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
    generation: 1,
    editedRevision: 1,
    installedRevision: 1,
    dirty: false,
    installation: {
      cardId,
      projectRevision: 1,
      projectFingerprint: fingerprint,
      studioFingerprint: fingerprint,
      verified: true,
    },
  }));
}

function announceVerified(status) {
  const card = {
    id: status.cardId,
    firmwareVersion: status.firmwareVersion,
    buildId: status.buildId,
  };
  const event = {
    type: 'card-verified',
    via: 'direct',
    host: PREVIEW_HOST,
    card,
    expectedCard: card,
    readiness: status,
  };
  return import('./cardLink.js').then(({ getSharedCardLink }) => {
    const link = getSharedCardLink();
    const priorBootId = link.getState().validatedBootId;
    link.dispatch(event);
    if (!priorBootId || priorBootId === status.bootId) link.dispatch(event);
  });
}

const STATUS_OUTPUTS = [{
  id: 'out1', pin: 18, pixels: 41, gpio: 18, count: 41,
  segments: [{ id: 'run-strip-1', count: 41, direction: 'forward' }],
}];

export async function installDevCardPreview() {
  const kind = new URLSearchParams(window.location.search).get('lwCard');
  if (!kind) return;
  if (kind === 'fresh') {
    // Fresh used to wipe localStorage, hold LAN probes, and reject every
    // fetch to lightweaver.local / 192.168.4.1. That faked a dead card on a
    // bench that already had one answering, then opened the no-reply essay.
    // Leave the real network alone. Empty Studio memory is a Layout concern,
    // not a Connect concern.
    return;
  }
  if (kind === 'unpaired') {
    clearCardMemory();
    mockCardFetch(readyStatus('lw-preview-unpaired', {
      projectId: 'held-piece',
      projectRevision: 1,
      projectFingerprint: 'd'.repeat(64),
    }));
    return;
  }
  if (kind === 'ready') {
    const cardId = 'lw-preview-ready';
    const projectId = 'ready-piece';
    const fingerprint = 'c'.repeat(64);
    const status = readyStatus(cardId, {
      projectId,
      projectRevision: 1,
      projectFingerprint: fingerprint,
      outputs: STATUS_OUTPUTS,
    });
    seedReadyProject({ cardId, projectId, fingerprint, name: 'Ready piece' });
    mockCardFetch(status);
    await announceVerified(status);
    return;
  }
  if (kind === 'mismatch') {
    const cardId = 'lw-preview-mismatch';
    const status = readyStatus(cardId, {
      projectId: 'card-held-piece',
      projectRevision: 2,
      projectFingerprint: 'b'.repeat(64),
      outputs: STATUS_OUTPUTS,
    });
    seedReadyProject({
      cardId,
      projectId: 'studio-open-work',
      fingerprint: 'e'.repeat(64),
      name: 'Studio open work',
    });
    mockCardFetch(status);
    await announceVerified(status);
  }
}

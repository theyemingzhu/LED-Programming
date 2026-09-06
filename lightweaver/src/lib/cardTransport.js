import { cardHostToUrl, isLocalCardHost, normalizeCardHost, rememberCardHost, writeStoredCardHost } from './cardConnection.js';
import { normalizeCardIdentity, persistCardIdentity, readPersistedCardIdentity } from './cardIdentity.js';
import { classifyCardReadiness } from './cardReadiness.js';
import { getSharedCardLink } from './cardLink.js';
import { allowLanProbes } from './usbInspection.js';

export const CARD_TRANSPORTS = Object.freeze({
  DIRECT: 'direct-lna',
  LOCAL: 'local-origin',
  BRIDGE: 'legacy-bridge',
});

let activeTransportAuthority = null;
const transportAcquisitionFlights = new Map();

export function getActiveCardTransportAuthority(host = '') {
  const authority = activeTransportAuthority;
  if (!authority || authority.revoked) return null;
  const expectedHost = normalizeCardHost(host || authority.host);
  return normalizeCardHost(authority.host) === expectedHost ? authority : null;
}

export function revokeActiveCardTransportAuthority() {
  activeTransportAuthority?.revoke?.();
  activeTransportAuthority = null;
}

function ownerSessionId() {
  try { return globalThis.crypto?.randomUUID?.() || `owner-${Date.now()}-${Math.random()}`; }
  catch { return `owner-${Date.now()}-${Math.random()}`; }
}

export function cardLocalStudioUrl(host = '') {
  const normalized = normalizeCardHost(host);
  if (!isLocalCardHost(normalized)) throw new TypeError('A local Lightweaver card host is required.');
  return `${cardHostToUrl(normalized)}/studio/`;
}

function failure(reason, host, details = {}) {
  return Object.freeze({
    connected: false,
    reason,
    host,
    ...details,
    recovery: Object.freeze({ localStudioUrl: cardLocalStudioUrl(host) }),
  });
}

/**
 * The one reason that means "the card is fine, its boot identity moved".
 *
 * A reboot — Recover lights' `restartCard`, a firmware update, a power cycle —
 * gives the card a new bootId, which is exactly the fact an authority pins. An
 * anonymous refusal here reached the owner as "the card did not answer in
 * time" about a card that was healthy and back on the network.
 */
export const CARD_RESTARTED_REASON = 'card-restarted';

const AUTHORITY_ERROR_MESSAGES = Object.freeze({
  [CARD_RESTARTED_REASON]: 'The card restarted, so this transport authority no longer matches it.',
});

const DEFAULT_AUTHORITY_ERROR_MESSAGE = 'Card transport authority was revoked and must be revalidated.';

function authorityError(reason = 'transport-revoked', details = {}) {
  const error = new Error(AUTHORITY_ERROR_MESSAGES[reason] || DEFAULT_AUTHORITY_ERROR_MESSAGE);
  error.reason = reason;
  // Whether the card was actually spoken to. A refusal raised BEFORE the fetch
  // means nothing was sent, so re-acquiring and sending once is not a duplicate
  // write; a refusal raised after the reply arrived means the command landed.
  error.requestSent = Boolean(details.requestSent);
  return error;
}

async function parseJsonResponse(response) {
  if (!response?.ok) {
    const error = new Error(`Card returned HTTP ${response?.status || 0}.`);
    error.reason = 'http';
    error.status = Number(response?.status || 0);
    try {
      const details = await response.json();
      error.details = details;
      error.code = details?.reason || details?.code || details?.error || '';
      const cardMessage = [details?.message, details?.detail, details?.error]
        .find(value => typeof value === 'string' && value.trim());
      if (cardMessage) error.message = cardMessage.trim().slice(0, 240);
      if (details?.currentHead) error.currentHead = details.currentHead;
    } catch { /* an HTTP status remains sufficient evidence */ }
    throw error;
  }
  return response.json();
}

function exactStatus(status, { expectedCardId = '', host = '' } = {}) {
  const observed = normalizeCardIdentity(status || {}, host);
  const observedCardId = String(observed?.id || status?.cardId || '').trim();
  const observedCard = observedCardId ? {
    id: observedCardId,
    firmwareVersion: observed.firmwareVersion,
    buildNumber: observed.buildNumber,
    buildId: observed.buildId,
  } : null;
  if (!observedCardId) return { ok: false, reason: 'identity-missing', observedCardId: '', observedCard };
  if (expectedCardId && observedCardId !== expectedCardId) return { ok: false, reason: 'wrong-card', observedCardId, observedCard };
  const classified = classifyCardReadiness(status || {}, {
    expectedCard: expectedCardId ? { id: expectedCardId } : null,
  });
  if (classified.state === 'identity-mismatch') return { ok: false, reason: 'wrong-card', observedCardId, observedCard };
  if (!classified.contractSupported || !classified.identityValid || !classified.bootId) {
    return {
      ok: false,
      reason: classified.identityValid && observed.firmwareVersion && observed.buildId
        ? 'firmware-incompatible'
        : 'identity-missing',
      observedCardId,
      observedCard,
    };
  }
  return { ok: true, card: observed, bootId: classified.bootId, readiness: status };
}

/**
 * Which fact stopped matching, named.
 *
 * Boot is checked before the operation generation deliberately: a reboot bumps
 * both (cardLink mints a new generation the moment it sees a changed bootId),
 * and the reboot is the cause. Reporting the generation would hide the one
 * condition a caller can actually recover from.
 */
function snapshotDivergence(expected, observed) {
  if (expected.host !== observed.host) return 'transport-revoked';
  if (expected.cardId !== observed.cardId) return 'transport-revoked';
  if (expected.ownerSessionId !== observed.ownerSessionId) return 'transport-revoked';
  if (expected.bootId !== observed.bootId) return CARD_RESTARTED_REASON;
  if (expected.operationGeneration !== observed.operationGeneration) return 'transport-revoked';
  return '';
}

function sameSnapshot(left, right) {
  return snapshotDivergence(left, right) === '';
}

export function createTransportAuthority({
  transport,
  host,
  status,
  card,
  link,
  fetchImpl,
  ownerCapability = '',
}) {
  const normalizedHost = normalizeCardHost(host);
  const session = ownerSessionId();
  const initialState = link?.getState?.() || {};
  const immutableSnapshot = Object.freeze({
    host: normalizedHost,
    cardId: String(card?.id || status?.cardId || ''),
    bootId: String(status?.bootId || initialState.validatedBootId || ''),
    ownerSessionId: session,
    operationGeneration: Number(initialState.operationGeneration || 0),
    projectHead: String(status?.projectHead || ''),
  });
  let revoked = false;
  let revocationReason = '';
  let capability = String(ownerCapability || '');
  let capabilityExpectedHead = null;
  let capabilityExpiresAt = 0;
  const currentSnapshot = () => {
    const state = link?.getState?.() || initialState;
    return {
      host: normalizeCardHost(state.host || normalizedHost),
      cardId: String(state.card?.id || immutableSnapshot.cardId),
      bootId: String(state.validatedBootId || state.readiness?.bootId || immutableSnapshot.bootId),
      ownerSessionId: session,
      operationGeneration: Number(state.operationGeneration || 0),
    };
  };
  const assertCurrent = ({ requestSent = false } = {}) => {
    const divergence = revoked
      ? (revocationReason || 'transport-revoked')
      : snapshotDivergence(immutableSnapshot, currentSnapshot());
    if (!divergence) return;
    revoked = true;
    revocationReason = divergence;
    throw authorityError(divergence, { requestSent });
  };
  const baseUrl = transport === CARD_TRANSPORTS.LOCAL ? '' : cardHostToUrl(normalizedHost);
  const doFetch = fetchImpl || globalThis.fetch;
  const request = async (path, init = {}) => {
    assertCurrent();
    if (typeof doFetch !== 'function') throw new TypeError('fetch is unavailable');
    const headers = { Accept: 'application/json', ...(init.headers || {}) };
    let body = init.body;
    if (body && typeof body === 'object' && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && typeof body !== 'string') {
      headers['Content-Type'] ||= 'application/json';
      body = JSON.stringify(body);
    }
    const response = await doFetch(`${baseUrl}${path}`, {
      cache: 'no-store', credentials: 'omit', targetAddressSpace: transport === CARD_TRANSPORTS.DIRECT ? 'local' : undefined,
      ...init, headers, body,
    });
    const result = await parseJsonResponse(response);
    assertCurrent({ requestSent: true });
    return result;
  };
  const authority = {
    connected: true,
    transport,
    card,
    readiness: status,
    ...immutableSnapshot,
    get ownerCapability() { return capability && Date.now() < capabilityExpiresAt ? capability : ''; },
    get ownerCapabilityExpectedHead() { return capabilityExpectedHead; },
    get revoked() { return revoked; },
    snapshot: () => immutableSnapshot,
    request,
    async stop() {
      if (revoked) return false;
      await request('/api/control', { method: 'POST', body: { cancelStream: true, blackout: true } });
      revoked = true;
      return true;
    },
    async revalidate() {
      assertCurrent();
      const response = await doFetch(`${baseUrl}/api/status`, { method: 'GET', cache: 'no-store', credentials: 'omit', targetAddressSpace: transport === CARD_TRANSPORTS.DIRECT ? 'local' : undefined });
      const nextStatus = await parseJsonResponse(response);
      const exact = exactStatus(nextStatus, { expectedCardId: immutableSnapshot.cardId, host: normalizedHost });
      if (!exact.ok || exact.bootId !== immutableSnapshot.bootId) { revoked = true; throw authorityError('identity-changed'); }
      return nextStatus;
    },
    async issueOwnerCapability({ commissioningProof = '', expectedProjectHead = immutableSnapshot.projectHead } = {}) {
      assertCurrent();
      if (!String(commissioningProof).trim()) throw new Error('Existing commissioning proof or deliberate physical-pairing confirmation is required.');
      const result = await request('/api/owner/capability', {
        method: 'POST',
        body: {
          ...immutableSnapshot,
          expectedProjectHead: expectedProjectHead || '',
          commissioningProof: String(commissioningProof).slice(0, 160),
        },
      });
      if (!result?.capability || result.cardId !== immutableSnapshot.cardId || result.bootId !== immutableSnapshot.bootId) {
        throw new Error('The card did not issue an exact owner capability.');
      }
      capability = String(result.capability);
      capabilityExpectedHead = expectedProjectHead || null;
      capabilityExpiresAt = Date.now() + Math.max(1, Math.min(60000, Number(result.expiresInMs) || 60000));
      return capability;
    },
    advanceOwnerCapabilityHead(nextHead) {
      assertCurrent();
      if (!capability || Date.now() >= capabilityExpiresAt) throw authorityError('owner-capability-expired');
      capabilityExpectedHead = String(nextHead || '') || null;
      return capabilityExpectedHead;
    },
    revoke() { revoked = true; revocationReason ||= 'transport-revoked'; capability = ''; capabilityExpiresAt = 0; return true; },
    watch(listener) {
      if (!link?.subscribe) return () => {};
      return link.subscribe(() => {
        if (revoked) return;
        const divergence = snapshotDivergence(immutableSnapshot, currentSnapshot());
        if (divergence) {
          revoked = true;
          revocationReason = divergence;
          listener?.({ type: 'revoked', reason: 'authority-changed' });
        }
      });
    },
  };
  return Object.freeze(authority);
}

async function connectCardTransportOnce({
  host,
  expectedCardId = readPersistedCardIdentity()?.id || '',
  fetchImpl = globalThis.fetch,
  link = getSharedCardLink(),
  transport = CARD_TRANSPORTS.DIRECT,
  ownerCapability = '',
} = {}) {
  const normalizedHost = normalizeCardHost(host);
  if (!isLocalCardHost(normalizedHost)) throw new TypeError('A valid local Lightweaver card host is required.');
  const baseUrl = transport === CARD_TRANSPORTS.LOCAL ? '' : cardHostToUrl(normalizedHost);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/api/status`, {
        method: 'GET', cache: 'no-store', credentials: 'omit',
        signal: controller.signal,
        ...(transport === CARD_TRANSPORTS.DIRECT ? { targetAddressSpace: 'local' } : {}),
        // Keep this read-only probe CORS-safelisted. Released cards accept an
        // ordinary JSON GET, but did not advertise the former custom header, so
        // browsers rejected that preflight before identity could be read.
        headers: { Accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }
    const status = await parseJsonResponse(response);
    const exact = exactStatus(status, { expectedCardId, host: normalizedHost });
    if (!exact.ok) return failure(exact.reason, normalizedHost, {
      expectedCardId: String(expectedCardId || ''), observedCardId: exact.observedCardId,
      ...(exact.observedCard ? { observedCard: exact.observedCard, readiness: status } : {}),
    });
    const acknowledgedAt = new Date().toISOString();
    // Owner-initiated connect with no remembered card IS the pair. Background
    // discovery uses reportDirectCardStatus({ allowAdopt: false }) and must
    // stay unpaired; this path is the one-tap Connect button.
    if (!expectedCardId && exact.card?.id) {
      persistCardIdentity(exact.card, { acknowledgedAt });
      rememberCardHost(normalizedHost);
      writeStoredCardHost(normalizedHost);
    }
    link?.dispatch?.({
      type: 'direct-status', connected: true, host: normalizedHost,
      card: exact.card,
      expectedCard: expectedCardId ? { id: expectedCardId } : exact.card,
      allowAdopt: !expectedCardId,
      readiness: status, acknowledgedAt,
    });
    revokeActiveCardTransportAuthority();
    activeTransportAuthority = createTransportAuthority({ transport, host: normalizedHost, status, card: exact.card, link, fetchImpl, ownerCapability });
    return activeTransportAuthority;
  } catch (cause) {
    if (cause?.reason === 'wrong-card') throw cause;
    return failure('direct-unavailable', normalizedHost, { cause });
  }
}

/**
 * Re-acquire an authority for the SAME card after its boot identity changed.
 *
 * Identity is not relaxed to recover from a restart: `expectedCardId` is
 * REQUIRED, and the fresh status probe still has to name that exact card, so a
 * different card answering at the same address is refused here exactly as it is
 * on a first connect. Without an expected id this refuses rather than probing —
 * an unattended re-acquire must never adopt whatever answers.
 */
export function reacquireCardTransportAuthority({ host, expectedCardId, ...rest } = {}) {
  const normalizedHost = normalizeCardHost(host);
  if (!isLocalCardHost(normalizedHost)) {
    return Promise.reject(new TypeError('A valid local Lightweaver card host is required.'));
  }
  const expected = String(expectedCardId || '').trim();
  if (!expected) {
    return Promise.resolve(failure('identity-missing', normalizedHost, { expectedCardId: '' }));
  }
  return connectCardTransport({ ...rest, host: normalizedHost, expectedCardId: expected });
}

function transportAcquisitionKey(host, expectedCardId, transport) {
  return `${normalizeCardHost(host)}\n${String(expectedCardId || '').trim()}\n${transport}`;
}

export function connectCardTransport(options = {}) {
  allowLanProbes();
  const host = normalizeCardHost(options.host);
  const expectedCardId = options.expectedCardId ?? readPersistedCardIdentity()?.id ?? '';
  const transport = options.transport || CARD_TRANSPORTS.DIRECT;
  const key = transportAcquisitionKey(host, expectedCardId, transport);
  const existing = transportAcquisitionFlights.get(key);
  if (existing) return existing;
  const flight = connectCardTransportOnce({
    ...options,
    host,
    expectedCardId,
    transport,
  }).finally(() => {
    if (transportAcquisitionFlights.get(key) === flight) {
      transportAcquisitionFlights.delete(key);
    }
  });
  transportAcquisitionFlights.set(key, flight);
  return flight;
}

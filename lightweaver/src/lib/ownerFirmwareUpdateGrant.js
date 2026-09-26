const BUILD_ID = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

function exactText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function studioOrigin() {
  const origin = globalThis.location?.origin;
  if (!origin || origin === 'null') throw new Error('Studio must have a secure web origin to authorize this update.');
  return origin;
}

export async function requestSoftwareFirmwareUpdateGrant({
  authority,
  release,
  fetchImpl = globalThis.fetch,
  origin = studioOrigin(),
} = {}) {
  const releaseBuildId = exactText(release?.manifest?.buildId, 40).toLowerCase();
  const ticketSha256 = exactText(release?.ticketSha256, 64).toLowerCase();
  if (!authority?.request || authority.revoked || !BUILD_ID.test(releaseBuildId) || !SHA256.test(ticketSha256)) {
    throw new Error('A current exact-card connection and verified firmware release are required.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('Studio cannot reach its firmware update service. Retry when online, or use the preserving USB update.');

  let challenge;
  try {
    challenge = await requestChallenge(authority, { origin, releaseBuildId, ticketSha256 });
  } catch (cause) {
    // A card-side HTTP refusal already carries the card's own message; only a
    // network-level failure surfaces as a bare TypeError ("Failed to fetch"),
    // which tells the owner nothing they can act on.
    if (cause?.reason || cause?.message !== 'Failed to fetch') throw cause;
    const error = new Error('Studio could not reach this card to request its secure update challenge. Reconnect the exact card, then retry, or use the preserving USB update.');
    error.cause = cause;
    throw error;
  }
  const grantPayload = typeof challenge?.grantPayload === 'string' ? challenge.grantPayload : '';
  if (!grantPayload || grantPayload.length > 3072) {
    throw new Error('The card did not return an exact software update challenge.');
  }

  let response;
  try {
    response = await fetchImpl('/api/firmware/update-grant', {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantPayload }),
    });
  } catch (cause) {
    const error = new Error('Studio could not reach its firmware update service. Check the connection and retry, or use the preserving USB update.');
    error.reason = 'grant-service-unreachable';
    error.cause = cause;
    throw error;
  }
  if (isUnexpectedRedirect(response)) {
    const error = new Error('The firmware update service redirected this request. Retry from the official Studio site, or use the preserving USB update.');
    error.reason = 'grant-service-redirect';
    throw error;
  }
  let signed;
  try { signed = await response.json(); } catch { signed = null; }
  if (response.status === 401 || response.status === 403) {
    const error = new Error('The firmware update service rejected this Studio origin. Open led.mandalacodes.com and retry, or use the preserving USB update.');
    error.reason = 'grant-service-forbidden';
    throw error;
  }
  // Local development and card-hosted Studio pages may not have this route.
  if (response.status === 404 && signed?.error?.code === 'not_found') {
    const error = new Error(GRANT_SERVICE_MISSING_GUIDANCE);
    error.reason = 'grant-service-missing';
    throw error;
  }
  if (response.status === 503) {
    const error = new Error('The firmware update service is unavailable right now. Check again later, or use the preserving USB update.');
    error.reason = 'grant-service-unavailable';
    throw error;
  }
  if (!response.ok) {
    throw new Error(signed?.error?.message || 'Studio could not authorize this firmware update.');
  }
  if (signed?.grantPayload !== grantPayload
    || signed?.algorithm !== 'ECDSA_P256_SHA256_P1363'
    || !SIGNATURE.test(signed?.signature || '')) {
    throw new Error('Studio returned an invalid software update authorization.');
  }
  return Object.freeze({
    grantPayload,
    grantSignature: signed.signature,
    grantAlgorithm: signed.algorithm,
  });
}

export const GRANT_SERVICE_MISSING_GUIDANCE = 'This Studio has no firmware update service. Open led.mandalacodes.com and reconnect this exact card, or use the preserving USB update.';

// This public route must answer directly. A redirect is a service problem,
// never a reason to send the owner through account sign-in.
function isUnexpectedRedirect(response) {
  const status = Number(response?.status || 0);
  return response?.type === 'opaqueredirect' || (status >= 300 && status < 400);
}

function requestChallenge(authority, { origin, releaseBuildId, ticketSha256 }) {
  return authority.request('/api/update/challenge', {
    method: 'POST',
    body: {
      cardId: authority.cardId,
      bootId: authority.bootId,
      ownerSessionId: authority.ownerSessionId,
      operationGeneration: authority.operationGeneration,
      expectedProjectHead: authority.projectHead || '',
      studioOrigin: origin,
      releaseBuildId,
      ticketSha256,
    },
  });
}

// Check public signer readiness without spending the card's exact challenge.
// A generic successful response or an account session does not prove that the
// signing key is usable; only this route's explicit readiness shape does.
export async function probeFirmwareUpdateGrantService({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') return { state: 'unavailable', reason: 'no-fetch' };
  try {
    const response = await fetchImpl('/api/firmware/update-grant', {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
    if (isUnexpectedRedirect(response)) return { state: 'unavailable', reason: 'redirect' };
    if (response.status === 204) return { state: 'unavailable', reason: 'no-grant-service' };
    if (response.ok) {
      const contentType = typeof response.headers?.get === 'function' ? (response.headers.get('content-type') || '') : '';
      if (!contentType.toLowerCase().includes('application/json')) {
        return { state: 'unavailable', reason: 'no-grant-service' };
      }
      let body;
      try { body = await response.json(); } catch { body = null; }
      if (body?.service === 'firmware-update-grant' && body.ready === true) return { state: 'ready', reason: '' };
      return { state: 'unavailable', reason: 'no-grant-service' };
    }
    return { state: 'unavailable', reason: `http-${response.status || 0}` };
  } catch {
    return { state: 'unavailable', reason: 'unreachable' };
  }
}

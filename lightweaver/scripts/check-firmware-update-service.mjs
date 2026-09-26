import { webcrypto } from 'node:crypto';
import { PINNED_UPDATE_GRANT_PUBLIC_KEY_SPKI } from '../functions/api/library/_shared/firmwareUpdateGrant.js';

// Exercises the public service without cookies, an account, or any card request.
// A synthetic challenge cannot authorize an update on a real card.
export async function verifyPublicFirmwareUpdateService(fetchImpl, {
  origin,
  releaseBuildId = '0'.repeat(40),
  ticketSha256 = '0'.repeat(64),
  publicKeySpki = Buffer.from(PINNED_UPDATE_GRANT_PUBLIC_KEY_SPKI, 'base64'),
} = {}) {
  const url = new URL('/api/firmware/update-grant', origin).href;
  const request = async (init = {}) => {
    const response = await fetchImpl(url, {
      cache: 'no-store', redirect: 'manual', credentials: 'omit',
      signal: AbortSignal.timeout(20_000), ...init,
    });
    if (response.status !== 200 || !/(?:^|,)\s*no-store(?:\s*(?:,|$))/i.test(response.headers.get('cache-control') || '')) {
      throw new Error(`Public firmware update service must work without login and return HTTP 200/no-store; received HTTP ${response.status}.`);
    }
    return response.json();
  };
  const readiness = await request();
  if (readiness?.service !== 'firmware-update-grant' || readiness.ready !== true) {
    throw new Error('Public firmware update service did not report signing readiness.');
  }
  const grantPayload = JSON.stringify({
    schemaVersion: 1, scope: 'firmware-update', cardId: 'lw-000000000000',
    bootId: 'production-smoke',
    challenge: Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
    studioOrigin: origin, cardHost: '192.0.2.1', networkIdentity: 'synthetic-production-smoke',
    ownerSessionId: 'synthetic-no-account', operationGeneration: 1,
    expectedProjectHead: '', releaseBuildId, ticketSha256,
  });
  const signed = await request({
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ grantPayload }),
  });
  if (signed?.grantPayload !== grantPayload || signed.algorithm !== 'ECDSA_P256_SHA256_P1363'
    || !/^[A-Za-z0-9_-]{86}$/.test(signed.signature || '')) {
    throw new Error('Public firmware update service returned an invalid grant response.');
  }
  const key = await webcrypto.subtle.importKey('spki', publicKeySpki,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
    Buffer.from(signed.signature, 'base64url'), new TextEncoder().encode(grantPayload))) {
    throw new Error('Public firmware update grant does not match the key pinned by the card.');
  }
  return { url, anonymous: true, signatureVerified: true };
}

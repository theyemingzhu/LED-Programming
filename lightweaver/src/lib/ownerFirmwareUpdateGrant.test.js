import assert from 'node:assert/strict';
import test from 'node:test';

import { probeFirmwareUpdateGrantService, requestSoftwareFirmwareUpdateGrant } from './ownerFirmwareUpdateGrant.js';

const BUILD = 'b'.repeat(40);
const TICKET = 'c'.repeat(64);
const SIGNATURE = 'A'.repeat(86);

function headersWithContentType(contentType) {
  return { get: name => (String(name).toLowerCase() === 'content-type' ? contentType : null) };
}

function exactAuthority(calls) {
  return {
    cardId: 'lw-b0fe81f61b44', bootId: 'boot-1', ownerSessionId: 'owner-1',
    operationGeneration: 8, projectHead: 'a'.repeat(64), revoked: false,
    async request(path, init) {
      calls.push({ path, init });
      return { grantPayload: '{"exact":"card-bytes"}' };
    },
  };
}

test('requests exact card challenge then a public signed grant without cookies', async () => {
  const calls = [];
  const fetchCalls = [];
  const result = await requestSoftwareFirmwareUpdateGrant({
    authority: exactAuthority(calls),
    release: { manifest: { buildId: BUILD }, ticketSha256: TICKET },
    origin: 'https://led.mandalacodes.com',
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true, async json() { return {
        grantPayload: '{"exact":"card-bytes"}', signature: SIGNATURE,
        algorithm: 'ECDSA_P256_SHA256_P1363',
      }; } };
    },
  });

  assert.equal(calls[0].path, '/api/update/challenge');
  assert.deepEqual(calls[0].init.body, {
    cardId: 'lw-b0fe81f61b44', bootId: 'boot-1', ownerSessionId: 'owner-1',
    operationGeneration: 8, expectedProjectHead: 'a'.repeat(64),
    studioOrigin: 'https://led.mandalacodes.com', releaseBuildId: BUILD, ticketSha256: TICKET,
  });
  assert.equal(fetchCalls[0].url, '/api/firmware/update-grant');
  assert.equal(fetchCalls[0].init.credentials, 'omit');
  assert.equal(fetchCalls[0].init.cache, 'no-store');
  assert.deepEqual(result, {
    grantPayload: '{"exact":"card-bytes"}', grantSignature: SIGNATURE,
    grantAlgorithm: 'ECDSA_P256_SHA256_P1363',
  });
});

test('rejects changed payload, malformed signature, and an unavailable signer', async () => {
  const common = {
    authority: exactAuthority([]), release: { manifest: { buildId: BUILD }, ticketSha256: TICKET },
    origin: 'https://led.mandalacodes.com',
  };
  await assert.rejects(requestSoftwareFirmwareUpdateGrant({ ...common, fetchImpl: async () => ({
    ok: true, async json() { return { grantPayload: 'changed', signature: SIGNATURE, algorithm: 'ECDSA_P256_SHA256_P1363' }; },
  }) }), /invalid software update authorization/i);
  await assert.rejects(requestSoftwareFirmwareUpdateGrant({ ...common, fetchImpl: async () => ({
    ok: true, async json() { return { grantPayload: '{"exact":"card-bytes"}', signature: 'bad', algorithm: 'ECDSA_P256_SHA256_P1363' }; },
  }) }), /invalid software update authorization/i);
  await assert.rejects(requestSoftwareFirmwareUpdateGrant({ ...common, fetchImpl: async () => ({
    ok: false, status: 503, async json() { return { error: { code: 'signer_unavailable' } }; },
  }) }), error => error.reason === 'grant-service-unavailable' && /preserving USB/i.test(error.message));
});

test('a redirect, forbidden origin, or network failure never sends the owner to sign-in', async () => {
  const common = {
    authority: exactAuthority([]), release: { manifest: { buildId: BUILD }, ticketSha256: TICKET },
    origin: 'https://led.mandalacodes.com',
  };
  // The public route must answer directly; any redirect is a service problem.
  await assert.rejects(
    requestSoftwareFirmwareUpdateGrant({ ...common, fetchImpl: async () => ({ type: 'opaqueredirect', status: 0 }) }),
    error => error.reason === 'grant-service-redirect' && !/sign.in|account/i.test(error.message),
  );
  await assert.rejects(
    requestSoftwareFirmwareUpdateGrant({ ...common, fetchImpl: async () => ({ status: 302, async json() { return null; } }) }),
    error => error.reason === 'grant-service-redirect',
  );
  // A forbidden Studio origin is actionable without offering account login.
  await assert.rejects(
    requestSoftwareFirmwareUpdateGrant({ ...common, fetchImpl: async () => ({
      ok: false, status: 403, async json() { return { error: { code: 'invalid_origin' } }; },
    }) }),
    error => error.reason === 'grant-service-forbidden' && !/sign.in|account/i.test(error.message),
  );
  // The raw TypeError never reaches the owner.
  await assert.rejects(
    requestSoftwareFirmwareUpdateGrant({ ...common, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    error => error.reason === 'grant-service-unreachable' && !/^Failed to fetch$/.test(error.message),
  );
  // A card challenge that dies at the network layer is named as the card leg.
  await assert.rejects(
    requestSoftwareFirmwareUpdateGrant({
      ...common,
      authority: {
        ...exactAuthority([]),
        async request() { throw new TypeError('Failed to fetch'); },
      },
      fetchImpl: async () => ({ ok: true, async json() { return {}; } }),
    }),
    /could not reach this card/i,
  );
});

test('a 404 grant response names the public Studio and preserving USB paths', async () => {
  const common = {
    authority: exactAuthority([]), release: { manifest: { buildId: BUILD }, ticketSha256: TICKET },
    origin: 'https://led.mandalacodes.com',
  };
  // This is the exact dev-server and card-hosted-Studio shape: neither has
  // this route mounted at all, so the API answers a generic 404 not_found —
  // never "the update failed", and never the bare "API route not found."
  // body text an owner cannot act on.
  await assert.rejects(
    requestSoftwareFirmwareUpdateGrant({
      ...common,
      fetchImpl: async () => ({
        ok: false, status: 404,
        async json() { return { error: { code: 'not_found', message: 'API route not found.' } }; },
      }),
    }),
    error => error.reason === 'grant-service-missing'
      && /led.mandalacodes.com.*preserving USB/i.test(error.message)
      && !/card button|press BOOT|press RESET/i.test(error.message)
      && !/^API route not found\.$/.test(error.message),
  );
});

test('probeFirmwareUpdateGrantService treats redirects and HTTP failures as service failures', async () => {
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => ({ type: 'opaqueredirect', status: 0 }) }),
    { state: 'unavailable', reason: 'redirect' },
  );
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => ({ status: 401 }) }),
    { state: 'unavailable', reason: 'http-401' },
  );
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    { state: 'unavailable', reason: 'unreachable' },
  );
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => ({ status: 503 }) }),
    { state: 'unavailable', reason: 'http-503' },
  );
});

test('probeFirmwareUpdateGrantService must not claim ready without public signer proof', async () => {
  // A generic successful response does not prove the signer is ready.
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => ({ status: 204 }) }),
    { state: 'unavailable', reason: 'no-grant-service' },
  );
  // A card-hosted Studio may fall back to HTML for unknown GET routes.
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => ({
      ok: true, status: 200, headers: headersWithContentType('text/html; charset=utf-8'),
      async json() { throw new Error('not JSON'); },
    }) }),
    { state: 'unavailable', reason: 'no-grant-service' },
  );
  // Arbitrary JSON cannot claim signing readiness.
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => ({
      ok: true, status: 200, headers: headersWithContentType('application/json; charset=utf-8'),
      async json() { return { ok: true }; },
    }) }),
    { state: 'unavailable', reason: 'no-grant-service' },
  );
});

test('probeFirmwareUpdateGrantService reports ready only for the public signer readiness shape', async () => {
  const fetchCalls = [];
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true, status: 200, headers: headersWithContentType('application/json; charset=utf-8'),
        async json() { return { service: 'firmware-update-grant', ready: true }; } };
    } }),
    { state: 'ready', reason: '' },
  );
  assert.equal(fetchCalls[0].url, '/api/firmware/update-grant');
  assert.equal(fetchCalls[0].init.credentials, 'omit');
  // An account session must not be mistaken for public signer readiness.
  assert.deepEqual(
    await probeFirmwareUpdateGrantService({ fetchImpl: async () => ({
      ok: true, status: 200, headers: headersWithContentType('application/json; charset=utf-8'),
      async json() { return { session: { username: 'adrian', role: 'owner' } }; },
    }) }),
    { state: 'unavailable', reason: 'no-grant-service' },
  );
});

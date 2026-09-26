import assert from 'node:assert/strict';
import test from 'node:test';
import { handleFirmwareUpdateGrantPagesRequest, onRequest } from './update-grant.js';

const origin = 'https://led.mandalacodes.com';
const grantPayload = JSON.stringify({
  schemaVersion: 1, scope: 'firmware-update', cardId: 'lw-b0fe81f61b44',
  bootId: 'boot-1', challenge: 'a'.repeat(43), studioOrigin: origin,
  cardHost: '192.168.18.70', networkIdentity: 'Lightweaver workshop',
  ownerSessionId: 'local-operation-1', operationGeneration: 1,
  expectedProjectHead: '', releaseBuildId: 'b'.repeat(40), ticketSha256: 'c'.repeat(64),
});

async function keyFixture() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateBytes = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    env: { LIGHTWEAVER_UPDATE_GRANT_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateBytes).toString('base64')}\n-----END PRIVATE KEY-----` },
    options: { verificationPublicKeySpki: await crypto.subtle.exportKey('spki', pair.publicKey) },
    publicKey: pair.publicKey,
  };
}

async function call({ method = 'GET', body, rawBody, requestOrigin = method === 'POST' ? origin : null,
  contentType = 'application/json', contentLength, fixture = {}, entrypoint = false } = {}) {
  const headers = new Headers();
  if (requestOrigin !== null) headers.set('origin', requestOrigin);
  if (contentType !== null) headers.set('content-type', contentType);
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));
  const requestBody = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
  const request = new Request(`${origin}/api/firmware/update-grant`, {
    method, headers, body: requestBody,
    ...(requestBody instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
  assert.equal(request.headers.has('cookie'), false);
  assert.equal(request.headers.has('authorization'), false);
  const context = { request, env: fixture.env || {}, params: {} };
  const response = entrypoint ? await onRequest(context)
    : await handleFirmwareUpdateGrantPagesRequest(context, fixture.options);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  return { status: response.status, payload: await response.json() };
}

test('public readiness verifies a working matching signing key without an account or cookie', async () => {
  assert.deepEqual(await call({ fixture: await keyFixture() }), {
    status: 200, payload: { service: 'firmware-update-grant', ready: true },
  });
});

test('public POST signs the exact card-bound payload without an account or cookie', async () => {
  const fixture = await keyFixture();
  const { status, payload } = await call({ method: 'POST', body: { grantPayload }, fixture });
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(payload).sort(), ['algorithm', 'grantPayload', 'signature']);
  assert.equal(payload.grantPayload, grantPayload);
  assert.equal(payload.algorithm, 'ECDSA_P256_SHA256_P1363');
  const signature = Buffer.from(payload.signature, 'base64url');
  assert.equal(signature.byteLength, 64);
  for (const [bytes, expected] of [[grantPayload, true], [grantPayload.replace('boot-1', 'boot-2'), false]]) {
    assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, fixture.publicKey,
      signature, new TextEncoder().encode(bytes)), expected);
  }
});

test('readiness and signing fail unavailable for missing, malformed, or mismatched keys', async () => {
  const signing = await keyFixture();
  const other = await keyFixture();
  for (const fixture of [{}, { env: { LIGHTWEAVER_UPDATE_GRANT_PRIVATE_KEY: 'bad-key' } },
    { env: signing.env, options: other.options }]) {
    for (const method of ['GET', 'POST']) {
      const result = await call({ method, fixture, body: method === 'POST' ? { grantPayload } : undefined });
      assert.equal(result.status, 503);
      assert.equal(result.payload.error.code, 'update_grant_unavailable');
      assert.doesNotMatch(JSON.stringify(result.payload), /private|bad-key|BEGIN|login|sign.in|owner/i);
    }
  }
});

test('real Pages entrypoint uses its environment key and production pin, not injected context authority', async () => {
  const fixture = await keyFixture();
  for (const method of ['GET', 'POST']) {
    const result = await call({ method, fixture, entrypoint: true, body: method === 'POST' ? { grantPayload } : undefined });
    assert.equal(result.status, 503);
    assert.equal(result.payload.error.code, 'update_grant_unavailable');
  }
});

test('wrong or missing POST origin is an origin error, never an owner-login challenge', async () => {
  for (const requestOrigin of [null, 'null', 'https://other.example']) {
    const result = await call({ method: 'POST', requestOrigin, body: { grantPayload } });
    assert.equal(result.status, 403);
    assert.equal(result.payload.error.code, 'invalid_origin');
    assert.match(result.payload.error.message, /origin/i);
    assert.doesNotMatch(result.payload.error.message, /owner|login|sign.in/i);
  }
  assert.equal((await call({ requestOrigin: 'https://other.example' })).status, 403);
});

test('public route rejects malformed or ambiguous envelopes and payload bindings before signing', async () => {
  const value = JSON.parse(grantPayload);
  const bodies = [null, [], {}, { grantPayload, extra: true }, { grantPayload: {} },
    { grantPayload: ` ${grantPayload}` }, { grantPayload: JSON.stringify({ ...value, studioOrigin: 'https://other.example' }) },
    { grantPayload: JSON.stringify({ ...value, cardId: 'other-card' }) },
    { grantPayload: JSON.stringify({ ...value, ticketSha256: '' }) },
    { grantPayload: grantPayload.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1') },
  ];
  for (const body of bodies) {
    const result = await call({ method: 'POST', body });
    assert.equal(result.status, 400);
    assert.equal(result.payload.error.code, 'invalid_request');
  }
  assert.equal((await call({ method: 'POST', rawBody: '{' })).status, 400);
  assert.equal((await call({ method: 'POST', body: { grantPayload }, contentType: 'text/plain' })).status, 415);
});

test('public route bounds declared and streamed bodies and rejects unsupported methods', async () => {
  assert.equal((await call({ method: 'POST', body: { grantPayload }, contentLength: 4097 })).status, 413);
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(2049)); },
    cancel() { cancelled = true; },
  });
  assert.equal((await call({ method: 'POST', rawBody: stream })).status, 413);
  assert.equal(cancelled, true);
  assert.equal((await call({ method: 'DELETE' })).status, 405);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { verifyPublicFirmwareUpdateService } from './check-firmware-update-service.mjs';

const origin = 'https://led.mandalacodes.com';
const json = value => new Response(JSON.stringify(value), { headers: { 'cache-control': 'no-store' } });
const ready = () => json({ service: 'firmware-update-grant', ready: true });

test('live proof signs and verifies a synthetic challenge without credentials or card traffic', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert.equal(url, `${origin}/api/firmware/update-grant`);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert.equal(new Headers(init.headers).has('cookie'), false);
    if (init.method !== 'POST') return ready();
    assert.equal(init.headers.origin, origin);
    const { grantPayload } = JSON.parse(init.body);
    const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey,
      new TextEncoder().encode(grantPayload));
    return json({ grantPayload, signature: Buffer.from(signature).toString('base64url'), algorithm: 'ECDSA_P256_SHA256_P1363' });
  };
  const publicKeySpki = await webcrypto.subtle.exportKey('spki', pair.publicKey);
  assert.deepEqual(await verifyPublicFirmwareUpdateService(fetchImpl, { origin, publicKeySpki }),
    { url: `${origin}/api/firmware/update-grant`, anonymous: true, signatureVerified: true });
  assert.equal(calls.length, 2);
});

test('live proof rejects login walls, unavailable signing and false readiness', async () => {
  for (const response of [new Response(null, { status: 302 }), new Response(null, { status: 401 }),
    new Response(null, { status: 503 }), json({ service: 'firmware-update-grant', ready: false }),
    json({ session: { role: 'owner' } }), new Response('{}')]) {
    await assert.rejects(verifyPublicFirmwareUpdateService(async () => response, { origin }));
  }
});

test('live proof rejects changed bytes and signatures not accepted by the card pin', async () => {
  for (const changed of [false, true]) {
    const fetchImpl = async (_url, init) => {
      if (init.method !== 'POST') return ready();
      const { grantPayload } = JSON.parse(init.body);
      return json({ grantPayload: changed ? '{}' : grantPayload, signature: 'A'.repeat(86), algorithm: 'ECDSA_P256_SHA256_P1363' });
    };
    await assert.rejects(verifyPublicFirmwareUpdateService(fetchImpl, { origin }), /invalid grant|pinned by the card/);
  }
});

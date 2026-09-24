import test from 'node:test';
import assert from 'node:assert/strict';
import { openUsbWifiSession, usbWifiErrorMessage } from './usbWifiProvisioning.js';
const expected = { cardId: 'lw-123456789abc', firmwareVersion: '1.2.3', buildId: 'a'.repeat(40), buildNumber: 123 };
function fakePort(reply) {
  const writes = [];
  let controller;
  return { writes, async open() {
    this.readable = new ReadableStream({ start(c) { controller = c; } });
    this.writable = new WritableStream({ write(bytes) {
      const request = JSON.parse(new TextDecoder().decode(bytes)); writes.push(request);
      const response = reply(request);
      if (response) controller.enqueue(new TextEncoder().encode(JSON.stringify(response) + '\n'));
    } });
  }, async close() {} };
}
function response(request, extra = {}) { return { ...expected, bootId: 'boot-new', protocol: 'lightweaver-usb-wifi', version: 1, id: request.id, command: request.command, ok: true, usbWifiProvisioning: true, wifi: {}, ...extra }; }
test('verifies exact runtime before sending credentials and pins each request', async () => {
  const port = fakePort(r => response(r, r.command === 'provision' ? { attemptId: r.id, wifi: { handoffGeneration: 2 } } : {}));
  const session = await openUsbWifiSession({ port, expected });
  await session.provision({ ssid: 'Home', password: 'secret123' });
  assert.equal(port.writes[0].command, 'hello');
  assert.equal(port.writes[1].expectedBootId, 'boot-new');
  assert.equal(port.writes[1].expectedBuildNumber, 123);
  assert.equal(port.writes[1].password, 'secret123');
  await session.close();
});
test('verified hello exposes fresh-install Wi-Fi eligibility without trusting later replies', async () => {
  const port = fakePort(r => response(r, { freshInstallEligible: r.command === 'hello' }));
  const session = await openUsbWifiSession({ port, expected });
  assert.equal(session.identity.freshInstallEligible, true);
  await session.scan();
  assert.equal(session.identity.freshInstallEligible, true);
  await session.close();

  const unavailable = await openUsbWifiSession({ port: fakePort(r => response(r)), expected });
  assert.equal(unavailable.identity.freshInstallEligible, false);
  await unavailable.close();
});
for (const [field, value] of [['cardId', 'lw-wrong'], ['buildId', 'b'.repeat(40)], ['buildNumber', 124], ['firmwareVersion', '1.2.4']]) {
  test(`rejects wrong ${field} before secrets leave Studio`, async () => {
    const port = fakePort(r => response(r, { [field]: value }));
    await assert.rejects(openUsbWifiSession({ port, expected }), { code: 'identity_mismatch' });
    assert.equal(port.writes.length, 1);
  });
}
test('rejects stale boot and stale attempt success', async () => {
  const stale = fakePort(r => response(r));
  await assert.rejects(openUsbWifiSession({ port: stale, expected: { ...expected, previousBootId: 'boot-new' } }), { code: 'stale_boot' });
  const port = fakePort(r => response(r, r.command === 'provision' ? { attemptId: r.id, wifi: { handoffGeneration: 2 } } : { attemptId: 'old-attempt', wifi: { stationIp: '192.168.1.20', handoffGeneration: 1 } }));
  const session = await openUsbWifiSession({ port, expected });
  await session.provision({ ssid: 'Home', password: 'secret123' });
  await assert.rejects(session.status(), { code: 'attempt_mismatch' });
  await session.close();
});
test('join failure reason is conservative and session remains available for retry', async () => {
  let attemptId;
  const port = fakePort(r => {
    if (r.command === 'provision') attemptId = r.id;
    return response(r, { attemptId, wifi: { handoffGeneration: 2, joinFailed: true, failureReason: 'handshake_timeout' } });
  });
  const session = await openUsbWifiSession({ port, expected });
  const result = await session.join({ ssid: 'Home', password: 'secret123' });
  assert.equal(result.state, 'failed');
  assert.doesNotMatch(result.message, /wrong password/i);
  assert.match(usbWifiErrorMessage('ssid_not_found'), /not find/);
  assert.match(usbWifiErrorMessage('authentication_failed'), /authentication/i);
  await session.provision({ ssid: 'Home', password: 'correct123' });
  assert.equal(port.writes.filter(r => r.command === 'provision').length, 2);
  await session.close();
});
test('stalled USB writer is bounded and never sends credentials', async () => {
  let canceled = false;
  const port = { async open() {
    this.readable = new ReadableStream({ cancel() { canceled = true; } });
    this.writable = new WritableStream({ write() { return new Promise(() => {}); } });
  }, async close() {} };
  const started = Date.now();
  await assert.rejects(openUsbWifiSession({ port, expected, requestTimeoutMs: 15 }), { code: 'timeout' });
  assert.ok(Date.now() - started < 1000);
  assert.equal(canceled, true);
});
test('retries only hello while the exact card application is still booting', async () => {
  let hellos = 0;
  const port = fakePort(request => {
    hellos += 1;
    return hellos === 1 ? null : response(request);
  });
  const session = await openUsbWifiSession({ port, expected, openTimeoutMs: 100, requestTimeoutMs: 20, helloReadyTimeoutMs: 100 });
  assert.equal(session.identity.cardId, expected.cardId);
  assert.deepEqual(port.writes.map(request => request.command), ['hello', 'hello']);
  await session.close();
});
test('a non-answering card stays unverified after bounded hello retries', async () => {
  const port = fakePort(() => null);
  const started = Date.now();
  await assert.rejects(openUsbWifiSession({ port, expected, openTimeoutMs: 75, requestTimeoutMs: 20,
    helloReadyTimeoutMs: 75 }), { code: 'timeout' });
  assert.ok(Date.now() - started < 500);
  assert.ok(port.writes.length >= 2 && port.writes.length <= 5);
  assert.ok(port.writes.every(request => request.command === 'hello'));
});
test('a wrong hello identity fails immediately even while boot retries are allowed', async () => {
  const port = fakePort(request => response(request, { cardId: 'lw-wrong' }));
  await assert.rejects(openUsbWifiSession({ port, expected, openTimeoutMs: 100, requestTimeoutMs: 20,
    helloReadyTimeoutMs: 100 }), { code: 'identity_mismatch' });
  assert.deepEqual(port.writes.map(request => request.command), ['hello']);
});
test('rejects passwords that the card cannot save without truncation', async () => {
  const port = fakePort(r => response(r));
  const session = await openUsbWifiSession({ port, expected });
  await assert.rejects(session.provision({ ssid: 'Home', password: 'a'.repeat(64) }), { code: 'invalid_credentials' });
  assert.equal(port.writes.length, 1);
  await session.close();
});
test('recovers a lost provision reply after USB reconnect without sending credentials again', async () => {
  let attemptId = '';
  let savedIntent = null;
  let opens = 0;
  const port = fakePort(r => {
    if (r.command === 'provision') { attemptId = r.id; return null; }
    return response(r, {
      freshInstallEligible: !attemptId,
      attemptId,
      wifi: { handoffGeneration: attemptId ? 2 : 1, transition: attemptId ? 'station' : 'setup-ap', stationIp: attemptId ? '192.168.18.70' : '' },
    });
  });
  const originalOpen = port.open.bind(port);
  port.open = async (...args) => { opens += 1; await originalOpen(...args); };
  const first = await openUsbWifiSession({ port, expected, requestTimeoutMs: 15 });
  await assert.rejects(first.join({ ssid: 'Gallery', password: 'secret123' }, {
    onAttempt: intent => { savedIntent = { ...intent, generation: null }; },
  }), { code: 'timeout' });
  assert.equal(opens, 1);
  const resumed = await openUsbWifiSession({ port, expected });
  await assert.rejects(resumed.resumeAttempt({ ...savedIntent, bootId: 'another-boot' }, { timeoutMs: 0 }), { code: 'attempt_mismatch' });
  assert.equal(port.writes.filter(r => r.command === 'status').length, 0);
  const joined = await resumed.resumeAttempt(savedIntent, { timeoutMs: 0 });
  assert.deepEqual(joined, { state: 'station', stationIp: '192.168.18.70', identity: resumed.identity });
  assert.equal(port.writes.filter(r => r.command === 'provision').length, 1);
  await resumed.close();
});
for (const stationIp of ['127.0.0.2', '192.168.001.20', '8.8.8.8', '192.168.4.1']) {
  test(`does not accept ${stationIp} as joined station evidence`, async () => {
    const port = fakePort(r => response(r, { attemptId: r.id, wifi: { stationIp, handoffGeneration: 1 } }));
    const session = await openUsbWifiSession({ port, expected });
    assert.equal((await session.join({ ssid: 'Home', password: 'secret123' }, { timeoutMs: 0 })).state, 'pending');
    await session.close();
  });
}

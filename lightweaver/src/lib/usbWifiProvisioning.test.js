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
test('rejects passwords that the card cannot save without truncation', async () => {
  const port = fakePort(r => response(r));
  const session = await openUsbWifiSession({ port, expected });
  await assert.rejects(session.provision({ ssid: 'Home', password: 'a'.repeat(64) }), { code: 'invalid_credentials' });
  assert.equal(port.writes.length, 1);
  await session.close();
});
for (const stationIp of ['127.0.0.2', '192.168.001.20', '8.8.8.8', '192.168.4.1']) {
  test(`does not accept ${stationIp} as joined station evidence`, async () => {
    const port = fakePort(r => response(r, { attemptId: r.id, wifi: { stationIp, handoffGeneration: 1 } }));
    const session = await openUsbWifiSession({ port, expected });
    assert.equal((await session.join({ ssid: 'Home', password: 'secret123' }, { timeoutMs: 0 })).state, 'pending');
    await session.close();
  });
}

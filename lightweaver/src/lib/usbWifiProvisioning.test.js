import test from 'node:test';
import assert from 'node:assert/strict';
import { openUsbWifiSession, usbWifiErrorMessage } from './usbWifiProvisioning.js';
const expected = { cardId: 'lw-123456789abc', firmwareVersion: '1.2.3', buildId: 'a'.repeat(40), buildNumber: 123 };
function fakePort(reply) {
  const writes = [];
  const decoder = new TextDecoder();
  let controller;
  let input = '';
  return { writes, async open() {
    this.readable = new ReadableStream({ start(c) { controller = c; } });
    this.writable = new WritableStream({ write(bytes) {
      input += decoder.decode(bytes, { stream: true });
      let end;
      while ((end = input.indexOf('\n')) >= 0) {
        const request = JSON.parse(input.slice(0, end));
        input = input.slice(end + 1);
        writes.push(request);
        const result = reply(request);
        if (result) controller.enqueue(new TextEncoder().encode(JSON.stringify(result) + '\n'));
      }
    } });
  }, async close() {} };
}
function response(request, extra = {}) { return { ...expected, bootId: 'boot-new', protocol: 'lightweaver-usb-wifi', version: 1, id: request.id, command: request.command, ok: true, usbWifiProvisioning: true, wifi: {}, ...extra }; }
function boundedNativeUsbPort() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const port = { chunks: [], droppedBytes: 0, requests: [] };
  let controller;
  let queued = '';
  let line = '';
  let scheduled = false;
  const drain = () => {
    scheduled = false;
    line += queued;
    queued = '';
    let end;
    while ((end = line.indexOf('\n')) >= 0) {
      const frame = line.slice(0, end);
      line = line.slice(end + 1);
      let request;
      try { request = JSON.parse(frame); } catch { continue; }
      port.requests.push(request);
      const extra = request.command === 'hello' ? { freshInstallEligible: true }
        : request.command === 'scan' ? { scanning: false, networks: [{ ssid: 'Gallery', secure: true, rssi: -40 }] }
          : { accepted: request.command === 'provision', attemptId: port.attemptId || request.id, wifi: { handoffGeneration: 2 } };
      if (request.command === 'provision') port.attemptId = request.id;
      controller.enqueue(encoder.encode(JSON.stringify(response(request, extra)) + '\n'));
    }
  };
  port.open = async () => {
    port.readable = new ReadableStream({ start(c) { controller = c; } });
    port.writable = new WritableStream({ write(bytes) {
      port.chunks.push(bytes.length);
      const room = Math.max(0, 256 - queued.length);
      queued += decoder.decode(bytes.subarray(0, room), { stream: true });
      port.droppedBytes += Math.max(0, bytes.length - room);
      if (!scheduled) { scheduled = true; setTimeout(drain, 10); }
    } });
  };
  port.close = async () => {};
  return port;
}
test('authenticated USB commands survive a 256-byte native receive queue drained once per 10 ms loop', async () => {
  const port = boundedNativeUsbPort();
  const session = await openUsbWifiSession({ port, expected, requestTimeoutMs: 500 });
  const scan = await session.scan({ refresh: true });
  assert.deepEqual(scan.networks.map(network => network.ssid), ['Gallery']);
  const provision = await session.provision({ ssid: 'Gallery', password: 'secret123' });
  assert.equal(provision.accepted, true);
  await session.status();
  assert.deepEqual(port.requests.map(request => request.command), ['hello', 'scan', 'provision', 'status']);
  assert.equal(port.droppedBytes, 0);
  assert.ok(port.chunks.every(length => length <= 64));
  await session.close();
});
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
test('a timed-out credential request sends no remaining chunks or automatic retry', async () => {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let controller;
  let hello = '';
  let helloDone = false;
  const afterHello = [];
  const port = { async open() {
    this.readable = new ReadableStream({ start(c) { controller = c; } });
    this.writable = new WritableStream({ write(bytes) {
      const copy = Uint8Array.from(bytes);
      if (!helloDone) {
        hello += decoder.decode(copy);
        if (hello.includes('\n')) {
          const request = JSON.parse(hello);
          helloDone = true;
          controller.enqueue(encoder.encode(JSON.stringify(response(request)) + '\n'));
        }
        return;
      }
      afterHello.push(copy);
      if (afterHello.length === 1) return new Promise(resolve => setTimeout(resolve, 100));
    } });
  }, async close() {} };
  const session = await openUsbWifiSession({ port, expected, requestTimeoutMs: 50 });
  await assert.rejects(session.provision({ ssid: 'Gallery', password: 'secret123' }), { code: 'timeout' });
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(afterHello.length, 1);
  assert.doesNotMatch(decoder.decode(afterHello[0]), /secret123/);
});
test('retries only hello while the exact card application is still booting', async () => {
  let hellos = 0;
  const port = fakePort(request => {
    hellos += 1;
    return hellos === 1 ? null : response(request);
  });
  const session = await openUsbWifiSession({ port, expected, openTimeoutMs: 200, requestTimeoutMs: 50, helloReadyTimeoutMs: 200 });
  assert.equal(session.identity.cardId, expected.cardId);
  assert.deepEqual(port.writes.map(request => request.command), ['hello', 'hello']);
  await session.close();
});
test('a non-answering card stays unverified after bounded hello retries', async () => {
  const port = fakePort(() => null);
  const started = Date.now();
  await assert.rejects(openUsbWifiSession({ port, expected, openTimeoutMs: 180, requestTimeoutMs: 50,
    helloReadyTimeoutMs: 180 }), { code: 'timeout' });
  assert.ok(Date.now() - started < 600);
  assert.ok(port.writes.length >= 2 && port.writes.length <= 5);
  assert.ok(port.writes.every(request => request.command === 'hello'));
});
test('a wrong hello identity fails immediately even while boot retries are allowed', async () => {
  const port = fakePort(request => response(request, { cardId: 'lw-wrong' }));
  await assert.rejects(openUsbWifiSession({ port, expected, openTimeoutMs: 150, requestTimeoutMs: 60,
    helloReadyTimeoutMs: 150 }), { code: 'identity_mismatch' });
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
  const first = await openUsbWifiSession({ port, expected, requestTimeoutMs: 200 });
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

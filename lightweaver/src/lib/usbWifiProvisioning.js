import { normalizeWifiHandoffHost } from './cardWifiHandoff.js';

const PROTOCOL = 'lightweaver-usb-wifi';
const MESSAGES = Object.freeze({
  ssid_not_found: 'The card could not find that Wi-Fi network. Check the network name, range, and 2.4 GHz availability.',
  authentication_failed: 'The access point rejected authentication. Check the Wi-Fi password and network security settings.',
  handshake_timeout: 'The Wi-Fi handshake timed out. Check signal strength, password, and access point settings; the card cannot determine which caused it.',
  connection_failed: 'The card could not complete the connection. It did not report a specific cause.',
  identity_mismatch: 'USB answered from a different card or firmware build. Reconnect the exact installed card before sending Wi-Fi details.',
  stale_boot: 'The card has not reported a new boot after installation. Restart the card and retry USB setup.',
  attempt_mismatch: 'The card returned a different Wi-Fi attempt. Retry setup on this exact card.',
  fresh_install_only: 'This card already has saved configuration. Use its local setup page to change Wi-Fi.',
  invalid_credentials: 'Enter a network name of up to 32 bytes and a valid Wi-Fi password (8–63 characters), or choose an open network.',
  persistence_failed: 'The card could not save its Wi-Fi candidate. Keep USB connected and retry.',
  busy: 'The card is busy. Wait a moment and retry.',
  unsupported: 'This firmware does not support Wi-Fi setup over USB. Use the card setup page.',
  timeout: 'The card did not answer over USB in time. Keep the cable connected and retry, or use the card setup page.',
  disconnected: 'USB disconnected. Reconnect the same card and retry, or use the card setup page.',
});
export function usbWifiErrorMessage(code) { return MESSAGES[code] || 'USB setup could not complete. Keep the cable connected and retry, or use the card setup page.'; }
function failure(code) { return Object.assign(new Error(usbWifiErrorMessage(code)), { code }); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function requestId() { return globalThis.crypto.randomUUID(); }

// No HTTP, browser storage, logging, or event bus participates in this channel.
// Only this explicitly selected, freshly verified USB port receives secrets.
export async function openUsbWifiSession({ port, expected, openTimeoutMs = 12_000, requestTimeoutMs = 3_000 } = {}) {
  if (!port?.open || !expected?.cardId || !expected?.buildId || !expected?.firmwareVersion
    || !Number.isSafeInteger(expected?.buildNumber)) throw failure('identity_mismatch');
  const deadline = Date.now() + openTimeoutMs;
  while (true) {
    try { await port.open({ baudRate: 115200 }); break; }
    catch { if (Date.now() >= deadline) throw failure('disconnected'); await delay(400); }
  }
  let reader, writer, closed = false, pending = null, buffer = '', identity = null, attempt = null;
  const rejectPending = code => { if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.reject(failure(code)); } };
  const close = async () => {
    if (closed) return;
    closed = true;
    rejectPending('disconnected');
    // Do not wait forever for a driver with stalled writes to release USB.
    try { await Promise.race([reader?.cancel(), delay(300)]); } catch { /* detached */ }
    try { void writer?.abort().catch(() => {}); } catch { /* detached */ }
    try { reader?.releaseLock(); } catch { /* detached */ }
    try { writer?.releaseLock(); } catch { /* detached */ }
    try { await Promise.race([port.close(), delay(300)]); } catch { /* detached */ }
  };
  const validate = reply => {
    if (reply.cardId !== expected.cardId || reply.firmwareVersion !== expected.firmwareVersion
      || reply.buildId !== expected.buildId || reply.buildNumber !== expected.buildNumber
      || typeof reply.bootId !== 'string' || !reply.bootId || reply.bootId.length > 96
      || (identity && reply.bootId !== identity.bootId)) throw failure('identity_mismatch');
    if (expected.previousBootId && reply.bootId === expected.previousBootId) throw failure('stale_boot');
    if (reply.usbWifiProvisioning !== true) throw failure('unsupported');
    if (!reply.ok) throw failure(Object.hasOwn(MESSAGES, reply.error) ? reply.error : 'unsupported');
    return reply;
  };
  try {
    reader = port.readable.getReader();
    writer = port.writable.getWriter();
    const decoder = new TextDecoder();
    void (async () => {
      try {
        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 32_768) { buffer = ''; rejectPending('disconnected'); continue; }
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            let reply;
            try { reply = JSON.parse(line); } catch { continue; }
            if (!reply || typeof reply !== 'object' || !pending || reply.protocol !== PROTOCOL || reply.version !== 1
              || reply.id !== pending.id || reply.command !== pending.command) continue;
            const p = pending; pending = null; clearTimeout(p.timer); p.resolve(reply);
          }
        }
      } catch { /* Do not expose arbitrary serial data or exceptions. */ }
      rejectPending('disconnected');
    })();
  } catch { await close(); throw failure('disconnected'); }
  const request = async (command, payload = {}, { beforeSend } = {}) => {
    if (closed) throw failure('disconnected');
    if (pending) throw failure('busy');
    const id = requestId();
    if (beforeSend) await beforeSend({ id, bootId: identity?.bootId || '' });
    if (closed) throw failure('disconnected');
    if (pending) throw failure('busy');
    const message = { protocol: PROTOCOL, version: 1, id, command, ...(identity ? {
      expectedCardId: identity.cardId, expectedBootId: identity.bootId,
      expectedFirmwareVersion: identity.firmwareVersion, expectedBuildId: identity.buildId,
      expectedBuildNumber: identity.buildNumber,
    } : {}), ...payload };
    const response = new Promise((resolve, reject) => {
      pending = { id, command, resolve, reject, timer: setTimeout(() => rejectPending('timeout'), requestTimeoutMs) };
    });
    // Always attach the response rejection before awaiting writes, so a cable
    // removal during a write cannot leak an unhandled rejection or its input.
    try {
      // A hung writer must not hold the UI beyond the response deadline.
      void writer.write(new TextEncoder().encode(JSON.stringify(message) + '\n')).catch(() => { rejectPending('disconnected'); });
      const reply = await response;
      return { reply: validate(reply), id };
    } catch (error) {
      if (['timeout', 'disconnected', 'identity_mismatch', 'stale_boot'].includes(error?.code)) await close();
      throw error;
    } finally {
      if (Object.hasOwn(message, 'password')) message.password = '';
    }
  };
  try {
    const { reply } = await request('hello');
    identity = Object.freeze({ cardId: reply.cardId, bootId: reply.bootId, firmwareVersion: reply.firmwareVersion, buildId: reply.buildId, buildNumber: reply.buildNumber });
  } catch (error) { await close(); throw error; }
  const correlate = reply => {
    if (!attempt || reply.attemptId !== attempt.id || reply.wifi?.handoffGeneration !== attempt.generation) throw failure('attempt_mismatch');
    return reply;
  };
  const provision = async ({ ssid, password, openNetwork = false }, { onAttempt } = {}) => {
    const size = new TextEncoder().encode(ssid || '').length;
    if (size < 1 || size > 32 || /[\u0000-\u001f\u007f]/.test(ssid)
      || (!openNetwork && !/^[\x20-\x7e]{8,63}$/.test(password || ''))) throw failure('invalid_credentials');
    const { reply, id } = await request('provision', { ssid, password: openNetwork ? '' : password, clearPassword: openNetwork }, { beforeSend: onAttempt });
    if (reply.attemptId !== id || !Number.isSafeInteger(reply.wifi?.handoffGeneration) || reply.wifi.handoffGeneration < 1) throw failure('attempt_mismatch');
    attempt = { id, generation: reply.wifi.handoffGeneration };
    return reply;
  };
  const status = async () => correlate((await request('status')).reply);
  const awaitAttempt = async ({ timeoutMs = 40_000, pollMs = 600, onProgress } = {}, initialReply = null) => {
    let reply = initialReply || await status();
    const end = Date.now() + timeoutMs;
    while (!closed) {
      const ip = normalizeWifiHandoffHost(reply.wifi?.stationIp);
      if (ip && ['handoff-ready', 'station'].includes(reply.wifi?.transition) && !reply.wifi?.joinFailed) return { state: 'station', stationIp: ip, identity };
      if (reply.wifi?.joinFailed === true) return { state: 'failed', message: usbWifiErrorMessage(reply.wifi.failureReason || 'connection_failed') };
      if (Date.now() >= end) return { state: 'pending', message: 'The card has not finished joining. USB remains available; check the current attempt again, or use the card setup page.' };
      onProgress?.();
      await delay(pollMs);
      reply = await status();
    }
    throw failure('disconnected');
  };
  return {
    identity, close, provision, status,
    async resumeAttempt(saved, options = {}) {
      if (!saved || typeof saved.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(saved.id)
        || saved.bootId !== identity.bootId
        || (saved.generation != null && (!Number.isSafeInteger(saved.generation) || saved.generation < 1))) throw failure('attempt_mismatch');
      const reply = (await request('status')).reply;
      if (reply.attemptId !== saved.id || !Number.isSafeInteger(reply.wifi?.handoffGeneration)
        || reply.wifi.handoffGeneration < 1
        || (saved.generation != null && reply.wifi.handoffGeneration !== saved.generation)) throw failure('attempt_mismatch');
      attempt = { id: saved.id, generation: reply.wifi.handoffGeneration };
      return await awaitAttempt(options, reply);
    },
    awaitAttempt,
    async scan({ refresh = false } = {}) {
      const { reply } = await request('scan', { refresh });
      return { scanning: reply.scanning === true, networks: (Array.isArray(reply.networks) ? reply.networks : []).slice(0, 32).filter(n => typeof n.ssid === 'string' && n.ssid.length <= 32).map(n => ({ ssid: n.ssid, secure: n.secure !== false, rssi: Number(n.rssi) || 0 })) };
    },
    async join(credentials, options = {}) {
      const reply = await provision(credentials, { onAttempt: options.onAttempt });
      return await awaitAttempt(options, reply);
    },
  };
}

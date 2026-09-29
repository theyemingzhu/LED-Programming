import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const web = readFileSync(new URL('../src/LightweaverWeb.cpp', import.meta.url), 'utf8');
const source = web.slice(web.indexOf('String studioBridgeScript()'), web.indexOf('return script;', web.indexOf('String studioBridgeScript()')));
let script = '';
for (const token of source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|script \+= bridgeVersion;/g)) {
  if (token[0][0] === '"') script += JSON.parse(token[0]);
  else if (token[0].startsWith('script')) script += '9';
}
const calls = [], replies = [];
const opener = { postMessage: message => replies.push(message) };
let messageHandler;
vm.runInNewContext(script, {
  location: { hash: '#studioBridge=1&studioOrigin=https%3A%2F%2Flight.mandalacodes.com', host: 'lightweaver.local', hostname: 'lightweaver.local' },
  window: { opener, addEventListener: (_, fn) => { messageHandler = fn; } },
  URLSearchParams, URL, console, setTimeout, clearTimeout,
  get: async uri => { calls.push(['GET', uri]); return { ok: true }; },
  post: async (uri, body) => { calls.push(['POST', uri, body]); return { ok: true }; },
});
const send = async (type, payload, source = opener) => messageHandler({ origin: 'https://light.mandalacodes.com', source, data: { app: 'LightweaverStudioBridge', id: 1, type, payload } });
for (const type of ['config', 'clear-project', 'reboot', 'owner-capability', 'frame', 'wiring-activate', 'media-begin']) {
  const count = calls.length;
  await send(type, {});
  assert.equal(calls.length, count, `${type} must never reach card fetch`);
  assert.equal(replies.at(-1).ok, false);
}
for (const payload of [{ patternId: 'installed', syncZones: true }, { blackout: true }, { brightness: 90 }, { speed: 80 }, { playlist: 'play' }]) {
  await send('control', payload);
  assert.deepEqual(calls.at(-1), ['POST', '/api/control', payload]);
}
await send('client-playlist', { method: 'GET' });
assert.deepEqual(calls.at(-1), ['GET', '/api/client-playlist']);
const body = { expectedCardId: 'lw-test', expectedRevision: 'opaque', enabled: true, fadeMs: 1000, entries: [{ patternId: 'installed', dwellSeconds: 30 }] };
await send('client-playlist', { method: 'POST', body });
assert.deepEqual(calls.at(-1), ['POST', '/api/client-playlist', body]);
await send('client-pattern', { method: 'GET', patternId: 'installed' });
assert.deepEqual(calls.at(-1), ['GET', '/api/client-pattern?patternId=installed']);
const patternBody = { expectedCardId: 'lw-test', expectedRevision: 'saved-revision', patternId: 'installed', changes: { brightness: 0.4, speed: 1.2, hueShift: 14 } };
await send('client-pattern', { method: 'POST', body: patternBody });
assert.deepEqual(calls.at(-1), ['POST', '/api/client-pattern', patternBody]);
const count = calls.length;
await send('control', { armNative: true });
assert.equal(calls.length, count);
await send('client-playlist', { method: 'GET' }, { postMessage() {} });
assert.equal(calls.length, count, 'non-opener cannot use client relay');
assert.doesNotMatch(web.slice(web.indexOf('bool corsOriginAllowed(const String& origin)')), /origin == "https:\/\/light\.mandalacodes\.com"/, 'client must not inherit shared websocket/editor origin authority');
assert.match(web, /server\.protectRegisteredHandlers\(\);\s*server\.begin\(\)/);
console.log('client playlist bridge contract passed');

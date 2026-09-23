import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const web = readFileSync(join(root, 'src/LightweaverWeb.cpp'), 'utf8');
const storage = readFileSync(join(root, 'src/LightweaverStorage.cpp'), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'lw-wifi-diagnostics-'));
try {
  const binary = join(dir, 'test');
  execFileSync('c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror',
    join(root, 'tests/wifi-join-diagnostics.cpp'), '-o', binary]);
  execFileSync(binary);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
assert.match(web, /wifiJoinObserveEvents\s*=\s*false;[\s\S]*WiFi\.disconnect\(false, false\)/,
  'deliberate disconnect must disarm callback evidence');
assert.match(web, /WiFi\.enableSTA\(false\);[\s\S]*wifiJoinFencePending\s*=\s*true/,
  'new web credentials must fence prior station events before joining');
assert.match(web, /wifiJoinFencePending[\s\S]*usbWifiStationStopped[\s\S]*startStationAttempt/,
  'fenced web join must begin only after STA_STOP');
assert.match(web, /wifiJoinSawAssociation\.exchange\(false\)/,
  'association evidence must be consumed on the main loop');
for (const field of ['failureStage', 'failureReason', 'driverReason']) {
  assert.match(storage, new RegExp(`doc\\["wifi"\\]\\["${field}"\\]`),
    `${field} must appear on the card status contract`);
}
const copyStart = web.indexOf('"const wifiFailureText=');
const copyEnd = web.indexOf('"let wifiJoinPollToken=', copyStart);
assert.ok(copyStart > 0 && copyEnd > copyStart);
const copyJs = [...web.slice(copyStart, copyEnd).matchAll(/"(?:\\.|[^"\\])*"/g)]
  .map(match => JSON.parse(match[0])).join('');
const copy = vm.runInNewContext(`${copyJs};wifiFailureText`);
assert.match(copy({ failureReason: 'no_compatible_access_point' }), /No compatible access point found/);
assert.doesNotMatch(copy({ failureReason: 'no_compatible_access_point' }), /wrong password|SSID was not found/i);
assert.match(copy({ failureReason: 'authentication_failed' }), /Check the password and router security/);
assert.match(copy({ failureReason: 'no_ip_address' }), /did not receive an IP address/);
assert.equal(copy({ lastError: 'legacy timeout' }), 'legacy timeout');
console.log('wifi-join-diagnostics tests passed');

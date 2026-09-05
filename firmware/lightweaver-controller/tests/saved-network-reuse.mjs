import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const src = resolve(import.meta.dirname, '../src');
const read = name => readFileSync(join(src, name), 'utf8');
const storage = read('LightweaverStorage.cpp');
assert.ok(storage.includes('reuseSaved'), 'saved credentials must be reusable without re-entering or exposing a password');
assert.match(storage, /if \(doc\["clearPassword"\] \| false\) candidate\.password = String\(\);/,
  'explicit open-network selection clears even a previously typed field');
const temp = mkdtempSync(join(tmpdir(), 'lw-saved-wifi-'));
try {
  writeFileSync(join(temp, 'test.cpp'), `
#include <cassert>
#include "${join(src, 'LightweaverWifiCredentialPolicy.h')}"
int main() {
 assert(preserveSavedWifiPassword(true, true, false, false));
 assert(!preserveSavedWifiPassword(false, true, false, false));
 assert(!preserveSavedWifiPassword(true, true, true, false));
 assert(!preserveSavedWifiPassword(true, true, false, true));
 assert(!preserveSavedWifiPassword(true, false, false, false));
}
`);
  execFileSync('c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', join(temp, 'test.cpp'), '-o', join(temp, 'test')]);
  execFileSync(join(temp, 'test'));
} finally { rmSync(temp, {recursive:true, force:true}); }
for (const file of ['main.cpp', 'LightweaverStorage.cpp']) {
 const source = read(file);
 assert.match(source, /doc\["wifi"\]\["ssid"\]/);
 assert.match(source, /doc\["wifi"\]\["savedPasswordAvailable"\]/);
 assert.doesNotMatch(source, /doc\["wifi"\]\["password"\]\s*=/);
}
const web = read('LightweaverWeb.cpp');
assert.ok(web.includes('Use saved network'));
assert.ok(web.includes('Change network'));
assert.ok(web.includes('reuseSaved:true'));
assert.doesNotMatch(web, /resetWifiFlow|Re-enter WiFi details/,
  'routine Wi-Fi edits must not erase the stored credentials first');
console.log('saved network reuse tests passed');

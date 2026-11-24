// The card keeps evidence of an abnormal reset.
//
// crash-record.cpp runs the shipped LightweaverCrashRecord.h on a host: the
// record made from what a reset leaves behind, keeping the last three,
// storing them, and the two reports. The assertions below pin the card source
// to that header and to the rules that keep the recorder itself harmless.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (name) => readFileSync(resolve(root, 'src', name), 'utf8');
const code = (source) => source.replace(/\/\/[^\n]*/g, '');
const record = read('LightweaverCrashRecord.h');
const recorder = read('LightweaverCrashRecorder.cpp');
const main = read('main.cpp');
const storage = read('LightweaverStorage.cpp');
const web = read('LightweaverWeb.cpp');
const platformio = readFileSync(resolve(root, 'platformio.ini'), 'utf8');

// --- Host run of the shipped header ------------------------------------------
let hostOutput = '';
const tempDir = mkdtempSync(join(os.tmpdir(), 'lightweaver-crash-record-'));
try {
  const binary = join(tempDir, 'crash-record');
  execFileSync('c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', resolve(root, 'src'),
    resolve(root, 'tests/crash-record.cpp'), '-o', binary], { stdio: 'inherit' });
  hostOutput = execFileSync(binary, [], { encoding: 'utf8' });
  process.stdout.write(hostOutput);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

// --- "lastCrash" is what Studio's reader accepts ---------------------------------
// The rules below are the ones in lightweaver/src/lib/cardCrashReport.js
// (parseCardCrashReport): the firmware must satisfy that reader unchanged.
const HEX32 = /^0x[0-9a-f]{8}$/;
const REASONS = ['panic', 'taskWatchdog', 'interruptWatchdog', 'watchdog', 'brownout'];
const PHASES = ['idle', 'render', 'configSave', 'wifi', 'storage', 'update', 'http'];
const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF;
const last = Object.fromEntries(hostOutput.split('\n').filter((line) => line.startsWith('LASTCRASH '))
  .map((line) => { const [, name, ...rest] = line.split(' '); return [name, JSON.parse(rest.join(' '))]; }));
assert.deepEqual(Object.keys(last).sort(), ['bare', 'brownout', 'never', 'panic', 'watchdog']);
assert.equal(last.never, null, 'a card that has never crashed reports null');
for (const name of ['panic', 'watchdog', 'brownout', 'bare']) {
  const raw = last[name];
  for (const field of ['sequence', 'resetReason', 'uptimeMs', 'freeHeap', 'minFreeHeap'])
    assert.ok(isCount(raw[field]), `${name}.${field} is a count`);
  assert.ok(raw.sequence >= 1);
  assert.ok(REASONS.includes(raw.reason), `${name}.reason is one the reader has words for`);
  assert.equal(typeof raw.phase, 'string');
  assert.equal(typeof raw.task, 'string');
  assert.match(raw.pc, HEX32);
  assert.ok(Array.isArray(raw.backtrace) && raw.backtrace.length <= 16 &&
    raw.backtrace.every((entry) => HEX32.test(entry)), `${name}.backtrace is hex addresses`);
}
assert.deepEqual([last.panic.sequence, last.watchdog.sequence, last.brownout.sequence, last.bare.sequence],
  [1, 2, 3, 4], 'sequence counts every crash');
assert.deepEqual([last.panic.reason, last.panic.phase, last.panic.task, last.panic.backtrace.length],
  ['panic', 'configSave', 'loopTask', 16]);
assert.deepEqual([last.watchdog.reason, last.watchdog.phase, last.watchdog.uptimeMs, last.watchdog.backtrace.length],
  ['taskWatchdog', 'idle', 27252000, 9]);
assert.deepEqual([last.brownout.reason, last.brownout.pc, last.brownout.backtrace.length],
  ['brownout', '0x00000000', 0]);
assert.ok(PHASES.includes(last.panic.phase) && PHASES.includes(last.watchdog.phase));
assert.equal(last.bare.phase, 'unknown', 'no breadcrumb: the reader says "doing something unknown"');
for (const [name, source] of [['firmware-info', main], ['status', storage]]) {
  assert.match(source, /doc\["lastCrash"\] = serialized\(lightweaverCrashLastCrashJson\(\)\);/,
    `${name} carries lastCrash`);
}

// --- The header stays pure ----------------------------------------------------
assert.doesNotMatch(record, /#include\s*<(Arduino|ArduinoJson|WString|esp_)/,
  'the record header must compile on a host');
assert.match(record, /LW_CRASH_RING_SIZE = 3;/, 'the last three records are kept');
assert.match(record, /LW_CRASH_BACKTRACE_MAX = 16;/, 'a trace keeps at least 8 frames');

// --- Capture: breadcrumb in memory a reset does not clear, plus a panic hook ---
assert.match(recorder, /RTC_NOINIT_ATTR LwCrashBreadcrumb g_crumb;/,
  'the breadcrumb lives in memory that survives a reset');
assert.match(platformio, /-Wl,--wrap=esp_panic_handler/,
  'every panic is routed through the recorder first');
assert.match(recorder, /extern "C" void IRAM_ATTR __wrap_esp_panic_handler\(panic_info_t\* info\)/,
  'the hook runs from memory that is always mapped');
const hook = recorder.slice(recorder.indexOf('__wrap_esp_panic_handler(panic_info_t* info) {'),
  recorder.indexOf('#else'));
assert.match(hook, /__real_esp_panic_handler\(info\);\s*\}\s*$/,
  'the hook always hands over to the system handler, whatever it captured');
assert.doesNotMatch(code(hook), /malloc|new |String|Serial|Preferences|snprintf|printf|delay\(|\[\]\s*\(/,
  'the hook allocates nothing, prints nothing and defines no helper outside IRAM');
assert.match(hook, /g_crumb\.hookMagic != LW_CRASH_HOOK_MAGIC/,
  'a second panic keeps the first one\'s evidence');
assert.match(hook, /depth < LW_CRASH_BACKTRACE_MAX && walk\.next_pc != 0/,
  'the trace walk is bounded');

// --- Start-up: store first, never block ---------------------------------------
const boot = recorder.slice(recorder.indexOf('void lightweaverCrashRecorderBoot() {'),
  recorder.indexOf('void lightweaverCrashRecorderTick('));
assert.match(boot, /lwCrashReasonAbnormal\(resetReason\)[\s\S]*lwCrashRingPush[\s\S]*saveRing\(prefs\)/,
  'an abnormal reset is turned into a record and stored');
assert.match(boot, /lwCrashBreadcrumbStart\(g_crumb, g_bootCount\);\s*\}\s*$/,
  'this start-up begins with a clean breadcrumb');
assert.doesNotMatch(code(boot), /while\s*\(|delay\(|ESP\.restart|abort\(/,
  'storing a record can never hold or restart the card');
const setup = main.slice(main.indexOf('void setup() {'), main.indexOf('void loop() {'));
assert.ok(setup.indexOf('lightweaverCrashRecorderBoot();') > 0 &&
  setup.indexOf('lightweaverCrashRecorderBoot();') < setup.indexOf('Serial.begin('),
  'the previous start-up\'s evidence is stored before anything else in setup can fail');
assert.match(main, /void loop\(\) \{\s*uint32_t now = millis\(\);\s*lightweaverCrashRecorderTick\(now\);/,
  'the breadcrumb is kept current on every pass, including while a restart is pending');

// --- What the card was doing --------------------------------------------------
for (const [file, call] of [
  ['LightweaverWeb.cpp', 'server.uri()'], ['LightweaverMedia.cpp', 'g_server->uri()'],
  ['LightweaverProjectRepository.cpp', 'g_projectServer->uri()'],
  ['LightweaverHttpFrameStream.cpp', 'g_streamServer->uri()'],
  ['LightweaverFirmwareUpdate.cpp', 'g_updateServer->uri()'],
  ['LightweaverOwnerCapability.cpp', 'g_ownerServer->uri()'],
  ['LightweaverWledJsonApi.cpp', 'serverPtr->uri()'],
]) {
  assert.ok(read(file).includes(`lightweaverCrashNoteActivity(${call}.c_str());`),
    `${file} notes the request path`);
}
assert.doesNotMatch(code(recorder) + code(web), /lightweaverCrashNoteActivity\([^)]*(arg\(|header\(|plain|body)/i,
  'only a request path is ever noted: no query, header or body');
assert.match(web, /lightweaverCrashNoteSave\(true\);\s*bool ok = saveRuntimeConfigJson\([^;]*;\s*lightweaverCrashNoteSave\(false\);/,
  'a project save in progress is marked');

// --- Reports ------------------------------------------------------------------
for (const [name, source] of [['firmware-info', main], ['status', storage]]) {
  assert.match(source, /doc\["capabilities"\]\["crashRecorder"\] = 1;\s*lightweaverCrashReportSummary\(doc\["crash"\]\.to<JsonObject>\(\)\);/,
    `${name} carries the short crash summary and says the full log exists`);
}
assert.match(recorder, /server\.on\("\/api\/crash-log", HTTP_GET, handleCrashLog\);/,
  'the full log is a read-only route');
assert.doesNotMatch(code(recorder), /HTTP_POST|HTTP_DELETE|HTTP_PUT/, 'nothing can write or clear the log over the network');
// "/api/wifi" appears only as a route name used to label what the card was
// doing; nothing reads the network name, a password, a token or a permission.
assert.doesNotMatch(code(recorder) + code(record), /ssid|password|passphrase|psk|token|WiFi\.|capability\b|runtimeConfig/i,
  'the recorder never touches a credential');
assert.match(web, /registerLightweaverCrashRecorder\(server\);/);

console.log('crash-record tests passed');

// A project under the stated limit must always be able to replace the one on
// the card, and limits.configStorageBytes must never promise more than a save
// can take.
//
// Measured on card lw-b0fe81f61b44 (firmware 1.2.3, build 2407) on 2026-11-19:
// POST /api/config with a 3,514-byte project answered 400 "nvs write failed;
// previous project remains intact and runtime unchanged", twice, while the
// card reported limits.configStorageBytes 3968.
//
// Cause: the project was one NVS string. A string must sit whole in a single
// 126-entry page, and the 20 KB partition has four usable pages. Once the
// card's other keys are spread over them, no page can take a 111-entry string.
//
// project-store-nvs-room.cpp runs the shipped LightweaverProjectStore.h
// against a model of the NVS page rules: the string write is refused on a used
// card, the blob write succeeds on the same card, the reported room is always
// honoured, and a power cut at any step leaves one whole project.
//
// Optional argv[2] points at a different LightweaverStorage.cpp, which is how
// the pre-fix failure was demonstrated.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const storagePath = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'src/LightweaverStorage.cpp');
const storage = readFileSync(storagePath, 'utf8');
const main = readFileSync(resolve(root, 'src/main.cpp'), 'utf8');

// The partition this arithmetic depends on. A different table changes the
// number of pages, and the model in the .cpp with it.
const platformio = readFileSync(resolve(root, 'platformio.ini'), 'utf8');
assert.match(platformio, /board_build\.partitions = default_16MB\.csv/,
  'the NVS page model assumes default_16MB.csv (nvs 0x5000 = five pages)');

// The canonical project never goes back to being a single-page string.
assert.doesNotMatch(storage, /prefs\.putString\(NVS_KNOWN_GOOD_CONFIG_KEY/,
  'the known-good project must be written through writeKnownGood (a blob), never putString');
assert.doesNotMatch(storage, /prefs\.getString\(NVS_KNOWN_GOOD_CONFIG_KEY/,
  'the known-good project must be read through readKnownGood, which prefers the blob');
assert.match(storage, /#include "LightweaverProjectStore\.h"/);
assert.match(storage, /lightweaver::writeProject\(prefs, NVS_KNOWN_GOOD_BLOB_KEY, NVS_KNOWN_GOOD_CONFIG_KEY, json\)/);

// The reported limit is computed from the room the card has, in both places
// that report it. A literal here is a promise nothing checks.
for (const [name, source] of [['LightweaverStorage.cpp', storage], ['main.cpp', main]]) {
  const reported = [...source.matchAll(/doc\["limits"\]\["configStorageBytes"\] = ([^;]+);/g)].map((m) => m[1]);
  assert.ok(reported.length > 0, `${name} must report limits.configStorageBytes`);
  for (const value of reported) {
    assert.equal(value, 'runtimeConfigStorageLimitBytes()',
      `${name} must report the measured room, not ${value}`);
  }
}
assert.match(storage,
  /size_t runtimeConfigStorageLimitBytes\(\) \{\s*return lightweaver::projectRoomBytes\(nvsFreeEntries\(\), NVS_STRING_LIMIT\);/);

// Saved looks, the playlist and the live-look record share the partition and
// may not grow into the project's room.
for (const key of ['CLIENT_PLAYLIST_KEY', 'CLIENT_PATTERN_KEY', 'NVS_LIVE_LOOK_KEY']) {
  const guard = storage.indexOf(`clientRecordLeavesProjectRoom(prefs, ${key},`);
  const write = storage.indexOf(`prefs.putString(${key},`);
  assert.ok(guard !== -1 && write !== -1 && guard < write,
    `${key} must be checked against the project's room before it is written`);
}

// A refusal says how big the project is and how much room there is.
assert.match(storage, /previous project remains intact and runtime unchanged \(project is /);

const temp = mkdtempSync(resolve(os.tmpdir(), 'lw-project-store-'));
try {
  const binary = resolve(temp, 'project-store-nvs-room');
  execFileSync('c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', resolve(import.meta.dirname, 'host-stubs'),
    '-I', resolve(root, 'src'),
    resolve(import.meta.dirname, 'project-store-nvs-room.cpp'),
    '-o', binary,
  ], { stdio: 'inherit' });
  execFileSync(binary, { stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('project-store-nvs-room tests passed');

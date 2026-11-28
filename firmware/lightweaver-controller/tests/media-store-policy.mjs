// A recorded look can live in the card's built-in memory when there is no
// microSD, without ever costing the project store its room.
//
// Measured 2026-11-23 from the partition table the build uses
// (framework-arduinoespressif32/tools/partitions/default_16MB.csv):
//   spiffs, data, spiffs, 0xc90000, 0x360000   -> 3,538,944 bytes of LittleFS
// The project store can hold three 768 KiB copies at once (current, known-good,
// staging) plus 64 KiB of headroom = 2,424,832 bytes, and it checks its 3 MiB
// quota against the whole filesystem's used bytes. That leaves 720,896 bytes;
// 64 KiB is held for LittleFS's own blocks, so recordings get 640 KiB.
//
// media-store-policy.cpp runs the shipped LightweaverMediaStorePolicy.h: store
// selection, the limit refusal, the not-enough-room refusal, what may be
// cleared, and an upload cut off at every step. The assertions below pin the
// card source to those rules and keep the microSD path as it was.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (name) => readFileSync(resolve(root, 'src', name), 'utf8');
const media = read('LightweaverMedia.cpp');
const header = read('LightweaverMedia.h');
const policy = read('LightweaverMediaStorePolicy.h');
const repository = read('LightweaverProjectRepository.cpp');
const repositoryHeader = read('LightweaverProjectRepository.h');
const main = read('main.cpp');
const storage = read('LightweaverStorage.cpp');
const code = (source) => source.replace(/\/\/[^\n]*/g, '');

// --- The partition the arithmetic depends on --------------------------------
const platformio = readFileSync(resolve(root, 'platformio.ini'), 'utf8');
assert.match(platformio, /board_build\.partitions = default_16MB\.csv/,
  'the recording budget assumes default_16MB.csv');
assert.match(policy, /LW_FLASH_MEDIA_PARTITION_BYTES = 0x360000;/);
const partitionTable = resolve(os.homedir(),
  '.platformio/packages/framework-arduinoespressif32/tools/partitions/default_16MB.csv');
if (existsSync(partitionTable)) {
  const row = readFileSync(partitionTable, 'utf8').split('\n').find((line) => line.startsWith('spiffs'));
  assert.ok(row, 'default_16MB.csv must define the spiffs partition LittleFS mounts');
  assert.equal(Number(row.split(',')[4].trim()), 0x360000,
    'the installed partition table no longer matches the measured LittleFS size');
} else {
  console.log('media-store-policy: PlatformIO partition table not installed here; size pinned by the header only');
}

// --- The project store limits the budget was worked out from ----------------
assert.match(repositoryHeader, /LW_PROJECT_REPOSITORY_QUOTA_BYTES = 3u \* 1024u \* 1024u;/);
assert.match(repositoryHeader, /LW_PROJECT_RECOVERY_HEADROOM_BYTES = 64u \* 1024u;/);
assert.match(repositoryHeader, /LW_PROJECT_MAX_BYTES = 768u \* 1024u;/);
assert.match(media, /static_assert\(LW_FLASH_MEDIA_PROJECT_MAX_BYTES == LW_PROJECT_MAX_BYTES &&\s*LW_FLASH_MEDIA_PROJECT_HEADROOM_BYTES == LW_PROJECT_RECOVERY_HEADROOM_BYTES &&\s*LW_FLASH_MEDIA_PROJECT_QUOTA_BYTES == LW_PROJECT_REPOSITORY_QUOTA_BYTES/,
  'a change to the project store limits must fail the build until the recording budget is redone');
assert.match(repository, /usedBytes\(\) const \{\s*return available_ \? LittleFS\.usedBytes\(\) : 0;/,
  'the 720,896-byte figure assumes the project quota counts the whole filesystem');
assert.match(policy, /LW_FLASH_MEDIA_MAX_BYTES = 640u \* 1024u;/);

// --- One mount, never formatted from here -----------------------------------
const sources = readdirSync(resolve(root, 'src')).filter((name) => /\.(cpp|h)$/.test(name) &&
  name !== 'LightweaverCardStudioBundle.h');
const mounts = sources.filter((name) => /LittleFS\.begin\(/.test(code(read(name))));
assert.deepEqual(mounts, ['LightweaverProjectRepository.cpp'],
  'built-in recordings reuse the project store mount; nothing else may mount LittleFS');
assert.doesNotMatch(code(media), /LittleFS\.(begin|format)\(/);
assert.match(media, /bool flashStoreAvailable\(\) \{[\s\S]*?lightweaverProjectRepository\(\)\.available\(\)[\s\S]*?lwFlashMediaFilesystemTrusted\(LittleFS\.totalBytes\(\)\)/,
  'built-in memory is used only through the mounted project store, on the measured partition');
assert.match(media, /Wear: a recording is written once/);

// --- Store selection ---------------------------------------------------------
assert.match(media, /const LwMediaStore store = batchBegin\s*\? lwSelectMediaStore\(sdMounted\(\), flashStoreAvailable\(\)\) : g_batch\.store;/,
  'a save picks its store once, at batch begin, and every later request stays on it');
assert.match(media, /g_batch\.store = store;/);
assert.match(media, /g_transfer\.store = store;/);
assert.match(media, /fs::FS& fs = storeFs\(g_transfer\.store\);/);
assert.match(media, /fs::FS& storeFs\(LwMediaStore store\) \{\s*if \(store == LwMediaStore::Sd\) return SD;\s*return LittleFS;/);

// --- Limit and not-enough-room refusals, at begin ----------------------------
assert.match(media, /if \(store == LwMediaStore::Flash && flashFootprint > LW_FLASH_MEDIA_MAX_BYTES\) \{\s*g_batch = Batch\{\};\s*sendResult\(413, false,/,
  'built-in memory refuses an over-limit save when the batch begins, before any byte is sent');
assert.match(media, /"the card memory limit of "\) \+ String\(static_cast<unsigned long>\(LW_FLASH_MEDIA_MAX_FILE_BYTES\)\)/,
  'the refusal names the limit in bytes');
assert.match(media, /if \(!fs\.exists\(file\.c_str\(\)\) && !admitFlashMedia\(bytes, refusal, reason\)\) \{\s*sendResult\(refusal, false, reason\); return;/,
  'each file is admitted against the limit and the free room before staging is created');
assert.match(media, /case LwFlashMediaAdmission::OverLimit:\s*status = 413;/);
assert.match(media, /case LwFlashMediaAdmission::StoreFull:\s*status = 507;/);
assert.match(media, /status = 507; message = "card memory capacity is insufficient"; return false;/);
const admit = media.indexOf('admitFlashMedia(bytes, refusal, reason)');
const staged = media.indexOf('File temp = fs.open(g_transfer.temp.c_str(), FILE_WRITE);');
assert.ok(admit !== -1 && staged !== -1 && admit < staged, 'admission must come before the staging file exists');

// --- Clearing only what nothing can play --------------------------------------
assert.match(media, /!lwFlashMediaEvictable\(runtimeSequenceFileInUse\(path\), declaredInBatch\(path\)\)/);
assert.match(main, /bool runtimeSequenceFileInUse\(const String& file\) \{\s*for \(uint8_t index = 0; index < lookCount; index\+\+\) \{\s*if \(looks\[index\]\.mode == "sequence" && looks\[index\]\.file == file\) return true;/);
assert.equal((code(media).match(/LittleFS\.remove\(/g) || []).length, 1,
  'built-in memory removes files in exactly one place: the unused-recording clear');
assert.match(media, /const String path = String\("\/sequences\/"\) \+ name;[\s\S]*?LittleFS\.remove\(unused\[i\]\.c_str\(\)\)/,
  'only paths built inside /sequences are ever removed from built-in memory');

// --- Power loss: bytes land in staging only; one rename publishes ------------
assert.match(media, /if \(!lwMediaDiscardStaging\(fs, LW_MEDIA_STAGING_PATH\)\)/);
assert.match(media, /File temp = fs\.open\(g_transfer\.temp\.c_str\(\), FILE_APPEND\);/);
assert.equal((code(media).match(/FILE_(WRITE|APPEND)/g) || []).length, 2,
  'the only writes are the staging create and the staging append');
const verified = media.indexOf('actualHash != g_transfer.hash || !validSequenceHeader(fs, g_transfer.temp, actualBytes)');
const promoted = media.indexOf('lwMediaPromote(fs, g_transfer.temp.c_str(), g_transfer.file.c_str())');
assert.ok(verified !== -1 && promoted !== -1 && verified < promoted,
  'the staged file is hashed and header-checked before the rename that makes it playable');
assert.match(media, /lightweaverFirmwareBootProbationActive\(\)\) \{[\s\S]*?sendResult\(409, false, "card memory is read-only until the new card software is confirmed"\)/);

// --- Playback ----------------------------------------------------------------
assert.match(main, /prepared\.file = lightweaverOpenRecordedMedia\(look\.file\.c_str\(\)\);/);
assert.match(main, /sequenceIntegrityMatches\(prepared\.file, look\.sequenceBytes, look\.sequenceSha256\) &&\s*readSequenceMetadata\(/,
  'a recording from either store passes the same SHA-256 and topology checks before a frame shows');
assert.match(media, /if \(sdPresent && SD\.exists\(path\)\) return SD\.open\(path, FILE_READ\);\s*if \(flashStoreAvailable\(\) && lwMediaPathInSequences\(path\) && LittleFS\.exists\(path\)\)\s*return LittleFS\.open\(path, FILE_READ\);\s*(\/\/[^\n]*\s*)?return sdPresent \? SD\.open\(path, FILE_READ\) : fs::File\(\);/,
  'the microSD is tried first; built-in memory only inside /sequences');
assert.match(header, /fs::File lightweaverOpenRecordedMedia\(const char\* path\);/);

// --- Reported to Studio ------------------------------------------------------
for (const [name, source] of [['main.cpp', main], ['LightweaverStorage.cpp', storage]]) {
  assert.match(source, /lightweaverReportRecordedMedia\(doc\["capabilities"\]\.as<JsonObject>\(\)\);/,
    `${name} must report where recordings are kept`);
}
assert.match(media, /capabilities\["recordedMediaStore"\] = lwMediaStoreName\(store\);/);
assert.match(media, /capabilities\["recordedMediaMaxBytes"\] = LW_FLASH_MEDIA_MAX_FILE_BYTES;\s*capabilities\["recordedMediaFreeBytes"\] = freeBytes;/);
assert.match(media, /lwSelectMediaStore\(SD\.cardType\(\) != CARD_NONE, flashStoreAvailable\(\)\);\s*capabilities\["recordedMediaStore"\]/,
  'a status poll reads the mounted state and never probes the SD slot');

// --- microSD path unchanged --------------------------------------------------
assert.match(media, /bool sdMounted\(\) \{\s*if \(SD\.cardType\(\) != CARD_NONE\) return true;\s*return SD\.begin\(LW_SD_CS\) && SD\.cardType\(\) != CARD_NONE;/);
assert.match(media, /return store == LwMediaStore::Flash \? "card memory" : "microSD";/,
  'every microSD message keeps its wording');
assert.match(media, /const uint64_t freeBytes = SD\.totalBytes\(\) > SD\.usedBytes\(\) \? SD\.totalBytes\(\) - SD\.usedBytes\(\) : 0;\s*if \(!fs\.exists\(file\.c_str\(\)\) && freeBytes < uint64_t\(bytes\) \+ 4096U\) \{\s*sendResult\(507, false, "microSD capacity is insufficient"\); return;/);
assert.match(media, /bytes > LW_SEQUENCE_MEDIA_MAX_BYTES \|\|\s*aggregate > LW_MEDIA_BATCH_MAX_BYTES - bytes/,
  'a microSD still takes 16 MiB a file and 48 MiB a save');
assert.match(header, /LW_SEQUENCE_MEDIA_MAX_BYTES = 16777216/);
assert.match(media, /sendResult\(503, false, storeLabel\(store\) \+ " media unavailable"\)/);

const temp = mkdtempSync(resolve(os.tmpdir(), 'lw-media-store-'));
try {
  const binary = resolve(temp, 'media-store-policy');
  execFileSync('c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', resolve(root, 'src'),
    resolve(import.meta.dirname, 'media-store-policy.cpp'),
    '-o', binary,
  ], { stdio: 'inherit' });
  execFileSync(binary, { stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('media-store-policy tests passed');

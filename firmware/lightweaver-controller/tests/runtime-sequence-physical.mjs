import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import { resolve } from 'node:path';

const temp = mkdtempSync(resolve(os.tmpdir(), 'lw-sequence-physical-'));
try {
  const binary = resolve(temp, 'runtime-sequence-physical');
  writeFileSync(resolve(temp, 'Arduino.h'), '#pragma once\n#include <stdint.h>\nuint32_t millis();\n');
  execFileSync('c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', temp,
    '-I', resolve(import.meta.dirname, '../src'),
    resolve(import.meta.dirname, '../src/LightweaverFrameSource.cpp'),
    resolve(import.meta.dirname, 'runtime-sequence-physical.cpp'),
    '-o', binary,
  ], { stdio: 'inherit' });
  execFileSync(binary, { stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const sourceRoot = resolve(import.meta.dirname, '../src');
const main = readFileSync(resolve(sourceRoot, 'main.cpp'), 'utf8');
const websocket = readFileSync(resolve(sourceRoot, 'LightweaverWledWebSocket.cpp'), 'utf8');
const http = readFileSync(resolve(sourceRoot, 'LightweaverHttpFrameStream.cpp'), 'utf8');
const web = readFileSync(resolve(sourceRoot, 'LightweaverWeb.cpp'), 'utf8');
assert.match(main, /sequencePhysicalFrame \|\| studioPhysicalFrame/);
assert.match(main, /frameSourceActive\(\) == FRAME_STUDIO_PHYSICAL[\s\S]*frameSourceActive\(\) == FRAME_HTTP_PHYSICAL/);
assert.match(websocket, /doc\["lwPhysical"\]\.as<int>\(\) == 1[\s\S]*FRAME_STUDIO_PHYSICAL : FRAME_WLED_REALTIME/);
assert.match(http, /doc\["lwPhysical"\]\.as<int>\(\) == 1/);
assert.match(web, /if\(p\.lwPhysical===1\)frame\.lwPhysical=1/);
assert.match(web, /\["physicalFrameOrder"\]\["version"\] = 1/);
assert.match(main, /\["physicalFrameOrder"\]\["version"\] = 1/);

console.log('multi-GPIO physical sequence playback passed');

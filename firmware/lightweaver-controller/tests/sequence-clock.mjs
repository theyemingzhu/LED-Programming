// A recorded look plays at its recorded speed.
//
// Measured on card lw-b0fe81f61b44 on 2026-11-23 (draft PR #490): a 24 fps
// recording played at 13 to 18 frames a second, mean 16, so a 5-second loop
// took about 7.5 seconds. Playback set each frame's time to "when the last
// frame was drawn + 1000 / fps" and never caught up.
//
// sequence-clock.cpp runs the shipped LightweaverSequenceClock.h: on time, one
// late frame, a long stall, the loop wrap, 1 and 60 frames a second, and the
// card's own measured 21 ms loop pass. The assertions below pin main.cpp to
// that clock and keep ordinary pattern timing exactly as it was.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const main = readFileSync(resolve(root, 'src/main.cpp'), 'utf8');
const storage = readFileSync(resolve(root, 'src/LightweaverStorage.cpp'), 'utf8');
const types = readFileSync(resolve(root, 'src/LightweaverTypes.h'), 'utf8');

const playback = main.match(/bool renderSequenceFrame\(bool force\) \{[\s\S]*?\n\}/);
assert.ok(playback, 'renderSequenceFrame must exist');
assert.match(playback[0], /lwSequenceClockAdvance\(\s*sequenceClock, millis\(\), sequenceFps, sequenceFrameCount, looks\[currentLookIndex\]\.loop\)/,
  'recorded playback must ask the clock which frame is due');
assert.doesNotMatch(main, /nextSequenceFrameAt/,
  'no per-frame deadline may come back: a deadline counted from "now" is what made recordings slow');
assert.doesNotMatch(playback[0], /1000 \/ sequenceFps/);
assert.match(main, /sequenceFrameIndex = 1;\s*lwSequenceClockStart\(sequenceClock, millis\(\)\);/,
  'the clock starts when frame 0 goes on screen');
assert.match(playback[0], /step\.frameIndex == sequenceFrameIndex \|\| sequenceFile\.seek\(frameOffset\)/,
  'the file is only moved for a skipped frame or a loop; in-order frames are read straight on');
assert.match(playback[0], /lwSequenceFrameOffset\(LWSEQ_HEADER_BYTES, step\.frameIndex, sequenceFrameBytes\)/);
assert.match(playback[0], /fail\(ERROR_SEQUENCE, "sequence read failed"\)/);
assert.match(playback[0], /sequenceFramesSkipped \+= step\.skipped;/);

// Ordinary patterns are timed exactly as before. Changing this is a separate
// decision: it would alter how every look moves.
assert.match(types, /constexpr uint16_t DEFAULT_RENDER_FPS = 30;/);
assert.match(main, /static uint32_t nextProceduralAt = 0;\s*uint32_t now = millis\(\);\s*if \(!force && now < nextProceduralAt\) return false;\s*nextProceduralAt = now \+ \(1000 \/ DEFAULT_RENDER_FPS\);/,
  'this change must not touch ordinary pattern timing');

// The timing report that tells scheduling, the recording read and the LED
// write apart on a real card.
for (const [name, source] of [['main.cpp', main], ['LightweaverStorage.cpp', storage]]) {
  assert.match(source, /lwOutput\["measuredFps"\] = runtimeOutputMeasuredFps\(\);\s*runtimeReportOutputTiming\(lwOutput\);/,
    `${name} must report output timing beside measuredFps`);
}
for (const field of ['loopPassMeanUs', 'loopPassMaxUs', 'showMaxUs']) {
  assert.match(main, new RegExp(`timing\\["${field}"\\]`));
}
for (const field of ['fps', 'frames', 'shown', 'skipped', 'readMaxUs']) {
  assert.match(main, new RegExp(`sequence\\["${field}"\\]`));
}

const temp = mkdtempSync(resolve(os.tmpdir(), 'lw-sequence-clock-'));
try {
  const binary = resolve(temp, 'sequence-clock');
  execFileSync('c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', resolve(root, 'src'),
    resolve(import.meta.dirname, 'sequence-clock.cpp'),
    '-o', binary,
  ], { stdio: 'inherit' });
  execFileSync(binary, { stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('sequence-clock tests passed');

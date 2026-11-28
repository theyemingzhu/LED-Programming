import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { compilePattern } from '../../../lightweaver/src/lib/frameEngine.js';

test('Warm Fade samples warm colors continuously through the eight-minute loop', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lw-warm-fade-'));
  try {
    const cpp = join(directory, 'sample.cpp');
    const binary = join(directory, 'sample');
    writeFileSync(cpp, `
      #include <iostream>
      #include "LightweaverWarmFade.h"

      int main() {
        for (uint32_t time = 0; time <= 960000; time += 100) {
          const auto color = sampleWarmFade(time);
          std::cout << int(color.r) << ',' << int(color.g) << ',' << int(color.b) << '\\n';
        }
      }
    `);
    execFileSync('c++', ['-std=c++17', '-I', resolve(import.meta.dirname, '../src'), cpp, '-o', binary]);
    const colors = execFileSync(binary, { encoding: 'utf8' }).trim().split('\n')
      .map(line => line.split(',').map(Number));

    assert.equal(colors.length, 9601);
    assert.deepEqual([0, 1200, 2400, 3600, 4800].map(frame => colors[frame]), [
      [232, 191, 112],
      [213, 145, 84],
      [176, 83, 59],
      [207, 125, 74],
      [232, 191, 112],
    ]);
    assert.deepEqual(colors.slice(4800), colors.slice(0, 4801));
    const renderStudioPixel = compilePattern('warm-fade');
    assert.equal(typeof renderStudioPixel, 'function');
    for (const [frame, color] of colors.entries()) {
      const [red, green, blue] = color;
      const elapsedSeconds = frame / 10;
      assert.deepEqual(renderStudioPixel(0, 0, 0, elapsedSeconds), { r: red, g: green, b: blue },
        `Studio and firmware match at ${elapsedSeconds}s`);
      assert.ok(red > green && green > blue && blue > 0, `warm color at frame ${frame}`);
      if (frame === 0) continue;
      assert.ok(color.every((channel, index) => Math.abs(channel - colors[frame - 1][index]) <= 1),
        `blend stays smooth at frame ${frame}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

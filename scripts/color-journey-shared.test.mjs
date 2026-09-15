import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleColorJourney } from '../lightweaver/src/lib/colorJourney.js';
import { sampleNativeColorJourneyPixel } from '../lightweaver/src/lib/colorJourneyNative.js';

const fixture = JSON.parse(readFileSync(new URL('../docs/fixtures/color-journey-v1-samples.json', import.meta.url), 'utf8'));

for (const example of fixture.cases) {
  test(`shared original-browser and native samples: ${example.name}`, () => {
    for (const sample of example.samples) {
      assert.deepEqual(sampleColorJourney(example.journey, sample.elapsedMs).rgb, sample.rgb,
        `${sample.elapsedMs}ms authored interpolation`);
      for (let pixel = 0; pixel < sample.pixels.length; pixel++) {
        const actual = sampleNativeColorJourneyPixel(example.nativeRecipe, pixel, sample.elapsedMs);
        ['r', 'g', 'b'].forEach((channel, index) => {
          assert.ok(Math.abs(actual[channel] - sample.pixels[pixel][index]) <= fixture.channelTolerance,
            `${sample.elapsedMs}ms pixel${pixel} ${channel}: ${actual[channel]} vs ${sample.pixels[pixel][index]}`);
        });
      }
    }
  });
}

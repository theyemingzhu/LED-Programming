import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const fixture = JSON.parse(readFileSync(
  resolve(root, '../../docs/fixtures/color-journey-v1-samples.json'), 'utf8'));
assert.equal(fixture.version, 1);

const lines = [
  '#include <cassert>',
  '#include <cstdint>',
  '#include <cstdlib>',
  '#include "LightweaverColorJourney.h"',
  'using namespace lightweaver;',
  'static void nearChannel(uint8_t actual, int expected, int tolerance) { assert(std::abs(int(actual) - expected) <= tolerance); }',
  'int main() {',
  '  static_assert(sizeof(NativeRecipe) <= 768, "bounded recipe storage regressed");',
];

for (const [caseIndex, testCase] of fixture.cases.entries()) {
  const recipe = testCase.nativeRecipe;
  const journey = recipe.journey;
  lines.push(`  NativeRecipe recipe${caseIndex};`);
  lines.push(`  recipe${caseIndex}.kind = NativeRecipeKind::ColorJourney;`);
  lines.push(`  recipe${caseIndex}.colorJourney.stopCount = ${journey.stops.length};`);
  lines.push(`  recipe${caseIndex}.colorJourney.smooth = ${journey.easing === 'smooth'};`);
  lines.push(`  recipe${caseIndex}.colorJourney.loop = ${journey.loop};`);
  lines.push(`  recipe${caseIndex}.colorJourney.motionSpeedMs = ${journey.motionSpeedMs}U;`);
  lines.push(`  recipe${caseIndex}.colorJourney.depth = ${journey.depth}f;`);
  lines.push(`  recipe${caseIndex}.colorJourney.phaseCount = ${journey.phase16.length / 4};`);
  journey.stops.forEach((stop, stopIndex) => {
    const rgb = stop.color.slice(1).match(/../g).map(value => Number.parseInt(value, 16));
    lines.push(`  recipe${caseIndex}.colorJourney.stops[${stopIndex}].color.red = ${rgb[0]};`);
    lines.push(`  recipe${caseIndex}.colorJourney.stops[${stopIndex}].color.green = ${rgb[1]};`);
    lines.push(`  recipe${caseIndex}.colorJourney.stops[${stopIndex}].color.blue = ${rgb[2]};`);
    lines.push(`  recipe${caseIndex}.colorJourney.stops[${stopIndex}].holdMs = ${stop.holdMs}U;`);
    lines.push(`  recipe${caseIndex}.colorJourney.stops[${stopIndex}].fadeMs = ${stop.fadeMs}U;`);
  });
  journey.phase16.match(/.{4}/g).forEach((phase, pixel) => {
    lines.push(`  recipe${caseIndex}.colorJourneyPhases[${pixel}] = 0x${phase};`);
  });
  testCase.samples.forEach((sample, sampleIndex) => {
    lines.push(`  { const RecipeColor base = sampleColorJourneyBase(recipe${caseIndex}, ${sample.elapsedMs}U);`);
    sample.rgb.forEach((expected, channel) => {
      lines.push(`    nearChannel(${['base.red', 'base.green', 'base.blue'][channel]}, ${expected}, 0);`);
    });
    sample.pixels.forEach((pixel, pixelIndex) => {
      lines.push(`    const RecipeColor pixel${sampleIndex}_${pixelIndex} = sampleColorJourneyPixel(recipe${caseIndex}, recipe${caseIndex}.colorJourneyPhases[${pixelIndex}], ${sample.elapsedMs}U);`);
      pixel.forEach((expected, channel) => {
        lines.push(`    nearChannel(${[`pixel${sampleIndex}_${pixelIndex}.red`, `pixel${sampleIndex}_${pixelIndex}.green`, `pixel${sampleIndex}_${pixelIndex}.blue`][channel]}, ${expected}, ${fixture.channelTolerance});`);
      });
    });
    lines.push('  }');
  });
}
const phaseFixture = JSON.parse(readFileSync(
  resolve(root, '../../docs/fixtures/color-journey-v2-phases.json'), 'utf8'));
for (const [caseIndex, testCase] of phaseFixture.cases.entries()) {
  const name = `affine${caseIndex}`;
  lines.push(`  NativeRecipe ${name};`);
  lines.push(`  ${name}.kind = NativeRecipeKind::ColorJourney;`);
  lines.push(`  ${name}.colorJourney.version = 2;`);
  lines.push(`  ${name}.colorJourney.phaseCount = ${testCase.pixelCount};`);
  lines.push(`  ${name}.colorJourney.phaseSpanCount = ${testCase.phases.length};`);
  testCase.phases.forEach(([count, start, delta], index) => {
    lines.push(`  ${name}.colorJourneyPhaseSpans[${index}] = {${count}, ${start}, ${delta}};`);
  });
  testCase.samples.forEach(({ pixel, phase16 }) => {
    lines.push(`  assert(sampleColorJourneyPhase(${name}, ${pixel}) == ${phase16});`);
  });
}
lines.push('  return 0;', '}');

const temp = mkdtempSync(resolve(os.tmpdir(), 'lw-color-journey-'));
try {
  const source = resolve(temp, 'color-journey-samples.cpp');
  const binary = resolve(temp, 'color-journey-samples');
  writeFileSync(source, `${lines.join('\n')}\n`);
  execFileSync('c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', resolve(root, 'src'),
    resolve(root, 'src/LightweaverColorJourney.cpp'), source,
    '-o', binary,
  ], { stdio: 'inherit' });
  execFileSync(binary, { stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`color journey fixture parity passed (${fixture.cases.length} color cases + ${phaseFixture.cases.length} affine phase cases)`);

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyColorJourneyVariation,
  createColorJourneyVariations,
  createSlowColorDriftJourney,
  normalizeColorJourney,
  sampleColorJourney,
} from './colorJourney.js';

test('creates an inviting six-minute slow color drift', () => {
  const journey = createSlowColorDriftJourney();
  assert.equal(journey.stops.length, 3);
  assert.equal(journey.motionSpeedSeconds, 18);
  assert.equal(sampleColorJourney(journey, 0).durationMs, 360_000);
  assert.deepEqual(journey.stops.map(stop => stop.color), ['#f2a65a', '#6d4cc7', '#3478c9']);
});

test('holds, fades with smooth easing, and returns through the final fade', () => {
  const journey = normalizeColorJourney({
    easing: 'smooth',
    stops: [
      { id: 'warm', color: '#ff0000', holdMs: 1_000, fadeMs: 2_000 },
      { id: 'cool', color: '#0000ff', holdMs: 1_000, fadeMs: 2_000 },
    ],
  });
  assert.deepEqual(sampleColorJourney(journey, 500).rgb, [255, 0, 0]);
  assert.deepEqual(sampleColorJourney(journey, 2_000).rgb, [128, 0, 128]);
  assert.deepEqual(sampleColorJourney(journey, 4_000).rgb, [0, 0, 255]);
  assert.deepEqual(sampleColorJourney(journey, 5_000).rgb, [128, 0, 128]);
  assert.deepEqual(sampleColorJourney(journey, 6_000).rgb, [255, 0, 0]);
});

test('normalization is bounded, immutable, and preserves stop locks', () => {
  const source = { motionSpeedSeconds: 999, character: 'wild', stops: [
    { id: 'a', color: '#ABC', holdMs: -1, fadeMs: 999_999, locked: true },
    { id: 'b', color: 'invalid', holdMs: 1_000, fadeMs: 1_000 },
  ] };
  const before = structuredClone(source);
  const journey = normalizeColorJourney(source);
  assert.deepEqual(source, before);
  assert.equal(journey.motionSpeedSeconds, 90);
  assert.equal(journey.character, 'balanced');
  assert.deepEqual(journey.stops[0], { id: 'a', color: '#aabbcc', holdMs: 0, fadeMs: 600_000, locked: true });
  assert.equal(journey.stops[1].color, '#6d4cc7');
});

test('variations are deterministic, bounded, and preserve locked colors', () => {
  const recipe = {
    seed: 42,
    palette: ['#f2a65a', '#6d4cc7', '#3478c9'],
    journey: createSlowColorDriftJourney({ stops: [
      { id: 'a', color: '#f2a65a', holdMs: 30_000, fadeMs: 90_000, locked: true },
      { id: 'b', color: '#6d4cc7', holdMs: 30_000, fadeMs: 90_000 },
      { id: 'c', color: '#3478c9', holdMs: 30_000, fadeMs: 90_000 },
    ] }),
  };
  const first = createColorJourneyVariations(recipe);
  const second = createColorJourneyVariations(recipe);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map(item => item.id)).size, 3);
  for (const candidate of first) {
    assert.equal(candidate.journey.stops[0].color, '#f2a65a');
    assert.match(candidate.explanation, /same|color|movement|pace/i);
  }
  const applied = applyColorJourneyVariation(recipe, first[0]);
  assert.deepEqual(applied.palette, applied.journey.stops.map(stop => stop.color));
  assert.equal(recipe.journey.stops[1].color, '#6d4cc7');
});

test('rehearsal changes observation time without changing saved timing', () => {
  const journey = createSlowColorDriftJourney();
  const before = structuredClone(journey);
  sampleColorJourney(journey, 18_000);
  sampleColorJourney(journey, 18_000 * 12);
  assert.deepEqual(journey, before);
});

test('a non-looping journey settles on its final color', () => {
  const journey = normalizeColorJourney({ loop: false, stops: [
    { color: '#ff0000', holdMs: 1_000, fadeMs: 1_000 },
    { color: '#0000ff', holdMs: 1_000, fadeMs: 1_000 },
  ] });
  assert.deepEqual(sampleColorJourney(journey, 30_000).rgb, [0, 0, 255]);
  assert.equal(sampleColorJourney(journey, 30_000).durationMs, 3_000);
});

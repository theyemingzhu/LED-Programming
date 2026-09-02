import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleJourneyLanes, journeyMinuteTicks, formatJourneyTime } from './patternLabJourney.js';
import { sampleEvolution } from './patternLabEvolution.js';

function recipe(evolution = {}) {
  return {
    seed: 7,
    evolution: {
      enabled: true,
      character: 'slow-bloom',
      durationSeconds: 600,
      change: 0.35,
      ...evolution,
    },
  };
}

test('lanes are sampled from sampleEvolution, not a second copy of the maths', () => {
  const draft = recipe();
  const { lanes, durationSeconds } = sampleJourneyLanes(draft, { samples: 5 });
  assert.equal(durationSeconds, 600);

  // The drawing has to agree with what the preview and the bake will do, so
  // every plotted value is the engine's own number for that moment.
  const midpoint = sampleEvolution(draft, 300);
  const brightness = lanes.find(lane => lane.key === 'brightness');
  assert.equal(brightness.points[2].t, 0.5);
  assert.equal(brightness.points[2].value, midpoint.destinations.brightness);
});

test('each lane is normalised on its own range', () => {
  const { lanes } = sampleJourneyLanes(recipe(), { samples: 40 });
  for (const lane of lanes) {
    const ys = lane.points.map(point => point.y);
    assert.ok(Math.min(...ys) >= 0, `${lane.key} dips below its track`);
    assert.ok(Math.max(...ys) <= 1, `${lane.key} rises above its track`);
    // A shared scale would flatten two lanes to argue for the third; each one
    // is expected to use its whole track.
    assert.ok(Math.max(...ys) - Math.min(...ys) > 0.5, `${lane.key} barely moves`);
  }
});

test('a flat lane draws through the middle instead of dividing by zero', () => {
  // change 0 holds every destination at the bottom of its range for the whole
  // journey, which is exactly the degenerate case.
  const { lanes } = sampleJourneyLanes(recipe({ change: 0 }), { samples: 12 });
  for (const lane of lanes) {
    for (const point of lane.points) {
      assert.ok(Number.isFinite(point.y), `${lane.key} produced ${point.y}`);
      assert.equal(point.y, 0.5);
    }
  }
});

test('evolution switched off reports itself rather than drawing a journey', () => {
  const { enabled, lanes, durationSeconds } = sampleJourneyLanes(recipe({ enabled: false }));
  assert.equal(enabled, false);
  assert.equal(durationSeconds, 600);
  // Empty, not zeroed — a flat line at zero would read as a journey that does
  // nothing rather than one that is turned off.
  for (const lane of lanes) assert.deepEqual(lane.points, []);
});

test('minute ticks cover the journey and always mark its end', () => {
  const whole = journeyMinuteTicks(600);
  assert.equal(whole.length, 11);
  assert.equal(whole[0].minutes, 0);
  assert.equal(whole[whole.length - 1].t, 1);

  // 7 min 30 is not a whole number of minutes; without the closing mark the
  // strip would appear to stop at 7:00.
  const ragged = journeyMinuteTicks(450);
  assert.equal(ragged[ragged.length - 1].t, 1);
  assert.equal(ragged[ragged.length - 1].seconds, 450);
});

test('journey times read as minutes and seconds', () => {
  assert.equal(formatJourneyTime(0), '0:00');
  assert.equal(formatJourneyTime(65), '1:05');
  assert.equal(formatJourneyTime(-4), '0:00');
  assert.equal(formatJourneyTime(Number.NaN), '0:00');
});

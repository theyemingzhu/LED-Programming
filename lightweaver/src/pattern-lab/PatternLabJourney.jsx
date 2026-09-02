import { useMemo, useRef } from 'react';
import {
  sampleJourneyLanes,
  journeyMinuteTicks,
  formatJourneyTime,
} from '../lib/patternLabJourney.js';

// The journey, drawn full width under the artwork.
//
// It appears only while Evolve is the open step. That is the whole trick: the
// timeline is the reason Evolve needs width, and giving it a permanent strip
// would have cost the artwork about a third of its height for the three
// quarters of the time you are not building a journey.
//
// Dragging the lanes moves previewTime and nothing else. The strip carries no
// slider of its own — the Evolve panel's "Preview time" range opens alongside
// it and is already the keyboard route to that same value.

const LANE_HEIGHT = 34;
const LANE_PAD = 5;

function lanePath(points) {
  if (!points.length) return '';
  return points
    .map((point, index) => {
      const x = point.t * 100;
      // y arrives 0-at-the-bottom; SVG counts down from the top.
      const y = LANE_PAD + (1 - point.y) * (LANE_HEIGHT - LANE_PAD * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(3)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export default function PatternLabJourney({ recipe, previewTime, onPreviewTime }) {
  const trackRef = useRef(null);

  const journey = useMemo(
    () => (recipe ? sampleJourneyLanes(recipe) : null),
    [recipe],
  );
  const duration = journey?.durationSeconds ?? 600;
  const ticks = useMemo(() => journeyMinuteTicks(duration), [duration]);

  if (!recipe) return null;

  const position = duration > 0 ? Math.min(Math.max(previewTime, 0), duration) / duration : 0;

  function scrubFromEvent(event) {
    const track = trackRef.current;
    if (!track || typeof onPreviewTime !== 'function') return;
    const box = track.getBoundingClientRect();
    if (box.width <= 0) return;
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    onPreviewTime(Math.round(ratio * duration));
  }

  function beginScrub(event) {
    // Pointer capture keeps the drag alive when the cursor leaves the strip,
    // which it will — the lanes are 34px tall and the piece is right above.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    scrubFromEvent(event);
  }

  function continueScrub(event) {
    if (event.buttons !== 1) return;
    scrubFromEvent(event);
  }

  return (
    <section
      className="plab-journey"
      aria-label="The journey"
      data-testid="pattern-lab-journey"
      data-enabled={journey.enabled ? 'true' : 'false'}
    >
      <div className="plab-journey-head">
        <h2>The journey</h2>
        <span className="plab-journey-meta">
          {journey.enabled
            ? `${Math.round(duration / 60)} min · ${journey.character.replaceAll('-', ' ')}`
            : 'Long Evolution is off'}
        </span>
        {/* No Beginning/Middle/End here. The Evolve panel two columns away
            already carries that trio, and the strip's whole point is that you
            can put the playhead anywhere rather than at one of three places —
            a second identical set would be the same control twice on one
            screen, which is what this pass exists to remove. */}
        <output className="plab-journey-clock" data-testid="pattern-lab-journey-clock">
          {formatJourneyTime(previewTime)} / {formatJourneyTime(duration)}
        </output>
      </div>

      <div className="plab-journey-body">
        <div className="plab-journey-keys" aria-hidden="true">
          <span className="plab-journey-ruler-key" />
          {journey.lanes.map(lane => (
            <span key={lane.key} className="plab-journey-key">{lane.label}</span>
          ))}
        </div>

        <div
          className="plab-journey-track"
          ref={trackRef}
          onPointerDown={beginScrub}
          onPointerMove={continueScrub}
        >
          <div className="plab-journey-ruler">
            {ticks.map(tick => (
              <span key={tick.seconds} className="plab-journey-tick" style={{ left: `${tick.t * 100}%` }}>
                <b>{tick.minutes}</b>
              </span>
            ))}
          </div>

          {journey.lanes.map(lane => (
            <div key={lane.key} className="plab-journey-lane">
              {journey.enabled ? (
                <svg
                  viewBox={`0 0 100 ${LANE_HEIGHT}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  data-testid={`pattern-lab-journey-lane-${lane.key}`}
                >
                  <path className="plab-journey-curve" d={lanePath(lane.points)} vectorEffect="non-scaling-stroke" />
                </svg>
              ) : <span className="plab-journey-flat" aria-hidden="true" />}
            </div>
          ))}

          {/* No slider of its own. The Evolve panel's "Preview time" range is
              on screen whenever this strip is — they open together — and it
              is already the keyboard route to this exact value. A second
              range here would put two controls named "Preview time" on one
              screen, which is the duplication this pass exists to remove.
              Dragging the lanes is the pointer route; the playhead below
              follows both. */}
          <span
            className="plab-journey-head-line"
            style={{ left: `${position * 100}%` }}
            data-testid="pattern-lab-journey-playhead"
            aria-hidden="true"
          />
        </div>
      </div>

      {!journey.enabled && (
        <p className="plab-journey-off">
          Turn on Long Evolution in the Evolve panel to build a five-to-fifteen-minute journey.
        </p>
      )}
    </section>
  );
}

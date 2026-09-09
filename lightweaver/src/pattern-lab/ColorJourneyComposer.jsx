import { useRef } from 'react';
import { normalizeColorJourney } from '../lib/colorJourney.js';

const PALETTES = Object.freeze([
  { id: 'ember-sky', name: 'Ember sky', colors: ['#f2a65a', '#6d4cc7', '#3478c9'] },
  { id: 'forest-hour', name: 'Forest hour', colors: ['#d6a85f', '#2d766f', '#173f5f'] },
  { id: 'rosewater', name: 'Rosewater', colors: ['#f0a0a8', '#c46c88', '#5963a8'] },
  { id: 'low-tide', name: 'Low tide', colors: ['#66b8b1', '#287b91', '#253f72'] },
]);

function totalMinutes(journey) {
  return journey.stops.reduce((total, stop) => total + stop.holdMs + stop.fadeMs, 0) / 60_000;
}

function paceFromJourney(journey) {
  return Math.round(Math.min(100, Math.max(0, (12 - totalMinutes(journey)) * 10)));
}

function journeyAtPace(journey, pace) {
  const durationMinutes = 12 - Math.min(100, Math.max(0, Number(pace))) / 10;
  const currentMs = totalMinutes(journey) * 60_000;
  const factor = currentMs > 0 ? durationMinutes * 60_000 / currentMs : 1;
  return normalizeColorJourney({
    ...journey,
    stops: journey.stops.map(stop => ({
      ...stop,
      holdMs: Math.round(stop.holdMs * factor),
      fadeMs: Math.round(stop.fadeMs * factor),
    })),
  });
}

function ribbonStyle(colors) {
  const palette = colors.length ? [...colors, colors[0]] : ['#303030', '#303030'];
  const stops = palette.map((color, index) => `${color} ${(index / (palette.length - 1)) * 100}%`);
  return { background: `linear-gradient(90deg, ${stops.join(', ')})` };
}

export default function ColorJourneyComposer({
  recipe,
  variations = [],
  savedLooks = [],
  saveState = 'unsaved',
  hasSavedVersion = false,
  onRecipeChange,
  onStart,
  onTryVariation,
  onSelectVariation,
  onKeep,
  onSaveAsNew,
  onOpenSaved,
  onUndo,
  canUndo = false,
  rehearsal = false,
  onRehearsalChange,
  auditionStopId = null,
  onPreviewColor,
}) {
  const draggedIndex = useRef(null);
  const colorInputs = useRef([]);
  const journey = recipe?.journey ? normalizeColorJourney(recipe.journey) : null;
  const colors = journey?.stops.map(stop => stop.color) || [];
  const auditionStopIndex = journey?.stops.findIndex(stop => stop.id === auditionStopId) ?? -1;

  function updateJourney(nextJourney, intent) {
    const normalized = normalizeColorJourney(nextJourney);
    onRecipeChange?.({
      ...recipe,
      base: { kind: 'color-journey', id: 'slow-color-drift', params: {} },
      journey: normalized,
      palette: normalized.stops.map(stop => stop.color),
    }, intent);
  }

  function moveColor(from, to) {
    if (!journey || !Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || from >= journey.stops.length || to < 0 || to >= journey.stops.length) return;
    const stops = [...journey.stops];
    const [moved] = stops.splice(from, 1);
    stops.splice(to, 0, moved);
    updateJourney({ ...journey, stops });
  }

  function changeColor(index, color) {
    const previewStopId = journey.stops[index]?.id;
    updateJourney({
      ...journey,
      stops: journey.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, color } : stop),
    }, { previewStopId });
  }

  function toggleLock(index) {
    updateJourney({
      ...journey,
      stops: journey.stops.map((stop, stopIndex) => stopIndex === index
        ? { ...stop, locked: !stop.locked }
        : stop),
    });
  }

  function choosePalette(palette) {
    updateJourney({
      ...journey,
      stops: journey.stops.map((stop, index) => stop.locked
        ? stop
        : { ...stop, color: palette.colors[index % palette.colors.length] }),
    });
  }

  if (!journey) {
    return (
      <section className="plab-creative plab-creative-welcome" aria-labelledby="plab-creative-heading">
        <p className="plab-creative-kicker">A starting point, ready to play</p>
        <h2 id="plab-creative-heading">Let color wander through the piece</h2>
        <p>Warm amber eases into violet and blue, then returns without a jump. Change anything when it catches your eye.</p>
        <button type="button" className="plab-composition-start" onClick={onStart}>Slow color drift</button>
      </section>
    );
  }

  return (
    <section className="plab-creative" aria-labelledby="plab-creative-heading">
      <div className="plab-creative-intro">
        <div>
          <button type="button" className="plab-creative-kicker plab-composition-reset" onClick={onStart}>Slow color drift</button>
          <h2 id="plab-creative-heading">Shape the color journey</h2>
        </div>
        <span
          className={`plab-creative-save-state is-${saveState}`}
          data-testid="color-journey-save-state"
          role="status"
          aria-live="polite"
        >{saveState === 'saved' ? 'Saved in this browser' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Could not save' : 'Unsaved changes'}</span>
      </div>

      <div className="plab-color-stage">
        <div className="plab-color-ribbon" data-testid="color-journey-ribbon" style={ribbonStyle(colors)}>
          {journey.stops.map((stop, index) => (
            <div className="plab-color-stop-wrap" key={stop.id} style={{ left: `${((index + .5) / journey.stops.length) * 100}%` }}>
              <button
                type="button"
                className={`plab-color-stop${stop.locked ? ' is-locked' : ''}`}
                style={{ '--stop-color': stop.color }}
                draggable
                data-color={stop.color}
                data-color-index={index}
                aria-label={`Color ${index + 1}: ${stop.color}. Drag to reorder.`}
                onClick={() => {
                  onPreviewColor?.(stop.id);
                  colorInputs.current[index]?.click();
                }}
                onDragStart={() => { draggedIndex.current = index; }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  moveColor(draggedIndex.current, index);
                  draggedIndex.current = null;
                }}
              ><span aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <div className="plab-color-stops">
          {journey.stops.map((stop, index) => (
            <div className="plab-color-editor" key={stop.id}>
              <label>
                <span>Color {index + 1}</span>
                <input
                  ref={node => { colorInputs.current[index] = node; }}
                  type="color"
                  value={stop.color}
                  aria-label={`Choose color ${index + 1}`}
                  onClick={() => onPreviewColor?.(stop.id)}
                  onChange={event => changeColor(index, event.target.value)}
                />
              </label>
              <div className="plab-color-order" role="group" aria-label={`Move color ${index + 1}`}>
                <button type="button" disabled={index === 0} aria-label={`Move color ${index + 1} left`} onClick={() => moveColor(index, index - 1)}>←</button>
                <button type="button" disabled={index === journey.stops.length - 1} aria-label={`Move color ${index + 1} right`} onClick={() => moveColor(index, index + 1)}>→</button>
                <button type="button" className={stop.locked ? 'is-locked' : ''} aria-pressed={Boolean(stop.locked)} aria-label={`${stop.locked ? 'Unlock' : 'Lock'} color ${index + 1}`} onClick={() => toggleLock(index)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {auditionStopIndex >= 0 && (
        <p className="plab-studio-live-note" role="status">Holding color {auditionStopIndex + 1} · Resume journey to continue</p>
      )}

      <div className="plab-palette-choices" role="group" aria-label="Color combinations">
        {PALETTES.map(palette => (
          <button type="button" key={palette.id} onClick={() => choosePalette(palette)}>
            <span style={ribbonStyle(palette.colors)} aria-hidden="true" />
            <b>{palette.name}</b>
          </button>
        ))}
      </div>

      <div className="plab-creative-dials">
        <label className="plab-pace-control">
          <span><b>Pace</b><small>{totalMinutes(journey).toFixed(totalMinutes(journey) % 1 ? 1 : 0)} minute loop</small></span>
          <input type="range" min="0" max="100" value={paceFromJourney(journey)} aria-label="Pace" onChange={event => updateJourney(journeyAtPace(journey, event.target.value))} />
          <span className="plab-range-ends" aria-hidden="true"><small>Slow</small><small>Lively</small></span>
        </label>
        <fieldset className="plab-character-control">
          <legend>Character</legend>
          <div>
            {['restrained', 'balanced', 'expressive'].map(character => (
              <button type="button" key={character} className={journey.character === character ? 'is-selected' : ''} aria-pressed={journey.character === character} onClick={() => updateJourney({ ...journey, character })}>
                {character[0].toUpperCase() + character.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="plab-arc-overview" aria-label="Journey overview">
        <span><i style={{ background: colors[0] }} />Beginning</span>
        <span><i style={{ background: colors[Math.floor(colors.length / 2)] }} />Later</span>
        <span><i style={{ background: colors[0] }} />Return</span>
      </div>
      <button type="button" className="plab-rehearsal" aria-pressed={rehearsal} onClick={() => onRehearsalChange?.(!rehearsal)}>
        {rehearsal ? 'Quick rehearsal on · saved timing unchanged' : 'Quick rehearsal'}
      </button>
      <p className="plab-studio-live-note">Live from Studio · keep this tab open for the piece to follow the journey.</p>

      <div className="plab-variation-actions">
        <button type="button" className="plab-variation-trigger" onClick={onTryVariation}>Try a variation</button>
        {canUndo && <button type="button" className="plab-creative-undo" onClick={onUndo}>Undo</button>}
      </div>
      {variations.length > 0 && (
        <div className="plab-variations" aria-label="Related variations">
          {variations.map((candidate, index) => (
            <button
              type="button"
              key={candidate.id}
              data-testid="color-journey-variation"
              aria-label={`Choose variation ${index + 1}`}
              onClick={() => onSelectVariation?.(candidate)}
            >
              <span className="plab-variation-ribbon" style={ribbonStyle(candidate.journey.stops.map(stop => stop.color))} aria-hidden="true" />
              <b>Variation {index + 1}</b>
              <small>{candidate.explanation}</small>
            </button>
          ))}
        </div>
      )}

      <div className="plab-keep-row">
        <button type="button" className="plab-keep-look" onClick={onKeep}>{hasSavedVersion ? `Update ${recipe.name}` : 'Keep this look'}</button>
        {hasSavedVersion && <button type="button" className="plab-save-copy" onClick={onSaveAsNew}>Save as new</button>}
      </div>
      {savedLooks.length > 0 && (
        <div className="plab-kept-looks" aria-label="Kept looks">
          <span>Kept looks</span>
          <div>
            {savedLooks.map(saved => (
              <button type="button" key={saved.id} className={saved.id === recipe.id ? 'is-open' : ''} onClick={() => onOpenSaved?.(saved)}>
                <i style={ribbonStyle(saved.journey.stops.map(stop => stop.color))} aria-hidden="true" />
                <b>{saved.name}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <details className="plab-journey-details">
        <summary>Journey timing</summary>
        <div>
          {journey.stops.map((stop, index) => (
            <div key={stop.id}>
              <span style={{ background: stop.color }} aria-hidden="true" />
              <b>Color {index + 1}</b>
              <label>Hold <input type="number" min="0" max="600" value={Math.round(stop.holdMs / 1000)} onChange={event => updateJourney({ ...journey, stops: journey.stops.map((item, itemIndex) => itemIndex === index ? { ...item, holdMs: Number(event.target.value) * 1000 } : item) })} /> sec</label>
              <label>Fade <input type="number" min="1" max="600" value={Math.round(stop.fadeMs / 1000)} onChange={event => updateJourney({ ...journey, stops: journey.stops.map((item, itemIndex) => itemIndex === index ? { ...item, fadeMs: Number(event.target.value) * 1000 } : item) })} /> sec</label>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

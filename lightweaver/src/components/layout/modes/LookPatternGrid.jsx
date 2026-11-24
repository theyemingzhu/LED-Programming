import { useMemo, useState } from 'react';
import { REAL_PATTERNS } from '../../../v3/v3-data.js';
import { PATTERN_CATS } from '../../../v3/lw-shared.jsx';
import { hasPattern } from '../../../lib/lookEngine/index.js';
import '../look-designer.css';

const MOODS = PATTERN_CATS.filter(cat => cat.id !== 'mix');
const FIRST = 12;
// The same list, order, names and swatches as Patterns & Looks (v3-data.js),
// read-only. A pattern the engine cannot play is left out so a tile never
// picks nothing.
export const GRID_PATTERNS = REAL_PATTERNS.filter(pattern => hasPattern(pattern.id));

/**
 * A picture grid of the project's patterns: mood chips, 12 tiles, Show more.
 * The chosen tile is outlined. `value` is a pattern id or '' for the look's colours.
 */
export function LookPatternGrid({ value, onPick }) {
  const [mood, setMood] = useState('all');
  const [more, setMore] = useState(false);
  const list = useMemo(() => GRID_PATTERNS.filter(pattern => mood === 'all' || pattern.cat === mood), [mood]);
  const shown = more ? list : list.slice(0, FIRST);
  const chosen = GRID_PATTERNS.find(pattern => pattern.id === value);
  return (
    <div className="ld-grid" data-testid="look-designer-grid">
      <div className="ld-grid-head">
        <span className="la-symmetry-k" id="ld-pattern-label">Pattern</span>
        <span className="ld-chosen" data-testid="look-designer-pattern-name">{chosen ? chosen.label : 'The colours of the look'}</span>
      </div>
      <div className="ld-chips" role="group" aria-label="Mood">
        {MOODS.map(entry => (
          <button key={entry.id} type="button" className="btn" aria-pressed={mood === entry.id} data-testid={`look-designer-mood-${entry.id}`}
                  onClick={() => { setMood(entry.id); setMore(false); }}>{entry.label}</button>
        ))}
      </div>
      <div className="ld-tiles-grid" role="group" aria-labelledby="ld-pattern-label">
        <button type="button" className="ld-ptile ld-ptile-plain" aria-pressed={!chosen} aria-label="The colours of the look"
                data-testid="look-designer-pattern-none" onClick={() => onPick('')}>
          <span className="ld-swatch ld-swatch-plain"/>
          <span className="ld-pname">The look's colours</span>
        </button>
        {shown.map(pattern => (
          <button key={pattern.id} type="button" className="ld-ptile" aria-pressed={pattern.id === value} aria-label={pattern.label}
                  data-testid={`look-designer-pattern-${pattern.id}`} onClick={() => onPick(pattern.id)}>
            <span className="ld-swatch" style={{ background: pattern.grad }}/>
            <span className="ld-pname">{pattern.label}</span>
          </button>
        ))}
      </div>
      {list.length > FIRST && (
        <button type="button" className="btn ld-more" data-testid="look-designer-pattern-more" onClick={() => setMore(!more)}>
          {more ? 'Show fewer' : `Show more (${list.length - FIRST})`}
        </button>
      )}
    </div>
  );
}

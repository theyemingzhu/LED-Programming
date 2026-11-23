import { useEffect, useMemo, useRef, useState } from 'react';
import {
  JOURNEYS, MOTIONS, applyBend, buildPieceModel, getMotion, nudgeLook, normalizeLook, randomLook,
  readBend, hasPattern, lookUsesJourney, patternChoices, thumbnailBytes, thumbnailSpots, seededRng, setArea, setPiece, startingLooks,
} from '../../../lib/lookEngine/index.js';
import { stripsBoundsCentre } from '../../../lib/mirrorPartners.js';
import { suggestSymmetry } from '../../../lib/symmetrySuggest.js';
import { setPlacedLookPreview, usePlacedLookPreview } from '../canvas/mirrorEcho.js';
import { setLookDesigner, useLookDesigner } from '../canvas/lookDesignerStore.js';
import { GRID_PATTERNS, LookPatternGrid } from './LookPatternGrid.jsx';
import { LookPin, PIN_HEIGHT } from './LookPin.jsx';
import { KeptLooks, LookKeep } from './LookKeep.jsx';
import { restoreDesignedLook } from '../../../lib/designedLooks.js';
import '../look-designer.css';

const STILL_SECONDS = 2.6;
const TILE_SIZE = 120;

// Choices read by the drawer. Adding a travel direction or a speed is a line here.
export const DIRECTION_CHOICES = [['forward', 'Forward'], ['backward', 'Backward'], ['bounce', 'Back and forth']];
export const SPEED_CHOICES = [[0.5, 'Half'], [1, 'Same'], [2, 'Double']];
export const COPIES_CHOICES = [['together', 'Together'], ['after', 'One after another'], ['other', 'Every other']];

// Patterns the starting points and "More like this" draw from: well-known ones
// that exist in this project, else the first few of the library.
const FAVOURITES = ['aurora', 'lava', 'fire', 'plasma', 'ocean', 'rainbow', 'wave'];
const offered = () => {
  const liked = FAVOURITES.filter(hasPattern);
  return liked.length >= 3 ? liked : patternChoices().slice(0, 6).map(choice => choice.id);
};

const newRng = () => seededRng((Math.random() * 2 ** 31) >>> 0);
const reduced = () => {
  try { return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};

function Dial({ id, label, low, high, min, max, step = 1, value, onChange }) {
  return (
    <label className="ld-dial" htmlFor={id}>
      <span>{low ?? label}</span>
      <input id={id} data-testid={id} type="range" min={min} max={max} step={step} value={value} aria-label={label}
             onChange={event => onChange(Number(event.target.value))}/>
      <span>{high ?? ''}</span>
    </label>
  );
}

export const AREA_NAME_MAX = 24;

// The chosen area's name, editable where it is shown. Enter or leaving keeps
// it, Escape puts the old one back, empty puts the default back.
function AreaName({ name, fallback, onCommit }) {
  const [draft, setDraft] = useState(name);
  const skip = useRef(false);
  return (
    <input className="ld-name" data-testid="look-designer-name" type="text" value={draft} maxLength={AREA_NAME_MAX}
           aria-label="Name of this shape" spellCheck={false}
           onChange={event => setDraft(event.target.value)}
           onKeyDown={event => {
             if (event.key === 'Enter') event.currentTarget.blur();
             if (event.key === 'Escape') { skip.current = true; setDraft(name); event.currentTarget.blur(); }
           }}
           onBlur={() => {
             if (skip.current) { skip.current = false; return; }
             const next = draft.trim().slice(0, AREA_NAME_MAX);
             setDraft(next || fallback);
             onCommit(next && next !== fallback ? next : null);
           }}/>
  );
}

function Segment({ label, id, choices, value, onPick, testId }) {
  return (
    <div className="ld-field">
      <span className="la-symmetry-k" id={id}>{label}</span>
      <div className="ld-seg" role="group" aria-labelledby={id}>
        {choices.map(([key, text]) => (
          <button key={String(key)} type="button" className="btn" aria-pressed={String(value) === String(key)}
                  data-testid={`${testId}-${key}`} onClick={() => onPick(key)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

// Six small live pictures of the owner's own piece. Drawn from the real strips'
// positions and coloured by the engine from the piece map, two per frame so
// seven moving pictures stay cheap. Reduced motion: one still frame each.
function LookThumbs({ tiles, chosen, model, onPick }) {
  const canvases = useRef([]);
  const spots = useMemo(() => thumbnailSpots(model, TILE_SIZE, 10), [model]);
  useEffect(() => {
    const draw = (index, t) => {
      const canvas = canvases.current[index];
      const tile = tiles[index];
      const ctx = canvas?.getContext?.('2d');
      if (!ctx || !tile) return;
      // Thumbnails stand in for a pattern with its swatch colours; the canvas shows the real one.
      const bytes = thumbnailBytes(tile.look, model, t);
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      spots.forEach((spot, led) => {
        if (!spot) return;
        ctx.fillStyle = `rgb(${Math.max(bytes[led * 3], 30)},${Math.max(bytes[led * 3 + 1], 30)},${Math.max(bytes[led * 3 + 2], 28)})`;
        ctx.beginPath(); ctx.arc(spot.x, spot.y, 1.8, 0, 7); ctx.fill();
      });
    };
    if (reduced()) { tiles.forEach((_, i) => draw(i, STILL_SECONDS)); return undefined; }
    const times = tiles.map((_, i) => 1.2 + i * 0.9);
    let frame = 0; let last = performance.now(); let turn = 0;
    const tick = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      for (let k = 0; k < 2; k += 1) {
        const i = (turn + k) % Math.max(1, tiles.length);
        times[i] += dt * 3; draw(i, times[i]);
      }
      turn += 2;
      frame = requestAnimationFrame(tick);
    };
    tiles.forEach((_, i) => draw(i, times[i]));
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tiles, model, spots]);
  return (
    <div className="ld-tiles" data-testid="look-designer-tiles">
      {tiles.map((tile, index) => (
        <button key={`${tile.id}-${index}`} type="button" aria-pressed={chosen === index} aria-label={tile.label}
                data-testid={`look-designer-tile-${index}`} onClick={() => onPick(index)}>
          <canvas ref={node => { canvases.current[index] = node; }} width={TILE_SIZE} height={TILE_SIZE}/>
        </button>
      ))}
    </div>
  );
}

// The look designer sits beside Placed look in the strip list: one more way to
// try a look on the artwork, never a screen of its own. Four depths: pick,
// bend, touch (on the canvas), and "Tune it yourself". Nothing here is saved.
export function LookDesignerControl({ strips, hidden = {}, symmetry = null, artworkCentre = null }) {
  const state = useLookDesigner();
  const placed = usePlacedLookPreview();
  const { look, model, tiles, chosen } = state;
  const on = Boolean(look);
  const shown = useMemo(() => strips.filter(strip => !hidden[strip.id]), [strips, hidden]);
  const fold = symmetry?.fold || 0;
  // The piece's centre: the symmetry's own turning centre when it has one.
  const findCentre = () => {
    if (symmetry) {
      const eligible = shown.filter(strip => strip.kaleidoscope?.enabled !== true);
      const found = suggestSymmetry(eligible, symmetry.fold, artworkCentre ? { centre: artworkCentre } : null)?.centre;
      if (found) return found;
    }
    return stripsBoundsCentre(shown);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const centre = useMemo(() => (on ? findCentre() : null), [on, symmetry, shown, artworkCentre]);
  const built = useMemo(() => (on ? buildPieceModel(shown, { fold, centre }) : null), [on, shown, fold, centre]);

  // Keep the canvas's copy of the piece current as strips change, and give any
  // new area a record.
  useEffect(() => {
    if (!built) return;
    const current = look;
    const ids = built.derived.areas.map(area => area.id);
    const missing = ids.some(id => !current.areas[id]);
    const selected = ids.includes(state.selected) ? state.selected : (ids[0] ?? null);
    setLookDesigner({ model: built, selected, ...(missing ? { look: normalizeLook(current, { areaIds: ids }) } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);
  // The placed look and this one both colour the LEDs: the later one wins.
  useEffect(() => { if (placed && on) setLookDesigner(null); }, [placed, on]);

  const turnOn = () => {
    if (on) return;
    const first = buildPieceModel(shown, { fold, centre: findCentre() });
    const offers = startingLooks(first.derived.areas, { patterns: offered() });
    setPlacedLookPreview(null);
    setLookDesigner({ look: offers[0].look, model: first, tiles: offers, chosen: 0, selected: first.derived.areas[0]?.id ?? null, tuneOpen: false, say: '' });
  };
  const edit = next => setLookDesigner({ look: next, chosen: -1 });
  // Open a kept look on the piece as it is now. Areas that no longer match start plain, and it says so.
  const openKept = record => {
    const live = model || buildPieceModel(shown, { fold, centre: findCentre() });
    const restored = restoreDesignedLook(record, live);
    setPlacedLookPreview(null);
    setLookDesigner({
      look: restored.look, model: live, names: restored.names, tiles: tiles.length ? tiles : startingLooks(live.derived.areas, { patterns: offered() }),
      chosen: -1, selected: live.derived.areas[0]?.id ?? null, tuneOpen: false, openKeptId: record.id,
      say: restored.unmatched.length
        ? `Opened "${record.name}". ${restored.unmatched.length === 1 ? 'One shape' : `${restored.unmatched.length} shapes`} changed since you kept it and start plain.`
        : `Opened "${record.name}".`,
      keepSay: '',
    });
  };
  const ids = model ? model.derived.areas.map(area => area.id) : [];
  const sel = state.selected && ids.includes(state.selected) ? state.selected : ids[0];
  const rec = look && sel ? look.areas[sel] : null;
  const motion = rec ? getMotion(rec.motion.type) : null;
  const selDefault = model && sel ? model.names[ids.indexOf(sel)] : '';
  const selName = (sel && state.names[sel]) || selDefault;
  const bend = look ? readBend(look) : null;
  // The colour row colours only the shapes that take the look's colours; with every shape on a pattern it would do nothing.
  const journeyUsed = look && model ? lookUsesJourney(look, ids) : true;
  const areaEdit = patch => edit(setArea(look, sel, patch));

  // THE PINNED STRIP. It shows only while the thing it stands in for is out of
  // view: the area chips (scrolled out of the inspector) or the canvas
  // (scrolled out of the window). The scroll container is the inspector,
  // `.side`; the strip is sticky inside it, just under the sticky mode bar.
  const [pinned, setPinned] = useState(false);
  const [navHeight, setNavHeight] = useState(0);
  const wrapRef = useRef(null);
  useEffect(() => {
    const side = wrapRef.current?.closest('.side');
    const nav = side?.querySelector('.la-mode-nav');
    if (!on || !state.tuneOpen || !side) { setPinned(false); return undefined; }
    const measure = () => setNavHeight(Math.round(nav ? nav.getBoundingClientRect().height : 0));
    measure();
    const resize = typeof ResizeObserver === 'function' && nav ? new ResizeObserver(measure) : null;
    resize?.observe(nav);
    return () => { resize?.disconnect(); };
  }, [on, state.tuneOpen]);
  useEffect(() => {
    const wrap = wrapRef.current;
    const side = wrap?.closest('.side');
    const chips = document.querySelector('[data-testid="look-designer-chips"]');
    const stage = document.querySelector('.la .lw-viewport');
    if (!on || !state.tuneOpen || !side || !chips || typeof IntersectionObserver !== 'function') { setPinned(false); return undefined; }
    wrap.style.setProperty('--ld-pin-top', `${navHeight}px`);
    // A focused control or a tapped tile is never left under the strip.
    side.style.scrollPaddingTop = `${navHeight + PIN_HEIGHT}px`;
    const seen = { chips: true, stage: true };
    const update = () => setPinned(!seen.chips || !seen.stage);
    // The chips count as in view only below the mode bar and the strip.
    const watchChips = new IntersectionObserver(([entry]) => { seen.chips = entry.isIntersecting; update(); },
      { root: side, rootMargin: `-${navHeight + PIN_HEIGHT}px 0px 0px 0px` });
    watchChips.observe(chips);
    const watchStage = stage ? new IntersectionObserver(([entry]) => { seen.stage = entry.intersectionRatio >= 0.35; update(); }, { threshold: [0, 0.35, 1] }) : null;
    if (stage) watchStage.observe(stage);
    return () => { watchChips.disconnect(); watchStage?.disconnect(); side.style.scrollPaddingTop = ''; setPinned(false); };
  }, [on, state.tuneOpen, navHeight, sel]);
  const jumpToChips = () => {
    const chips = document.querySelector('[data-testid="look-designer-chips"]');
    chips?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    chips?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  };


  return (
    <section className="la-placed ld" data-testid="layout-look-designer" aria-label="Look designer">
      <span className="la-symmetry-k" id="layout-look-designer-label">Look designer</span>
      <div className="la-symmetry-seg is-pair" role="group" aria-labelledby="layout-look-designer-label">
        <button type="button" className="btn" aria-pressed={!on} data-testid="look-designer-off"
                onClick={() => setLookDesigner(null)}>None</button>
        <button type="button" className="btn" aria-pressed={on} data-testid="look-designer-on" onClick={turnOn}>Design a look</button>
      </div>
      {!on && <p className="la-symmetry-note">Six living versions of your own piece to pick from, then bend, then touch. A try-out for now.</p>}
      <KeptLooks onOpen={openKept}/>
      {on && model && (
        <div className="ld-body">
          <p className="la-symmetry-note" data-testid="look-designer-session-note">
            Changes here are a try-out until you keep the look.
          </p>
          <p className="la-symmetry-note" data-testid="look-designer-card-note">
            It plays in Studio only until a card update: the card cannot play it yet.
          </p>

          <div className="ld-field">
            <span className="la-symmetry-k">Pick</span>
            <LookThumbs tiles={tiles} chosen={chosen} model={model}
                        onPick={index => setLookDesigner({ look: tiles[index].look, chosen: index, say: `${tiles[index].label}.` })}/>
            <div className="ld-pair">
              <button type="button" className="btn" data-testid="look-designer-more"
                      onClick={() => {
                        const rng = newRng();
                        const base = { id: 'this', label: 'This one', look };
                        setLookDesigner({ tiles: [base, ...Array.from({ length: 5 }, (_, i) => ({ id: `near-${i}`, label: `Close cousin ${i + 1}`, look: nudgeLook(look, rng, { patterns: offered() }) }))], chosen: 0, say: 'Five close cousins of this one.' });
                      }}>More like this</button>
              <button type="button" className="btn" data-testid="look-designer-fresh"
                      onClick={() => {
                        const rng = newRng();
                        setLookDesigner({ tiles: Array.from({ length: 6 }, (_, i) => ({ id: `new-${i}`, label: `New look ${i + 1}`, look: randomLook(model.derived.areas, rng, { patterns: offered() }) })), chosen: -1, say: 'Six new ones. Yours is still playing.' });
                      }}>Something else</button>
            </div>
          </div>

          <div className="ld-field">
            <span className="la-symmetry-k">Bend</span>
            <Dial id="look-designer-pace" label="Calm to lively" low="Calm" high="Lively" min={0} max={100} value={bend.pace}
                  onChange={value => edit(applyBend(look, 'pace', value))}/>
            <Dial id="look-designer-spread" label="As one to rippling" low="As one" high="Rippling" min={0} max={100} value={bend.spread}
                  onChange={value => edit(applyBend(look, 'spread', value))}/>
            <Dial id="look-designer-glow" label="Dark to glowing" low="Dark" high="Glowing" min={0} max={100} value={bend.glow}
                  onChange={value => edit(applyBend(look, 'glow', value))}/>
            <div className="ld-journeys" role="group" aria-label="Colour journey">
              {JOURNEYS.map(journey => (
                <button key={journey.id} type="button" aria-pressed={look.journey === journey.id} aria-label={journey.label} title={journey.label}
                        data-testid={`look-designer-journey-${journey.id}`} disabled={!journeyUsed}
                        style={{ background: `linear-gradient(90deg, ${journey.colours.map(c => `rgb(${c})`).join(', ')})` }}
                        onClick={() => edit({ ...look, journey: journey.id })}/>
              ))}
            </div>
            {!journeyUsed && (
              <p className="la-symmetry-note" data-testid="look-designer-journey-note">
                These colours apply to shapes set to "The look's colours". Every shape plays a pattern now.
              </p>
            )}
          </div>

          <p className="la-symmetry-note" role="status" data-testid="look-designer-say">
            {state.say || 'Tap a shape on the artwork to change its pattern. Drag across shapes to set the order they play in.'}
          </p>

          <LookKeep model={model} fold={fold}/>

          <details className="ld-tune" data-testid="look-designer-tune" open={state.tuneOpen}
                   onToggle={event => { if (event.currentTarget.open !== state.tuneOpen) setLookDesigner({ tuneOpen: event.currentTarget.open }); }}>
            <summary>Tune it yourself</summary>
            <div className="ld-pinwrap" ref={wrapRef}>
              {pinned && rec && (
                <LookPin look={look} model={model} areaIndex={ids.indexOf(sel)} areaName={selName}
                         copies={model.derived.areas[ids.indexOf(sel)].copies.length}
                         patternName={rec.source.kind === 'pattern' ? (GRID_PATTERNS.find(p => p.id === rec.source.id)?.label || rec.source.id) : 'The colours of the look'}
                         onJump={jumpToChips}/>
              )}
            </div>
            {rec && (
              <div className="ld-tunebody">
                <div className="ld-chips" role="group" aria-label="Which shape" data-testid="look-designer-chips">
                  {model.derived.areas.map((area, index) => (
                    <button key={area.id} type="button" className="btn" aria-pressed={area.id === sel} data-testid={`look-designer-chip-${index}`}
                            onClick={() => setLookDesigner({ selected: area.id })}>
                      {state.names[area.id] || model.names[index]}
                      <span className="ld-count" aria-label={`${area.copies.length} ${area.copies.length === 1 ? 'copy' : 'copies'}`}>{area.copies.length}</span>
                    </button>
                  ))}
                </div>
                <AreaName key={`${sel}:${selName}`} name={selName} fallback={selDefault}
                          onCommit={next => {
                            const names = { ...state.names };
                            if (next) names[sel] = next; else delete names[sel];
                            setLookDesigner({ names });
                          }}/>
                <LookPatternGrid value={rec.source.kind === 'pattern' ? rec.source.id : ''}
                                 onPick={id => areaEdit({ source: id ? { kind: 'pattern', id } : { kind: 'journey' } })}/>
                <div className="ld-field">
                  <span className="la-symmetry-k" id="ld-plays">It shows as</span>
                  <div className="ld-seg is-two" role="group" aria-labelledby="ld-plays" data-testid="look-designer-motions">
                    {MOTIONS.map(entry => (
                      <button key={entry.id} type="button" className="btn" aria-pressed={entry.id === rec.motion.type}
                              data-testid={`look-designer-motion-${entry.id}`}
                              onClick={() => areaEdit({ motion: { type: entry.id, params: {} } })}>{entry.label}</button>
                    ))}
                  </div>
                  {motion.params.map(spec => (
                    <Dial key={spec.id} id={`look-designer-param-${spec.id}`} label={spec.label} low={spec.label} min={0} max={100}
                          value={Math.round((rec.motion.params[spec.id] - spec.min) / (spec.max - spec.min) * 100)}
                          onChange={value => areaEdit({ motion: { type: motion.id, params: { ...rec.motion.params, [spec.id]: spec.min + value / 100 * (spec.max - spec.min) } } })}/>
                  ))}
                </div>
                <Segment label="Its copies play" id="ld-copies" testId="look-designer-copies" choices={COPIES_CHOICES} value={rec.copies}
                         onPick={value => areaEdit({ copies: value })}/>
                <div className="ld-field">
                  <span className="la-symmetry-k">It begins</span>
                  <Dial id="look-designer-begins" label="When this shape begins" low="First" high="Last" min={0} max={90}
                        value={Math.round(rec.begins * 100)} onChange={value => areaEdit({ begins: value / 100 })}/>
                </div>
                <Segment label="Direction" id="ld-direction" testId="look-designer-direction" choices={DIRECTION_CHOICES} value={rec.direction}
                         onPick={value => areaEdit({ direction: value })}/>
                <Segment label="Speed" id="ld-speed" testId="look-designer-speed" choices={SPEED_CHOICES} value={rec.speed}
                         onPick={value => areaEdit({ speed: Number(value) })}/>
                <div className="ld-field">
                  <Dial id="look-designer-smoothness" label="Smoothness" low="Smoothness" min={0} max={100} value={Math.round(rec.smoothness * 100)}
                        onChange={value => areaEdit({ smoothness: value / 100 })}/>
                  <Dial id="look-designer-fade" label="Fade in and out" low="Fade in and out" min={0} max={100} value={Math.round(rec.fade * 100)}
                        onChange={value => areaEdit({ fade: value / 100 })}/>
                  <Dial id="look-designer-breathe" label="Breathe" low="Breathe" min={0} max={100} value={Math.round(rec.breathe * 100)}
                        onChange={value => areaEdit({ breathe: value / 100 })}/>
                </div>
                <div className="ld-field">
                  <span className="la-symmetry-k" id="ld-piece">The whole piece</span>
                  <div className="ld-seg is-two" role="group" aria-labelledby="ld-piece">
                    <button type="button" className="btn" aria-pressed={look.piece.takeTurns} data-testid="look-designer-takeTurns"
                            onClick={() => edit(setPiece(look, { takeTurns: !look.piece.takeTurns }))}>Take turns</button>
                    <button type="button" className="btn" aria-pressed={look.piece.petalByPetal} data-testid="look-designer-petalByPetal"
                            onClick={() => edit(setPiece(look, { petalByPetal: !look.piece.petalByPetal }))}>Petal by petal</button>
                  </div>
                  <Dial id="look-designer-breath" label="How long one breath lasts" low={`One breath lasts ${look.breath.toFixed(1)} seconds`}
                        min={3} max={16} step={0.5} value={look.breath} onChange={value => edit(normalizeLook({ ...look, breath: value }))}/>
                </div>
              </div>
            )}
          </details>
        </div>
      )}
    </section>
  );
}

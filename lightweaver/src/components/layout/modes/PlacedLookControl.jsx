import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PLACED_LOOK_MAX_BYTES,
  PLACED_LOOK_PALETTES,
  estimatePlacedLookBake,
  normalizePlacedLook,
  placedLookOnCentre,
} from '../../../lib/placedLook.js';
import { stripsBoundsCentre } from '../../../lib/mirrorPartners.js';
import { suggestSymmetry } from '../../../lib/symmetrySuggest.js';
import { setPlacedLookPreview, setPlacedLookSavedAs, usePlacedLookPreview, usePlacedLookSavedAs, useSymmetryFocus } from '../canvas/mirrorEcho.js';
import { recordPlacedLook } from '../../../lib/placedLookRecording.js';
import { applyRecordedSequenceAsset, createRecordedSequenceAsset } from '../../../lib/recordedSequenceAsset.js';
import { useProject } from '../../../state/ProjectContext.jsx';
import '../placed-look.css';

const RECORD_SECONDS = 20;
const PALETTE_NAMES = { ember: 'Ember', tide: 'Tide', moss: 'Moss' };
const megabytes = bytes => (bytes < 10486 ? 'under 0.01' : (bytes / (1024 * 1024)).toFixed(2));
const seconds = value => (Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1));
const LIMIT_MB = PLACED_LOOK_MAX_BYTES / (1024 * 1024);
const sameColours = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What recording the look came to, in plain words. Nothing is sent anywhere.
function checkLook(look, compiledWiring, symmetry) {
  if (!compiledWiring?.ok) {
    return { state: 'blocked', text: 'Finish the wiring in Wire first: a recording follows the order the lights are wired in.' };
  }
  try {
    const options = { seconds: RECORD_SECONDS, symmetry };
    const estimate = estimatePlacedLookBake(look, compiledWiring, options);
    const lights = `${estimate.pixelCount} light${estimate.pixelCount === 1 ? '' : 's'}`;
    if (!estimate.fits) {
      return {
        state: 'over', bytes: estimate.totalBytes,
        text: `A ${seconds(estimate.seconds)} second loop for these ${lights} would be ${megabytes(estimate.totalBytes)} MB, over the ${LIMIT_MB} MB a look can be. A faster look loops sooner and takes less room.`,
      };
    }
    const length = estimate.frameCount === 1
      ? `This look does not move, so one picture is enough for these ${lights}`
      : `A ${seconds(estimate.seconds)} second loop for these ${lights}`;
    return { state: 'fits', length };
  } catch (error) {
    return { state: 'blocked', text: error?.message || 'This look could not be recorded.' };
  }
}

function nextLookName(assets = []) {
  const used = new Set((assets || []).map(asset => asset?.label));
  for (let index = 1; ; index += 1) {
    const name = `Placed look ${index}`;
    if (!used.has(name)) return name;
  }
}

function Dial({ id, label, min, max, step = 1, value, onChange }) {
  return (
    <label className="la-placed-dial" htmlFor={id}>
      <span>{label}</span>
      <input id={id} data-testid={id} type="range" min={min} max={max} step={step} value={value}
             onChange={event => onChange(Number(event.target.value))}/>
    </label>
  );
}

// A placed look sits under Symmetry in the strip list: one more thing about
// how the piece plays, not a screen of its own. Turning it on puts a frame on
// the artwork; the dials here and the frame there edit the same look.
export function PlacedLookControl({ strips, hidden = {}, symmetry = null, compiledWiring = null, artworkCentre = null }) {
  const look = usePlacedLookPreview();
  const symmetryFocus = useSymmetryFocus();
  const { standaloneController, setStandaloneController } = useProject();
  const [recording, setRecording] = useState(null);
  const recordedFor = useRef(null);
  // The recording this try-out was last saved as (or opened from): saving
  // again updates it.
  const savedAs = usePlacedLookSavedAs();
  const shown = useMemo(() => strips.filter(strip => !hidden[strip.id]), [strips, hidden]);
  const set = patch => setPlacedLookPreview(normalizePlacedLook({ ...look, ...patch }));
  // A recording is of one exact look: any change makes it out of date.
  useEffect(() => {
    if (recording?.state === 'saved' && recordedFor.current !== look) {
      setRecording(look ? { state: 'stale', text: `Changed since you saved “${savedAs?.label}”. Save again to update it.` } : null);
    }
    if (!look && recording) setRecording(null);
  }, [look, recording, savedAs]);
  const centre = () => {
    if (symmetryFocus?.centre) return symmetryFocus.centre;
    if (symmetry) {
      const eligible = shown.filter(strip => strip.kaleidoscope?.enabled !== true);
      const found = suggestSymmetry(eligible, symmetry.fold, artworkCentre ? { centre: artworkCentre } : null)?.centre;
      if (found) return found;
    }
    return stripsBoundsCentre(shown);
  };
  const sideCount = symmetry?.sides?.length || 0;
  const save = async () => {
    recordedFor.current = look;
    const checked = checkLook(look, compiledWiring, symmetry);
    if (checked.state !== 'fits') { setRecording(checked); return; }
    setRecording({ state: 'saving', text: 'Recording and saving this look…' });
    try {
      const controller = standaloneController || {};
      const replacing = savedAs
        && (controller.sequenceAssets || []).some(asset => asset?.id === savedAs.id) ? savedAs : null;
      const label = replacing?.label || nextLookName(controller.sequenceAssets);
      const bakeResult = await recordPlacedLook({ look, strips, compiledWiring, symmetry });
      const result = await createRecordedSequenceAsset({
        kind: 'placed-look', bakeResult, controller, label, replaceId: replacing?.id || '',
      });
      setStandaloneController(await applyRecordedSequenceAsset(controller, result));
      setPlacedLookSavedAs({ id: result.asset.id, label: result.asset.label });
      if (recordedFor.current !== look) return;
      setRecording({
        state: 'saved', bytes: result.asset.byteLength,
        text: `${replacing ? 'Updated' : 'Saved as'} “${result.asset.label}” in this project's recordings: ${checked.length.charAt(0).toLowerCase()}${checked.length.slice(1)}, ${megabytes(result.asset.byteLength)} MB. To play it on the card, add it to the Playlist.`,
      });
    } catch (error) {
      setRecording({ state: 'blocked', text: error?.message || 'This look could not be saved.' });
    }
  };
  return (
    <section className="la-placed" data-testid="layout-placed-look" aria-label="Placed look">
      <span className="la-symmetry-k" id="layout-placed-look-label">Placed look</span>
      <div className="la-symmetry-seg is-pair" role="group" aria-labelledby="layout-placed-look-label">
        <button type="button" className="btn" aria-pressed={!look} data-testid="placed-look-off"
                onClick={() => setPlacedLookPreview(null)}>None</button>
        <button type="button" className="btn" aria-pressed={Boolean(look)} data-testid="placed-look-on"
                onClick={() => { if (!look) setPlacedLookPreview(normalizePlacedLook({}, { strips: shown })); }}>On the artwork</button>
      </div>
      {!look && <p className="la-symmetry-note">
        A frame you drag over the strips. A sweep or rings move inside it, and each light takes the colour under it.
      </p>}
      {look && (
        <div className="la-placed-body">
          <p className="la-symmetry-note" data-testid="placed-look-session-note">
            Drag the frame on the artwork to move it, or a corner to size it. It is a try-out until you save it as a look.
          </p>
          <div className="la-placed-field">
            <span className="la-symmetry-k" id="placed-look-mode-label">This look moves as</span>
            <div className="la-symmetry-seg is-pair" role="group" aria-labelledby="placed-look-mode-label">
              <button type="button" className="btn" aria-pressed={look.mode === 'sweep'} data-testid="placed-look-sweep"
                      onClick={() => set({ mode: 'sweep' })}>A sweep</button>
              <button type="button" className="btn" aria-pressed={look.mode === 'rings'} data-testid="placed-look-rings"
                      onClick={() => set({ mode: 'rings' })}>Rings</button>
            </div>
          </div>
          <div className="la-placed-field">
            <span className="la-symmetry-k" id="placed-look-colours-label">Colours</span>
            <div className="la-symmetry-seg is-three" role="group" aria-labelledby="placed-look-colours-label">
              {Object.entries(PLACED_LOOK_PALETTES).map(([key, colours]) => (
                <button key={key} type="button" className="btn" aria-pressed={sameColours(look.colours, colours)}
                        data-testid={`placed-look-colours-${key}`}
                        onClick={() => set({ colours })}>{PALETTE_NAMES[key]}</button>
              ))}
            </div>
          </div>
          <div className="la-placed-field">
            <Dial id="placed-look-width" label="Width" min={5} max={90} value={Math.round(look.width * 100)}
                  onChange={value => set({ width: value / 100 })}/>
            <Dial id="placed-look-softness" label="Softness" min={0} max={100} value={Math.round(look.softness * 100)}
                  onChange={value => set({ softness: value / 100 })}/>
            <Dial id="placed-look-repeat" label="Repeat" min={1} max={6} value={look.repeat}
                  onChange={value => set({ repeat: value })}/>
            <Dial id="placed-look-speed" label="Speed" min={0} max={100} value={Math.round(look.speed * 100)}
                  onChange={value => set({ speed: value / 100 })}/>
            <Dial id="placed-look-turn" label="Turn" min={-180} max={180} value={Math.round(look.frame.turn)}
                  onChange={value => set({ frame: { ...look.frame, turn: value } })}/>
          </div>
          <div className="la-placed-field">
            <label className="la-placed-check">
              <input type="checkbox" data-testid="placed-look-reverse" checked={look.reverse}
                     onChange={event => set({ reverse: event.target.checked })}/>
              Run the other way
            </label>
            {sideCount > 0 && (
              <label className="la-placed-check">
                <input type="checkbox" data-testid="placed-look-alike" checked={look.alikeOnSides}
                       onChange={event => set({ alikeOnSides: event.target.checked })}/>
                {sideCount === 2 ? 'Play it alike on both sides' : `Play it alike on all ${sideCount} sides`}
              </label>
            )}
            <button type="button" className="btn la-placed-quiet" data-testid="placed-look-centre"
                    onClick={() => setPlacedLookPreview(normalizePlacedLook(placedLookOnCentre(look, centre())))}>
              {symmetry ? 'Put it on the centre mark' : 'Put it on the centre of the piece'}
            </button>
          </div>
          <div className="la-placed-record">
            <button type="button" className="btn" data-testid="placed-look-record"
                    disabled={recording?.state === 'saving'}
                    onClick={() => { void save(); }}>{savedAs ? 'Save changes' : 'Save as a look'}</button>
            <p className="la-symmetry-note la-placed-record-note" role="status" data-testid="placed-look-record-note"
               data-state={recording?.state || 'idle'} data-bytes={recording?.bytes ?? undefined}>
              {recording?.text || 'The card cannot work this out itself, so Studio records it once as a loop and keeps it with the project. Nothing is sent to the card until you add it to the Playlist.'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

import { useState } from 'react';
import { useProject } from '../../../state/ProjectContext.jsx';
import { DESIGNED_NAME_MAX, areaRecordsOf, layoutKeyOf } from '../../../lib/designedLooks.js';
import { setLookDesigner, useLookDesigner } from '../canvas/lookDesignerStore.js';
import '../look-designer.css';

// KEEP. A look kept here goes into the project and stays in Studio: the card
// cannot play it until a card update, and nothing that builds the card's files
// reads it. The words say so: "Kept in Studio", never "Saved".

/** The name field and the keep buttons, shown while a look is being designed. */
export function LookKeep({ model, fold }) {
  const { designedLooks, keepDesignedLook, replaceKeptLook } = useProject();
  const state = useLookDesigner();
  const [draft, setDraft] = useState('');
  const open = designedLooks.find(entry => entry.id === state.openKeptId) || null;
  const name = draft || '';
  const record = () => ({
    look: state.look,
    areas: areaRecordsOf(model, state.names),
    layoutKey: layoutKeyOf(model.derived, fold),
  });
  const say = text => setLookDesigner({ keepSay: text });
  const keep = () => {
    const result = keepDesignedLook({ name: name || (open ? open.name : ''), ...record() });
    if (!result.ok) { say(result.reason); return; }
    setDraft('');
    setLookDesigner({ openKeptId: result.record.id, keepSay: `Kept in Studio as "${result.record.name}".` });
  };
  const replace = () => {
    const result = replaceKeptLook(open.id, record());
    say(result.ok ? `Kept in Studio as "${result.record.name}".` : result.reason);
  };
  return (
    <div className="ld-field ld-keep" data-testid="look-designer-keep">
      <label className="la-symmetry-k" htmlFor="look-designer-keep-name">Keep</label>
      <input id="look-designer-keep-name" data-testid="look-designer-keep-name" className="ld-name ld-keep-name" type="text"
             value={draft} maxLength={DESIGNED_NAME_MAX} placeholder={open ? open.name : 'Name this look'} spellCheck={false}
             onChange={event => setDraft(event.target.value)}
             onKeyDown={event => { if (event.key === 'Enter') keep(); }}/>
      <div className="ld-stack">
        <button type="button" className="btn" data-testid="look-designer-keep-button" onClick={keep}>Keep this look</button>
        {open && (
          <button type="button" className="btn" data-testid="look-designer-keep-replace" aria-label={`Replace "${open.name}"`} onClick={replace}>
            Replace "{open.name}"
          </button>
        )}
      </div>
      <p className={`la-symmetry-note ld-keep-say${state.keepSay ? ' is-said' : ''}`} role="status" data-testid="look-designer-keep-say">
        {state.keepSay || 'Kept looks stay in this project and play in Studio only, until a card update.'}
      </p>
    </div>
  );
}

/** The looks kept in this project, each with its Studio-only tag. Tap a name to open it again. */
export function KeptLooks({ onOpen }) {
  const { designedLooks, removeKeptLook } = useProject();
  const state = useLookDesigner();
  if (!designedLooks.length) return null;
  return (
    <div className="ld-field ld-kept" data-testid="look-designer-kept">
      <span className="la-symmetry-k" id="ld-kept-label">Kept looks</span>
      <ul className="ld-kept-list" aria-labelledby="ld-kept-label">
        {designedLooks.map(entry => (
          <li key={entry.id} data-testid={`look-designer-kept-${entry.id}`}>
            <button type="button" className="ld-kept-open" aria-pressed={state.openKeptId === entry.id}
                    data-testid={`look-designer-kept-open-${entry.id}`} onClick={() => onOpen(entry)}>
              <span className="ld-kept-name">{entry.name}</span>
              <span className="ld-kept-tag">Studio only</span>
            </button>
            <button type="button" className="btn ld-kept-remove" data-testid={`look-designer-kept-remove-${entry.id}`}
                    aria-label={`Remove ${entry.name}`}
                    onClick={() => { removeKeptLook(entry.id); if (state.openKeptId === entry.id) setLookDesigner({ openKeptId: null, keepSay: `Removed "${entry.name}" from this project.` }); }}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

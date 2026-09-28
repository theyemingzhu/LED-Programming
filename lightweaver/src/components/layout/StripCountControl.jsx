import { useEffect, useRef, useState } from 'react';

export function StripCountControl({ strip, disabled, onCommit, max = 9999 }) {
  const [draft, setDraft] = useState(null);
  const cancelOnBlur = useRef(false);
  useEffect(() => setDraft(null), [strip.id]);
  const commit = value => {
    const count = Number(value);
    setDraft(null);
    if (Number.isSafeInteger(count) && count >= 1 && count <= max && count !== strip.pixelCount) onCommit(count);
  };
  return <span className="la-row-count" role="group" aria-label={`${strip.name} LED count`} onClick={event => event.stopPropagation()}>
    <button type="button" aria-label={`One fewer LED in ${strip.name}`} disabled={disabled || strip.pixelCount <= 1}
            onClick={() => commit(strip.pixelCount - 1)}>−</button>
    <input type="number" min="1" max={max} inputMode="numeric" value={draft ?? strip.pixelCount}
           aria-label={`${strip.name} LED count`} disabled={disabled}
           onFocus={event => { cancelOnBlur.current = false; event.target.select(); }}
           onChange={event => setDraft(event.target.value)}
           onBlur={event => {
             if (cancelOnBlur.current) { cancelOnBlur.current = false; setDraft(null); }
             else commit(event.target.value);
           }}
           onKeyDown={event => {
             if (event.key === 'Enter') event.currentTarget.blur();
             if (event.key === 'Escape') { event.preventDefault(); cancelOnBlur.current = true; event.currentTarget.blur(); }
           }}/>
    <button type="button" aria-label={`One more LED in ${strip.name}`} disabled={disabled || strip.pixelCount >= max}
            onClick={() => commit(strip.pixelCount + 1)}>+</button>
  </span>;
}

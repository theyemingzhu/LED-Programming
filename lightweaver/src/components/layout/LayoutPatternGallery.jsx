import { useEffect, useRef } from 'react';
import { REAL_PATTERNS } from '../../v3/v3-data.js';

export function LayoutPatternGallery({ stripName, currentPatternId, onChoose, onClose }) {
  const firstRef = useRef(null);
  useEffect(() => { firstRef.current?.focus(); }, []);
  return <div className="la-pattern-gallery" role="dialog" aria-label={`Choose pattern for ${stripName}`}
              onClick={event => event.stopPropagation()}
              onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="la-pattern-gallery-head">
      <strong>Pattern · {stripName}</strong>
      <button type="button" aria-label="Close pattern gallery" onClick={onClose}>Close</button>
    </div>
    <div className="la-pattern-gallery-list">
      {REAL_PATTERNS.map((pattern, index) => <button type="button" key={pattern.id}
          ref={index === 0 ? firstRef : undefined}
          className="la-pattern-choice" aria-label={pattern.label}
          aria-pressed={currentPatternId === pattern.id}
          onClick={() => onChoose(pattern.id)}>
        <span className="la-pattern-preview" style={{ background: pattern.grad }} aria-hidden="true"/>
        <span>{pattern.label}</span>
      </button>)}
    </div>
  </div>;
}

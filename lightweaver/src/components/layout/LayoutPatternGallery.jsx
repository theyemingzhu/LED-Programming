import { useEffect, useRef, useState } from 'react';
import { REAL_PATTERNS, REAL_PATTERN_BY_ID } from '../../v3/v3-data.js';
import { PatternPreview } from '../../v3/PatternPreview.jsx';
import { fitPreviewViewBox, resolvePreviewPatternId } from '../../lib/patternPiecePreview.js';

export function LayoutPatternGallery({ stripName, currentPatternId, previewSegment, onChoose, onClose }) {
  const firstRef = useRef(null);
  const [auditionId, setAuditionId] = useState(currentPatternId);
  useEffect(() => { firstRef.current?.focus(); }, []);
  const audition = REAL_PATTERN_BY_ID.get(auditionId);
  const auditionStrip = previewSegment && audition ? {
    ...previewSegment,
    sourcePatternId: audition.id,
    patternId: resolvePreviewPatternId(audition.id) || audition.id,
    palette: audition.pal,
    visualLook: { ...(previewSegment.visualLook || {}), patternId: audition.id },
  } : null;
  return <div className="la-pattern-gallery" role="dialog" aria-label={`Choose pattern for ${stripName}`}
              onClick={event => event.stopPropagation()}
              onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="la-pattern-gallery-head">
      <strong>Pattern · {stripName}</strong>
      <button type="button" aria-label="Close pattern gallery" onClick={onClose}>Close</button>
    </div>
    <div className="la-pattern-audition" data-testid="layout-pattern-audition"
         aria-label={`${audition?.label || auditionId} animated preview for ${stripName}`}>
      <div className="la-pattern-audition-stage">
        {auditionStrip && <PatternPreview strips={[auditionStrip]}
          viewBox={fitPreviewViewBox([auditionStrip])}
          patternId={auditionStrip.patternId} playing={true}
          palette={auditionStrip.palette} glow={1.1} dotSize={3}
          targetFps={30} ariaLabel={`${audition?.label} animated LED preview for ${stripName}`}
          testId="layout-pattern-audition-canvas"/>}
      </div>
      <span>{audition?.label || auditionId} · {stripName}</span>
    </div>
    <div className="la-pattern-gallery-list">
      {REAL_PATTERNS.map((pattern, index) => <button type="button" key={pattern.id}
          ref={pattern.id === currentPatternId || (index === 0 && !REAL_PATTERN_BY_ID.has(currentPatternId)) ? firstRef : undefined}
          className="la-pattern-choice" aria-label={pattern.label}
          aria-pressed={currentPatternId === pattern.id}
          onPointerEnter={() => setAuditionId(pattern.id)}
          onFocus={() => setAuditionId(pattern.id)}
          onClick={() => onChoose(pattern.id)}>
        <span className="la-pattern-preview" style={{ background: pattern.grad }} aria-hidden="true"/>
        <span>{pattern.label}</span>
      </button>)}
    </div>
  </div>;
}

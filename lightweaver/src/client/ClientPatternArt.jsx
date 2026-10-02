import React from 'react';
import { REAL_PATTERN_BY_ID } from '../v3/v3-data.js';

// Share Studio's exact gradient metadata. Unknown recordings never borrow art.
export function clientPatternGradient(pattern) {
  if (pattern?.previewColors?.length) return `linear-gradient(110deg, ${pattern.previewColors.join(',')})`;
  const runtimeId = pattern?.runtimePatternId || pattern?.preset || pattern?.id;
  const known = REAL_PATTERN_BY_ID.get(runtimeId);
  if (known) return known.grad;
  const zoneColors = (pattern?.zones || []).flatMap(zone => REAL_PATTERN_BY_ID.get(zone.patternId)?.pal || []);
  return zoneColors.length ? `linear-gradient(110deg, ${zoneColors.join(',')})` : null;
}

export default function ClientPatternArt({ pattern, large = false }) {
  const gradient = clientPatternGradient(pattern);
  return <div className={`cl-art${large ? ' cl-art-large' : ''}${gradient ? '' : ' cl-art-unavailable'}`} style={gradient ? { background: gradient } : undefined} data-pattern-preview={pattern?.id || ''} role="img" aria-label={gradient ? `${pattern?.label || 'Pattern'} gradient` : 'Pattern preview unavailable'}>{!gradient && <span>Preview unavailable</span>}</div>;
}

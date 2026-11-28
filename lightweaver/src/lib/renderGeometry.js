import {
  compileKaleidoscopePixelContext,
  normalizeKaleidoscope,
} from './kaleidoscope.js';

function plainContext(sourceProgress) {
  return {
    reflectionProgress: sourceProgress,
    kaleidoscopeProgress: sourceProgress,
    reflectionDistance: 1,
    reflectionSegment: 0,
    reflectionPoint: null,
    isReflectionPoint: false,
  };
}

// Keep pattern inputs in the pre-flip order while the visible path remains
// end-first. The completed frame then follows the same flip for index- and
// coordinate-driven effects.
export function flippedPatternCoordinates(strip, sourceLed, displayPoint = null) {
  if (strip?.pathPlaybackFlipped !== true) return null;
  const points = strip.pixels || strip.pts || [];
  const beforeFlip = points[points.length - 1 - sourceLed];
  if (!beforeFlip) return null;
  const source = points[sourceLed];
  const offsetX = displayPoint ? displayPoint.x - (Number(source?.x) || 0) : 0;
  const offsetY = displayPoint ? displayPoint.y - (Number(source?.y) || 0) : 0;
  return {
    patternX: (Number(beforeFlip.x) || 0) + offsetX,
    patternY: (Number(beforeFlip.y) || 0) + offsetY,
  };
}

export function normalizeProjectRenderStrips(strips, { hidden = {}, includeHidden = false } = {}) {
  return (Array.isArray(strips) ? strips : []).flatMap(strip => {
    if (!strip) return [];
    const isHidden = Boolean(hidden?.[strip.id] || strip.hidden);
    if (isHidden && !includeHidden) return [];
    const pixels = Array.isArray(strip.pixels)
      ? strip.pixels
      : Array.isArray(strip.pts)
        ? strip.pts
        : [];
    if (!pixels.length) return [];
    const pixelCount = pixels.length;
    const normalized = normalizeKaleidoscope(strip.kaleidoscope, pixelCount);
    const kaleidoscopeContext = normalized.enabled
      ? compileKaleidoscopePixelContext(normalized.value, pixelCount)
      : null;
    const pts = pixels.map((pixel, index) => {
      const sourceProgress = pixelCount > 1 ? index / (pixelCount - 1) : 0.5;
      const reflection = kaleidoscopeContext
        ? kaleidoscopeContext.pixelContexts[index]
        : plainContext(sourceProgress);
      return {
        ...pixel,
        ...flippedPatternCoordinates(strip, index),
        x: Number(pixel?.x) || 0,
        y: Number(pixel?.y) || 0,
        i: index,
        p: sourceProgress,
        sourceProgress,
        hasKaleidoscope: Boolean(kaleidoscopeContext),
        kaleidoscopePoints: kaleidoscopeContext?.points || normalized.points,
        ...reflection,
      };
    });
    return [{
      ...strip,
      hidden: isHidden,
      pts,
      kaleidoscopeContext,
    }];
  });
}

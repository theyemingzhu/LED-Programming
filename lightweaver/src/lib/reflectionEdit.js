import { deriveReflectionPointIndices, validateKaleidoscope } from './kaleidoscope.js';

// The final point is an editor draft, never an enabled runtime mapping.
export function reflectionEditorPoints(strip) {
  if (strip?.kaleidoscope) return deriveReflectionPointIndices(strip.kaleidoscope, strip.pixelCount);
  const point = strip?.reflectionPointDraft;
  return Number.isInteger(point) && point >= 0 && point < strip.pixelCount ? [point] : [];
}

export function removeReflectionPoint(strip, pointIndex) {
  const points = reflectionEditorPoints(strip);
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) throw new RangeError('Choose a valid reflection point.');
  const remaining = points.filter((_, index) => index !== pointIndex);
  if (remaining.length < 2) return { kaleidoscope: null, reflectionPointDraft: remaining[0] ?? null };
  const startLed = remaining[0];
  const pixelCount = strip.pixelCount;
  const mapping = {
    enabled: true,
    pointCount: remaining.length,
    startLed,
    offsets: remaining.map((point, index) => point - ((startLed + Math.round(index * pixelCount / remaining.length)) % pixelCount)),
  };
  const validation = validateKaleidoscope(mapping, pixelCount);
  if (!validation.ok) throw new RangeError(validation.errors[0].message);
  return { kaleidoscope: validation.value, reflectionPointDraft: null };
}

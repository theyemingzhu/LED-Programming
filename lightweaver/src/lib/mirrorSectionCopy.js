// A mirror set compiles to one zone whose id starts with "mirror-" and whose
// ranges are the member strips. The Patterns screen keys its help line off
// that prefix, so no extra prop is needed.
export function isMirrorSetTarget(target) {
  if (!target || target.kind !== 'section') return false;
  return String(target.zoneId || '').startsWith('mirror-')
    || String(target.id || '').startsWith('mirror-');
}

export function mirrorSetStripCount(target) {
  return Array.isArray(target?.ranges) ? target.ranges.length : 0;
}

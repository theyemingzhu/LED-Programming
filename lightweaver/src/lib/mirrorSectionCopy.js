// Copy and small derivations for the Patterns screen's "sides" choice. A piece
// with symmetry has sides; each look chooses whether the sides mirror each
// other (one pattern, played as a mirror image) or play their own. Strips in
// no side are "on their own". Text only: no icons, no em-dashes.

export const SIDES_HEADING = 'In this look, the sides';
export const SIDES_OPTIONS = Object.freeze([
  Object.freeze({ mirrored: true, label: 'Mirror each other' }),
  Object.freeze({ mirrored: false, label: 'Play their own' }),
]);

function sidesOf(symmetry) {
  return Array.isArray(symmetry?.sides) ? symmetry.sides : [];
}

export function hasSymmetrySides(symmetry) {
  return sidesOf(symmetry).length > 1;
}

// The one short line under the control.
export function sidesHintCopy({ symmetry, sidesMirrored } = {}) {
  const sides = sidesOf(symmetry);
  if (sides.length < 2) return '';
  if (sidesMirrored === false) return 'Each side gets its own pattern.';
  const firstName = sides[0]?.label || 'the first side';
  const others = sides.length === 2 ? 'The other side plays' : 'The other sides play';
  const how = symmetry.orientation === 'same' ? 'the same way round' : 'as a mirror image';
  return `Pick a pattern for ${firstName}. ${others} it ${how}.`;
}

// Section label for the one target that stands for every mirrored side.
export function mirroredSectionLabel(sideCount) {
  return Number(sideCount) >= 4 ? 'All four sides, mirrored' : 'Both sides, mirrored';
}

// A target is a mirrored group when the section model marks the sides it drives.
export function isMirroredSidesTarget(target) {
  return Boolean(target && target.kind === 'section'
    && Array.isArray(target.mirroredSides) && target.mirroredSides.length > 0);
}

// A target is a side (mirrored group or a single side) when its zone is one
// of the symmetry's sides. Everything else is on its own.
export function isSideTarget(target, symmetry) {
  if (!target || target.kind !== 'section') return false;
  if (isMirroredSidesTarget(target)) return true;
  const zoneId = String(target.zoneId || '');
  return sidesOf(symmetry).some(side => side.id === zoneId);
}

function stripLeds(strip) {
  return Number(strip?.pixelCount) || strip?.pixels?.length || 0;
}

function countSides(symmetry, sideIds, strips) {
  const byId = new Map((strips || []).map(strip => [strip.id, strip]));
  let stripCount = 0;
  let leds = 0;
  for (const side of sidesOf(symmetry)) {
    if (!sideIds.includes(side.id)) continue;
    for (const stripId of side.stripIds || []) {
      stripCount += 1;
      leds += stripLeds(byId.get(stripId));
    }
  }
  return { stripCount, leds };
}

// "{n} strips · {LEDs} LEDs" for a side or the mirrored group, and
// "On its own · {LEDs} LEDs" for the rest. Returns null when the piece has no
// symmetry so the screen keeps its usual line.
export function sectionMetaCopy({ target, symmetry, strips, ledCount } = {}) {
  if (!hasSymmetrySides(symmetry) || !target || target.kind !== 'section') return null;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (isSideTarget(target, symmetry)) {
    const ids = isMirroredSidesTarget(target)
      ? [String(target.zoneId || ''), ...target.mirroredSides]
      : [String(target.zoneId || '')];
    const { stripCount, leds } = countSides(symmetry, ids, strips);
    return `${plural(stripCount, 'strip')} · ${leds || ledCount || 0} LEDs`;
  }
  return `On its own · ${ledCount || 0} LEDs`;
}

// The label a section row shows: the mirrored group is named for how many
// sides it drives; every other target keeps the name the section model gave it.
export function sectionLabelCopy({ target, symmetry } = {}) {
  if (isMirroredSidesTarget(target)) {
    return mirroredSectionLabel(sidesOf(symmetry).length || target.mirroredSides.length + 1);
  }
  return target?.label || '';
}

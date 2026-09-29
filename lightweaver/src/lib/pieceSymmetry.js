// Piece symmetry: the owner divides the artwork into two or four "sides".
// Stored at piece level as `layout.symmetry`:
//   { fold: 2, orientation: 'mirror',
//     sides: [{ id: 'side-1', label: 'Left side', stripIds: ['strip-3', 'strip-4'] },
//             { id: 'side-2', label: 'Right side', stripIds: ['strip-1', 'strip-2'] }] }
// The order of stripIds inside a side IS the order the pattern flows through it.
// A strip in no side is "on its own" and always plays its own pattern.
//
// Not the Fold geometry (lib/symmetry.js). This file replaces the v1 "mirror
// sets" (mirrorSets.js survives only to migrate saved projects).
//
// Every function here is pure: it returns new objects and never mutates input.
//
// wiringCompiler.js imports this module and validateSymmetry imports the
// compiler back. That cycle is safe only because nothing here reads an import
// at module-evaluation time; keep it that way (no top-level use of compileWiring).

import { compileWiring } from './wiringCompiler.js';
import { normalizeMirrorSets } from './mirrorSetRules.js';

export const SYMMETRY_FOLDS = Object.freeze([2, 4]);

const text = value => (typeof value === 'string' ? value.trim() : '');
const isFold = value => value === 2 || value === 4;

export const defaultSymmetryOrientation = fold => (fold === 2 ? 'mirror' : 'same');

export const sideIdForIndex = index => `side-${index + 1}`;

// Sides are labelled by where they sit: two sides that split left/right read
// "Left side" / "Right side", top/bottom read "Top side" / "Bottom side", four
// sides read "Side 1".."Side 4".
export function defaultSideLabels(fold, axis = null) {
  if (fold === 2) return axis === 'vertical' ? ['Top side', 'Bottom side'] : axis === 'horizontal' ? ['Left side', 'Right side'] : ['Side 1', 'Side 2'];
  return Array.from({ length: fold }, (_, index) => `Side ${index + 1}`);
}

function stripCentre(strip) {
  const pixels = Array.isArray(strip?.pixels) ? strip.pixels : [];
  const offsetX = Number(strip?.offsetX ?? strip?.x ?? 0) || 0;
  const offsetY = Number(strip?.offsetY ?? strip?.y ?? 0) || 0;
  if (!pixels.length) return { x: offsetX, y: offsetY, known: false };
  let x = 0;
  let y = 0;
  for (const pixel of pixels) {
    x += Number(pixel?.x) || 0;
    y += Number(pixel?.y) || 0;
  }
  return { x: x / pixels.length + offsetX, y: y / pixels.length + offsetY, known: true };
}

// For two sides: which axis splits them, and which side comes first (left or top).
function orderTwoSides(stripIdGroups, strips) {
  const byId = new Map((strips || []).map(strip => [String(strip?.id), strip]));
  const centres = stripIdGroups.map(ids => {
    const known = ids.map(id => byId.get(id)).filter(Boolean).map(stripCentre).filter(centre => centre.known);
    if (!known.length) return null;
    return { x: known.reduce((sum, c) => sum + c.x, 0) / known.length, y: known.reduce((sum, c) => sum + c.y, 0) / known.length };
  });
  if (centres.some(centre => !centre)) return { order: [0, 1], axis: null };
  const dx = Math.abs(centres[0].x - centres[1].x);
  const dy = Math.abs(centres[0].y - centres[1].y);
  if (dx >= dy) return { order: centres[0].x <= centres[1].x ? [0, 1] : [1, 0], axis: 'horizontal' };
  return { order: centres[0].y <= centres[1].y ? [0, 1] : [1, 0], axis: 'vertical' };
}

function makeSymmetry(fold, stripIdGroups, strips, { orientation, labels } = {}) {
  let groups = stripIdGroups.slice(0, fold);
  while (groups.length < fold) groups.push([]);
  let axis = null;
  if (fold === 2 && !labels) {
    const ordered = orderTwoSides(groups, strips);
    groups = ordered.order.map(index => groups[index]);
    axis = ordered.axis;
  }
  const names = labels && labels.length === fold ? labels : defaultSideLabels(fold, axis);
  return {
    fold,
    orientation: orientation === 'mirror' || orientation === 'same' ? orientation : defaultSymmetryOrientation(fold),
    sides: groups.map((stripIds, index) => ({ id: sideIdForIndex(index), label: names[index], stripIds: [...stripIds] })),
  };
}

// Shape-only cleanup. Returns null unless `fold` is 2 or 4. Trims ids, gives
// every side an id and label, pads or trims the side list to exactly `fold`,
// lets the first side keep a strip claimed twice, and (with `strips`) drops
// strips that no longer exist. Empty sides are KEPT so the owner can fill them;
// validateSymmetry reports them.
export function normalizeSymmetry(value, strips = null) {
  if (!value || typeof value !== 'object') return null;
  const fold = Number(value.fold);
  if (!isFold(fold)) return null;
  const liveIds = Array.isArray(strips) ? new Set(strips.map(strip => String(strip?.id ?? ''))) : null;
  const claimed = new Set();
  const usedIds = new Set();
  const labels = defaultSideLabels(fold);
  const rawSides = Array.isArray(value.sides) ? value.sides : [];
  const sides = [];
  for (let index = 0; index < fold; index += 1) {
    const raw = rawSides[index] && typeof rawSides[index] === 'object' ? rawSides[index] : {};
    let id = text(raw.id) || sideIdForIndex(index);
    if (usedIds.has(id)) id = sideIdForIndex(index);
    usedIds.add(id);
    const stripIds = [];
    for (const member of Array.isArray(raw.stripIds) ? raw.stripIds : []) {
      const stripId = text(String(member ?? ''));
      if (!stripId || claimed.has(stripId)) continue;
      if (liveIds && !liveIds.has(stripId)) continue;
      claimed.add(stripId);
      stripIds.push(stripId);
    }
    sides.push({ id, label: text(raw.label) || labels[index], stripIds });
  }
  const orientation = value.orientation === 'mirror' || value.orientation === 'same'
    ? value.orientation
    : defaultSymmetryOrientation(fold);
  return { fold, orientation, sides };
}

function tallyCompiledRanges(wiring, strips) {
  const compiled = compileWiring({ wiring, strips, groups: [] });
  if (!compiled.ok) return null;
  const tally = new Map();
  for (const zone of compiled.zones) {
    for (const range of zone.ranges) {
      const stripId = compiled.pixels[range.start]?.stripId;
      if (stripId) tally.set(stripId, (tally.get(stripId) || 0) + 1);
    }
  }
  return tally;
}

// Structural rules decidable from the symmetry and strips alone (no wiring).
// Used by compileWiring and validateSymmetry. Works on RAW input: it does not
// normalize first, so a bad fold or side count is reported, not repaired.
export function findSymmetryStructureErrors(sym, strips = []) {
  const errors = [];
  if (!sym || typeof sym !== 'object') return errors;
  const stripById = new Map((strips || []).map(strip => [String(strip?.id ?? ''), strip]));
  const fold = Number(sym.fold);
  const sides = Array.isArray(sym.sides) ? sym.sides : [];
  if (!isFold(fold)) {
    errors.push({ code: 'symmetry-fold', message: 'Choose 2 sides or 4 sides.' });
  } else if (sides.length !== fold) {
    errors.push({ code: 'symmetry-side-count', message: `${fold} sides need exactly ${fold} groups of strips.` });
  }
  const owner = new Map();
  sides.forEach((side, index) => {
    const sideId = String(side?.id ?? sideIdForIndex(index));
    const label = String(side?.label || sideId);
    const stripIds = Array.isArray(side?.stripIds) ? side.stripIds.map(String) : [];
    if (!stripIds.length) {
      errors.push({ code: 'symmetry-side-empty', sideId, message: `${label} needs at least one strip.` });
    }
    for (const stripId of stripIds) {
      const strip = stripById.get(stripId);
      if (!strip) {
        errors.push({ code: 'symmetry-strip-missing', sideId, stripId, message: `${label} refers to a strip that no longer exists.` });
        continue;
      }
      const name = strip.name || stripId;
      if (owner.has(stripId)) {
        errors.push({ code: 'symmetry-strip-twice', sideId, stripId, message: `${name} can only be in one side.` });
      } else {
        owner.set(stripId, sideId);
      }
      if (strip.kaleidoscope?.enabled === true) {
        errors.push({ code: 'symmetry-strip-kaleidoscope', sideId, stripId, message: `Turn off Kaleidoscope on ${name} first.` });
      }
    }
  });
  return errors;
}

export function validateSymmetry(sym, strips = [], wiring = null) {
  if (!sym) return { ok: true, errors: [] };
  const errors = findSymmetryStructureErrors(sym, strips);
  if (wiring) {
    const tally = tallyCompiledRanges(wiring, strips);
    if (tally) {
      const stripById = new Map((strips || []).map(strip => [String(strip.id), strip]));
      const reported = new Set(errors.filter(error => error.stripId).map(error => `${error.code}:${error.stripId}`));
      for (const side of Array.isArray(sym.sides) ? sym.sides : []) {
        for (const stripId of Array.isArray(side?.stripIds) ? side.stripIds.map(String) : []) {
          if (!stripById.has(stripId)) continue;
          if ((tally.get(stripId) || 0) === 1) continue;
          const key = `symmetry-strip-split:${stripId}`;
          if (reported.has(key)) continue;
          reported.add(key);
          const name = stripById.get(stripId)?.name || stripId;
          errors.push({
            code: 'symmetry-strip-split',
            sideId: String(side?.id ?? ''),
            stripId,
            message: `Join ${name}'s wiring into one run first.`,
          });
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function sideOfStrip(sym, stripId) {
  if (!sym) return null;
  const id = String(stripId ?? '');
  const side = (sym.sides || []).find(candidate => (candidate.stripIds || []).some(member => String(member) === id));
  return side ? side.id : null;
}

export function stripsOnTheirOwn(sym, strips = []) {
  const inSide = new Set((sym?.sides || []).flatMap(side => side.stripIds || []).map(String));
  return (strips || []).map(strip => String(strip?.id ?? '')).filter(id => id && !inSide.has(id));
}

export function sideFlipped(sym, sideIndex) {
  return Boolean(sym) && sym.orientation === 'mirror' && Number(sideIndex) % 2 === 1;
}

function sideStripIds(entry) {
  if (Array.isArray(entry)) return entry.map(String);
  if (entry && typeof entry === 'object' && Array.isArray(entry.stripIds)) return entry.stripIds.map(String);
  return [];
}

// fold 0 (None) -> null. Otherwise a symmetry of `fold` sides. `suggestion` is
// what suggestSymmetry returns: `{ sides }` where each side is a strip id array
// or `{ stripIds, label? }`. Without one, an existing symmetry of the same fold
// is kept and anything else deals the strips into contiguous groups in order.
export function setSymmetryFold(sym, fold, strips = [], suggestion = null) {
  const wanted = Number(fold);
  if (!isFold(wanted)) return null;
  if (!suggestion && sym && sym.fold === wanted) return sym;
  const liveIds = (strips || []).map(strip => String(strip?.id ?? '')).filter(Boolean);
  const live = new Set(liveIds);
  let groups;
  let labels = null;
  if (suggestion && Array.isArray(suggestion.sides)) {
    const claimed = new Set();
    groups = suggestion.sides.slice(0, wanted).map(entry => sideStripIds(entry).filter(id => {
      if (!live.has(id) || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    }));
    if (suggestion.sides.length === wanted && suggestion.sides.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && text(entry.label))) {
      labels = suggestion.sides.map(entry => text(entry.label));
    }
  } else {
    groups = Array.from({ length: wanted }, () => []);
    if (liveIds.length >= wanted) {
      const per = liveIds.length / wanted;
      liveIds.forEach((id, index) => groups[Math.min(wanted - 1, Math.floor(index / per))].push(id));
    }
  }
  return makeSymmetry(wanted, groups, strips, { labels });
}

export function setSymmetryOrientation(sym, orientation) {
  if (!sym) return sym;
  return orientation === 'mirror' || orientation === 'same' ? { ...sym, orientation } : sym;
}

// Move a strip into a side at `index` (default: the end), or take it out of
// every side when `sideId` is null (it then plays on its own). A strip is in at
// most one side. Unknown side ids leave the symmetry unchanged.
export function moveStripToSide(sym, stripId, sideId, index) {
  if (!sym) return sym;
  const id = String(stripId ?? '');
  if (!id) return sym;
  if (sideId !== null && sideId !== undefined && !(sym.sides || []).some(side => side.id === sideId)) return sym;
  const sides = sym.sides.map(side => ({ ...side, stripIds: side.stripIds.filter(member => member !== id) }));
  if (sideId !== null && sideId !== undefined) {
    const target = sides.find(side => side.id === sideId);
    const at = Number.isInteger(index) ? Math.max(0, Math.min(target.stripIds.length, index)) : target.stripIds.length;
    target.stripIds.splice(at, 0, id);
  }
  return { ...sym, sides };
}

// Set the order of strips inside one side. Ids not in the side are ignored and
// members missing from `stripIds` keep their place at the end.
export function reorderSide(sym, sideId, stripIds = []) {
  if (!sym) return sym;
  return {
    ...sym,
    sides: sym.sides.map(side => {
      if (side.id !== sideId) return { ...side, stripIds: [...side.stripIds] };
      const members = new Set(side.stripIds);
      const ordered = [];
      for (const id of (stripIds || []).map(String)) if (members.has(id) && !ordered.includes(id)) ordered.push(id);
      for (const id of side.stripIds) if (!ordered.includes(id)) ordered.push(id);
      return { ...side, stripIds: ordered };
    }),
  };
}

export function renameSide(sym, sideId, label) {
  if (!sym) return sym;
  const value = text(label);
  if (!value) return sym;
  return { ...sym, sides: sym.sides.map(side => (side.id === sideId ? { ...side, label: value } : side)) };
}

// Take strips out of every side (a strip was deleted, split or separated). Sides
// keep their place even if left empty; validateSymmetry then reports them.
export function removeStripsFromSymmetry(sym, stripIds = []) {
  if (!sym) return sym;
  const drop = new Set((stripIds || []).map(String));
  if (!sym.sides.some(side => side.stripIds.some(id => drop.has(id)))) return sym;
  return { ...sym, sides: sym.sides.map(side => ({ ...side, stripIds: side.stripIds.filter(id => !drop.has(id)) })) };
}

// v1 mirror sets: exactly ONE set of two or four members becomes that fold with
// one strip per side, in member order. Anything else (no set, several sets, a
// set of three, five or six) returns null and the sets are discarded.
export function migrateMirrorSetsToSymmetry(mirrorSets, strips = []) {
  const sets = normalizeMirrorSets(mirrorSets, { strips });
  if (sets.length !== 1) return null;
  const members = sets[0].members;
  if (!isFold(members.length)) return null;
  return makeSymmetry(members.length, members.map(id => [id]), strips, {});
}

export function remapSymmetryStripIds(sym, oldToNew) {
  if (!sym) return sym;
  const lookup = oldToNew instanceof Map
    ? id => oldToNew.get(id)
    : id => (oldToNew && Object.hasOwn(oldToNew, id) ? oldToNew[id] : undefined);
  return { ...sym, sides: (sym.sides || []).map(side => ({ ...side, stripIds: (side.stripIds || []).map(id => lookup(id) ?? id) })) };
}

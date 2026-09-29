// Pure, dependency-free rules for mirror sets. Kept apart from mirrorSets.js so
// the wiring compiler can enforce them without importing a module that itself
// imports the compiler (validateMirrorSets compiles wiring to count ranges).
//
// A mirror set is a named group of two to six strips that play as one section:
//   { id: 'mirror-1', name: 'Four arms', members: ['strip-3', 'strip-5'] }
// members[0] is the lead (the Studio preview renders it and copies to the rest).

export const MIRROR_SET_MIN_MEMBERS = 2;
export const MIRROR_SET_MAX_MEMBERS = 6;

const text = value => (typeof value === 'string' ? value.trim() : '');

function groupMemberStripId(member) {
  return typeof member === 'string' ? member : member?.stripId;
}

// Shape-only normalization: no strips are needed. Trims ids, drops duplicate
// members inside a set, lets the FIRST set keep a strip claimed twice, and drops
// any set left outside two to six members or without an id. Pass `strips` to
// also prune members that no longer exist (a set then dissolves below two).
export function normalizeMirrorSets(sets, { strips = null } = {}) {
  if (!Array.isArray(sets)) return [];
  const liveIds = Array.isArray(strips) ? new Set(strips.map(strip => String(strip?.id ?? ''))) : null;
  const claimed = new Set();
  const usedIds = new Set();
  const result = [];
  for (const raw of sets) {
    if (!raw || typeof raw !== 'object') continue;
    const id = text(raw.id);
    if (!id || usedIds.has(id)) continue;
    const members = [];
    for (const member of Array.isArray(raw.members) ? raw.members : []) {
      const stripId = text(member);
      if (!stripId || members.includes(stripId) || claimed.has(stripId)) continue;
      if (liveIds && !liveIds.has(stripId)) continue;
      members.push(stripId);
    }
    if (members.length < MIRROR_SET_MIN_MEMBERS || members.length > MIRROR_SET_MAX_MEMBERS) continue;
    usedIds.add(id);
    members.forEach(stripId => claimed.add(stripId));
    result.push({ id, name: typeof raw.name === 'string' ? raw.name.trim() : '', members });
  }
  return result;
}

// Errors decidable from the sets, strips and layer groups alone (no wiring).
// Same shape as validateWiring: { code, message, setId, stripId? }.
export function findMirrorSetStructureErrors(sets, strips = [], layerGroups = []) {
  const errors = [];
  const stripById = new Map((strips || []).map(strip => [String(strip?.id ?? ''), strip]));
  const groupedIds = new Set();
  for (const group of layerGroups || []) {
    for (const member of group?.members || []) {
      const stripId = groupMemberStripId(member);
      if (stripId) groupedIds.add(String(stripId));
    }
  }
  const owner = new Map();
  for (const set of Array.isArray(sets) ? sets : []) {
    const setId = String(set?.id ?? '');
    const members = Array.isArray(set?.members) ? set.members.map(String) : [];
    const label = String(set?.name || setId || 'This mirror set');
    if (members.length < MIRROR_SET_MIN_MEMBERS || members.length > MIRROR_SET_MAX_MEMBERS) {
      errors.push({
        code: 'mirror-set-size',
        setId,
        message: `${label} needs two to six strips.`,
      });
    }
    for (const stripId of members) {
      const strip = stripById.get(stripId);
      if (!strip) {
        errors.push({ code: 'mirror-member-missing', setId, stripId, message: `${label} refers to a strip that no longer exists.` });
        continue;
      }
      const name = strip.name || stripId;
      if (owner.has(stripId) && owner.get(stripId) !== setId) {
        errors.push({ code: 'mirror-member-twice', setId, stripId, message: `${name} can only mirror in one set.` });
      } else {
        owner.set(stripId, setId);
      }
      if (groupedIds.has(stripId)) {
        errors.push({ code: 'mirror-member-grouped', setId, stripId, message: `Ungroup ${name} first.` });
      }
      if (strip.kaleidoscope?.enabled === true) {
        errors.push({ code: 'mirror-member-kaleidoscope', setId, stripId, message: `Turn off Kaleidoscope on ${name} first.` });
      }
    }
  }
  return errors;
}

// The label a set shows when the owner has not named it: "Left wing and 3 more".
export function defaultMirrorSetName(set, strips = []) {
  const names = (set?.members || []).map(id => {
    const strip = (strips || []).find(candidate => String(candidate?.id) === String(id));
    return String(strip?.name || id);
  });
  if (!names.length) return String(set?.id || 'Mirror set');
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more`;
}

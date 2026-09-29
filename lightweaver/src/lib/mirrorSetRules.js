// RETIRED with the v1 mirror sets: this file now exists only so a saved
// project's `layout.mirrorSets` can be cleaned and handed to
// migrateMirrorSetsToSymmetry (lib/pieceSymmetry.js). A v1 mirror set was
//   { id: 'mirror-1', name: 'Four arms', members: ['strip-3', 'strip-5'] }
// members[0] was the lead. Only a single set of exactly two or four members
// migrates (to that many sides, one strip each, in member order).

export const MIRROR_SET_MIN_MEMBERS = 2;
export const MIRROR_SET_MAX_MEMBERS = 6;

const text = value => (typeof value === 'string' ? value.trim() : '');

// Shape-only normalization: trims ids, drops duplicate members inside a set,
// lets the FIRST set keep a strip claimed twice, and drops any set left outside
// two to six members or without an id. Pass `strips` to also prune members that
// no longer exist (a set then dissolves below two).
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

// RETIRED: v1 "mirror sets" (`layout.mirrorSets`, named groups of two to six
// strips that played as one section). Symmetry sides (lib/pieceSymmetry.js)
// replaced them. What survives here is the minimum the project loader needs to
// migrate a saved project: keep v1 members pointing at the right strips while
// legacy strip ids are renamed, then hand the sets to
// migrateMirrorSetsToSymmetry. Nothing writes `layout.mirrorSets` any more, and
// nothing else reads it.

export { normalizeMirrorSets } from './mirrorSetRules.js';

// Rewrite member ids through an old-to-new map (a Map or a plain object).
export function remapMirrorSetStripIds(sets, oldToNew) {
  const lookup = oldToNew instanceof Map
    ? id => oldToNew.get(id)
    : id => (oldToNew && Object.hasOwn(oldToNew, id) ? oldToNew[id] : undefined);
  return (Array.isArray(sets) ? sets : []).map(set => ({
    ...set,
    members: (set.members || []).map(id => lookup(id) ?? id),
  }));
}

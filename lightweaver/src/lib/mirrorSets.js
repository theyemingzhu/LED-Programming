// Mirror sets: named groups of two to six strips that play as one section.
// Stored at piece level as `layout.mirrorSets`:
//   [{ id: 'mirror-1', name: 'Four arms', members: ['strip-3', 'strip-5'] }]
// The first member is the lead (Studio preview renders it and copies to the
// rest). On the card a set is one zone with one range per member, in member
// order; the card plays every range of a zone from LED 1 on one shared clock.
//
// Every function here is pure: it returns new arrays and never mutates input.

import { compileWiring } from './wiringCompiler.js';
import {
  MIRROR_SET_MAX_MEMBERS,
  MIRROR_SET_MIN_MEMBERS,
  defaultMirrorSetName,
  findMirrorSetStructureErrors,
  normalizeMirrorSets,
} from './mirrorSetRules.js';

export {
  MIRROR_SET_MAX_MEMBERS,
  MIRROR_SET_MIN_MEMBERS,
  defaultMirrorSetName,
  normalizeMirrorSets,
};

const clean = sets => (Array.isArray(sets) ? sets : []);

// Tally the compiled card ranges each strip contributes, whichever zone they
// land in. Compiled WITHOUT mirror sets so the answer is the strips' own wiring.
function rangesByStrip(wiring, strips, layerGroups, capabilities) {
  const compiled = compileWiring({ wiring, strips, groups: layerGroups, capabilities });
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

export function validateMirrorSets(sets, strips = [], wiring = null, layerGroups = [], capabilities) {
  const list = clean(sets);
  const errors = findMirrorSetStructureErrors(list, strips, layerGroups);
  if (wiring) {
    const structurallyBroken = new Set(errors.map(error => error.setId));
    const tally = rangesByStrip(wiring, strips, layerGroups, capabilities);
    if (tally) {
      const maxRanges = capabilities?.maxRangesPerZone ?? 6;
      const stripById = new Map((strips || []).map(strip => [String(strip.id), strip]));
      for (const set of list) {
        const setId = String(set?.id ?? '');
        const members = Array.isArray(set?.members) ? set.members.map(String) : [];
        if (structurallyBroken.has(setId)) continue;
        let total = 0;
        for (const stripId of members) {
          const count = tally.get(stripId) || 0;
          total += count;
          if (count !== 1) {
            const name = stripById.get(stripId)?.name || stripId;
            errors.push({
              code: 'mirror-member-split',
              setId,
              stripId,
              message: `Join ${name}'s wiring into one run first.`,
            });
          }
        }
        if (total > maxRanges) {
          errors.push({
            code: 'mirror-set-ranges',
            setId,
            message: `These strips need ${total} wiring runs; a card section holds ${maxRanges}.`,
          });
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function mirrorSetForStrip(sets, stripId) {
  const id = String(stripId ?? '');
  return clean(sets).find(set => (set?.members || []).some(member => String(member) === id)) || null;
}

function nextMirrorSetId(sets) {
  let max = 0;
  for (const set of sets) {
    const match = /^mirror-(\d+)$/.exec(String(set?.id ?? ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `mirror-${max + 1}`;
}

// Drop `stripIds` from every set; a set left below two members dissolves.
function withoutMembers(sets, stripIds) {
  const drop = new Set(stripIds.map(String));
  return clean(sets)
    .map(set => ({ ...set, members: (set.members || []).filter(member => !drop.has(String(member))) }))
    .filter(set => set.members.length >= MIRROR_SET_MIN_MEMBERS);
}

// Create the lead's set, or extend it. A strip already in some other set moves
// here (a strip belongs to at most one set). New members past six are ignored.
export function addMirrorMembers(sets, leadId, memberIds = []) {
  const lead = String(leadId ?? '');
  if (!lead) return clean(sets).map(set => ({ ...set, members: [...set.members] }));
  const wanted = [];
  for (const id of memberIds || []) {
    const value = String(id ?? '');
    if (value && value !== lead && !wanted.includes(value)) wanted.push(value);
  }
  const existing = mirrorSetForStrip(sets, lead);
  const base = existing ? existing.members.map(String) : [lead];
  const additions = wanted.filter(id => !base.includes(id));
  const members = [...base, ...additions].slice(0, MIRROR_SET_MAX_MEMBERS);
  if (members.length < MIRROR_SET_MIN_MEMBERS) return clean(sets).map(set => ({ ...set, members: [...set.members] }));
  const others = withoutMembers(
    clean(sets).filter(set => set !== existing),
    members,
  );
  if (existing) {
    return clean(sets).flatMap(set => {
      if (set === existing) return [{ ...set, members }];
      const kept = others.find(candidate => candidate.id === set.id);
      return kept ? [kept] : [];
    });
  }
  return [...others, { id: nextMirrorSetId(clean(sets)), name: '', members }];
}

// Remove one strip from its set. A set left with one member dissolves.
export function removeMirrorMember(sets, stripId) {
  return withoutMembers(sets, [stripId]);
}

export function renameMirrorSet(sets, setId, name) {
  const value = typeof name === 'string' ? name.trim() : '';
  return clean(sets).map(set => (set.id === setId ? { ...set, name: value, members: [...set.members] } : { ...set, members: [...set.members] }));
}

// Rewrite member ids through an old-to-new map (a Map or a plain object).
export function remapMirrorSetStripIds(sets, oldToNew) {
  const lookup = oldToNew instanceof Map
    ? id => oldToNew.get(id)
    : id => (oldToNew && Object.hasOwn(oldToNew, id) ? oldToNew[id] : undefined);
  return clean(sets).map(set => ({
    ...set,
    members: (set.members || []).map(id => lookup(id) ?? id),
  }));
}

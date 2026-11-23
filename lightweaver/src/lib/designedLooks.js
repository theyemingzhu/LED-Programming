// Designed looks the owner has KEPT: a look made in the look designer, stored
// with the project and playable in Studio only until a card update.
//
//   project.designedLooks = [{ id, name, look, areas, layoutKey, updatedAt }]
//     id         stable id, `design-<n>`
//     name       the owner's name, up to 24 characters, unique in the project
//     look       the look designer's look record (lib/lookEngine/schema.js)
//     areas      { [areaId]: { name, stripIds } } as the owner saw them
//     layoutKey  which strips and how many sides it was made on
//     updatedAt  ms
//
// WHY A TOP-LEVEL FIELD, NOT `devices.standaloneController.looks`: the card's
// fingerprint, runtime package, storage payload and playlist are all built from
// the standalone controller and the layout. A designed look kept anywhere else
// cannot reach them, so none of those paths needs to know it exists. The field
// is written only when there is at least one, so a project without designed
// looks saves and hashes exactly as before (projectShapeGolden.test.js).
//
// Nothing here throws on bad input: a record that cannot be read is dropped and
// counted, so one damaged look never costs the owner the project.

import { normalizeLook } from './lookEngine/schema.js';

export const MAX_DESIGNED_LOOKS = 24;
export const DESIGNED_NAME_MAX = 24;
export const DEFAULT_DESIGNED_NAME = 'My look';

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => (typeof value === 'string' ? value : '');
const cleanName = (value, fallback = DEFAULT_DESIGNED_NAME) => text(value).replace(/\s+/g, ' ').trim().slice(0, DESIGNED_NAME_MAX).trim() || fallback;

function normalizeAreas(raw) {
  const areas = {};
  if (!isObject(raw)) return areas;
  for (const [areaId, value] of Object.entries(raw)) {
    if (!areaId || !isObject(value)) continue;
    areas[areaId] = {
      name: cleanName(value.name, ''),
      stripIds: Array.isArray(value.stripIds) ? [...new Set(value.stripIds.filter(id => typeof id === 'string' && id))] : [],
    };
  }
  return areas;
}

/** Keep only what is known. Returns `{ looks, dropped }`; never throws. */
export function normalizeDesignedLooks(raw) {
  if (!Array.isArray(raw)) return { looks: [], dropped: 0 };
  const looks = [];
  const ids = new Set();
  let dropped = 0;
  for (const item of raw) {
    try {
      if (!isObject(item) || !isObject(item.look) || typeof item.id !== 'string' || !item.id || ids.has(item.id) || looks.length >= MAX_DESIGNED_LOOKS) {
        dropped += 1;
        continue;
      }
      ids.add(item.id);
      looks.push({
        id: item.id,
        name: cleanName(item.name),
        look: normalizeLook(item.look),
        areas: normalizeAreas(item.areas),
        layoutKey: text(item.layoutKey),
        updatedAt: Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : 0,
      });
    } catch {
      dropped += 1;
    }
  }
  // Names stay unique even if a hand-edited file repeated one.
  const taken = [];
  const unique = looks.map(entry => {
    const name = uniqueName(entry.name, taken);
    taken.push(name);
    return name === entry.name ? entry : { ...entry, name };
  });
  return { looks: unique, dropped };
}

/** "Evening bloom" -> "Evening bloom 2" when taken (never longer than 24 characters). */
export function uniqueName(name, takenNames = []) {
  const base = cleanName(name);
  const taken = new Set(takenNames.map(item => String(item).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, DESIGNED_NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

const namesExcept = (looks, id) => looks.filter(entry => entry.id !== id).map(entry => entry.name);

function nextId(looks) {
  const used = new Set(looks.map(entry => entry.id));
  for (let n = looks.length + 1; ; n += 1) if (!used.has(`design-${n}`)) return `design-${n}`;
}

/** Keep a new look. `{ ok, looks, record }` or `{ ok: false, reason }` when the project is full. */
export function addDesignedLook(looks, { name, look, areas, layoutKey, now = Date.now() } = {}) {
  const list = Array.isArray(looks) ? looks : [];
  if (list.length >= MAX_DESIGNED_LOOKS) {
    return { ok: false, looks: list, reason: `This project already keeps ${MAX_DESIGNED_LOOKS} looks. Remove one to keep another.` };
  }
  const record = normalizeDesignedLooks([{
    id: nextId(list), name: uniqueName(name, list.map(entry => entry.name)), look, areas, layoutKey, updatedAt: now,
  }]).looks[0];
  if (!record) return { ok: false, looks: list, reason: 'This look could not be kept.' };
  return { ok: true, looks: [...list, record], record };
}

/** Put a changed look into an existing record. The name and id stay. */
export function replaceDesignedLook(looks, id, { look, areas, layoutKey, now = Date.now() } = {}) {
  const list = Array.isArray(looks) ? looks : [];
  const old = list.find(entry => entry.id === id);
  if (!old) return { ok: false, looks: list, reason: 'That kept look is no longer in this project.' };
  const record = normalizeDesignedLooks([{ ...old, look, areas, layoutKey, updatedAt: now }]).looks[0];
  if (!record) return { ok: false, looks: list, reason: 'This look could not be kept.' };
  return { ok: true, looks: list.map(entry => (entry.id === id ? record : entry)), record };
}

export function renameDesignedLook(looks, id, name) {
  const list = Array.isArray(looks) ? looks : [];
  if (!list.some(entry => entry.id === id)) return list;
  const next = uniqueName(name, namesExcept(list, id));
  return list.map(entry => (entry.id === id ? { ...entry, name: next } : entry));
}

export const removeDesignedLook = (looks, id) => (Array.isArray(looks) ? looks : []).filter(entry => entry.id !== id);

/** What the project writes: nothing at all when there are no kept looks. */
export function designedLooksProjectFields(looks) {
  return Array.isArray(looks) && looks.length ? { designedLooks: looks } : {};
}

// ── Areas, across a re-layout ───────────────────────────────────────────────

/** A short stamp of which strips and how many sides a look was made on. */
export function layoutKeyOf(derived, fold = 0) {
  const ids = (derived?.areas || []).flatMap(area => area.copies.flat()).sort();
  let h = 2166136261;
  for (const ch of `${fold}|${ids.join(',')}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `${fold}:${ids.length}:${h.toString(16)}`;
}

/** The `areas` record for a look made on this model: each area's name and its strips. */
export function areaRecordsOf(model, names = {}) {
  const records = {};
  model.derived.areas.forEach((area, index) => {
    records[area.id] = { name: cleanName(names[area.id] || model.names[index], ''), stripIds: area.copies.flat() };
  });
  return records;
}

/**
 * Which saved area is which current area, by the strips they share. An area
 * with the same id and some of the same strips wins first; then the best
 * overlap. Each saved area matches at most one current area.
 * Returns `{ pairs: { [currentAreaId]: savedAreaId | null }, unmatched }`.
 */
export function matchSavedAreas(saved = {}, current = []) {
  const stripsOf = area => new Set(area.stripIds || area.copies?.flat() || []);
  const candidates = [];
  for (const area of current) {
    const here = stripsOf(area);
    for (const [savedId, record] of Object.entries(saved)) {
      const there = new Set(record.stripIds || []);
      let shared = 0;
      for (const id of here) if (there.has(id)) shared += 1;
      if (!shared) continue;
      const union = here.size + there.size - shared;
      candidates.push({ currentId: area.id, savedId, score: shared / union + (savedId === area.id ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.currentId.localeCompare(b.currentId));
  const pairs = Object.fromEntries(current.map(area => [area.id, null]));
  const usedSaved = new Set();
  for (const item of candidates) {
    if (pairs[item.currentId] || usedSaved.has(item.savedId)) continue;
    pairs[item.currentId] = item.savedId;
    usedSaved.add(item.savedId);
  }
  return { pairs, unmatched: current.filter(area => !pairs[area.id]).map(area => area.id) };
}

/**
 * Open a kept look on the piece as it is now. The look's areas and the owner's
 * names are carried over to the matching current areas; a current area with no
 * match gets plain defaults and is listed in `unmatched` so the screen can say so.
 * Returns `{ look, names, unmatched }`.
 */
export function restoreDesignedLook(record, model) {
  const { pairs, unmatched } = matchSavedAreas(record.areas, model.derived.areas);
  const areas = {};
  const names = {};
  model.derived.areas.forEach((area, index) => {
    const savedId = pairs[area.id];
    if (!savedId) return;
    if (record.look.areas?.[savedId]) areas[area.id] = record.look.areas[savedId];
    const savedName = record.areas[savedId]?.name;
    if (savedName && savedName !== model.names[index]) names[area.id] = savedName;
  });
  const look = normalizeLook({ ...record.look, areas }, { areaIds: model.derived.areas.map(area => area.id) });
  return { look, names, unmatched };
}

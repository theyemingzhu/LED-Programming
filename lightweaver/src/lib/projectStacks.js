import { normalizeStoredNativeColorJourney } from './colorJourneyNative.js';
import { normalizeSavedLooks, normalizeSectionVisualLook, MAX_SAVED_LOOKS } from './sectionLookModel.js';
import { CARD_PLAYLIST_ENTRY_LIMIT, makeComboPlaylistItem } from './cardPlaylist.js';

const clone = value => JSON.parse(JSON.stringify(value));
const sections = targets => (targets || []).filter(target => target?.kind === 'section');
function appearanceForTarget(look, target) {
  const keys = look?.sectionSnapshotVersion === 1 ? [target.id] : [target.id, target.zoneId, target.stripId];
  const key = keys.find(id => id && Object.hasOwn(look?.sectionLooks || {}, id));
  return key ? look.sectionLooks[key] : look?.defaultLook || {};
}
export function suggestProjectStackName(looks = []) {
  const names = new Set(looks.map(look => look.label));
  for (let i = 1; ; i += 1) { const name = `Stack ${String(i).padStart(2, '0')}`; if (!names.has(name)) return name; }
}
export function createProjectStackId(looks = []) {
  const ids = new Set(looks.map(look => look.id));
  let id; do { id = `stack-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; } while (ids.has(id));
  return id;
}
export function getProjectStackReview(look, targets = []) {
  const rows = sections(targets);
  const current = new Set(rows.map(target => target.id));
  const saved = new Set(Object.keys(look?.sectionLooks || {}));
  const legacyAliases = new Set(rows.flatMap(target => [target.id, target.zoneId, target.stripId]).filter(Boolean));
  const missingSectionIds = look?.sectionSnapshotVersion === 1 ? [...current].filter(id => !saved.has(id)) : [];
  const removedSectionIds = [...saved].filter(id => !(look?.sectionSnapshotVersion === 1 ? current : legacyAliases).has(id));
  return { needsReview: Boolean(missingSectionIds.length || removedSectionIds.length), missingSectionIds, removedSectionIds };
}
export function summarizeProjectStack(look, targets = []) {
  const rows = sections(targets);
  const display = rows.length ? rows : Object.keys(look?.sectionLooks || {}).map(id => ({ id, label: id }));
  return { sectionCount: display.length, sections: display.map(target => {
    const appearance = clone(appearanceForTarget(look, target));
    return { id: target.id, label: target.label || target.id, patternId: appearance.patternId, look: appearance };
  }), review: getProjectStackReview(look, targets) };
}
export function repairProjectStack(look, targets = []) {
  return { ...clone(look), sectionSnapshotVersion: 1, sectionLooks: Object.fromEntries(sections(targets).map(target => [target.id, clone(appearanceForTarget(look, target))])), updatedAt: Date.now() };
}
export function getProjectStackCompatibility(look) {
  if (!look) return { ok: false, reason: 'This stack is missing.' };
  if (look.projectOnly === true) return { ok: false, reason: 'Prepare this design for the card before adding it to the playlist.' };
  let nativePatternId = '';
  if (look.patternLabRecipe?.base?.kind === 'color-journey' && look.nativeRecipe) {
    try { nativePatternId = normalizeStoredNativeColorJourney(look.nativeRecipe).id; } catch { /* Invalid native data never grants an unknown pattern compatibility. */ }
  }
  for (const value of [look.defaultLook, ...Object.values(look.sectionLooks || {})]) {
    if (value?.patternId && value.patternId !== nativePatternId && normalizeSectionVisualLook(value).patternId !== value.patternId) return { ok: false, reason: `Unsupported section pattern: ${value.patternId}. Choose a supported card pattern.` };
  }
  return { ok: true, reason: '' };
}
export function addProjectStacksToPlaylist(controller = {}, lookIds = []) {
  const looks = normalizeSavedLooks(controller.looks);
  const playlist = clone(controller.playlist || []);
  const additions = [];
  for (const id of new Set(lookIds)) {
    const look = looks.find(candidate => candidate.id === id);
    const compatibility = getProjectStackCompatibility(look);
    if (!compatibility.ok) throw new Error(compatibility.reason);
    if (!playlist.some(item => item.lookId === id || item.comboId === id)) additions.push(makeComboPlaylistItem(look));
  }
  if (playlist.length + additions.length > CARD_PLAYLIST_ENTRY_LIMIT) throw new RangeError(`The playlist supports ${CARD_PLAYLIST_ENTRY_LIMIT} entries. Nothing was added; remove entries and try again.`);
  return { ...controller, playlist: [...playlist, ...additions] };
}
export function renameProjectStack(controller, id, label) {
  if (!String(label || '').trim()) throw new Error('Give the stack a name.');
  if (!(controller.looks || []).some(look => look.id === id)) throw new Error('This stack is missing.');
  const name = String(label).trim();
  return { ...controller, looks: controller.looks.map(look => look.id === id ? { ...clone(look), label: name, updatedAt: Date.now() } : look), playlist: (controller.playlist || []).map(item => item.lookId === id || item.comboId === id ? { ...item, label: name } : item) };
}
export function duplicateProjectStack(controller, id) {
  const source = controller.looks?.find(look => look.id === id);
  if (!source) throw new Error('This stack is missing.');
  if (controller.looks.length >= MAX_SAVED_LOOKS) throw new RangeError(`This project already has ${MAX_SAVED_LOOKS} saved designs.`);
  const names = new Set(controller.looks.map(look => look.label));
  let suffix = 2; while (names.has(`${source.label} ${suffix}`)) suffix += 1;
  const copy = { ...clone(source), id: createProjectStackId(controller.looks), label: `${source.label} ${suffix}`, updatedAt: Date.now() };
  return { ...controller, activeLookId: copy.id, looks: [...controller.looks, copy] };
}

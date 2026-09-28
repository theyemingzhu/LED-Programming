// Browser-only working copies. They never change the project or authorize a card command.
const PREFIX = 'lw_pattern_edit_v1:';
function key(projectId, surface) { return `${PREFIX}${encodeURIComponent(String(projectId || 'untitled'))}:${surface}`; }
function storageOrDefault(storage) { return storage === undefined ? globalThis.localStorage : storage; }
export function readPatternEditSession(projectId, surface, storage) {
  try {
    const value = JSON.parse(storageOrDefault(storage)?.getItem(key(projectId, surface)) || 'null');
    return value?.version === 1 && value.projectId === String(projectId || 'untitled') ? value.value : null;
  } catch { return null; }
}
export function writePatternEditSession(projectId, surface, value, storage) {
  try {
    const target = storageOrDefault(storage);
    if (!target?.setItem) throw new Error('Browser storage is unavailable.');
    const serialized = JSON.stringify({ version: 1, projectId: String(projectId || 'untitled'), value });
    target.setItem(key(projectId, surface), serialized);
    if (target.getItem(key(projectId, surface)) !== serialized) throw new Error('Browser storage did not retain the working copy.');
    return { ok: true, error: '' };
  } catch (error) { return { ok: false, error: `Working copy could not be stored: ${error?.message || error}` }; }
}
export function clearPatternEditSession(projectId, surface, storage) {
  try { storageOrDefault(storage)?.removeItem(key(projectId, surface)); return { ok: true }; }
  catch (error) { return { ok: false, error: String(error?.message || error) }; }
}
export function writePatternLabEditHandoff(projectId, value, storage) {
  return writePatternEditSession(projectId, 'lab-handoff', value, storage);
}
export function consumePatternLabEditHandoff(projectId, storage) {
  const value = readPatternEditSession(projectId, 'lab-handoff', storage);
  if (value) clearPatternEditSession(projectId, 'lab-handoff', storage);
  return value;
}

// Each named stack owns a separate recoverable working copy. Empty identity is the new-stack draft.
function stackSurface(stackId) { return `stack:${encodeURIComponent(String(stackId || '__new__'))}`; }
export function readProjectStackDraft(projectId, stackId, storage) { return readPatternEditSession(projectId, stackSurface(stackId), storage); }
export function writeProjectStackDraft(projectId, stackId, value, storage) { return writePatternEditSession(projectId, stackSurface(stackId), value, storage); }
export function clearProjectStackDraft(projectId, stackId, storage) { return clearPatternEditSession(projectId, stackSurface(stackId), storage); }

// Call once when opening a project's Patterns surface, with its actual active
// stack. Claim the old single draft before copying so a cleanup failure or a
// later stack switch cannot assign the same unsaved work to another stack.
export function migrateLegacyPatternDraft(projectId, activeStackId, storage) {
  const stackId = String(activeStackId || '');
  const existing = readProjectStackDraft(projectId, stackId, storage);
  const legacy = readPatternEditSession(projectId, 'patterns', storage);
  if (!legacy) return { ok: true, migrated: false, value: existing, error: '' };
  const claim = readPatternEditSession(projectId, 'patterns-migration', storage);
  if (claim && claim.stackId !== stackId) return { ok: true, migrated: false, value: existing, error: '' };
  const claimed = writePatternEditSession(projectId, 'patterns-migration', { stackId }, storage);
  if (!claimed.ok) return { ...claimed, migrated: false, value: existing || legacy };
  if (!existing) {
    const written = writeProjectStackDraft(projectId, stackId, legacy, storage);
    if (!written.ok) return { ...written, migrated: false, value: legacy };
  }
  // The destination has been read/verified; retain the claim even when browser
  // storage refuses cleanup, rather than ever replaying stale legacy work.
  const cleanup = clearPatternEditSession(projectId, 'patterns', storage);
  return { ok: cleanup.ok, migrated: !existing, value: existing || legacy, error: cleanup.error || '' };
}

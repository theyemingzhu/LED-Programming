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

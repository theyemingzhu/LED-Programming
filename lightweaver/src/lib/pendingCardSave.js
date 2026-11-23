// A save to the card whose outcome this page may never learn: the reply is
// lost when the card restarts, the owner reloads or closes the tab, or the
// card answers only after Studio's restart wait. What was sent is noted here
// (localStorage, so it outlives the page) and becomes the project only when
// the card itself reports holding exactly that fingerprint. A refusal or a
// confirmed save clears the note. Interruption tests D1/D2,
// todo/plans/practice-card-interruptions.md.
const KEY = 'lw_pending_card_save_v1';
// A note older than this describes a save nobody is waiting for any more.
export const PENDING_CARD_SAVE_MAX_AGE_MS = 30 * 60 * 1000;

function storage(override) {
  if (override) return override;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function writePendingCardSave(entry, { store, now = Date.now() } = {}) {
  const target = storage(store);
  if (!target || !entry?.projectId || !entry?.cardId || !/^[a-f0-9]{16,64}$/.test(String(entry.projectFingerprint || '').toLowerCase())) return false;
  try {
    target.setItem(KEY, JSON.stringify({ version: 1, at: now, ...entry, projectFingerprint: String(entry.projectFingerprint).toLowerCase() }));
    return true;
  } catch { return false; }
}

export function readPendingCardSave({ store, now = Date.now() } = {}) {
  const target = storage(store);
  if (!target) return null;
  try {
    const value = JSON.parse(target.getItem(KEY) || 'null');
    if (!value || value.version !== 1 || !(now - Number(value.at) < PENDING_CARD_SAVE_MAX_AGE_MS)) return null;
    return value;
  } catch { return null; }
}

export function clearPendingCardSave({ store } = {}) {
  try { storage(store)?.removeItem(KEY); } catch { /* storage refused */ }
}

/**
 * The pending save the connected card proves it holds, or null: same card,
 * same project, and the card's own fingerprint equal to what was sent.
 */
export function pendingSaveHeldByCard(pending, evidence = {}, { projectId } = {}) {
  if (!pending) return null;
  const fingerprint = String(evidence.projectFingerprint || '').trim().toLowerCase();
  if (!fingerprint || fingerprint !== pending.projectFingerprint) return null;
  if (String(evidence.cardId || '') !== String(pending.cardId)) return null;
  if (projectId && String(projectId) !== String(pending.projectId)) return null;
  return pending;
}
